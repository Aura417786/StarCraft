"""Render a seamless, packed tissue material from a native Blender node graph.

R stores pigment/cavity, G roughness variation, and B relief. The four-dimensional
torus makes the tissue periodic along both texture axes while retaining a
three-dimensional-looking connected network of fibers and membranes.
"""

import math
from pathlib import Path
import sys

import bpy


def make_material():
    material = bpy.data.materials.new("Hadal tissues | pigment, roughness, relief")
    material.use_nodes = True
    tree = material.node_tree
    tree.nodes.clear()

    def node(kind, label):
        result = tree.nodes.new(kind)
        result.label = label
        return result

    def attach(value, socket):
        if isinstance(value, bpy.types.NodeSocket):
            tree.links.new(value, socket)
        else:
            socket.default_value = value

    def arithmetic(operation, a, b=0.0):
        op = node("ShaderNodeMath", operation)
        op.operation = operation
        attach(a, op.inputs[0])
        attach(b, op.inputs[1])
        return op.outputs[0]

    def add(a, b):
        return arithmetic("ADD", a, b)

    def mul(a, b):
        return arithmetic("MULTIPLY", a, b)

    def bounds(value):
        return arithmetic("MINIMUM", arithmetic("MAXIMUM", value, 0), 1)

    def remap(value, lo, hi):
        op = node("ShaderNodeMapRange", "Soft boundaries")
        op.interpolation_type = "SMOOTHERSTEP"
        op.clamp = True
        attach(value, op.inputs["Value"])
        op.inputs["From Min"].default_value = lo
        op.inputs["From Max"].default_value = hi
        return op.outputs[0]

    uv = node("ShaderNodeTexCoord", "Repeatable UV")
    separate = node("ShaderNodeSeparateXYZ", "Periodic texture axes")
    attach(uv.outputs["UV"], separate.inputs["Vector"])
    u = mul(separate.outputs["X"], math.tau)
    v = mul(separate.outputs["Y"], math.tau)

    def coord(a, b, c):
        result = node("ShaderNodeCombineXYZ", "4D torus · XYZ")
        for value, socket in zip((a, b, c), result.inputs):
            attach(value, socket)
        return result.outputs[0]

    x = mul(arithmetic("COSINE", u), .72)
    y = mul(arithmetic("SINE", u), .72)
    z = mul(arithmetic("COSINE", v), 1.17)
    w = mul(arithmetic("SINE", v), 1.17)
    torus = coord(x, y, z)

    def noise(label, scale, octaves, roughness, position=torus, time=w):
        result = node("ShaderNodeTexNoise", label)
        result.noise_dimensions = "4D"
        for name, value in {
            "Vector": position, "W": time, "Scale": scale, "Detail": octaves,
            "Roughness": roughness
        }.items():
            attach(value, result.inputs[name])
        return result.outputs["Fac"]

    warp = noise("Cell edge distortion", 4.3, 3, .61)
    fascia = noise("Low-frequency fascia depth", 3.2, 3, .62)
    grains = noise("Pearlescent surface grains", 31.0, 2, .66)
    torn = noise("Fine connective fibers", 13.6, 3, .74)
    phase = add(mul(u, 5), add(mul(arithmetic("SINE", mul(v, 3)), 1.25), mul(warp, 8.7)))
    lamellae = remap(arithmetic("SINE", phase), -.25, .98)

    reticulum = node("ShaderNodeTexVoronoi", "Warped intercellular reticulum")
    reticulum.voronoi_dimensions = "4D"
    reticulum.feature = "DISTANCE_TO_EDGE"
    delta = mul(arithmetic("SUBTRACT", warp, .5), .26)
    attach(coord(add(x, delta), add(y, mul(delta, .68)), add(z, mul(delta, .84))), reticulum.inputs["Vector"])
    attach(add(w, mul(delta, .81)), reticulum.inputs["W"])
    reticulum.inputs["Scale"].default_value = 4.7
    walls = arithmetic("SUBTRACT", 1, remap(reticulum.outputs["Distance"], .014, .098))

    pigment = bounds(add(.09, add(mul(fascia, .59), add(mul(lamellae, .19),
                     add(mul(torn, .23), mul(walls, -.36))))))
    rough = bounds(add(.22, add(mul(grains, .51), add(mul(walls, .16), mul(lamellae, -.15)))))
    relief = bounds(add(.12, add(mul(fascia, .42), add(mul(lamellae, .23),
                    add(mul(grains, .18), mul(walls, -.28))))))

    pack = node("ShaderNodeCombineColor", "R pigment · G roughness · B relief")
    for value, socket in zip((pigment, rough, relief), pack.inputs):
        attach(value, socket)
    emission = node("ShaderNodeEmission", "Unlit output for channel packing")
    attach(pack.outputs[0], emission.inputs["Color"])
    output = node("ShaderNodeOutputMaterial", "Bake target")
    attach(emission.outputs[0], output.inputs["Surface"])

    return material


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    output = Path(args[0]) if args else Path(__file__).resolve().parents[2] / "assets" / "models" / "alien-microdetail.png"
    output = output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.mesh.primitive_plane_add(size=2)
    bpy.context.object.data.materials.append(make_material())
    bpy.ops.object.camera_add(location=(0, 0, 5))
    camera = bpy.context.object
    camera.rotation_euler = (0, 0, 0)
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 2

    scene = bpy.context.scene
    scene.camera = camera
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.eevee.taa_render_samples = 8
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.view_settings.view_transform = "Raw"
    scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)
    print(f"ORGANIC_MICRODETAIL {output} {output.stat().st_size} bytes")


if __name__ == "__main__":
    main()
