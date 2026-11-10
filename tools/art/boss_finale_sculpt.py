"""Finale silhouettes built separately so the revised collision objectives remain legible."""

from math import cos, pi, sin
from boss_sculpt import TAU


def marrow_reliquary(s):
    s.lobe((.03, .03, .02), (.48, .39, .85), "membrane", ridge=7)
    s.lobe((-.16, -.35, .06), (.21, .15, .49), "signal", ridge=8, wrinkle=.30)
    for side in (-1, 1):
        for i in range(5):
            z = side * (.23 + .13 * i)
            s.limb([(.30, .16, z * .39), (.48 - .08 * i, -.20, z), (.04, -.42, z + .04),
                    (-.48, -.32, z * .61)], .07, "rib", motion=(.21, 1.22), sides=8)


def uncased_furnace(s):
    s.lobe((0, .05, .0), (.54, .50, .64), "signal", ridge=8, wrinkle=.37)
    s.ring((.03, -.42, .01), (.51, .61), "rib", thick=.092, warp=.17)
    for i in range(6):
        t = i * TAU / 6
        x, z = cos(t), sin(t)
        s.limb([(x * .39, .19, z * .52), (x * .62, -.06, z * .73), (x * .77, -.16, z * .86),
                (x * .51, -.31, z * .58)], .20, "carapace", motion=(.44, 1.45), flatten=.64)
    s.lobe((-.12, -.46, .0), (.20, .085, .43), "membrane", ridge=9)


def unstrung_heart(s):
    s.lobe((0, -.15, 0), (.38, .28, .53), "signal", ridge=6, wrinkle=.24)
    for side in (-1, 1):
        for i in range(6):
            t = TAU * i / 6
            x, z = cos(t), sin(t)
            s.limb([(x * .28, .33, z * .30), (x * .51, .04, z * .72),
                    (x * .60, -.24, z * .64), (side * .08, -.49, z * .31)], .056, "rib",
                   flatten=.63, motion=(.35, 1.55), steps=18, sides=8)
    s.lobe((0, .18, -.07), (.46, .28, .43), "carapace", ridge=11)


def double_lock(s):
    s.lobe((.07, .17, 0), (.51, .41, .47), "carapace", ridge=7)
    s.lobe((-.20, -.21, 0), (.37, .26, .23), "signal", ridge=6)
    for side in (-1, 1):
        s.limb([(.40, .0, side * .24), (.34, -.13, side * .62), (-.25, -.34, side * .66),
                (-.64, -.19, side * .34)], .25, "membrane", motion=(.33, 1.85), flatten=.58)
        s.limb([(.20, -.19, side * .56), (-.21, -.31, side * .74), (-.71, -.28, side * .61),
                (-.73, -.16, side * .22)], .16, "rib", motion=(.33, 1.85))
        s.lobe((.24, -.16, side * .35), (.16, .13, .16), "carapace", ridge=4)


def mirror_sepulcher(s):
    s.lobe((.08, .15, 0), (.51, .27, .65), "carapace", ridge=12, angle=.16)
    for side in (-1, 1):
        s.ring((side * .16, -.19, side * .26), (.35, .42), "rib", thick=.07, warp=.12)
        s.lobe((side * .17, -.16, side * .26), (.31, .14, .39), "membrane", ridge=4, angle=side * .29)
    s.limb([(.15, -.45, -.57), (.24, -.44, -.22), (-.04, -.48, .13), (-.17, -.42, .56)], .034, "signal")


def severed_thunder(s):
    for i in range(10):
        t = i / 9
        a = .35 + t * TAU * .67
        r = .29 - .21 * t
        x, z = .65 * cos(a), .50 * sin(a)
        s.lobe((x, .09 * sin(a * 2), z), (r * 1.08, r, r * .82),
               "carapace" if i % 2 else "membrane", segment=16, rings=10, motion=(1 + t, .75))
        s.lobe((x, -.17, z), (r * .32, r * .24, r * .38), "signal", segment=12, rings=8)
    s.ring((-.19, -.28, .04), (.38, .45), "rib", thick=.045, warp=.22, motion=(.85, 1.2))


def last_spore_nest(s):
    s.lobe((.13, .12, -.10), (.67, .48, .47), "membrane", ridge=11)
    s.lobe((.04, -.22, -.15), (.32, .19, .32), "signal", ridge=7)
    for i in range(7):
        t = TAU * i / 7
        x, z = cos(t), sin(t)
        s.limb([(x * .26, .25, z * .21), (x * .57, -.13, z * .35), (x * .61, -.16, z * .60),
                (x * .32, -.14, z * .76)], .142, "carapace", flatten=.74, motion=(.58, 1.2))
        s.lobe((x * .48, -.17, z * .49), (.10, .13, .14), "rib", segment=12, rings=8)


def world_eater(s):
    s.lobe((0, -.26, 0), (.46, .43, .46), "carapace", ridge=5, wrinkle=.08)
    s.ring((0, -.40, 0), (.50, .49), "signal", thick=.048, warp=.15)
    s.ring((0, .07, 0), (.62, .68), "rib", thick=.075, warp=.26)
    for i in range(4):
        start = i * TAU / 4
        points = [(cos(start - t * 1.73) * (.51 + t * .49), .19 + sin(t * pi) * .26,
                   sin(start - t * 1.73) * (.47 + t * .31)) for t in (.0, .25, .50, .75, 1.)]
        s.limb(points, .115, "membrane", motion=(.88, 1.20))


def neural_crown(s):
    s.lobe((.10, .18, -.06), (.43, .31, .53), "membrane", ridge=7)
    for i in range(7):
        z = -.55 + .185 * i
        s.limb([(.43, .04, z - .14), (.36, -.15, z + .08), (.02, -.31, z + .20),
                (-.54, -.26, z + .10)], .095, "rib", flatten=.67, motion=(.32, 1.31))
        s.limb([(.45, .09, z), (.22, -.37, z - .10), (-.24, -.45, z - .16)],
               .031, "signal", sides=6)
    s.lobe((.11, -.39, -.05), (.25, .13, .33), "carapace", ridge=9)


def extinction_core(s):
    s.lobe((.08, .08, .05), (.57, .48, .57), "carapace", ridge=9)
    for i in range(3):
        t = i * TAU / 3
        x, z = cos(t) * .33, sin(t) * .37
        s.lobe((x, -.43, z), (.26, .17, .24), "signal", wrinkle=.30, ridge=8)
        s.ring((x, -.43, z), (.24, .23), "rib", thick=.058, warp=.065)
        s.limb([(x * .77, .21, z * .8), (x * 1.22, -.1, z * 1.66),
                (x * .98 + .22, -.25, z * 1.83), (x * .26 + .61, -.1, z * 1.14)], .13, "membrane",
               flatten=.68, motion=(.51, 1.66))


FINALES = [
    ("marrow-reliquary", marrow_reliquary), ("uncased-furnace", uncased_furnace),
    ("unstrung-heart", unstrung_heart), ("double-lock", double_lock),
    ("mirror-sepulcher", mirror_sepulcher), ("severed-thunder", severed_thunder),
    ("last-spore-nest", last_spore_nest), ("world-eater", world_eater),
    ("neural-crown", neural_crown), ("extinction-core", extinction_core),
]
