"""An articulated basalt predator, shaped for the game's left-facing camera."""

from math import cos, pi, sin
from mathutils import Vector

from boss_sculpt import TAU


MOUTH = Vector((-1.48, -.43, .095))
FORWARD = Vector((-.71, -.705, 0)).normalized()
ACROSS = Vector((-FORWARD.y, FORWARD.x, 0))
UP = Vector((0, 0, 1))


def mouth_point(depth, horizontal, vertical):
    return MOUTH - FORWARD * depth + ACROSS * horizontal + UP * vertical


def bend_jaw(sculpt, layer, start, jaw, travel=1):
    """Carry the whole jaw plate, tooth or collar section on the same hinge."""
    positions, _, _, breathe, attack, unfurl = sculpt.parts[layer]
    hinge_x, hinge_z = -.43, .10
    for index in range(start, len(positions)):
        point = positions[index]
        reach = max(0, min(1, (.10 - point.x) * .84))
        side = jaw if jaw else max(-1, min(1, (point.z - .10) * 3))
        angle = (.30 if side < 0 else .25) * travel * reach * side
        x, z = point.x - hinge_x, point.z - hinge_z
        attack[index] = Vector((
            hinge_x + x * cos(angle) + z * sin(angle),
            point.y - .15 * reach,
            hinge_z - x * sin(angle) + z * cos(angle),
        ))
        breathe[index].z += .018 * side * reach
        unfurl[index].z += .06 * side * reach * travel


def plate(sculpt, seed, first, last, width, thickness, *, jaw=0, layer="carapace"):
    """Tapered geological plates with a high broken ridge and a cut underside."""
    root, tip = Vector(first), Vector(last)
    forward = (tip - root).normalized()
    across = forward.cross(Vector((0, -1, .18))).normalized()
    normal = across.cross(forward).normalized()
    start = len(sculpt.parts[layer][0])
    grid = []
    # An asymmetric stone cross section keeps planar faces visible next to the rounded flesh.
    cross_section = ((-1, 0), (-.66, .58), (-.22, .91), (.33, .73), (.72, .35),
                     (1, -.06), (.67, -.20), (-.23, -.28), (-.67, -.18))
    for row, t in enumerate((0, .12, .27, .46, .65, .81, .94, 1)):
        family = .08 + .92 * sin(pi * (.18 + t * .81)) ** .82
        center = root.lerp(tip, t) + normal * (sin(pi * t) * thickness * .44)
        section = []
        for col, (j, k) in enumerate(cross_section):
            irregular = sin(seed * 3.4 + row * 1.6 + col * 1.9)
            position = (center + across * (width * family * (j + irregular * .09))
                        + normal * (thickness * family * (k + irregular * .095)))
            sand = .34 + .16 * sin(row * .85 + seed) + .11 * irregular
            shade = sand + (.32 if k > .25 else -.13)
            section.append(sculpt.vertex(layer, position, shade, (.07, .52), albedo=.90 if k > 0 else .57))
        grid.append(section)
    sculpt.surface(layer, grid)
    if jaw:
        bend_jaw(sculpt, layer, start, jaw)


def cavity(sculpt):
    # This surface starts at the aperture and terminates behind the visible coal core.
    # The three well sections do not fill the opening with a front-facing cap.
    depths = ((.08, .53, .68), (.26, .48, .57), (.43, .41, .50),
              (.62, .35, .43), (.82, .30, .34), (1.03, .19, .23))
    layer = "membrane"
    start = len(sculpt.parts[layer][0])
    grid = []
    for depth, width, height in depths:
        section = []
        for number in range(33):
            angle = TAU * number / 32
            folds = 1 + .074 * sin(angle * 9 + depth * 17) + .037 * sin(angle * 15 - depth * 8)
            radial = mouth_point(depth, cos(angle) * width * folds, sin(angle) * height * folds)
            section.append(sculpt.vertex(layer, radial, .31 + .20 * sin(angle * 8 + depth * 4),
                                          (.03, .3), albedo=.38 + .22 * depth))
        grid.append(section)
    sculpt.surface(layer, grid, closed=False)
    bend_jaw(sculpt, layer, start, 0, .77)
    center = mouth_point(.51, -.028, -.045)
    sculpt.lobe(center, (.246, .20, .282), "signal", ridge=8, wrinkle=.30,
                angle=-.21, segment=26, rings=14, motion=(.11, .38), albedo=.91)
    # Raised coal ribs pass in front of the ember lobe and break up its bright silhouette.
    for j in range(7):
        angle = .63 + j * .86
        points = [mouth_point(.30 + t * .53, cos(angle + t * 1.13) * (.43 - t * .20),
                             sin(angle + t * 1.13) * (.57 - t * .31)) for t in (0, .39, .76, 1)]
        layer = "rib"
        start = len(sculpt.parts[layer][0])
        sculpt.limb(points, .045 + .011 * cos(j * 2), layer, steps=11, sides=7, motion=(.02, .26))
        bend_jaw(sculpt, layer, start, 0, .72)
    for j, angle in enumerate((2.66, 3.85, 4.52, 5.29)):
        points = [mouth_point(.15 + t * .46, cos(angle + t * .64) * (.48 - t * .24),
                             sin(angle + t * .64) * (.57 - t * .29))
                  for t in (0, .37, .69, 1)]
        layer = "signal"
        start = len(sculpt.parts[layer][0])
        sculpt.limb(points, .027 - j * .002, layer, steps=10, sides=6, motion=(.04, .29))
        bend_jaw(sculpt, layer, start, 0, .71)


def mandibles(sculpt):
    # Braided muscle and two load-bearing mandibles surround the irregular aperture.
    for jaw in (-1, 1):
        layer = "membrane"
        start = len(sculpt.parts[layer][0])
        fore = -1.90 if jaw > 0 else -1.76
        sculpt.limb([(.08, .10, jaw * .23), (-.55, -.01, jaw * .53),
                     (-1.13, -.20, jaw * .70), (fore, -.37, jaw * .61)],
                    lambda t: .075 + .16 * sin(pi * (.14 + t * .76)),
                    layer, steps=22, sides=10, flatten=.82, motion=(.06, .38), ridge=7)
        bend_jaw(sculpt, layer, start, jaw)
        for i, signed_u in enumerate((-.54, -.28, -.025, .24, .47)):
            edge = (.52 + .20 * cos(signed_u * 2.68)) * jaw
            root = mouth_point(.67 + i * .055, signed_u * .98, edge * 1.05)
            toe = mouth_point(-.10 - .035 * cos(i * 2.31), signed_u * 1.11,
                              edge + jaw * (.055 + .084 * sin(i * 3.4 + jaw)))
            plate(sculpt, i + jaw * 1.8, root, toe, .145 + .042 * sin(i * 1.5 + 2),
                  .21 + .037 * cos(i), jaw=jaw)
        for i, u in enumerate((-.45, -.27, -.07, .15, .35, .49)):
            edge = (.53 + .18 * cos(u * 2.71)) * jaw
            tooth = .18 + .173 * (sin(i * 2.2 + jaw) * .5 + .5)
            path = [mouth_point(.09, u, edge * 1.02),
                    mouth_point(-.005, u * 1.01, edge - jaw * tooth * .37),
                    mouth_point(.10 + .044 * sin(i * 2.7), u + .031, edge - jaw * tooth)]
            layer = "rib"
            start = len(sculpt.parts[layer][0])
            sculpt.limb(path, .071 + .021 * cos(i), layer, steps=9, sides=7, flatten=.83,
                        motion=(.01, .31), ridge=4)
            bend_jaw(sculpt, layer, start, jaw)
        # Only two of the leading fracture channels visibly connect the shell to the furnace.
        for i, u in enumerate((-.33, .31)):
            points = [mouth_point(depth, u + shift, jaw * height)
                      for depth, shift, height in ((.53, -.011, .66), (.31, .04, .70),
                                                    (.20, .018, .65), (.075, -.013, .60))]
            layer = "signal"
            start = len(sculpt.parts[layer][0])
            sculpt.limb(points, .024 - i * .006, layer, steps=11, sides=6, motion=(.03, .37))
            bend_jaw(sculpt, layer, start, jaw)


def shoulder_and_eye(sculpt):
    # The near eye sits under a heavy broken brow and above the closest forelimb.
    sculpt.lobe((-.86, -.76, .415), (.21, .11, .106), "membrane", angle=-.27,
                ridge=6, segment=18, rings=10, albedo=.32)
    sculpt.lobe((-.92, -.858, .438), (.12, .052, .065), "signal", angle=-.29,
                ridge=5, segment=18, rings=12, albedo=1)
    sculpt.lobe((-.72, -.843, .466), (.055, .039, .036), "signal", angle=-.29,
                ridge=5, segment=16, rings=10)
    plate(sculpt, 29, (-.51, -.665, .58), (-1.12, -.893, .492), .147, .13)
    plate(sculpt, 31, (-.48, -.598, .33), (-.86, -.858, .295), .135, .108)
    sculpt.limb([(-.76, -.818, .61), (-.68, -.787, .558), (-.56, -.745, .52)],
                .023, "signal", steps=12, sides=6, motion=(.025, .25))

    for i, (x, y, z) in enumerate(((-.43, .40, -.51), (.65, .40, -.50),
                                    (-.19, -.72, -.65), (1.00, -.53, -.60))):
        near = i >= 2
        reach = .33 if i == 2 else .19 if near else .30
        elbow = (x + .15, y * .72, z + .08)
        wrist = (x - reach, y, z - (.31 if near else .25))
        root = (x + .24, y * .31, -.19 - i * .044)
        sculpt.limb([root, elbow, wrist],
                    lambda t: .060 + .17 * sin(pi * (.19 + t * .72)), "membrane",
                    steps=20, sides=10, flatten=.88, motion=(.18, .45), ridge=6)
        plate(sculpt, 35 + i, (root[0] + .03, root[1] - .09, root[2] + .07),
              (elbow[0] - .09, elbow[1] - .19, elbow[2] - .09), .171 if near else .127, .12)
        plate(sculpt, 39 + i, elbow, (wrist[0] - .04, wrist[1] - .15, wrist[2]), .146, .117)
        for j in range(3 if near else 2):
            dx, dy, dz = wrist
            dy += (j - 1) * .071
            sculpt.limb([(dx + .07, dy, dz + .07),
                         (dx - .11, dy - .03, dz - .036),
                         (dx - .205 + .035 * j, dy + .012, dz - .12 + .021 * j)],
                        .075 - j * .008, "rib", steps=10, sides=7, motion=(.14, .38))


def furnace(sculpt):
    sculpt.lobe((.44, .18, -.10), (1.22, .57, .51), "membrane",
                ridge=11, wrinkle=.33, segment=32, rings=17, angle=.17, albedo=.62)
    cavity(sculpt)
    mandibles(sculpt)
    for i in range(7):
        x = -.64 + i * .36
        crest = .88 - i * .071 + .085 * sin(i * 2.43)
        plate(sculpt, i, (x - .38, .22 + .05 * sin(i), crest * .65),
              (x + .10, -.07 + .11 * cos(i * 2.4), crest + .20 + .118 * sin(i * 2.3)),
              .24 - i * .015, .265 - i * .013)
        shoulder = -.43 + i * .021
        offset = .31 + .14 * sin(i * 1.7 + .80)
        # Stagger the middle shingle row across the high dorsal plates.
        plate(sculpt, 2.1 + i, (x + .48, shoulder + .13, .25 - .053 * i),
              (x - .24, shoulder - .18, .28 + offset), .28 - .015 * i, .22 - .012 * i)
        if i in (1, 3, 5):
            plate(sculpt, 8.6 + i, (x + .39, shoulder + .15, -.23 - i * .05),
                  (x - .24, shoulder - .13, -.69 + .075 * sin(i) + i * .025), .22, .21)
        if i in (0, 2, 3, 5):
            sculpt.limb([(x + .16, shoulder - .119, .45 - i * .023),
                         (x + .08, shoulder - .211, .36 - i * .031),
                         (x - .06, shoulder - .216, .32 - i * .033)],
                        .023 - i * .0017, "signal", steps=11, sides=6, motion=(.04, .52))
    shoulder_and_eye(sculpt)
    tail = [(1.23, .23, -.20), (1.63, .28, -.28), (1.98, .21, -.13), (2.12, .12, .30)]
    sculpt.limb(tail, .28, "membrane", steps=23, sides=11, motion=(.48, .37), ridge=6)
    for i, tip in enumerate(tail[1:]):
        x, y, z = tip
        plate(sculpt, 24 + i, tail[i], (x + .10, y - .20, z + .17),
              .19 - i * .023, .15 - i * .029)
