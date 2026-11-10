"""UV, look-development and GLB bake for the 11 aliens and their finales.

Run with Blender 4.5 LTS in background mode:
  blender -b --factory-startup -t 8 --python-exit-code 1 --python bake_boss_pbr.py -- --only 1 3 9 11

The sculpt is kept as the source of geometry, morphs and anatomy pigments.
The four images in each GLB are an asset-specific albedo atlas, OpenGL
tangent normal, packed glTF occlusion/roughness/metallic and emission.
"""

import argparse
from collections import defaultdict
import json
import math
from pathlib import Path
import struct
import sys
import tempfile
from time import monotonic

import bpy

sys.path.insert(0, str(Path(__file__).parent))
from build_boss_models import MODELS, PALETTES, Sculpt


# Scale and stretch of a material's structure, followed by relief, matte
# response, mineral content and output of active tissue. Body and finale
# use the same family of tissue but get independent mesh-space maps.
PROFILES = [
    ("hadal lamellae", (1.15, 1.55, 3.6), 5.5, .022, .34, .06, .76),
    ("porous marrow", (1.10, 2.0, 2.5), 8.2, .029, .69, .02, .54),
    ("basalt and slag", (1.85, 2.10, 2.4), 4.4, .040, .73, .38, 1.12),
    ("layered spinneret", (1.15, 3.60, 4.0), 6.4, .024, .48, .12, .78),
    ("scute armor", (1.60, 2.20, 2.9), 6.8, .036, .52, .21, .66),
    ("silvered nacre", (1.05, 2.50, 4.0), 5.1, .016, .29, .55, .67),
    ("conductive scales", (1.30, 2.25, 4.5), 7.1, .027, .43, .24, .87),
    ("spore rind", (1.85, 2.00, 2.1), 5.8, .031, .62, .03, .78),
    ("folded void flesh", (1.65, 1.55, 3.1), 6.1, .032, .47, .13, .92),
    ("neural sheath", (1.00, 1.60, 4.6), 7.4, .020, .38, .08, .82),
    ("grafted organs", (1.30, 1.80, 3.5), 5.8, .031, .49, .18, .93),
]
PRIORITY = {0, 2, 8, 10}


class AtlasSculpt(Sculpt):
    """Keep the ordered anatomy grids so seams can follow the sculpt."""

    def __init__(self, pigment_pair, glow):
        super().__init__(pigment_pair, glow)
        self.charts = defaultdict(list)

    def surface(self, layer, grid, closed=True):
        start = len(self.parts[layer][1])
        super().surface(layer, grid, closed)
        self.charts[layer].append((start, grid, closed))


class Graph:
    def __init__(self, material):
        self.tree = material.node_tree
        self.shader = self.tree.nodes.get("Principled BSDF")
        self.output = self.tree.nodes.get("Material Output")

    def set(self, socket, value):
        if isinstance(value, bpy.types.NodeSocket):
            self.tree.links.new(value, socket)
        else:
            socket.default_value = value

    def node(self, kind, label, **inputs):
        node = self.tree.nodes.new(kind)
        node.label = label
        for name, value in inputs.items():
            self.set(node.inputs[name], value)
        return node

    def math(self, op, first, second=0):
        node = self.node("ShaderNodeMath", op)
        node.operation = op
        self.set(node.inputs[0], first)
        self.set(node.inputs[1], second)
        return node.outputs[0]

    def vector(self, op, first, second):
        node = self.node("ShaderNodeVectorMath", op)
        node.operation = op
        self.set(node.inputs[0], first)
        self.set(node.inputs["Scale" if op == "SCALE" else 1], second)
        return node.outputs["Vector"]

    def mix(self, label, weight, first, second, mode="MIX"):
        node = self.node("ShaderNodeMixRGB", label, Fac=weight, Color1=first, Color2=second)
        node.blend_type = mode
        return node.outputs[0]

    def remap(self, label, value, low, high):
        node = self.node("ShaderNodeMapRange", label, Value=value)
        node.interpolation_type = "SMOOTHERSTEP"
        node.inputs["From Min"].default_value = low
        node.inputs["From Max"].default_value = high
        return node.outputs[0]

    def noise(self, label, point, scale, detail=2, rough=.64):
        return self.node("ShaderNodeTexNoise", label, Vector=point, Scale=scale, Detail=detail,
                         Roughness=rough).outputs["Fac"]


def design_material(material, index, glow, object_origin):
    family, stretch, scale, relief, matte, mineral, strength = PROFILES[index]
    graph = Graph(material)
    add = lambda a, b: graph.math("ADD", a, b)
    mul = lambda a, b: graph.math("MULTIPLY", a, b)
    subtract = lambda a, b: graph.math("SUBTRACT", a, b)
    membrane = material.name == "Membrane"
    bone = material.name == "Ossified detail"
    signal = material.name == "Bioluminescence"

    coordinate = graph.node("ShaderNodeTexCoord", "Neutral anatomy coordinates")
    coordinate.object = object_origin
    point = coordinate.outputs["Object"]
    stretched = graph.vector("MULTIPLY", point, stretch)
    broad = graph.noise("Pigment clouds", point, 2.9, 3)
    flecks = graph.noise("Micropores and wear", stretched, scale * 7.3, 2)
    fibers = graph.noise("Fine fascia strands", stretched, scale * 1.65, 3)
    warp = graph.node("ShaderNodeTexNoise", "Displaced cellular boundary",
                      Vector=point, Scale=scale * .86, Detail=2)
    warped = graph.vector("ADD", stretched, graph.vector("SCALE", warp.outputs["Color"], .52))
    cells = graph.node("ShaderNodeTexVoronoi", family, Vector=warped, Scale=scale)
    cells.feature = "DISTANCE_TO_EDGE"
    seams = subtract(1, graph.remap("Cleft mask", cells.outputs["Distance"], .016, .113))
    ridge = graph.remap("Mineral bands and cell edges", fibers, .31, .72)
    cavity = seams
    if index in {0, 3, 6, 9} or membrane:
        axes = graph.node("ShaderNodeSeparateXYZ", "Directional fascia", Vector=stretched)
        phase = add(mul(axes.outputs["Z"], 8.4 + index * .41), mul(broad, 7.9))
        lamella = graph.remap("Folded lamella", graph.math("SINE", phase), .18, .96)
        ridge = add(mul(ridge, .58), mul(lamella, .42))
        cavity = add(mul(seams, .56), mul(subtract(1, lamella), .35))
    elif index in {1, 7}:
        cavity = add(mul(seams, .45), mul(graph.remap("Pitted colonies", flecks, .50, .76), .54))
    elif index == 5:
        ridge = graph.remap("Nacre facets", broad, .33, .64)
        cavity = mul(seams, .48)

    pigment = next(node for node in graph.tree.nodes if node.type == "VERTEX_COLOR").outputs["Color"]
    depth = add(.47, add(mul(ridge, .54), add(mul(broad, .36), mul(cavity, -.44))))
    albedo = graph.mix("Tissue pigment and embedded relief", 1, pigment, depth, "MULTIPLY")
    # Weathered borders on keratin and localized red-orange oxidation on basalt.
    if bone:
        accent = (.55, .38, .24, 1) if index in {1, 2, 8} else (.31, .37, .47, 1)
        albedo = graph.mix("Old mineral highlights", mul(ridge, .21), albedo, accent)
    lava = None
    if index == 2:
        distance = graph.node("ShaderNodeVectorMath", "Distance from furnace")
        distance.operation = "DISTANCE"
        graph.set(distance.inputs[0], point)
        distance.inputs[1].default_value = (-.56, -.24, .05)
        warmth = subtract(1, graph.remap("Cooling away from the core", distance.outputs["Value"], .50, 1.82))
        heat = mul(warmth, graph.remap("Uneven heat transfer through the shell", broad, .27, .67))
        crack = subtract(1, graph.remap("Narrow radiant fissure", cells.outputs["Distance"], .010, .052))
        lava = mul(crack, heat)
        if not signal:
            albedo = graph.mix("Dark outer basalt", mul(subtract(1, heat), .27), albedo, (.035, .017, .013, 1))
            albedo = graph.mix("Incandescent minerals close to the core", mul(lava, .48), albedo, (.66, .082, .006, 1))
    if index == 8 and not signal:
        albedo = graph.mix("Warm tissue below the blue scar", mul(cavity, .45), albedo, (.079, .008, .021, 1))
    if index == 10 and not signal:
        zones = graph.node("ShaderNodeSeparateXYZ", "Graft junctions", Vector=point)
        split = graph.remap("Tissue boundary", add(zones.outputs["X"], mul(broad, .67)), -.45, .67)
        accents = graph.mix("Teal organism and violet mantle", split, (.033, .25, .23, 1), (.31, .085, .20, 1))
        albedo = graph.mix("Unequal grafts", .32, albedo, accents)

    # OpenGL tangent relief is baked directly from the procedural bump response.
    height = add(mul(ridge, .43), add(mul(flecks, .14), mul(cavity, -.43)))
    bump = graph.node("ShaderNodeBump", "Wet ridges and recessed cavities", Height=height,
                      Strength=.76, Distance=relief * (.64 if membrane or signal else 1))
    graph.set(graph.shader.inputs["Normal"], bump.outputs["Normal"])
    rough = add(matte - (.105 if signal else .055 if membrane else 0),
                add(mul(flecks, .22), add(mul(cavity, .22), mul(ridge, -.17))))
    metal = mul(mineral * (.30 if membrane or signal else 1), graph.remap("Exposed mineral",
                add(mul(broad, .65), mul(ridge, .35)), .24, .71))
    ao_node = graph.node("ShaderNodeAmbientOcclusion", "Localized anatomical contact", Distance=.26)
    ao_node.samples = 6
    ao = mul(add(.23, mul(ao_node.outputs["AO"], .77)), subtract(1, mul(cavity, .19)))
    orm = graph.node("ShaderNodeCombineColor", "R occlusion, G roughness, B metallic", Red=ao, Green=rough, Blue=metal)
    if signal:
        dense = graph.remap("Recessed luminous cells", add(mul(broad, .60), mul(ridge, .40)), .32, .72)
        mask = mul(strength, mul(subtract(1, mul(cavity, .74)), add(.16, mul(dense, .84))))
        albedo = graph.mix("Darker connective paths within the core", mul(cavity, .52), albedo, (.082, .021, .042, 1))
        if index == 2:
            mask = add(mul(mask, .71), mul(lava, .62))
    elif index in {2, 8, 10} and not bone:
        mask = mul(lava, .44) if index == 2 else mul(seams, .075)
    else:
        mask = 0
    hue = (*glow, 1)
    if index == 10 and signal:
        height_axis = graph.node("ShaderNodeSeparateXYZ", "Layered organ emission", Vector=point).outputs["Z"]
        violet = graph.remap("Independent organ tone", height_axis, -.55, .48)
        hue = graph.mix("Teal through magenta", violet, (.22, .74, 1.0, 1), hue)
    emission = graph.mix("Independent bioluminescence", mask, (0, 0, 0, 1), hue)
    pass_node = graph.node("ShaderNodeEmission", "Linear bake pass")
    image_node = graph.node("ShaderNodeTexImage", "Bake target")
    return graph, pass_node, image_node, {"Albedo": albedo, "ORM": orm.outputs[0], "Emission": emission}


def unwrap(objects, sculpt, size):
    chart_number = 0
    for obj, layer in zip(objects, sculpt.parts):
        mesh = obj.data
        uv = mesh.uv_layers.new(name="AnatomyAtlas").data
        for first, grid, closed in sculpt.charts[layer]:
            width = len(grid[0])
            span = width if closed else width - 1
            points = [[mesh.vertices[index].co for index in row] for row in grid]
            # Cut the least visible side of each closed lobe, tentacle or rib.
            seam = max(range(width), key=lambda i: sum(row[i].y for row in points)) if closed else 0
            perimeter = sum(sum((row[(i + 1) % width] - row[i]).length for i in range(span))
                            for row in points) / len(points)
            lengths = [0.0]
            for previous, row in zip(points, points[1:]):
                lengths.append(lengths[-1] + sum((a - b).length for a, b in zip(row, previous)) / width)
            lookup = {index: ((i - seam) % width, lengths[row]) for row, indices in enumerate(grid)
                      for i, index in enumerate(indices)}
            strip_count = (len(grid) - 1) * span
            # Fold very long ring or tentacle strips into shorter islands so their
            # narrow aspect ratio does not waste most of the atlas.
            sections = min(3, max(1, math.ceil(lengths[-1] / max(1.8, perimeter * 4))))
            for section in range(sections):
                start_row = section * (len(grid) - 1) // sections
                end_row = (section + 1) * (len(grid) - 1) // sections
                offset = chart_number * 8.0
                chart_number += 1
                for polygon in mesh.polygons[first + start_row * span:first + end_row * span]:
                    side_indices = [lookup[index][0] for index in polygon.vertices]
                    crosses_seam = closed and 0 in side_indices and width - 1 in side_indices
                    for loop_index in polygon.loop_indices:
                        side, length = lookup[mesh.loops[loop_index].vertex_index]
                        if crosses_seam and side == 0:
                            side = width
                        uv[loop_index].uv = (offset + perimeter * side / span, length - lengths[start_row])
            if not closed:
                continue
            for face_index, row in enumerate((grid[0], grid[-1]), start=first + strip_count):
                polygon = mesh.polygons[face_index]
                sides = {index: i for i, index in enumerate(row)}
                section = [mesh.vertices[index].co for index in row]
                radius = sum((a - b).length for a, b in zip(section, section[1:] + section[:1])) / math.tau
                for loop_index in polygon.loop_indices:
                    theta = math.tau * sides[mesh.loops[loop_index].vertex_index] / width
                    # Opposite end caps have opposite winding.
                    if face_index == first + strip_count:
                        theta = -theta
                    uv[loop_index].uv = (chart_number * 8.0 + radius * math.cos(theta), radius * math.sin(theta))
                chart_number += 1
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.mode_set(mode="EDIT")
    try:
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.select_all(action="SELECT")
        bpy.ops.uv.pack_islands(rotate=True, rotate_method="CARDINAL", shape_method="CONCAVE",
                                margin_method="FRACTION", margin=0.5 * max(8, size // 128) / size)
    finally:
        bpy.ops.object.mode_set(mode="OBJECT")
    area = 0
    for obj in objects:
        layer = obj.data.uv_layers.active
        if layer is None:
            raise ValueError(f"No UVs: {obj.name}")
        for face in obj.data.polygons:
            coords = [layer.data[i].uv for i in face.loop_indices]
            if any(not (-1e-5 <= p.x <= 1.00001 and -1e-5 <= p.y <= 1.00001) for p in coords):
                raise ValueError(f"Out-of-bounds UVs: {obj.name}")
            area += abs(sum(p.x * q.y - p.y * q.x for p, q in zip(coords, coords[1:] + coords[:1]))) * .5
    if not .25 < area < .98:
        raise ValueError(f"Packed UV coverage {area:.3f} suggests insufficient packing or overlap")
    return area


def bake(scene, designs, name, size, pass_name):
    linear = pass_name in {"ORM", "Normal"}
    image = bpy.data.images.new(f"{name}-{pass_name}", width=size, height=size, alpha=False)
    image.colorspace_settings.name = "Non-Color" if linear else "sRGB"
    for graph, emission, target, outputs in designs:
        target.image = image
        graph.tree.nodes.active = target
        if pass_name == "Normal":
            graph.set(graph.output.inputs["Surface"], graph.shader.outputs[0])
        else:
            graph.set(emission.inputs["Color"], outputs[pass_name])
            graph.set(graph.output.inputs["Surface"], emission.outputs[0])
    bake_type = "NORMAL" if pass_name == "Normal" else "EMIT"
    scene.cycles.samples = 12 if pass_name == "ORM" else 4
    result = bpy.ops.object.bake(type=bake_type, margin=max(3, size // 256),
                                 margin_type="EXTEND", normal_space="TANGENT", use_clear=True)
    if "FINISHED" not in result:
        raise RuntimeError(f"{name}: {pass_name} bake failed")
    return image


def compact_albedo(image, directory):
    # Only the sRGB base color uses lossy encoding. Channel data stays PNG.
    file = directory / "Albedo.jpg"
    image.file_format = "JPEG"
    image.save(filepath=str(file), quality=95)
    compact = bpy.data.images.load(str(file))
    compact.name = image.name + "-Web"
    compact.pack()
    return compact


def use_atlases(material, maps):
    material.node_tree.nodes.clear()
    graph = Graph.__new__(Graph)
    graph.tree = material.node_tree
    graph.shader = graph.node("ShaderNodeBsdfPrincipled", "Portable glTF material")
    graph.output = graph.node("ShaderNodeOutputMaterial", "Surface", Surface=graph.shader.outputs[0])
    albedo = graph.node("ShaderNodeTexImage", "sRGB tissue").outputs["Color"]
    albedo.node.image = maps["Albedo"]
    graph.set(graph.shader.inputs["Base Color"], albedo)
    normal_image = graph.node("ShaderNodeTexImage", "Linear OpenGL tangent normal")
    normal_image.image = maps["Normal"]
    normal = graph.node("ShaderNodeNormalMap", "Sculpt relief", Color=normal_image.outputs["Color"])
    graph.set(graph.shader.inputs["Normal"], normal.outputs["Normal"])
    packed = graph.node("ShaderNodeTexImage", "Linear packed occlusion, roughness, metallic")
    packed.image = maps["ORM"]
    channels = graph.node("ShaderNodeSeparateColor", "Unpack glTF ORM", Color=packed.outputs["Color"])
    graph.set(graph.shader.inputs["Roughness"], channels.outputs["Green"])
    graph.set(graph.shader.inputs["Metallic"], channels.outputs["Blue"])
    settings = bpy.data.node_groups.get("glTF Material Output")
    if not settings:
        settings = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
        settings.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    occlusion = graph.node("ShaderNodeGroup", "glTF occlusion channel")
    occlusion.node_tree = settings
    graph.set(occlusion.inputs["Occlusion"], channels.outputs["Red"])
    light = graph.node("ShaderNodeTexImage", "sRGB emissive mask")
    light.image = maps["Emission"]
    graph.set(graph.shader.inputs["Emission Color"], light.outputs["Color"])
    graph.set(graph.shader.inputs["Emission Strength"], .80)


def inspect_glb(file):
    with file.open("rb") as data:
        signature, version, length, json_size, kind = struct.unpack("<4s4I", data.read(20))
        assert (signature, version, length, kind) == (b"glTF", 2, file.stat().st_size, 0x4E4F534A)
        document = json.loads(data.read(json_size))
    images = document.get("images", [])
    if len(images) != 4 or any("bufferView" not in image for image in images):
        raise ValueError(f"{file.name}: expected exactly four embedded images, got {len(images)}")
    for material in document["materials"]:
        pbr = material["pbrMetallicRoughness"]
        if not {"normalTexture", "occlusionTexture", "emissiveTexture"} <= material.keys():
            raise ValueError(f"{file.name}: incomplete PBR material")
        if material["occlusionTexture"]["index"] != pbr["metallicRoughnessTexture"]["index"]:
            raise ValueError(f"{file.name}: redundant unpacked ORM image")
        assert pbr["baseColorTexture"]
    for mesh in document["meshes"]:
        assert mesh["extras"]["targetNames"] == ["Pulse", "Attack", "Unfurl"]
        for primitive in mesh["primitives"]:
            assert {"POSITION", "NORMAL", "TEXCOORD_0"} <= primitive["attributes"].keys()
            assert len(primitive["targets"]) == 3
    assert document["animations"]
    return {"textures": len(images), "batches": len(document["meshes"]), "clips": len(document["animations"])}


def build(index, output, size, threads, round_trip):
    start = monotonic()
    name, sculpt_model = MODELS[index]
    identity = index % 11
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = 1, 88
    scene.render.fps = 24
    scene.render.threads_mode = "FIXED"
    scene.render.threads = threads
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    palette = PALETTES[index if index < 12 else index - 11]
    sculpt = AtlasSculpt(palette[:2], palette[2])
    sculpt_model(sculpt)
    objects = sculpt.organs(name)
    for obj in objects:
        obj.select_set(True)
    coverage = unwrap(objects, sculpt, size)
    origin = bpy.data.objects.new("Material bake origin", None)
    bpy.context.collection.objects.link(origin)
    materials = [obj.data.materials[0] for obj in objects]
    designs = [design_material(mat, identity, palette[2], origin) for mat in materials]
    print(f"UV {name} {coverage:.3f} {size}px", flush=True)
    maps = {}
    resolutions = {"Albedo": size, "ORM": min(size, 1024), "Normal": min(size, 1024),
                   "Emission": max(256, size // 2)}
    for pass_name in ("Albedo", "ORM", "Normal", "Emission"):
        maps[pass_name] = bake(scene, designs, name, resolutions[pass_name], pass_name)
        print(f"BAKED {name} {pass_name} {monotonic() - start:.1f}s", flush=True)
    path = output / f"{name}.glb"
    temporary = output / f"{name}.baking.glb"
    with tempfile.TemporaryDirectory(prefix="star-breaker-albedo-") as directory:
        maps["Albedo"] = compact_albedo(maps["Albedo"], Path(directory))
        for material in materials:
            use_atlases(material, maps)
        scene.frame_set(1)
        bpy.ops.export_scene.gltf(filepath=str(temporary), export_format="GLB", use_selection=True,
                                 export_morph=True, export_morph_animation=True, export_animation_mode="SCENE",
                                 export_cameras=False, export_lights=False, export_vertex_color="NONE")
    summary = inspect_glb(temporary)
    if round_trip:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=str(temporary))
        recovered = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
        assert len(recovered) == summary["batches"]
        assert all(obj.data.uv_layers and len(obj.data.shape_keys.key_blocks) == 4 for obj in recovered)
    temporary.replace(path)
    summary.update(name=name, uvCoverage=round(coverage, 4), resolutions=resolutions, bytes=path.stat().st_size,
                   elapsed=round(monotonic() - start, 1))
    print("ASSET " + json.dumps(summary), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[2] / "assets" / "models")
    parser.add_argument("--only", type=int, nargs="+", choices=range(1, 23), default=range(1, 23))
    parser.add_argument("--size", type=int, choices=(256, 512, 768, 1024, 2048))
    parser.add_argument("--threads", type=int, default=8)
    parser.add_argument("--round-trip", action="store_true")
    opts = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    opts.output.mkdir(parents=True, exist_ok=True)
    for item in opts.only:
        priority = (item - 1) % 11 in PRIORITY
        size = opts.size or (2048 if priority and item <= 11 else 1024 if priority or item <= 11 else 768)
        build(item - 1, opts.output, size, opts.threads, opts.round_trip)


if __name__ == "__main__":
    main()
