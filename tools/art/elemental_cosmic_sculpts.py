"""Anatomy and motion for the mirror, void, and nerve-element Bosses."""

from math import cos, pi, sin

from mathutils import Vector


TAU = 2 * pi


def bend(sculpt, layer, first, deform):
    """Append authored motion deltas to the most recently added anatomy."""
    points, _, _, pulse, attack, unfurl = sculpt.parts[layer]
    for i in range(first, len(points)):
        changes = deform(points[i])
        pulse[i] += Vector(changes[0])
        attack[i] += Vector(changes[1])
        unfurl[i] += Vector(changes[2])


def count(sculpt, layer):
    return len(sculpt.parts[layer][0])


def foil_profile(t):
    sweep = t * t
    return (-.87 + 1.19 * sweep, 1.10 + .26 * t - .44 * sweep, -.065 + .30 * sin(t * pi))


def foil_point(t, u, face, side):
    front, width, depth = foil_profile(t)
    x = front + u * width
    # The membrane thins to the trailing edge, then twists into a sharp wingtip.
    thickness = (.24 * (1 - t) ** .74 + .018) * sin(pi * (.06 + .88 * u))
    bow = sin(pi * t) * sin(pi * u) * .16
    return (
        x,
        depth + (bow - .16 * u * t) * side + face * thickness,
        side * (t * 1.07 + u * t * .17 + .032 * sin(pi * u)),
    )


def ray(sculpt):
    for side in (-1, 1):
        first = count(sculpt, "carapace")
        grid = []
        # A closed foil with a real reflective thickness and one uninterrupted silhouette.
        for span in range(17):
            t = span / 16
            ring = []
            for face, chord in ((1, range(11)), (-1, range(10, -1, -1))):
                for column in chord:
                    u = column / 10
                    shade = .19 + .54 * (1 - u) + (column % 3) * .08
                    ring.append(sculpt.vertex(
                        "carapace", foil_point(t, u, face, side), shade, (.10, .24)
                    ))
            grid.append(ring)
        sculpt.surface("carapace", grid)
        bend(sculpt, "carapace", first, ray_stroke)
        for stripe in range(3):
            along = .22 + stripe * .20
            first = count(sculpt, "rib")
            edge = []
            for index in range(15):
                t = .15 + index * .059
                x, d, h = foil_point(t, along + .08 * sin(index * .24), -1, side)
                edge.append((x, d - .018, h))
            sculpt.limb(edge, .039 - stripe * .009, "rib", steps=17, sides=7,
                        taper=.09, flatten=.45, motion=(.08, .18))
            bend(sculpt, "rib", first, ray_stroke)
    sculpt.lobe((-.42, -.06, 0), (.96, .40, .34), "membrane",
                segment=30, ridge=6, angle=-.05, wrinkle=.105)
    sculpt.lobe((-.82, -.29, 0), (.49, .19, .209), "carapace",
                ridge=5, angle=-.12, wrinkle=.095)
    for side in (-1, 1):
        sculpt.lobe((-1.04, -.423, side * .16), (.142, .052, .052), "signal",
                    ridge=3, segment=14, rings=7, angle=side * .26)
        sculpt.limb([(-1.39, -.11, side * .075), (-1.26, -.21, side * .19),
                     (-.86, -.32, side * .23), (-.55, -.26, side * .25)],
                    .064, "rib", sides=8, steps=19, taper=.31)
    for depth in (-.13, .10):
        sculpt.limb([(.38, depth, .06), (.95, depth, -.15), (1.38, depth, -.23),
                     (1.78, depth - .14, -.10), (1.96, depth - .2, .13)],
                    .095, "membrane", steps=29, sides=9, motion=(.92, .75))


def ray_stroke(p):
    x, depth, z = p
    edge = min(1, abs(z) ** 1.45)
    return ((0, -.19 * edge, -.055 * z),
            (.20 * edge, -.38 * edge, -.04 * z),
            (-.10 * edge, .19 * edge, .17 * z))


def aperture(radius, angle, depth):
    # The aperture faces both the player and the camera.
    return (
        -1.04 + .56 * depth + .72 * radius * cos(angle),
        -.68 + .83 * depth - .47 * radius * cos(angle),
        .24 + radius * sin(angle) * .94,
    )


def maw(sculpt):
    # Five expanding throat bands form a concave cavity rather than a round face.
    for layer, bands in (
        ("membrane", ((.075, .68), (.21, .61), (.34, .42), (.50, .24), (.62, .05), (.68, -.05))),
        ("carapace", ((.39, .53), (.57, .33), (.68, .15), (.75, .01), (.68, -.08), (.62, .04))),
    ):
        first = count(sculpt, layer)
        grid = []
        for row, (radius, depth) in enumerate(bands):
            ring = []
            for step in range(44):
                angle = TAU * step / 43
                corrugation = 1 + (.025 + row * .010) * cos(angle * 9 + .61 * row)
                p = aperture(radius * corrugation, angle, depth)
                shade = .07 + .32 * row / len(bands) + .13 * cos(angle * 5)
                ring.append(sculpt.vertex(layer, p, shade, (.08, .31), albedo=.50 if layer == "membrane" else 1))
            grid.append(ring)
        sculpt.surface(layer, grid, closed=False)
        bend(sculpt, layer, first, maw_dilate)
    for tooth in range(17):
        theta = TAU * (tooth + .2) / 17
        t = .022 * sin(tooth * 2.7)
        first = count(sculpt, "rib")
        sculpt.limb([aperture(.69, theta, .04), aperture(.68, theta + .025, -.125 - t),
                     aperture(.57, theta + .07, -.18 - t), aperture(.46, theta + .095, -.10)],
                    .074 + .017 * cos(tooth * 2.4), "rib",
                    steps=9, sides=6, flatten=.67, motion=(.13, .49))
        bend(sculpt, "rib", first, maw_dilate)
    first = count(sculpt, "signal")
    for band in range(2):
        radius = .45 - band * .17
        rift = [aperture(radius * (.96 + .04 * cos(i * .59)), TAU * (i / 45), .34 + band * .16)
                for i in range(46)]
        sculpt.limb(rift, .025 - band * .007, "signal", steps=45, sides=7, taper=1,
                    flatten=.8, motion=(.12, .42))
    bend(sculpt, "signal", first, maw_dilate)
    path = [
        (-.69, .35, .27, .49), (-.26, .40, .48, .50), (.11, .43, .62, .47),
        (.50, .34, .59, .41), (.83, .27, .42, .37), (1.10, .21, .19, .32),
        (1.33, .14, -.10, .28), (1.54, .08, -.32, .22), (1.77, .08, -.48, .16),
        (2.02, .17, -.48, .11), (2.23, .25, -.35, .07),
    ]
    for section, (x, depth, z, width) in enumerate(path):
        first = count(sculpt, "carapace")
        sculpt.lobe((x, depth, z), (.29 if section < 7 else .23, width, width * .86),
                    ridge=7, segment=19, rings=10, angle=sin(section * .43) * .64,
                    wrinkle=.23, albedo=.75 + (section % 3) * .10,
                    motion=(.08, .15))
        bend(sculpt, "carapace", first, maw_flex)
        if section >= 8:
            continue
        for side in (-1, 1):
            first = count(sculpt, "rib")
            sculpt.limb([(x - .17, depth - width * .40, z + side * width * .72),
                         (x, depth - width * .73, z + side * width * .91),
                         (x + .25, depth - width * .57, z + side * width * 1.10)],
                        width * .138, "rib", sides=6, steps=9,
                        motion=(.08, .19), flatten=.7)
            bend(sculpt, "rib", first, maw_flex)


def maw_dilate(p):
    x, depth, z = p
    return ((-.019, -.026, .03 * (z - .24)),
            ((x + 1.04) * .23 - .05, -.05, (z - .24) * .26),
            ((x + 1.04) * .31, -.098, (z - .24) * .41))


def maw_flex(p):
    x, depth, _ = p
    wave = max(0, x + .83) / 3
    return ((-.043 * wave, .08 * wave, .14 * wave * sin(x * 3.3)),
            (-.086 * wave, .14 * wave, .28 * wave * sin(x * 2.1 + .3)),
            (.16 * wave, .13 * wave, .21 * wave * cos(x * 2.6)))


def neural(sculpt):
    # Split cortical folds held in a visible cage, with local signal organs.
    for i in range(6):
        t = i / 5
        x = -.65 + t * 1.57
        for side in (-1, 1):
            z = side * (.23 + .11 * sin(pi * t))
            sculpt.lobe((x, -.05 + side * .082, z), (.35 - t * .085, .38, .28 - t * .044),
                        "membrane", ridge=8, twist=1.35, wrinkle=.25, segment=24, rings=12,
                        angle=side * .18 + t * .26, motion=(.30, .44))
            sculpt.lobe((x - .055, -.377 + t * .07, z * .91),
                        (.121 - t * .034, .062, .074 - t * .02), "signal",
                        ridge=5, segment=13, rings=8, motion=(.26, .53))
    for side in (-1, 1):
        for i in range(5):
            x = -.65 + i * .30
            tip = .74 + .27 * sin(pi * i / 5)
            first = count(sculpt, "carapace")
            sculpt.limb([(x + .30, .26, side * .27), (x + .03, .05, side * .49),
                         (x + .06, -.27, side * .69), (x + .26, -.29, side * tip),
                         (x + .50, -.07, side * (tip + .11))],
                        .14 - i * .016, "carapace", steps=19, sides=8,
                        taper=.08, flatten=.67, motion=(.22, .68))
            bend(sculpt, "carapace", first, nerve_fan)
        # The two large sensor forks articulate differently from the downstream leads.
        for i in range(3):
            first = count(sculpt, "rib")
            sculpt.limb([(-.77 + i * .12, -.04, side * .28), (-.91, -.23, side * (.46 + i * .16)),
                         (-1.15 - i * .05, -.39, side * (.57 + i * .12)),
                         (-1.63 - i * .10, -.29, side * (.40 + i * .17))],
                        .083 - i * .013, "rib", steps=16, sides=7, taper=.15,
                        flatten=.68, motion=(.19, .35))
            bend(sculpt, "rib", first, nerve_fan)
        for i in range(3):
            spread = .29 + i * .22
            start = (1.01, -.12 + i * .11, side * spread * .41)
            hinge = (1.42 + i * .08, -.20, side * spread * .92)
            tip = (2.00 - i * .22, -.24 - i * .075, side * spread * 1.22)
            first = count(sculpt, "membrane")
            sculpt.limb([start, hinge, tip], .082 - i * .012, "membrane", steps=23, sides=8,
                        taper=.17, motion=(.88, .87))
            bend(sculpt, "membrane", first, nerve_fan)
            for fork in (-1, 1):
                first = count(sculpt, "signal")
                sculpt.limb([hinge, (tip[0] - .20, tip[1], tip[2] + fork * .15),
                             (tip[0] + .13, tip[1] - .053, tip[2] + fork * .23)],
                            .021, "signal", steps=12, sides=6, motion=(.58, .78))
                bend(sculpt, "signal", first, nerve_fan)
    sculpt.lobe((-.91, -.26, .025), (.35, .24, .24), "carapace",
                ridge=9, segment=25, rings=12, angle=.04, wrinkle=.17)
    sculpt.lobe((-1.165, -.397, .02), (.12, .086, .087), "signal",
                ridge=5, twist=.9, segment=15, rings=9)


def nerve_fan(p):
    x, depth, z = p
    switch = sin(x * 2.7 + abs(z) * 3.8)
    ext = abs(z) + max(0, x - .7) * .38
    return ((.027 * switch, .052 * z, .05 * ext * switch),
            (.12 * ext, -abs(z) * .095, -.35 * z),
            (-.057 * ext, .061 * switch, .30 * z))


SCULPTS = {5: ray, 8: maw, 9: neural}
PALETTES = {
    5: ((.028, .061, .115), (.28, .61, .86), (.23, .80, 1)),
    8: ((.015, .012, .034), (.13, .065, .25), (.64, .20, 1)),
    9: ((.050, .013, .041), (.37, .090, .31), (.98, .24, .56)),
}
