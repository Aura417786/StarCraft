"""Sculpt the marrow predator, the spinner and the armored pincer in game space."""

from math import cos, pi, sin
from mathutils import Vector


PALETTES = {
    1: ((.15, .104, .068), (.82, .69, .50), (1, .52, .16)),
    3: ((.022, .009, .046), (.35, .15, .40), (.86, .35, 1)),
    4: ((.017, .032, .022), (.32, .46, .22), (.62, 1, .34)),
}


def hinge(sculpt, layer, first, origin, attack, unfurl, stiffness=1):
    """Carry connected surfaces around their local joint through both shape keys."""
    vertices, _, _, pulse, hunting, ruptured = sculpt.parts[layer]
    pivot = Vector(origin)
    for index in range(first, len(vertices)):
        point = vertices[index]
        offset = point - pivot
        reach = min(1, offset.length * stiffness)
        x, y, z = offset
        angle = attack * reach
        hunting[index] = pivot + Vector((x * cos(angle) - z * sin(angle), y, x * sin(angle) + z * cos(angle)))
        angle = unfurl * reach
        ruptured[index] = pivot + Vector((x * cos(angle) - z * sin(angle), y * 1.07, x * sin(angle) + z * cos(angle)))
        pulse[index].z = point.z + sin(x * 3.7 + y * 2) * .035 * reach


def flange(sculpt, root, tip, width, ridge, seed, layer="carapace"):
    """A thick, asymmetric plate with a raised top facet and a dark undercut."""
    root, tip = Vector(root), Vector(tip)
    forward = (tip - root).normalized()
    side = forward.cross(Vector((0, -.57, .82))).normalized()
    normal = side.cross(forward).normalized()
    section = ((-.98, -.15), (-.82, .14), (-.39, .71), (.04, 1),
               (.49, .73), (.91, .23), (1, -.10), (.14, -.32), (-.77, -.26))
    grid = []
    for i, t in enumerate((0, .12, .26, .45, .64, .80, .93, 1)):
        scale = (.08 + .92 * sin(pi * (.19 + .80 * t))) ** .74
        center = root.lerp(tip, t) + normal * (ridge * .25 * sin(t * pi))
        row = []
        for j, (u, v) in enumerate(section):
            n = sin(i * 1.77 + j * 2.3 + seed) * .065
            point = center + side * ((u + n) * width * scale) + normal * ((v + n) * ridge * scale)
            shade = (.22 + .55 * max(0, v) + .13 * sin(t * 9 + n * 15 + seed))
            row.append(sculpt.vertex(layer, point, shade, (.15, .74), albedo=.73 if v < 0 else 1))
        grid.append(row)
    sculpt.surface(layer, grid)


def marrow_stalker(s):
    spine = [(-.68, .08, .30), (-.13, .14, .53), (.46, .16, .67),
             (1.03, .19, .64), (1.49, .12, .41), (1.86, -.03, .13),
             (1.97, -.17, -.30), (1.77, -.19, -.52)]
    s.limb(spine, lambda t: .22 * (1 - .73 * t), "membrane", steps=36, sides=12, motion=(.62, 1.1), ridge=6)
    # Vertebrae, flank shadows and visible open air between each hanging rib.
    for i, (x, y, z) in enumerate(spine[:-1]):
        size = .25 - i * .016
        s.lobe((x, y, z), (size, .25 - i * .015, size * .89), "rib",
               segment=16, rings=9, ridge=4, wrinkle=.26, albedo=.81 + .14 * cos(i))
        s.limb([(x - .04, y, z + .10), (x + .11, y - .015, z + .32),
                (x + .20, y - .08, z + .49 - i * .038)], .085 - i * .006,
               "rib", steps=9, sides=7, motion=(.17, 1.0))
        if i >= 5:
            continue
        for side in (-1, 1):
            z_gap = .05 + .18 * sin(i * .47)
            pivot = (x + .03, y, z)
            start = len(s.parts["rib"][0])
            s.limb([pivot, (x + .06, side * .44, z - .03),
                    (x + .16, side * .63, z - .39),
                    (x + .16, side * .44, -.45 - z_gap),
                    (x + .08, side * .21, -.53 - z_gap)],
                   lambda t: (.105 - i * .009) * (.27 + .73 * sin(pi * (.23 + .77 * t))),
                   "rib", steps=18, sides=9, motion=(.19, 1.22), ridge=3)
            hinge(s, "rib", start, pivot, -.23 + .08 * i, .30 + .033 * i)
    # Bone hood and hollow jaws. High cheek edge, shadowed eye socket and an open underside.
    s.lobe((-1.18, -.08, .32), (.64, .43, .31), "rib", angle=-.17, segment=25, rings=14, ridge=5, wrinkle=.33)
    s.lobe((-1.37, -.39, .29), (.26, .21, .17), "membrane", angle=-.20, ridge=4,
           segment=16, rings=9, albedo=.16)
    s.lobe((-1.41, -.59, .30), (.103, .047, .052), "signal", angle=-.25, segment=14, rings=8)
    for side in (-1, 1):
        outer_y = .34 if side == 1 else -.47
        flange(s, (-.84, outer_y, .39), (-1.84, outer_y * .60, .41), .17, .16, side + 2, "rib")
        flange(s, (-.91, outer_y, .33), (-.59, outer_y * 1.30, .68), .16, .12, side + 5, "rib")
        for jaw in (-1, 1):
            pivot = (-.75, outer_y * .79, .13)
            start = len(s.parts["rib"][0])
            s.limb([pivot, (-1.03, outer_y, .13 + jaw * .32), (-1.53, outer_y * .88, .11 + jaw * .40),
                    (-1.96, outer_y * .61, .12 + jaw * .24)], .14 if jaw > 0 else .11,
                   "rib", steps=18, sides=10, motion=(.16, 1.25), ridge=4)
            for j in range(4):
                x = -1.10 - j * .232
                z = .13 + jaw * (.36 - j * .021)
                s.limb([(x, outer_y * (.95 - j * .08), z),
                        (x - .05, outer_y * (.94 - j * .08), z - jaw * .15),
                        (x + .025, outer_y * (.87 - j * .07), z - jaw * (.19 + j * .016))],
                       .054 + j * .002, "rib", steps=8, sides=7, motion=(.05, .70))
            hinge(s, "rib", start, pivot, -jaw * .38, -jaw * .20)
    for i in range(3):
        x = -.22 + i * .41
        s.lobe((x, -.07, -.16 + .07 * i), (.12, .12, .095), "signal",
               segment=15, rings=8, ridge=6, albedo=.68)


def rift_weaver(s):
    s.lobe((.62, .19, .02), (.96, .64, .60), "membrane", angle=.15,
           segment=30, rings=17, ridge=11, wrinkle=.28, albedo=.65)
    s.lobe((-.55, -.04, .045), (.56, .47, .36), "carapace", angle=-.18,
           segment=25, rings=14, ridge=7, albedo=.71)
    for side in (-1, 1):
        for i in range(6):
            x = -.01 + i * .231
            bulge = sin(pi * (i + 1) / 8)
            flange(s, (x + .33, .19 + side * .07, .43 * bulge),
                   (x - .12, -.05 + side * (.24 + .27 * bulge), .47 * bulge + .10 * side),
                   .20 - i * .012, .15 + .04 * bulge, i + side * 4)
    # The nearest four legs cross the visible abdomen at different depths and sweep separately.
    for side in (-1, 1):
        for i in range(4):
            top = i < 2
            fan = 1 if top else -1
            spread = (i % 2) * .31
            root_x = -.64 + i * .28
            pivot = (root_x, .02 + side * .29, fan * .13)
            upper = (root_x + .39 - spread, side * (.52 + .08 * i), fan * (.64 + spread))
            knee = (root_x + .60 - spread * .62, side * (.68 + .04 * i), fan * (.88 + spread))
            talon = (root_x - .33 - spread, side * (.76 + .13 * i), fan * (1.0 + spread * .45))
            toe = (root_x - .97 + .13 * i, side * (.57 + .12 * i), fan * (.55 + spread * .83))
            if side == 1:
                knee = (knee[0] + .20, knee[1], knee[2] + fan * .21)
                toe = (toe[0] + .37, toe[1], toe[2] + fan * .14)
            start = len(s.parts["carapace"][0])
            s.limb([pivot, upper, knee], lambda t: .16 - .065 * t, "carapace", steps=15,
                   sides=10, motion=(.62, 1.0), ridge=4)
            s.limb([knee, talon, toe], lambda t: .102 * (1 - .92 * t), "carapace",
                   steps=18, sides=9, motion=(.88, 1.1), ridge=4)
            flange(s, upper, (knee[0] + .15, knee[1], knee[2] * 1.10), .109, .11, 13 + i)
            hinge(s, "carapace", start, pivot, .27 * fan * (1 - i * .08), -.25 * fan)
            start = len(s.parts["rib"][0])
            s.lobe(knee, (.108, .115, .113), "rib", segment=12, rings=8, ridge=4, albedo=.57)
            hinge(s, "rib", start, pivot, .27 * fan * (1 - i * .08), -.25 * fan)
            if side == -1:
                start = len(s.parts["signal"][0])
                s.limb([(upper[0], upper[1] - .078, upper[2]), (knee[0], knee[1] - .086, knee[2]),
                        (talon[0], talon[1] - .062, talon[2])],
                       .020, "signal", steps=14, sides=6, motion=(.63, .88))
                hinge(s, "signal", start, pivot, .27 * fan * (1 - i * .08), -.25 * fan)
    # Pedipalps nest around three separated members of the eye cluster.
    for side in (-1, 1):
        pivot = (-.62, side * .19, 0)
        start = len(s.parts["rib"][0])
        s.limb([pivot, (-1.02, side * .32, side * .21), (-1.44, side * .25, side * .25),
                (-1.53, side * .16, side * .10)], .107, "rib", steps=14, sides=8, ridge=3)
        hinge(s, "rib", start, pivot, .37 * side, -.25 * side)
    for i, (x, y, z, k) in enumerate(((-.96, -.36, .19, .108), (-.74, -.47, .28, .089),
                                       (-.70, -.49, .04, .071), (-.94, -.38, -.02, .069),
                                       (-1.02, -.27, .34, .049))):
        s.lobe((x, y, z), (k * 1.1, k * .46, k), "signal",
               angle=-.24, segment=13, rings=8, ridge=5)
        flange(s, (x + k * 1.1, y + .025, z + k * .84),
               (x - k * 1.23, y - .024, z + k * .69), k * .60, k * .31, 34 + i)
    for i in range(4):
        x = .79 + i * .16
        s.limb([(x - .14, -.33, .11), (x, -.45, .03), (x + .24, -.35, -.13)],
               .030 - .004 * i, "signal", steps=12, sides=6, motion=(.15, .47), ridge=4)


def pulse_binder(s):
    s.lobe((.49, .18, -.01), (1.04, .69, .51), "membrane", angle=.16,
           segment=32, rings=16, ridge=11, albedo=.59)
    s.lobe((-.55, -.17, .04), (.59, .54, .38), "carapace", angle=-.16,
           segment=28, rings=14, ridge=6)
    for i in range(6):
        x = -.17 + i * .29
        z = .51 - .028 * i + .087 * sin(i * 1.13)
        flange(s, (x + .33, .14, z - .14), (x - .25, -.24, z + .25), .29 - i * .025, .18, i)
        flange(s, (x + .28, -.20, .13 - i * .022), (x - .14, -.70 + i * .041, .35 - i * .033),
               .20 - i * .014, .14, i + 7)
        if i < 4:
            s.limb([(x + .11, -.63, .19), (x - .023, -.73, .12), (x - .13, -.60, -.024)],
                   .030, "signal", steps=11, sides=6, motion=(.045, .86))
    for i in range(5):
        x = -.16 + .35 * i
        for side in (-1, 1):
            pivot = (x, side * .27, -.21)
            wrist = (x + .19, side * .63, -.33 - i * .025)
            tip = (x + .48, side * (.60 + .045 * i), -.70 - .043 * sin(i))
            s.limb([pivot, wrist, tip], .123 - .009 * i, "rib", steps=14, sides=8,
                   motion=(.49 + .033 * i, .92), ridge=5)
    # Visible scalloped claw plate and a separate hooked sliding jaw for each arm.
    for side in (-1, 1):
        z = side * (.62 if side > 0 else .59)
        depth = -.43 if side > 0 else -.18
        pivot = (-.52, depth, z * .65)
        elbow = (-.18, depth * .47, z * 1.20)
        wrist = (-1.09, depth, z * 1.02)
        s.limb([(.11, depth * .76, z * .16), elbow, wrist], lambda t: .17 + .08 * sin(t * pi),
               "membrane", steps=18, sides=10, motion=(.39, 1.29), ridge=6)
        s.lobe(elbow, (.30, .23, .20), "carapace", ridge=6, angle=-.12 * side, segment=20, rings=11)
        start = len(s.parts["carapace"][0])
        s.lobe(wrist, (.53, .32, .26), "carapace", angle=-.20 * side, ridge=6, segment=24, rings=13)
        flange(s, (-.78, depth - .08, z * .96), (-1.50, depth - .08, z * 1.36), .26, .16, side + 5)
        hook = [wrist, (-1.47, depth - .12, z * 1.36), (-1.90, depth - .14, z * 1.39),
                (-2.16, depth - .03, z * .94), (-2.12, depth, z * .68)]
        s.limb(hook, lambda t: .218 * (1 - .94 * t), "carapace", steps=23, sides=11,
               flatten=.76, ridge=5, motion=(.31, 1.3))
        hinge(s, "carapace", start, pivot, .40 * side, -.24 * side)
        start = len(s.parts["rib"][0])
        s.limb([wrist, (-1.40, depth - .17, z * .66), (-1.70, depth - .21, z * .36),
                (-2.01, depth - .13, z * .55)], lambda t: .171 * (1 - .93 * t),
               "rib", steps=20, sides=9, ridge=4, motion=(.29, 1.2))
        for j in range(4):
            x = -1.20 - j * .179
            b = z * (1.08 + .21 * sin(j))
            s.limb([(x, depth - .21, b), (x - .07, depth - .16, b - side * (.13 + .03 * j))],
                   .061, "rib", steps=6, sides=6, ridge=4, motion=(.18, .91))
        hinge(s, "rib", start, pivot, .45 * side, -.43 * side)
        start = len(s.parts["signal"][0])
        s.limb([(-.94, depth - .21, z * 1.18), (-1.26, depth - .31, z * 1.32),
                (-1.51, depth - .24, z * 1.35), (-1.73, depth - .16, z * 1.33)],
               .022, "signal", steps=18, sides=6, motion=(.29, 1.2))
        hinge(s, "signal", start, pivot, .40 * side, -.24 * side)
    for i in range(3):
        s.lobe((-.88 + .13 * i, -.65 + .026 * i, .17 + .083 * i), (.089, .072, .064),
               "signal", ridge=6, segment=15, rings=9)
    tail = [(1.11, .27, .07), (1.54, .29, .15), (1.79, .21, .47), (1.85, .14, .77), (1.62, .01, .94)]
    s.limb(tail, .215, "carapace", steps=24, sides=11, ridge=5, motion=(.71, .91))
    for i in range(3):
        start = tail[i]
        end = tail[i + 1]
        flange(s, start, (end[0] + .10, end[1] - .16, end[2] + .21), .15 - .02 * i, .14, 20 + i)


SCULPTS = {1: marrow_stalker, 3: rift_weaver, 4: pulse_binder}
