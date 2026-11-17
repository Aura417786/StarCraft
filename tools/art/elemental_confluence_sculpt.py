"""Three anatomically distinct organs bound into the Abyssal Confluence."""

from math import cos, pi, sin
from mathutils import Vector

from boss_sculpt import TAU


def blade(sculpt, root, tip, span, rise, key):
    root, tip = Vector(root), Vector(tip)
    axis = (tip - root).normalized()
    cross = axis.cross(Vector((0, -1, .2))).normalized()
    normal = cross.cross(axis)
    layer = "carapace"
    start = len(sculpt.parts[layer][0])
    surface = []
    for j, u in enumerate((0, .10, .27, .47, .67, .84, .94, 1)):
        face = root.lerp(tip, u) + normal * (rise * sin(pi * u))
        width = span * (.04 + .96 * sin(pi * (.20 + .79 * u)))
        row = []
        for k in range(10):
            angle = TAU * k / 10
            scallop = sin(k * 2.4 + j * 1.7 + key)
            v = face + cross * (cos(angle) * width * (1 + scallop * .1))
            v += normal * ((sin(angle) * .62 + scallop * .07) * width)
            row.append(sculpt.vertex(layer, v, .42 + .32 * sin(angle) + scallop * .09, (.15, .75)))
        surface.append(row)
    sculpt.surface(layer, surface)
    vertices, _, _, _, attack, unfurl = sculpt.parts[layer]
    for i in range(start, len(vertices)):
        reach = (vertices[i] - root).length / max(.01, (tip - root).length)
        attack[i] += normal * (reach * .13 * sin(key)) + axis * (reach * .07)
        unfurl[i] += cross * (reach * .18 * cos(key))


def confluence(sculpt):
    # A dark spine connects a recessed siphon, a long lance socket, and an exposed burst organ.
    spine = ((-.75, .12, -.04), (-.16, .15, .02), (.63, .23, .10),
             (1.21, .19, -.14), (1.65, .32, -.41), (2.04, .34, -.17))
    sculpt.limb(spine, lambda u: .08 + .43 * sin(pi * (.12 + .82 * u)),
                "membrane", steps=35, sides=14, flatten=.74, ridge=9, motion=(.30, .61))
    sculpt.lobe((.35, .20, -.02), (.92, .62, .68), "carapace", ridge=8, wrinkle=.26,
                segment=34, rings=21, angle=-.19, motion=(.13, .71))
    sculpt.lobe((-.86, -.29, .03), (.47, .25, .42), "membrane",
                ridge=13, wrinkle=.38, segment=30, motion=(.15, .60), albedo=.42)
    sculpt.ring((-.91, -.42, .035), (.49, .38), "rib", thick=.056, warp=.18, motion=(.17, .73))
    sculpt.ring((-.92, -.40, .04), (.295, .25), "signal", thick=.049, warp=.07, motion=(.24, .82))
    # Thin nested ribs obscure much of the organ itself, leaving a visibly hollow center.
    for j in range(6):
        phase = TAU * j / 6
        path = [(-.92 + cos(phase + t * .66) * (.47 - .27 * t),
                 -.41 - .13 * sin(pi * t),
                 .04 + sin(phase + t * .66) * (.37 - .16 * t)) for t in (0, .33, .66, 1)]
        sculpt.limb(path, .043, "rib", steps=8, sides=7, motion=(.18, 1.05))

    sculpt.lobe((.07, -.41, .56), (.29, .19, .12), "signal",
                ridge=6, wrinkle=.18, segment=25, rings=11, angle=.19, motion=(.20, .92))
    sculpt.limb(((.42, -.19, .55), (.13, -.51, .68), (-.33, -.63, .65), (-.77, -.65, .72)),
                lambda u: .095 * (.26 + .74 * sin(pi * (.25 + .72 * u))),
                "rib", steps=23, sides=9, flatten=.68, motion=(.23, 1.13))
    blade(sculpt, (.52, -.20, .65), (-.92, -.61, .75), .22, .18, 1.2)
    sculpt.lobe((.12, -.51, -.44), (.29, .20, .21), "signal", ridge=7, wrinkle=.53,
                segment=29, rings=16, motion=(.39, 1.43))
    sculpt.ring((.13, -.58, -.47), (.36, .235), "membrane", thick=.051, warp=.16, motion=(.49, 1.32))

    for j in range(5):
        u = j / 4
        blade(sculpt, (-.61 + j * .35, -.55 + .09 * j, .34 - .21 * u),
              (.22 + j * .45, -.30 + .035 * j, .94 - .18 * u), .29 - u * .092, .17, j + .8)
        blade(sculpt, (-.37 + j * .29, -.48 + .065 * j, -.36 + .08 * u),
              (.16 + j * .40, -.33, -.87 + .14 * u), .214 - u * .047, .10, j + 2.8)
        sculpt.limb(((.15 + j * .28, -.66 + j * .077, .24 - u * .47),
                     (.29 + j * .31, -.59 + j * .057, .15 - u * .43),
                     (.43 + j * .33, -.52 + j * .064, .32 - u * .28)),
                    .022, "signal", steps=10, sides=6, motion=(.15, .88))

    # Long appendages sweep at offset phases, with negative space between the three attack families.
    branches = (
        ((-.36, -.19, .52), (-1.10, -.31, .86), (-1.63, -.26, 1.08), (-1.98, -.06, .77), (-1.66, .05, .55)),
        ((-.30, .11, .40), (-.73, .09, .82), (-1.13, .17, 1.20), (-1.54, .31, 1.19)),
        ((-.28, -.28, -.32), (-.91, -.34, -.68), (-1.44, -.29, -.96), (-1.94, -.15, -.67), (-1.78, .11, -.35)),
        ((.24, -.14, -.53), (-.21, -.25, -.88), (-.65, -.22, -1.16), (-1.15, -.10, -1.12)),
        ((.50, -.10, .46), (.91, -.11, .78), (1.19, -.14, 1.09), (1.53, -.04, 1.13), (1.74, .14, .88)),
        ((.71, -.10, -.42), (1.08, -.04, -.72), (1.55, -.05, -.92), (1.98, .10, -.85)),
    )
    for j, path in enumerate(branches):
        layer = "membrane"
        start = len(sculpt.parts[layer][0])
        sculpt.limb(path, lambda u: .023 + (.15 + .018 * sin(j * 1.8)) * (1 - u) ** .65,
                    layer, steps=29, sides=10, ridge=9, motion=(.43, 1.15))
        positions, _, _, idle, attack, unfold = sculpt.parts[layer]
        for i in range(start, len(positions)):
            t = (i - start) / max(1, len(positions) - start - 1)
            side = 1 if path[-1][2] > 0 else -1
            idle[i].z += t * .17 * sin(j * 1.6 + t * 2.4)
            attack[i].x -= t * (.22 + .08 * cos(j * 1.3))
            attack[i].z += side * t * (.20 + .11 * sin(j))
            unfold[i].z += side * t * .20
        for k in range(2):
            base, median = Vector(path[k + 1]), Vector(path[k + 2])
            end = base.lerp(median, .82) + Vector((.022, -.095, .055 * (1 if j % 2 else -1)))
            blade(sculpt, base + Vector((.05, -.073, .01)), end, .119 - k * .02, .06, j * 2 + k)


SCULPTS = {10: confluence}
PALETTES = {10: ((.018, .010, .030), (.235, .164, .331), (.66, .25, .97))}
