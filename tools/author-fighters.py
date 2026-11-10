"""Author and render the three sortie craft with Blender's stock Python API."""

import argparse
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector


WIDTH, HEIGHT = 576, 384
BANKS = (-28, -14, 0, 14, 28)
NOSE = (2.73, 0, .03)
FIGHTERS = {
    "red": {
        "name": "Crimson", "paint": (.43, .010, .016), "secondary": (.15, .009, .017),
        "glow": (.72, .31, .11), "engine": (.24, .65, 1), "span": 1.03,
        "wing": [(0.25, 1.54, -1.84, .02, .22), (.49, 1.24, -1.76, .05, .20),
                 (.82, .47, -1.45, .08, .17), (1.16, -.21, -1.53, .06, .13),
                 (1.48, -.72, -1.80, .01, .10), (1.76, -1.20, -1.96, -.05, .067),
                 (1.98, -1.84, -2.09, -.10, .035), (2.02, -2.04, -2.11, -.11, .015)],
    },
    "blue": {
        "name": "Azure", "paint": (.012, .116, .36), "secondary": (.012, .044, .17),
        "glow": (.22, .74, 1), "engine": (.08, .59, 1), "span": .87,
        "wing": [(0.24, 1.43, -1.80, .01, .22), (.45, 1.21, -1.91, .06, .16),
                 (.74, .59, -1.59, .12, .14), (1.0, -.07, -1.55, .05, .13),
                 (1.25, -.53, -1.72, .03, .10), (1.47, -.94, -2.00, .04, .079),
                 (1.72, -1.59, -2.22, .14, .038), (1.87, -2.23, -2.28, .19, .016)],
    },
    "yellow": {
        "name": "Auric", "paint": (.53, .19, .018), "secondary": (.27, .072, .009),
        "glow": (1, .74, .26), "engine": (1, .54, .12), "span": 1.12,
        "wing": [(0.24, 1.33, -1.88, .02, .23), (.53, .96, -1.84, .06, .22),
                 (.79, .38, -1.66, .08, .19), (1.04, -.03, -1.55, .13, .16),
                 (1.45, -.31, -1.76, .08, .15), (1.76, -.64, -1.99, .04, .12),
                 (1.88, -1.01, -2.06, .01, .09), (1.94, -1.39, -2.12, -.02, .035)],
    },
}


def material(name, color, metal, roughness, emission=0):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1)
    result.use_nodes = True
    surface = result.node_tree.nodes.get("Principled BSDF")
    surface.inputs["Base Color"].default_value = (*color, 1)
    surface.inputs["Metallic"].default_value = metal
    surface.inputs["Roughness"].default_value = roughness
    surface.inputs["Coat Weight"].default_value = .24 if metal < .55 else .10
    surface.inputs["Coat Roughness"].default_value = .24
    if emission:
        surface.inputs["Emission Color"].default_value = (*color, 1)
        surface.inputs["Emission Strength"].default_value = emission
    return result


def add_microfinish(surface, strength=.09):
    nodes = surface.node_tree.nodes
    links = surface.node_tree.links
    texture = nodes.new("ShaderNodeTexNoise")
    texture.inputs["Scale"].default_value = 104
    texture.inputs["Detail"].default_value = 2
    noise = nodes.new("ShaderNodeBump")
    noise.inputs["Strength"].default_value = strength
    noise.inputs["Distance"].default_value = .022
    links.new(texture.outputs["Fac"], noise.inputs["Height"])
    links.new(noise.outputs["Normal"], nodes.get("Principled BSDF").inputs["Normal"])


def mesh(name, vertices, faces, surface, pivot, smooth=True):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    edit = bmesh.new()
    edit.from_mesh(data)
    bmesh.ops.recalc_face_normals(edit, faces=list(edit.faces))
    edit.to_mesh(data)
    edit.free()
    for face in data.polygons:
        face.use_smooth = smooth
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.parent = pivot
    obj.data.materials.append(surface)
    return obj


def closed_sections(name, sections, surface, pivot, smooth=True, subdivision=0):
    count = len(sections[0])
    vertices = [point for ring in sections for point in ring]
    faces = [tuple(range(count - 1, -1, -1))]
    for offset in range(0, len(vertices) - count, count):
        for index in range(count):
            next_index = (index + 1) % count
            faces.append((offset + index, offset + next_index, offset + count + next_index, offset + count + index))
    faces.append(tuple(range(len(vertices) - count, len(vertices))))
    obj = mesh(name, vertices, faces, surface, pivot, smooth)
    if subdivision:
        modifier = obj.modifiers.new("Curvature", "SUBSURF")
        modifier.levels = modifier.render_levels = subdivision
    return obj


def fuselage(name, rings, surface, pivot, center_y=0, count=32, subdivision=1):
    return closed_sections(name, [[(x, center_y + ry * math.cos(a), z + rz * math.sin(a))
                                    for a in (index * math.tau / count for index in range(count))]
                                   for x, ry, rz, z in rings], surface, pivot, subdivision=subdivision)


def airfoil(name, stations, side, surface, pivot, subdivision=1):
    # Chord sections give the wing a full convex shell and a narrow trailing edge.
    chord = [(0, .00), (.14, .72), (.33, 1), (.58, .72), (.81, .39), (.96, .17), (1, .00),
             (.94, -.10), (.76, -.24), (.52, -.36), (.29, -.47), (.11, -.30)]
    return closed_sections(name, [[(front + (back - front) * x, side * y, height + thickness * z) for x, z in chord]
                                   for y, front, back, height, thickness in stations],
                           surface, pivot, subdivision=subdivision)


def plate(name, points, thickness, surface, pivot):
    n = len(points)
    vertices = [*points, *((x, y, z - thickness) for x, y, z in points)]
    faces = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))]
    faces.extend((i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n))
    obj = mesh(name, vertices, faces, surface, pivot, smooth=False)
    chamfer = obj.modifiers.new("Machined edges", "BEVEL")
    chamfer.width = min(.032, thickness * .37)
    chamfer.segments = 3
    chamfer.harden_normals = True
    obj.modifiers.new("Panel normals", "WEIGHTED_NORMAL")
    return obj


def line(name, coordinates, radius, surface, pivot):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.bevel_resolution = 3
    curve.resolution_u = 12
    path = curve.splines.new("BEZIER")
    path.bezier_points.add(len(coordinates) - 1)
    for point, location in zip(path.bezier_points, coordinates):
        point.co = location
        point.handle_left_type = point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.parent = pivot
    curve.materials.append(surface)


def engine(name, x, y, z, outer, heat, throat, emitter, pivot):
    # A real annular nozzle returns into the chamber rather than ending in a solid disc.
    rings = [(x + .35, .21), (x + .08, .25), (x, .26), (x - .06, .24),
             (x - .068, .198), (x + .04, .174), (x + .15, .156), (x + .31, .15)]
    shell = closed_sections(name, [[(rx, y + r * math.cos(a), z + r * math.sin(a))
                                     for a in (index * math.tau / 36 for index in range(36))]
                                    for rx, r in rings], outer, pivot)
    shell.data.materials.append(heat)
    shell.data.materials.append(throat)
    for polygon in shell.data.polygons:
        segment = (polygon.index - 1) // 36
        polygon.material_index = 1 if segment in (2, 3) else 2 if segment in (4, 5, 6) else 0
    fuselage(name + " plasma chamber", [(x + .05, .16, .16, z), (x + .12, .16, .16, z), (x + .18, .13, .13, z)],
             emitter, pivot, y, subdivision=0)


def craft(profile):
    pivot = bpy.data.objects.new(profile["name"] + " sortie axis", None)
    bpy.context.collection.objects.link(pivot)
    pivot.scale.y = .70
    skin = material("Lacquered titanium", profile["paint"], .61, .32)
    add_microfinish(skin, .045)
    edge = material("Anodized alloy", profile["secondary"], .54, .38)
    iron = material("Forged engine casing", (.11, .137, .18), .69, .34)
    add_microfinish(iron, .14)
    shadow = material("Heat-resistant graphite", (.024, .028, .034), .21, .54)
    brass = material("Heat-aged ceramic", (.38, .21, .115), .51, .39)
    canopy = material("Canopy gloss", (.003, .007, .014), .42, .24)
    trim = material("Machine-cut edge", (.50, .55, .61), .72, .34)
    neon = material("Status light", profile["glow"], .12, .37, 2.8)
    thrust = material("Plasma chamber", profile["engine"], .05, .33, 4)
    fuselage("Primary hull", [(-2.05, .19, .16, -.04), (-1.93, .33, .22, -.01),
                               (-1.66, .47, .29, -.01), (-1.19, .52, .35, .01),
                               (-.56, .45, .36, .03), (.09, .34, .30, .05), (.76, .25, .21, .055),
                               (1.39, .17, .14, .042), (2.00, .10, .085, .035),
                               (2.45, .063, .055, .031), (2.68, .028, .03, .03),
                               (NOSE[0], .005, .006, NOSE[2])], skin, pivot)
    fuselage("Lower spine", [(-1.91, .23, .13, -.13), (-1.61, .36, .22, -.14),
                             (-1.12, .41, .23, -.16), (-.28, .32, .20, -.15), (.62, .23, .16, -.11),
                             (1.36, .13, .089, -.07), (2.18, .035, .03, -.03)], edge, pivot)
    fuselage("Black canopy surround", [(-1.26, .16, .09, .20), (-1.05, .29, .21, .32),
                                        (-.60, .29, .24, .34), (-.16, .22, .19, .32),
                                        (.29, .13, .13, .27), (.71, .05, .068, .20),
                                        (.86, .013, .028, .18)], edge, pivot)
    fuselage("Armored canopy", [(-1.15, .14, .065, .38), (-.97, .235, .13, .41),
                                 (-.62, .232, .158, .425), (-.22, .166, .134, .398),
                                 (.18, .11, .087, .332), (.55, .032, .044, .244),
                                 (.64, .008, .023, .213)], canopy, pivot)
    y_engine = .53 if profile["name"] == "Azure" else .47
    engine_x = -2.23 if profile["name"] == "Crimson" else -2.20
    nozzles = []
    for side in (-1, 1):
        prefix = "Port" if side < 0 else "Starboard"
        stations = [(y * profile["span"], a, b, z, t) for y, a, b, z, t in profile["wing"]]
        airfoil(prefix + " main spar", stations, side, skin, pivot)
        insets = [(y, front + .30 * (back - front), front + .78 * (back - front), z + thickness * .92, thickness * .24)
                  for y, front, back, z, thickness in stations[1:-1]]
        airfoil(prefix + " recessed plate", insets, side, edge, pivot)
        lip = [(front + (back - front) * .12, side * y, z + thickness * .59)
               for y, front, back, z, thickness in stations[2:-1]]
        line(prefix + " machined leading edge", lip, .011, trim, pivot)
        ey = y_engine * side
        fuselage(prefix + " nacelle", [(-2.17, .19, .18, .00), (-1.99, .30, .28, .01),
                                         (-1.62, .30, .29, .043), (-1.29, .27, .26, .055),
                                         (-.89, .224, .21, .04), (-.37, .16, .12, .02),
                                         (.21, .06, .06, .005), (.32, .018, .02, 0)], skin, pivot, ey)
        engine(prefix + " recessed engine", engine_x, ey, .015, iron, brass, shadow, thrust, pivot)
        nozzles.append((engine_x - .068, ey, .015))
        plate(prefix + " engine blade", [(-1.84, ey + .23 * side, .22), (-1.38, ey + .25 * side, .215),
                                          (-.83, ey + .18 * side, .19), (-1.23, ey + .30 * side, .16),
                                          (-1.73, ey + .32 * side, .13)], .067, iron, pivot)
        line(prefix + " running light", [(-1.73, ey + .15 * side, .275), (-1.41, ey + .13 * side, .283),
                                          (-1.12, ey + .11 * side, .26)], .019, neon, pivot)
        line(prefix + " canopy gasket", [(-.99, .211 * side, .471), (-.67, .218 * side, .481),
                                         (-.26, .165 * side, .447), (.16, .109 * side, .361)], .015, iron, pivot)
        if profile["name"] == "Auric":
            y = 1.31 * side
            fuselage(prefix + " broadside magazine", [(-1.83, .11, .13, .088), (-1.65, .16, .19, .12),
                                                       (-1.32, .18, .18, .14), (-.91, .15, .14, .15),
                                                       (-.48, .066, .055, .13)], iron, pivot, y)
            line(prefix + " magazine bus", [(-1.64, y, .278), (-1.30, y, .317), (-1.02, y, .280)], .018, neon, pivot)
        elif profile["name"] == "Azure":
            fin = [(y * .94, a - .13, b - .14, z + .10, t * .65) for y, a, b, z, t in stations[3:]]
            airfoil(prefix + " induction fin", fin, side, iron, pivot)
            line(prefix + " induction bus", [(-1.20, 1.04 * side, .23), (-1.53, 1.27 * side, .24),
                                               (-1.88, 1.45 * side, .28)], .019, neon, pivot)
        else:
            line(prefix + " accent seam", [(.42, .31 * side, .225), (-.29, .47 * side, .248),
                                            (-.86, .77 * side, .198)], .012, trim, pivot)
    return pivot, nozzles


def area(name, where, aim, energy, color, size, rectangle=None):
    data = bpy.data.lights.new(name, "AREA")
    data.energy, data.color, data.size = energy, color, size
    if rectangle is not None:
        data.shape = "RECTANGLE"
        data.size_y = rectangle
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = where
    obj.rotation_euler = (Vector(aim) - obj.location).to_track_quat("-Z", "Y").to_euler()


def setup(preview, cycles):
    scene = bpy.context.scene
    if cycles:
        scene.render.engine = "CYCLES"
        scene.cycles.samples = 14 if preview else 32
        scene.cycles.use_denoising = True
    else:
        scene.render.engine = "BLENDER_EEVEE" if bpy.app.version >= (5, 0, 0) else "BLENDER_EEVEE_NEXT"
        scene.eevee.taa_render_samples = 20 if preview else 48
    scene.render.resolution_x, scene.render.resolution_y = WIDTH, HEIGHT
    scene.render.resolution_percentage = 65 if preview else 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.compression = 12
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = -.05
    scene.world.use_nodes = True
    scene.world.node_tree.nodes.get("Background").inputs["Color"].default_value = (.14, .19, .28, 1)
    scene.world.node_tree.nodes.get("Background").inputs["Strength"].default_value = .21
    camera_data = bpy.data.cameras.new("Ortho flight camera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 5.85
    camera = bpy.data.objects.new("Ortho flight camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (.23, -1.32, 9)
    camera.rotation_euler = (Vector((.23, 0, 0)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera
    area("Starlight key", (1.7, -3.0, 5.2), (-.10, 0, .2), 950, (1.0, .86, .78), 3.8, 2.15)
    area("Planet bounce", (.9, 3.1, 2.8), (-.5, 0, 0), 245, (.47, .69, 1), 4.4)
    area("Ion rim", (-3.0, 1.5, 2.5), (-.4, 0, .16), 515, (.69, .80, 1), 2.7, .92)
    area("Canopy strip", (2.7, -.35, 3.4), (.2, 0, .35), 160, (.91, .97, 1), 2.6, .24)
    return scene, camera


def project(scene, camera, matrix, point):
    uv = world_to_camera_view(scene, camera, matrix @ Vector(point))
    return [round(uv.x, 7), round(1 - uv.y, 7)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="Directory for rendered frames and geometry metadata")
    parser.add_argument("--preview", action="store_true", help="Render three neutral-bank frames at reduced resolution")
    parser.add_argument("--cycles", action="store_true", help="Use CPU Cycles when EEVEE cannot open a GPU context")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    args.output.mkdir(parents=True, exist_ok=True)
    frames = {}
    for id_, profile in FIGHTERS.items():
        bpy.ops.wm.read_factory_settings(use_empty=True)
        if not bpy.context.scene.world:
            bpy.context.scene.world = bpy.data.worlds.new("Orbital atmosphere")
        pivot, nozzles = craft(profile)
        scene, camera = setup(args.preview, args.cycles)
        frames[id_] = []
        for bank in ((0,) if args.preview else BANKS):
            pivot.rotation_euler.x = math.radians(bank)
            bpy.context.view_layer.update()
            output = args.output / f"{id_}_{bank:+03d}.png"
            scene.render.filepath = str(output.resolve())
            bpy.ops.render.render(write_still=True)
            frames[id_].append({"file": output.name, "nose": project(scene, camera, pivot.matrix_world, NOSE),
                               "engines": [project(scene, camera, pivot.matrix_world, point) for point in nozzles],
                               "reflections": [[project(scene, camera, pivot.matrix_world, (x, y * side, z))
                                                for x, y, z in [(.41, .32, .216), (-.19, .44, .23), (-.68, .66, .20)]]
                                               for side in (-1, 1)]})
    (args.output / "fighter-frames.json").write_text(json.dumps(frames, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"fighters": len(frames), "frames": sum(map(len, frames.values()))}))


if __name__ == "__main__":
    main()
