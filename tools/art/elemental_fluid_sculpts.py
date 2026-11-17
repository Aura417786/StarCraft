"""Organic anatomy for the tide, storm and spore bosses.

The Blender bake calls these recipes with the standard four material
batches. All geometry uses the game's x/depth/z engineering coordinates.
"""

from math import cos, pi, sin
from mathutils import Vector


TAU = 2 * pi
PALETTES = {
    0: ((.012, .041, .075), (.093, .34, .44), (.24, .91, 1.0)),
    6: ((.015, .040, .089), (.20, .33, .56), (.27, .62, 1.0)),
    7: ((.026, .053, .024), (.32, .36, .126), (.72, 1.0, .24)),
}


def mantle_lip(sculpt, center, width, depth, rise, salt, layer="carapace"):
    """Closed fluted bell with lobed silhouette and recessed underside."""
    cx, cy, cz = center
    grid = []
    for ring in range(13):
        theta = .025 + ring / 12 * (pi - .05)
        fullness = sin(theta)
        row = []
        for side in range(40):
            angle = TAU * side / 40
            fold = .07 * cos(angle * 9 + salt) + .084 * sin(angle * 4 - salt)
            x = cx + width * cos(angle) * fullness * (1 + fold)
            y = cy + depth * sin(angle) * fullness * (1 + fold)
            underside = .23 + .34 * max(0, cos(theta))
            z = cz + rise * cos(theta) + fullness ** 4 * (fold - underside * .22)
            shade = .29 + .18 * cos(theta) + .20 * sin(angle * 13 + theta * 8 + salt)
            row.append(sculpt.vertex(layer, (x, y, z), shade, (.31, 1.24)))
        grid.append(row)
    sculpt.surface(layer, grid)


def tune_motion(sculpt, layer, start, behavior):
    """Offset attached organs in concert, with the same wave on their anchors."""
    positions, _, _, breathe, attack, rupture = sculpt.parts[layer]
    for i in range(start, len(positions)):
        p = positions[i]
        pulse_delta, attack_delta, open_delta = behavior(p)
        breathe[i] = p + Vector(pulse_delta)
        attack[i] = p + Vector(attack_delta)
        rupture[i] = p + Vector(open_delta)


def broodmother(s):
    # Translucent inner flesh nested in a broad, fluted chitin canopy.
    s.lobe((.55, .12, .27), (1.17, .66, .39), "membrane", ridge=9, segment=29, rings=13)
    mantle_lip(s, (.55, .19, .45), 1.30, .67, .34, .67)
    mantle_lip(s, (.79, .27, .64), .98, .47, .31, 1.54)
    s.lobe((-.31, -.24, -.10), (.50, .37, .36), "membrane", ridge=12, rings=12)
    s.lobe((-.39, -.56, -.06), (.31, .095, .20), "signal", segment=22, rings=11, angle=.20)

    # Repeating radial ribs follow the canopy instead of piling up into an orb.
    for rib in range(11):
        k = rib / 10
        x = -.55 + 2.30 * k
        lift = .15 * sin(k * pi)
        outer = (x, -.40 - .07 * sin(k * pi), .25 + lift)
        tip = (x - .19, -.48, -.05 + .72 * k)
        s.limb([(x + .15, -.09, .72 + .29 * sin(k * pi)),
                (x + .05, -.29, .62 + .24 * sin(k * pi)), outer, tip],
               .075 - .021 * k, "rib", steps=15, sides=7, flatten=.57, motion=(.20, 1.24))
        if rib % 2 == 0:
            s.limb([outer, (x -.13, -.49, .15 + lift * .66), tip], .014, "signal",
                   steps=9, sides=5, motion=(.2, 1.24))
    for eye in range(3):
        s.lobe((-.63 + .19 * eye, -.64 + eye * .006, -.01 - .10 * eye),
               (.064 - .010 * eye, .071, .043), "signal", segment=12, rings=8)

    # The frontal tentacles pull in together, then unfurl in a layered fan.
    for finger in range(7):
        z = -.03 - finger * .071
        depth = -.41 + finger * .103
        x = -.15 + finger * .095
        reach = 1.94 - finger * .16 + .089 * sin(1.8 * finger)
        path = [(x, depth, z), (x - .36, depth - .07, z - .31),
                (x - .80, depth + .08, z - .51 - finger * .035),
                (x - reach * .84, depth - .02, z - .42 + .08 * cos(finger)),
                (x - reach, depth + .05, z - .14 - finger * .029),
                (x - reach + .11, depth + .10, z + .02 - finger * .044)]
        layer = "membrane" if finger % 2 == 0 else "carapace"
        thickness = .147 - .012 * finger
        s.limb(path, thickness, layer, steps=33, sides=10, taper=.035,
               flatten=.79, motion=(1.23 + .16 * finger, 1.46), ridge=5)
        if finger < 4:
            vein = [(ox, oy - thickness * (.75 - t * .13), oz + .021) for t, (ox,oy,oz) in enumerate(path[:5])]
            s.limb(vein, .018, "signal", steps=22, sides=6, motion=(1.23 + .16 * finger, 1.46))
    for feeler in range(5):
        z = .30 - feeler * .20
        s.limb([(1.02, .29, z), (1.58,.32,z-.17), (1.94,.24,z-.45),
                (2.21+.06*cos(feeler),.06,z-.37)], .063 - .005 * feeler,
               "rib", steps=17, sides=7, motion=(1.52, 1.11))


def thunder_wyrm(s):
    """A long continuous body carrying articulated scale rows and electrodes."""
    backbone = [(-1.56, -.12, .45), (-1.02, -.11, .70), (-.51, -.06, .59),
                (.02, .12, .28), (.49, .27, -.20), (.84, .22, -.56),
                (1.40, .06, -.63), (1.80, -.03, -.44), (2.14, .06, -.08),
                (2.17, .19, .33)]
    s.limb(backbone, lambda t: .37 * (1-t) ** .78 + .018, "membrane",
           steps=60, sides=16, flatten=.82, motion=(.3, 1.0), ridge=6)
    s.lobe((-1.49,-.18,.50),(.62,.40,.32),"carapace",segment=29,rings=13,angle=-.16)
    s.lobe((-1.80,-.35,.30),(.38,.27,.14),"membrane",ridge=8,angle=.10)
    s.lobe((-1.59,-.45,.45),(.32,.16,.16),"carapace",ridge=7)
    s.lobe((-1.61,-.58,.53),(.108,.056,.051),"signal",segment=16,rings=9)
    s.limb([(-1.85,-.53,.60),(-1.60,-.64,.65),(-1.33,-.52,.65),(-1.10,-.41,.78)],.091,
           "rib",steps=17,sides=8,flatten=.65,taper=.45)
    for tooth in range(5):
        x = -2.04 + .104 * tooth
        s.limb([(x,-.49,.38),(x-.046,-.53,.28),(x-.10,-.50,.24)],
               .046, "rib", steps=7,sides=6,taper=.03)

    for i in range(18):
        t = (i + .68) / 19
        pos = t * (len(backbone) - 1)
        seg = min(len(backbone)-2, int(pos))
        a, b = map(Vector, backbone[seg:seg + 2])
        x, depth, z = a.lerp(b, pos - seg)
        r = .36 * (1-t) ** .75 + .029
        for flag in (-1, 1):
            blade = [(x -.20, depth - r*.38, z + flag * r*.17),
                     (x -.01, depth - r*.95, z + flag * r*.64),
                     (x + .15, depth - r*.69, z + flag * r*.90),
                     (x + .21, depth - r*.30, z + flag * r*.98)]
            s.limb(blade, r*.52, "carapace", steps=9, sides=7, flatten=.50, taper=.07)
            if flag == 1 and i % 2 == 0:
                s.limb([(x -.04,depth-r*.20,z+r*.64),(x+.06,depth-r*.13,z+r*1.25),
                        (x+.21,depth+.07,z+r*(1.67+.13*sin(i)))], r*.36,
                       "rib",steps=10,sides=7,taper=.03,flatten=.70)
        s.lobe((x + .02, depth-r*.95, z+r*.11), (r*.18,r*.19,r*.18),
               "signal",segment=12,rings=7,albedo=.92)
    s.limb(backbone[-4:], lambda t: .054 * (1 - t) + .01, "signal", steps=24, sides=6)
    s.limb([(1.68,.02,-.41),(2.06,-.10,-.10),(2.38,-.14,.37),(2.46,.03,.58)],
           .116,"rib",steps=17,sides=8,flatten=.48,ridge=3)
    s.limb([(1.57,.07,-.58),(1.84,.21,-.60),(2.04,.22,-.37)],.102,
           "carapace",steps=12,sides=8,flatten=.48)

    # Charge yanks the tail rearward across all four material batches.
    def wave(p):
        x, y, z = p
        tail = max(0, min(1, (x + 1.22) / 3.45))
        bend = sin(tail * pi * 1.6)
        return ((.034 * tail, -.10 * tail, .15 * bend * tail),
                (-.16 * tail, -.35 * tail, .37 * bend * tail - .19 * tail),
                (.14 * tail, -.18 * tail, .23 * z * tail + .14 * bend))

    for layer in ("carapace","membrane","rib","signal"):
        tune_motion(s, layer, 0, wave)


def spore_regent(s):
    # Matte stepped bark hides a yellow respirator surrounded by flexible gills.
    s.lobe((.47,.14,.03),(1.27,.66,.49),"carapace",ridge=13,segment=29,rings=15)
    s.lobe((-.54,-.16,.11),(.72,.51,.43),"membrane",ridge=9,segment=25,rings=13)
    s.lobe((-.83,-.54,.08),(.30,.16,.24),"signal",ridge=13,wrinkle=.37,segment=23,rings=14)
    s.ring((-.82,-.62,.09),(.35,.26),"rib",thick=.037,warp=.069,motion=(.41,1.25))
    for flap in range(11):
        a = TAU * flap / 11
        x, z = cos(a), sin(a)
        s.limb([(-.81+.32*x,-.57,.08+.26*z),(-.84+.43*x,-.67,.08+.36*z),
                (-.93+.38*x,-.73,.08+.31*z)], .060 + .016 * cos(2 * a),
               "membrane",steps=12,sides=7,flatten=.51,motion=(.49,1.58))
    caps = [(-.68,.10,.70,.69,.42,.30),(.12,.14,.69,.70,.50,.35),
            (.84,.21,.65,.65,.46,.31),(1.39,.21,.40,.45,.34,.24),
            (.23,.41,.89,.45,.28,.30)]
    for i, (x,y,z,wide,deep,lift) in enumerate(caps):
        mantle_lip(s,(x,y,z),wide,deep,lift,1.3+i,"carapace" if i <= 2 else "membrane")
        for vein in range(6):
            k = (vein + .22) / 6
            center_x = x + wide * (k * 1.74 - .87)
            ridge = sin(k * pi)
            s.limb([(center_x+.06,y-deep*.25,z+.08*ridge),(center_x,y-deep*.61,z-.12),
                    (center_x-.05,y-deep*.79,z-.22*ridge)], .032,
                   "rib",steps=9,sides=6,flatten=.55,motion=(.26,1.35))
        s.lobe((x-.08,y-deep*.53,z-lift*.73),(.12,.09,.097),"signal",segment=14,rings=9)

    # Hanging sacs inflate and branch into uneven root tendrils.
    for i in range(7):
        x = -.80 + .36*i
        y = -.30 + .19*sin(i*1.86)
        z = -.57 -.17*cos(i*2)
        radius = .12 + .085*(.5 + .5*cos(i*2))
        s.lobe((x,y,z),(radius,radius*.86,radius*1.38),"membrane",ridge=10,
               segment=17,rings=10,motion=(.43,1.1))
        s.lobe((x-.018,y-radius*.77,z+.031),(radius*.49,radius*.29,radius*.68),
               "signal",ridge=8,segment=12,rings=8,motion=(.43,1.1))
        stalk = [(x,y,z+.11),(x-.12,y-.05,z-.29),(x+.20,y+.11,z-.49),
                 (x+.35+.12*cos(i),y+.20,z-.62)]
        s.limb(stalk, .075, "membrane", steps=18, sides=8, motion=(.82+i*.089,1.11))
        s.limb([stalk[1],(x-.14,y-.19,z-.34),(x-.39,y-.07,z-.50)], .039,
               "rib", steps=12,sides=6,motion=(1.12,1.28))
    for i in range(4):
        s.limb([(.82,.10,.19),(1.37,.18,.16-i*.10),(1.87,.31,.46-i*.16),
                (2.23-.08*i,.22,.61-i*.19)], .085, "carapace", steps=21,sides=8,motion=(1.28,1.1))


SCULPTS = {0: broodmother, 6: thunder_wyrm, 7: spore_regent}
