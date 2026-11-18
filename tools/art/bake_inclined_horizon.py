"""Project the game's original accretion material into an inclined, lensed disk.

RGB is accumulated in premultiplied space, then exported as straight-alpha WebP.
Run from the repository root. Columns are phase and rows are consecutive cycles
of four frames. Gas makes a complete, seamless orbit over twelve keys.
"""
from pathlib import Path
import sys
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[2]
folder = root / "assets/vfx/nextgen"
src = np.asarray(Image.open(folder / "black-hole-accretion.png").convert("RGBA"), dtype=np.float32) / 255
size = 576, 352
count = 12
y, x = np.indices((size[1], size[0]), dtype=np.float32)
x = (x + .5 - size[0] / 2) / (size[0] / 2)
y = (y + .5 - size[1] / 2) / (size[0] / 2)
rad = np.hypot(x, y)
angle = np.arctan2(y, x)
left = .5 - .5 * np.cos(angle)


def smooth(a, b, v):
    t = np.clip((v - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def material(radius, theta):
    """Bilinear polar lookup from the authored face-on material."""
    sx = np.clip((.50 + .5 * radius * np.cos(theta)) * (src.shape[1]-1), 0, src.shape[1]-1.001)
    sy = np.clip((.50 + .5 * radius * np.sin(theta)) * (src.shape[0]-1), 0, src.shape[0]-1.001)
    ix, iy = sx.astype(int), sy.astype(int)
    dx, dy = (sx-ix)[..., None], (sy-iy)[..., None]
    return (src[iy,ix]*(1-dx)+src[iy,ix+1]*dx)*(1-dy) + (src[iy+1,ix]*(1-dx)+src[iy+1,ix+1]*dx)*dy


def render(phase):
    rgb = np.zeros((*rad.shape,3),np.float32)
    alpha = np.zeros(rad.shape,np.float32)

    def layer(color, coverage):
        a = np.asarray(np.clip(coverage, 0, 1), dtype=np.float32)
        rgb[:] = color*a[...,None]+rgb*(1-a[...,None])
        alpha[:] = a+alpha*(1-a)

    # Distant material stays on the inclined plane. Differential advection
    # changes local density without making the entire singularity rotate.
    height = y + .16*x
    disc_r = np.hypot(x*.99, height/.86)
    disc_a = np.arctan2(height/.86, x*.99)
    advect = .13*np.sin(phase+.9*disc_r)+.045*np.sin(2*phase-2*disc_r)
    disk = material(1.27*disc_r, disc_a + advect)
    exposure = .80 + .52 * (.5-.5*np.cos(disc_a)) + .12*np.sin(phase+disc_a*3-disc_r*9)
    color = np.clip(disk[...,:3]*np.array([1.12,.81,1.0])*exposure[...,None],0,1)
    opacity = disk[...,3] * (1-smooth(.95,1,disc_r))
    layer(color,opacity)

    # The far face is mapped onto two separate apparent arcs around the
    # horizon. The narrow lower-order counterimage is dimmer than the upper arc.
    rear = .5-.5*np.sin(angle)
    width = .065+.142*rear**1.45
    distance = (rad-.255)/width
    surface = material(.22 + distance*.49, angle*.93+.13*np.sin(phase+distance*1.5)-.75)
    band = smooth(-.08,.12,distance)*(1-smooth(.77,1.09,distance))
    glow = .66+.58*left
    lens_color = surface[...,:3]*glow[...,None] + np.array([.055,.043,.10])
    layer(np.clip(lens_color,0,1), band*(.70+.30*surface[...,3])*(.54+.46*rear))
    # A near face-on corona has tangent folds. The approaching inner winding
    # is hotter; the exterior folds keep violet/cobalt shadow between peaks.
    for n, (r0,width) in enumerate([(.299,.031),(.32,.027),(.36,.045),(.414,.057),(.487,.06)]):
        wav = .43+.49*np.cos(angle*2-rad*13+n*.32+.18*np.sin(phase))+.20*np.sin(angle*3+rad*22)
        base = r0 + wav*(.023+n*.009)
        d=(rad-base)/width
        opacity=np.exp(-(d+.22)**2*1.6)*(.87-.09*n)*(.65+.35*rear)*(.73+.27*np.cos(angle-n*1.14))
        texture=material(.31+.32*smooth(-1,1,d), angle+advect*.62+n*.9)
        lum=np.exp(-((d+.46)/.17)**2)
        ink=np.clip(texture[...,:3]*np.array([1.05,.78,1.01])*(.56+.24*rear[...,None])+lum[...,None]*np.array([.44,.31,.47]),0,1)
        layer(ink,opacity)
    # The feeders are two folded translucent sheets. Their ridges cross
    # behind each other; coherent strands run into the orbit rather than
    # stretching a single bright ray over the screen.
    s = np.clip((np.abs(x)-.235)/.775,0,1)
    side=np.where(x<0,-1,1)
    abs_x = np.abs(x)
    ribbon_alpha = smooth(.223,.263,abs_x)
    # Differential tidal shear pulls the four membranes out to different
    # lengths on either side. Only the exposed tips delaminate into wisps.
    left_tips = (.959,.794,.896,.746)
    right_tips = (.840,.964,.757,.906)
    for j in range(4):
        angle_s=s*7.8+side*.82+j*.58+.39*np.sin(phase+j*.40)+.46*np.sin(s*11.6)
        curve = side*(.04-.093*np.sqrt(s)+.078*np.sin(angle_s)*smooth(0,.20,s)) - .092*x
        curve += side*.037*np.cos(1.2+angle_s)*np.exp(-s*9)
        tip=np.where(x<0,left_tips[j],right_tips[j])+.010*np.sin(phase+j*1.57+side)
        taper=smooth(tip-.205,tip,abs_x)
        fan=side*(j-1.35)*.045
        curve+=taper*(fan+.028*np.sin(angle_s*1.4+phase))
        base_half=.018+.036*(.50+.50*np.cos(angle_s+side*.6))+.018*np.sqrt(s)
        half=base_half*(1-.962*taper)
        uv=(y-curve)/half
        edge=smooth(.99,.90,np.abs(uv))
        selvage=np.exp(-((np.abs(uv)-.90)/.067)**2)
        shine=np.exp(-((uv-.46*np.sin(angle_s*1.12))/.37)**2)
        detail=.94+.06*np.sin(uv*47+angle_s*3.1)
        col=np.zeros((*rad.shape,3),np.float32)
        col[:]=[.16,.026,.29]
        col+=shine[...,None]*np.array([.53,.048,.34])
        col+=selvage[...,None]*np.array([.74,.30,.57])
        col+=((.5+.5*np.sin(angle_s))*.12)[...,None]*np.array([1,.1,1])
        layer(np.clip(col*detail[...,None],0,1),
              edge*ribbon_alpha*(.57+.26*shine)*(1-smooth(tip-.09,tip,abs_x)))
        for k in range(2):
            fork_end=np.minimum(.982,tip+.019+k*.036)
            fork=smooth(tip-.159,fork_end,abs_x)
            bend=side*(2*k-1)*(.014+.037*fork)+fan*.25
            fibre_y=curve+(2*k-1)*half*.63+fork*bend
            fibre_y+=.013*fork*np.sin(abs_x*31+phase+j*1.81+k)
            fibre_width=.0018+.0065*(1-fork)
            distance=(y-fibre_y)/fibre_width
            weight=smooth(tip-.165,tip-.102,abs_x)*(1-smooth(tip-.034,fork_end,abs_x))
            layer(np.array([.79,.23,.75]) if k else np.array([.67,.21,.83]),
                  np.exp(-distance**2*1.55)*weight*(.45+.16*np.sin(angle_s+j)**2))
    # Stable black occultation with a nearly white irregular inner lip. Only
    # a few faint gravitationally bent fragments sit against its outer rim.
    rim_r = .254+.0018*np.sin(angle*3+.15*np.sin(phase))
    limb=rad-rim_r
    grain=.86+.14*np.sin(angle*27+2.7*np.sin(angle*8+.5*np.sin(phase)))
    hotspot=.53+.47*(.5+.5*np.cos(angle*2-.64))**2
    for width,color,gain in [(.043,[.82,.18,.65],.65),(.021,[1,.35,.80],.76),(.008,[1,.87,.99],.98)]:
        layer(np.array(color),np.exp(-(limb/(width*(1+.29*hotspot)))**2)*gain*grain)
    layer(np.array([1.0,.88,.97]),np.exp(-((limb-.013)/.016)**2)*hotspot**3*.82)
    inside=1-smooth(.246,.255,rad)
    halo=smooth(.16,.256,rad)**4
    core=np.zeros((*rad.shape,3),np.float32)
    core[:]=[.006,.004,.025]
    core+=halo[...,None]*np.array([.105,.024,.138])
    layer(core,inside)
    premul = np.divide(rgb,alpha[...,None],out=np.zeros_like(rgb),where=alpha[...,None]>.001)
    alpha *= (1-smooth(.505,.602,np.abs(y)))*(1-smooth(.93,.992,np.abs(x)))
    return Image.fromarray(np.uint8(np.clip(np.dstack((premul,alpha)),0,1)*255+.5))


def bake_horizon():
    sheet=Image.new("RGBA",(4*size[0],3*size[1]))
    for i in range(count):
        sheet.paste(render(i*np.pi*2/count),((i%4)*size[0],(i//4)*size[1]))
    sheet.save(folder/"void-inclined-horizon.webp",method=6,quality=91,alpha_quality=100)


if __name__ == "__main__":
    if "--horizon-only" in sys.argv:
        bake_horizon()
        sys.exit(0)
    # This contact material represents only the shearing outer annulus. The
    # game clips it to the live collision radii independently of the lens.
    py,px = np.indices((512,512),dtype=np.float32)
    px=(px+.5)/256-1; py=(py+.5)/256-1
    rr=np.hypot(px,py); a=np.arctan2(py,px)
    winding = np.cos(5*a+rr*27+.55*np.sin(3*a+rr*11))
    shear = .028*np.sin(3*a+rr*14)+.013*np.cos(8*a-rr*13)
    u = (rr+shear-.67)*3
    ink = material(np.clip(.26+.45*u,.15,.92),a+u*1.28)
    ridge=np.exp(-((rr-.943-shear*.41)/(.014+.006*(.5+.5*np.sin(7*a))))**2)
    light=.47+.5*(.5+.5*winding)*(.65+.35*np.sin(a*2+1)**2)
    cr=np.clip(ink[...,:3]*np.array([1.16,.78,1.19])*light[...,None]+ridge[...,None]*np.array([.56,.29,.55]),0,1)
    ca=smooth(.64,.80,rr)*(1-smooth(.966,.998,rr))*(.17+.65*ink[...,3])*(.52+.48*(.5+.5*winding))+.67*ridge
    ca*=1-smooth(.975,.998,rr)
    contact=Image.fromarray(np.uint8(np.clip(np.dstack((cr,ca)),0,1)*255+.5))
    contact.save(folder/"void-collapse-front.webp",method=5,quality=88)
    # A tileable strip of torn, folded spacetime with its brightness in the
    # ridges and deep purple in the folds; no emissive rectangular backing.
    py,px=np.indices((96,480),dtype=np.float32)
    theta=px/480*(2*np.pi)
    v=(py+.5)/48-1
    cr=np.zeros((*v.shape,3),np.float32);ca=np.zeros(v.shape,np.float32)
    for j in range(6):
        t=theta+j*.79
        mid=.50*np.sin(2*t+.61*np.sin(t))+.16*np.sin(t*5+j*.7)
        half=.075+.182*(.5+.5*np.sin(t+.4*j))**2
        height=(v-mid)/half
        cover=(1-smooth(.82,1.01,abs(height)))*(.71+.20*np.sin(t*2+j)**2)
        tex=material(.43+.12*np.sin(t*2+height),t+height*.16)
        aa=np.exp(-((height+.72)/.20)**2)
        bb=np.exp(-((height-.23*np.cos(t*2))/.5)**2)
        cc=np.array([.105,.027,.20])+tex[...,:3]*np.array([.49,.30,.57])*bb[...,None]+aa[...,None]*np.array([.75,.48,.73])
        cr=cc*cover[...,None]+cr*(1-cover[...,None]); ca=cover+ca*(1-cover)
    cr=np.divide(cr,ca[...,None],out=np.zeros_like(cr),where=ca[...,None]>.001)
    shear=Image.fromarray(np.uint8(np.clip(np.dstack([cr,ca]),0,1)*255+.5))
    shear.save(folder/"void-shear.webp",method=5,quality=91)
    if "--front-only" in sys.argv:
        sys.exit(0)
    bake_horizon()
