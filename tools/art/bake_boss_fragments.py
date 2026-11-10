"""Bake compact fracture pieces from the production glTF meshes with Blender.

blender -b -t 4 --python-exit-code 1 --python tools/art/bake_boss_fragments.py
"""

from math import floor
from pathlib import Path
import json
import re

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


ROOT = Path(__file__).resolve().parents[2]
NAMES = re.findall(r'"([^"]+)"', (ROOT / "alien-models.js").read_text(encoding="utf8")
                   .split("const starBreakerModelNames = [", 1)[1].split("];", 1)[0])


def hull(points):
    def half(ordered):
        edge = []
        for p in ordered:
            while len(edge) > 1:
                a, b = edge[-2:]
                if (b[0] - a[0]) * (p[1] - a[1]) > (b[1] - a[1]) * (p[0] - a[0]):
                    break
                edge.pop()
            edge.append(p)
        return edge

    ordered = sorted(set(points))
    return half(ordered)[:-1] + half(reversed(ordered))[:-1]


def sample_mesh(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    vertices, faces = [], []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        offset = len(vertices)
        vertices.extend(obj.matrix_world @ vertex.co for vertex in obj.data.vertices)
        faces.extend([offset + index for index in face.vertices] for face in obj.data.polygons)
    bounds = [(min(v[axis] for v in vertices), max(v[axis] for v in vertices)) for axis in range(3)]
    (left, right), (front, back), (bottom, top) = bounds
    tree = BVHTree.FromPolygons(vertices, faces)
    samples = []
    nx, ny = 52, 44
    for iy in range(ny):
        for ix in range(nx):
            x, y = (ix + .5) / nx, (iy + .5) / ny
            point, normal, _, _ = tree.ray_cast(Vector((left + x * (right - left), front - 1,
                                                        top - y * (top - bottom))), Vector((0, 1, 0)))
            if point is not None:
                z = (point.y - front) / max(.001, back - front)
                light = max(0, normal.dot(Vector((-.3, -.8, .5))))
                samples.append((x, y, z, light, ix, iy))

    # Farthest-point seeding gives independent, well-sized islands across the silhouette.
    def distance(a, b):
        return (a[0] - b[0]) ** 2 + .63 * (a[1] - b[1]) ** 2

    sites = [min(samples, key=lambda p: distance(p, (.5, .5)))]
    for _ in range(23):
        sites.append(max(samples, key=lambda p: min(distance(p, site) for site in sites)))
    groups = [[] for _ in sites]
    for p in samples:
        groups[min(range(len(sites)), key=lambda index: distance(p, sites[index]))].append(p)

    def round_values(values):
        return [round(value, 4) for value in values]

    pieces = []
    for group in groups:
        if len(group) < 3:
            continue
        x, y, depth, light = (sum(p[axis] for p in group) / len(group) for axis in range(4))
        # Trace the coverage of the visible mesh, never the image bounds.
        edge = hull((floor(p[0] * nx + dx) / nx, floor(p[1] * ny + dy) / ny)
                    for p in group for dx in (0, 1) for dy in (0, 1))
        polygon = [coordinate for a, b in edge for coordinate in (a - x, b - y)]
        pieces.append(round_values((x - .5, y - .5, depth, light, *polygon)))
    if len(pieces) < 14:
        raise RuntimeError(f"Too few fracture pieces for {path.name}: {len(pieces)}")
    return sorted(pieces, key=lambda piece: (piece[0], piece[1]))


def main():
    if len(NAMES) != 22:
        raise RuntimeError("Expected eleven Boss body and eleven finale models")
    atlas = []
    for name in NAMES:
        pieces = sample_mesh(ROOT / "assets" / "models" / f"{name}.glb")
        atlas.append(pieces)
        print(f"Fractures {name}: {len(pieces)}", flush=True)
    header = ('"use strict";\n\n'
              '// Mesh-derived outlines and depth sampled in Blender. Regenerate with tools/art/bake_boss_fragments.py.\n'
              'const bossFragmentAtlas = [\n')
    body = ",\n".join("  " + json.dumps(pieces, separators=(",", ":")) for pieces in atlas)
    (ROOT / "boss-fragments-data.js").write_text(header + body + "\n];\n", encoding="utf8")


if __name__ == "__main__":
    main()
