"""Modeling primitives for the Star Breaker Blender asset build."""

from collections import defaultdict
from math import cos, pi, sin
from mathutils import Vector
from mathutils.noise import noise_vector
import bpy


TAU = pi * 2


def mix(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def saturate(value):
    return max(0, min(1, value))


def pigment(dark, light, position, stripe):
    detail = noise_vector(position * 12.4)[0] * .13
    grain = noise_vector(position * 39.7)[1] * .075
    return (*mix(dark, light, saturate(stripe + detail + grain)), 1)


def pbr(name, roughness, metallic, emission=None):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    graph = material.node_tree
    shader = graph.nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Base Color"].default_value = (.5, .5, .5, 1)
    tint = graph.nodes.new("ShaderNodeVertexColor")
    tint.layer_name = "Pigment"
    graph.links.new(tint.outputs["Color"], shader.inputs["Base Color"])
    if emission:
        shader.inputs["Emission Color"].default_value = (*emission, 1)
        shader.inputs["Emission Strength"].default_value = .53
    return material


class Sculpt:
    """Accumulate named anatomy in four material batches, each with matching morph targets."""

    def __init__(self, pigment_pair, glow):
        dark, pale = pigment_pair
        self.dark = dark
        self.pale = pale
        self.glow = glow
        self.parts = defaultdict(lambda: ([], [], [], [], [], []))
        self.materials = {
            "carapace": pbr("Carapace", .38, .30),
            "membrane": pbr("Membrane", .40, .15),
            "rib": pbr("Ossified detail", .32, .34),
            "signal": pbr("Bioluminescence", .29, .10, glow),
        }

    def palette(self, layer):
        if layer == "membrane":
            return mix(self.dark, self.glow, .09), mix(self.pale, self.glow, .27)
        if layer == "rib":
            return mix(self.dark, self.pale, .27), mix(self.pale, (1, 1, 1), .36)
        if layer == "signal":
            return mix(self.dark, self.glow, .56), mix(self.glow, (1, 1, 1), .24)
        return self.dark, self.pale

    def vertex(self, layer, point, shade, motion, factor=1, albedo=1):
        vertices, _, colors, breathe, hunt, rupture = self.parts[layer]
        point = Vector(point)
        vertices.append(point)
        dark, pale = self.palette(layer)
        colors.append(pigment(tuple(x * albedo for x in dark), tuple(x * albedo for x in pale), point, shade))
        x, depth, height = point
        # The direction and amplitude grow down the anatomy, leaving anchored roots stable.
        sway, flare = motion
        phase = x * 2.35 + height * 2.8 + depth * 1.5
        breathe.append(point + Vector((.031 * x, .05 * depth, .046 * height + sin(phase) * sway * .16)) * factor)
        hunt.append(point + Vector((-.13 * sway, -.20 * depth * flare, sin(phase + 1.4) * sway * .33)) * factor)
        rupture.append(point + Vector((.09 * x * flare, -.21 * depth * flare,
                                       .21 * height * flare + cos(phase) * sway * .08)) * factor)
        return len(vertices) - 1

    def surface(self, layer, grid, closed=True):
        _, faces, *_ = self.parts[layer]
        width = len(grid[0])
        for a, b in zip(grid, grid[1:]):
            for j in range(width if closed else width - 1):
                k = (j + 1) % width
                faces.append((a[j], a[k], b[k], b[j]))
        if closed:
            faces.append(tuple(reversed(grid[0])))
            faces.append(tuple(grid[-1]))

    def lobe(self, center, scale, layer="carapace", ridge=8, twist=.7,
             segment=24, rings=16, motion=(.2, .7), angle=0, wrinkle=.15, albedo=1):
        """Sculpt a closed, folded ellipsoid with continuous faceted pigment and seam grooves."""
        cx, cy, cz = center
        sx, sy, sz = scale
        grid = []
        for row in range(rings + 1):
            v = -.495 * pi + row / rings * .99 * pi
            section = []
            for side in range(segment):
                u = TAU * side / segment
                groove = sin(u * ridge + twist * sin(v * 2.6))
                n = noise_vector(Vector((cos(u) * 2.3, sin(u) * 2.3, v * 2.1)))[2]
                fullness = cos(v) * (1 + groove * wrinkle * .42 + n * wrinkle * .24)
                x = sx * cos(u) * fullness
                z = sz * sin(v) * (1 + groove * wrinkle * .24)
                point = (cx + x * cos(angle) + z * sin(angle), cy + sy * sin(u) * fullness,
                         cz - x * sin(angle) + z * cos(angle))
                stripe = .31 + .23 * groove + .17 * cos(v * 3.4 - u * 2) + .19 * n
                section.append(self.vertex(layer, point, stripe, motion, albedo=albedo))
            grid.append(section)
        self.surface(layer, grid)

    def limb(self, points, radius, layer="membrane", steps=24, sides=10,
             taper=.05, flatten=1, motion=(.6, .65), ridge=3):
        """A curved taper with true depth. Radius can be a function of the normalized arc."""
        path = [Vector(p) for p in points]
        padded = [path[0], *path, path[-1]]

        def sample(t):
            index = min(len(path) - 2, int(t * (len(path) - 1)))
            v = t * (len(path) - 1) - index
            a, b, c, d = padded[index:index + 4]
            return (2 * b + (c - a) * v + (2 * a - 5 * b + 4 * c - d) * v * v
                    + (-a + 3 * b - 3 * c + d) * v * v * v) / 2

        grid = []
        for row in range(steps + 1):
            t = row / steps
            center = sample(t)
            tangent = (sample(min(1, t + .005)) - sample(max(0, t - .005))).normalized()
            axis = tangent.cross(Vector((0, -1, .17))).normalized()
            if axis.length < .05:
                axis = tangent.cross(Vector((0, 0, 1))).normalized()
            cross = tangent.cross(axis).normalized()
            section = []
            for side in range(sides):
                u = TAU * side / sides
                groove = cos(u * ridge + 14.2 * t)
                local = (radius(t) if callable(radius) else radius * (1 - t * (1 - taper))) * (1 + .13 * groove)
                point = center + local * (axis * cos(u) + cross * (sin(u) * flatten))
                stripe = .30 + .19 * groove + .15 * cos(t * 19.0 + u) + .20 * cos(u)
                section.append(self.vertex(layer, point, stripe, motion, .20 + .80 * t))
            grid.append(section)
        self.surface(layer, grid)

    def ring(self, center, radius, layer="rib", thick=.08, axis="depth", warp=.08, motion=(.2, .6)):
        cx, cy, cz = center
        steps = 40
        points = []
        for i in range(steps + 1):
            t = TAU * i / steps
            x = radius[0] * cos(t) * (1 + .055 * cos(t * 9))
            z = radius[1] * sin(t) * (1 + .085 * sin(t * 7))
            depth = warp * sin(3 * t)
            points.append((cx + (depth if axis == "nose" else x),
                           cy + (x if axis == "nose" else depth), cz + z))
        self.limb(points, lambda t: thick * (.83 + .17 * cos(TAU * t * 8)), layer,
                  steps=48, sides=8, taper=1, motion=motion)

    def organs(self, name):
        result = []
        for layer, (positions, faces, colors, breathe, hunt, rupture) in self.parts.items():
            mesh = bpy.data.meshes.new(f"{name}_{layer}")
            mesh.from_pydata(positions, [], faces)
            mesh.update()
            mesh.validate()
            for polygon in mesh.polygons:
                polygon.use_smooth = len(polygon.vertices) == 4
            attribute = mesh.color_attributes.new(name="Pigment", type="BYTE_COLOR", domain="POINT")
            for slot, color in zip(attribute.data, colors):
                slot.color = color
            # Recalculate orientation for a consistently outward glTF surface.
            import bmesh
            bm = bmesh.new()
            bm.from_mesh(mesh)
            bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
            bm.to_mesh(mesh)
            bm.free()
            obj = bpy.data.objects.new(mesh.name, mesh)
            bpy.context.collection.objects.link(obj)
            obj.data.materials.append(self.materials[layer])
            obj.shape_key_add(name="Basis")
            pulse = obj.shape_key_add(name="Pulse")
            for name_key, values in ((pulse, breathe), (obj.shape_key_add(name="Attack"), hunt),
                                     (obj.shape_key_add(name="Unfurl"), rupture)):
                for point, position in zip(name_key.data, values):
                    point.co = position
            for frame, strength in ((1, .08), (22, .94), (36, .29), (56, .83), (88, .08)):
                pulse.value = strength
                pulse.keyframe_insert(data_path="value", frame=frame)
            result.append(obj)
        return result
