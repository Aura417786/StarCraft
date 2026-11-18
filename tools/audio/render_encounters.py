"""Render the encounter soloists, material signatures and fighter feedback.

Two warm-up passes give FluidSynth notes and reverb their natural loop tails.
All Foley is original deterministic synthesis. No external recorded effects.
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import subprocess

import numpy as np

from render_bank import ROOT, RATE, Score, command, master, normalized, render_synth, write_wav
from render_nextgen import colored, tone
from render_factions import victory_score

# Each row pairs one contour/rhythm and orchestration with two real arena events.
# Pitches are relative to the established faction score's local tonic.
BOSSES = [
    ("water", "tide", "tideWalls", "Sinking Light", 112, 40, (43, 75), (7, 3, 2, -5), (0, 1.5, 2.5, 3.25)),
    ("bone", "ribCage", "boneNova", "Dry Trophies", 112, 40, (115, 45), (0, 7, 3, 0, -2), (.25, .75, 1.5, 2.75, 3.25)),
    ("magma", "magmaCover", "magmaRift", "Furnace Vents", 124, 38, (58, 47), (0, 0, 1, 7), (0, 1.5, 2, 3)),
    ("silk", "loom", "silkCage", "The Unspooling", 104, 37, (46, 51), (0, 7, 6, 1), (.5, 1.25, 2.5, 3.5)),
    ("chitin", "pincerLock", "pincer", "Lockstep", 124, 38, (36, 114), (7, 0, 6, 3, 0), (0, .75, 1.5, 2.5, 3)),
    ("crystal", "mirrorDecoys", "mirrorArray", "Parallax", 124, 38, (10, 98), (3, 7, 12, 7), (.25, 1, 1.75, 3)),
    ("plasma", "tailConduit", "stormRing", "Countercurrent", 112, 40, (81, 12), (0, 2, 3, 7, 2), (0, .5, 1, 2.5, 3.5)),
    ("spore", "sporeNests", "sporeBloom", "Fruit of Sleep", 112, 40, (70, 53), (3, 2, 7, 0), (.5, 1.75, 2.25, 3)),
    ("void", "riftFold", "voidCollapse", "Entropy Well", 104, 37, (19, 89), (7, 6, 1, 0), (0, 1.75, 2.25, 3.5)),
    ("nerve", "neuralRelay", "neuralGrid", "Relay Choir", 104, 37, (11, 85), (0, 1, 7, 6, 1), (0, .75, 1.25, 2.75, 3.5)),
    ("fusion", "fusionLimbs", "fusion", "Three Bodies", 104, 37, (60, 52), (0, 7, 6, 0, 1), (0, .5, 1.5, 2.25, 3.25)),
]
REGIONS = {
    "hangar": ("Dock Lights", 84, 45, (4, 92), (0, 7, 2), (.5, 1.75, 3)),
    "belt": ("Debris Waltz", 116, 40, (12, 45), (7, 3, 2), (.25, 1.75, 3)),
    "wreck": ("Ember Wake", 116, 40, (47, 58), (0, 3, 2, 0), (0, 1.5, 2.25, 3.25)),
    "citadel": ("Hull Sonar", 116, 40, (70, 88), (7, 2, 0), (0, 1.5, 3.25)),
    "rift": ("Orbital Shear", 116, 40, (98, 53), (7, 6, 2), (.5, 2, 3.25)),
}


def solo(args, directory, name, bpm, root, instruments, contour, rhythm):
    score = Score(bpm)
    score.voice(0, instruments[0], 53, 44)
    score.voice(1, instruments[1], 75, 55)
    # Ground one four-bar question/answer in the home key. Leave half of each
    # statement empty for enemies and the moving harmony of the longer score.
    for bar in range(12):
        phrase = bar % 4
        if phrase in (0, 2):
            bends = contour if phrase == 0 else (*contour[1:], contour[0])
            for i, (degree, pulse) in enumerate(zip(bends, rhythm)):
                duration = rhythm[i + 1] - pulse if i + 1 < len(rhythm) else 4 - pulse
                score.note(0, bar * 4 + pulse, duration * (.78 if i % 2 == 0 else .55),
                           root + 12 + degree, 78 - 4 * (i % 3))
        else:
            score.note(1, bar * 4 + .5, 1.38, root + 19, 58)
            score.note(1, bar * 4 + 2.5, .6 if phrase == 3 else 1.1,
                       root + (12 if phrase == 3 else 14), 63)
    midi = directory / (name + ".mid")
    score.save(midi, 48)
    samples = render_synth(args.synth, args.soundfont, midi, args.work / "synth.wav")
    length = round(RATE * 16 * 60 / bpm)
    return normalized(samples[length:2 * length].copy(), .52)


def stargate(args, directory):
    # Keep the campaign's horn/harp cadence. Cello hands the final answer
    # to a distant flute, then the choir opens to E major as the gate clears.
    score = victory_score()
    score.voice(4, 73, 74, 62)
    score.voice(5, 52, 59, 64)
    score.voice(6, 10, 80, 55)
    for beat, pitch, duration in [(4.5,67,1.25),(6.25,64,1.15),(12.25,69,1.45),(14.25,66,1.3),
                                  (19.0,71,.75),(20.5,72,1.25),(22.1,67,1.4),(26.5,71,1.0),(28.3,76,2.2)]:
        score.note(4,beat,duration,pitch,61)
    for beat, chord in [(16,(55,59)),(20,(55,60)),(24,(54,59)),(28,(56,59,64))]:
        for index, pitch in enumerate(chord):
            score.note(5,beat+.28+index*.05,3.15,pitch,44+index*2)
    for beat, pitch in [(6.9,76),(14.9,78),(22.9,79),(27.2,78),(28.2,83)]:
        score.note(6,beat,.62,pitch,58)
    mid = directory/"enc_victory.mid"
    score.save(mid, 32)
    samples = render_synth(args.synth,args.soundfont,mid,args.work/"synth.wav")[:15*RATE].copy()
    fade = round(.72*RATE)
    samples[-fade:] *= np.linspace(1,0,fade)[:,None]
    return normalized(samples,.65)


def foley(family, ultimate):
    index = next(i for i, row in enumerate(BOSSES) if row[0] == family)
    rng = np.random.default_rng(6200 + index * 2 + int(ultimate))
    duration = 1.75 if ultimate else 1.02
    t = np.arange(round(duration * RATE)) / RATE
    p = t / duration
    low = colored(rng, len(t), 1.5, 210)
    air = colored(rng, len(t), .4, 2050)
    bright = colored(rng, len(t), .3, 4650)
    envelope = np.exp(-p * 2.1)
    body = np.zeros_like(t)

    def resonators(at, pitches, decay, level):
        age = np.maximum(t - at, 0)
        modes = sum(np.sin(2*np.pi * hz * age) / (i + 1) for i, hz in enumerate(pitches))
        return (t >= at) * (1 - np.exp(-age * 600)) * np.exp(-age * decay) * level * modes

    if family == "water":
        # Two breaking fronts with a low curling crest, spray and falling drops.
        for at in ((.07, .62, 1.12) if ultimate else (.03, .41)):
            local = np.maximum(0, t-at)
            crest = (1 - np.exp(-local*11)) * np.exp(-local*5)
            body += crest * (.85*low + .53*air + .16*bright)
            body += resonators(at+.06, (62, 93), 6, .31)
        for at in rng.uniform(duration*.54, duration*.91, 28):
            hz = rng.uniform(430, 1600)
            body += resonators(at, (hz, hz*1.6), 65, .10)
    elif family == "bone":
        for i, at in enumerate((.02, .23, .48, .83, 1.08) if ultimate else (.02, .16, .41)):
            body += resonators(at, (152+i*13, 379+i*64, 850, 1233), 13+i, .66)
            body += (t >= at)*np.exp(-np.maximum(t-at,0)*45)*air*.72
        for at in rng.uniform(.45, duration*.91, 20 if ultimate else 8):
            body += resonators(at, (rng.uniform(370,650), rng.uniform(1100,2300)), 43, .18)
    elif family == "magma":
        cracks = np.maximum(0, np.sin(2*np.pi*(11*t+12*t*t)))**16
        body = (.55*low + .48*tone(t,76,32,1,2.3))*envelope
        body += (.65*air+.27*bright)*cracks*(1-p) + .2*low*np.sin(np.pi*p)**2
        if ultimate:
            body += resonators(.53, (53, 86, 137), 4, .93) + .6*air*np.exp(-((t-.65)/.16)**2)
    elif family == "silk":
        body = (.28*tone(t,180,408,2.8,47)+.21*tone(t,281,612))*np.sin(np.pi*p)**1.5
        for i, at in enumerate((.08,.23,.48,.83,1.18) if ultimate else (.09,.41,.72)):
            body += resonators(at,(197+97*i,443+109*i,882+151*i),13,.48)
    elif family == "chitin":
        ratchet = np.maximum(0, np.sin(2*np.pi*(7*t+7*t*t)))**18
        body = ratchet*(air*.64 + .45*tone(t,238,346)) * np.sin(np.pi*p)
        for at in ((.06,.42,.82,1.1) if ultimate else (.08,.49)):
            body += resonators(at,(104,227,780),10,.86) + (t>=at)*np.exp(-np.maximum(t-at,0)*21)*low*.43
    elif family == "crystal":
        for i, at in enumerate((.01,.09,.22,.38,.56,.75,1.06) if ultimate else (.02,.19,.37)):
            hz = (734,977,1299,837,1115,1427,916)[i]
            body += resonators(at,(hz,hz*1.417,hz*2.283),3.6+i*.6,.50)
    elif family == "plasma":
        for i, at in enumerate((.04,.15,.38,.46,.64,.96,1.12) if ultimate else (.03,.19,.44)):
            age = np.maximum(t-at,0)
            body += (t>=at)*np.exp(-age*(19-i))*(air*.52+bright*.25+.65*tone(age,465-i*29,106,7,64))
        body += resonators(.38,(66,96),4,.69)
    elif family == "spore":
        body = .30*air*np.sin(np.pi*p)**2 + .19*low*np.sin(np.pi*p)
        for at in rng.uniform(0, duration*.83, 36 if ultimate else 14):
            age = np.maximum(t-at,0)
            hz = rng.uniform(100,430)
            body += (t>=at)*np.exp(-age*40)*np.sin(2*np.pi*hz*(age+.035*(1-np.exp(-age*48))))*.58
    elif family == "void":
        pivot = duration * (.65 if ultimate else .45)
        rise = np.minimum(1,t/pivot)**1.8
        body = (tone(t,140,49)+.42*tone(t,145,49))*rise*np.exp(-np.maximum(0,t-pivot)*13)*.44
        body += .39*air*rise*np.exp(-np.maximum(0,t-pivot)*18)
        body += resonators(pivot+.055,(44,67,117),4.5,.9)
    elif family == "nerve":
        for i, at in enumerate((.01,.13,.30,.49,.59,.83,1.05,1.21) if ultimate else (.02,.19,.30,.62)):
            age = np.maximum(t-at,0)
            hz = (370,740,556,294)[i%4]
            body += (t>=at)*np.exp(-age*18)*(.58*tone(age,hz,hz*.6,2.2,99)+.25*air)
    elif family == "fusion":
        for i, at in enumerate((.01,.16,.34,.55,.78,1.04) if ultimate else (.02,.24,.56)):
            age = np.maximum(t-at,0)
            hz = (81,126,219)[i%3]
            body += (t>=at)*np.exp(-age*6)*(.55*tone(age,hz,hz*.70,3.3,23)+.18*low)
        if ultimate:
            body += resonators(1.14,(49,75,118,159),5,.84) + .46*air*np.exp(-((t-1.17)/.12)**2)
    return finish(body, t)


def finish(signal, t):
    edge = np.minimum(1, t/.006) * np.minimum(1, (t[-1]-t)/.06)
    mono = normalized(np.tanh(signal) * edge, .59)
    return np.column_stack((mono, mono))


def resonance(family, signature):
    """A short material call, a silent answering beat, then sympathetic decay."""
    row = next(row for row in BOSSES if row[0] == family)
    bpm, root, contour, rhythm = row[4], row[5], row[7], row[8]
    t = np.arange(round(RATE*1.34))/RATE
    signal = np.zeros_like(t)
    grain = signature[:round(RATE*.17), 0]
    for i, (interval, tick) in enumerate(zip(contour, rhythm)):
        start = int(RATE*tick*60/bpm*.53)
        ratio = 2**(interval/12)
        # Resampling each material transient follows this creature's actual
        # tune. The resonator answers below its motif, leaving warnings clear.
        positions = np.arange(0, len(grain)-1, ratio)
        strike = np.interp(positions, np.arange(len(grain)), grain)
        strike *= np.linspace(1, 0, len(strike))**.5
        signal[start:start+len(strike)] += strike
        local = np.maximum(0,t-start/RATE)
        hz = 440 * 2**((root+12+interval-69)/12)
        signal += (t>=start/RATE) * np.exp(-local*(9+i)) * (1-np.exp(-local*130)) * (
            np.sin(2*np.pi*local*hz) + .30*np.sin(2*np.pi*local*hz*2.01))*.38
    return finish(signal,t)


def detail(name):
    durations = {"red_prime": .72, "blue_mark": .16, "gold_field": .60, "gold_pulse": .28,
                 "water_seam": .83, "water_lash": .65}
    t = np.arange(round(RATE * durations[name])) / RATE
    p = t / durations[name]
    rng = np.random.default_rng(6288 + list(durations).index(name))
    air = colored(rng, len(t), .4, 1900)
    if name == "red_prime":
        sig = (.43*tone(t,72,251,1.4,17)+.32*tone(t,128,413)+.12*air)*(p**.65)
    elif name == "blue_mark":
        sig = .48*tone(t,1230,1680)*np.exp(-19*t) + .25*tone(t,760,990)*np.exp(-((t-.08)/.026)**2)
    elif name == "gold_field":
        sig = sum(tone(t,hz,hz*1.018) / (i+1) for i,hz in enumerate((141,211.5,353,569)))
        sig *= np.sin(np.pi*p)**.8
    elif name == "gold_pulse":
        sig = (.61*tone(t,178,98) + .4*tone(t,331,215)+.09*air)*np.exp(-3.8*p)
    elif name == "water_seam":
        sig = (air*.57 + colored(rng,len(t),1.25,750)*.53)*np.minimum(1,t/.035)*np.exp(-1.6*p)
    else:
        sig = air * np.exp(-((p-.19)/.12)**2) + .77*tone(t,102,42)*np.exp(-3*p)
    return finish(sig,t)


def build(args):
    destination = ROOT / "assets/audio/encounters"
    destination.mkdir(parents=True, exist_ok=True)
    args.work.mkdir(parents=True, exist_ok=True)
    manifest = {"clips": {}, "groups": {}, "bosses": [], "regions": {}}
    banks = {}

    def export(name, group, samples, bpm=None):
        wav = args.work / "master.wav"
        write_wav(wav, samples)
        path = destination / (name + ".ogg")
        master(args.ffmpeg, wav, path, stem=bool(bpm))
        blob = path.read_bytes()
        pcm = subprocess.check_output([str(args.ffmpeg), "-v", "error", "-i", str(path),
                                       "-f", "f32le", "-ac", "2", "-ar", str(RATE), "-"])
        decoded = np.frombuffer(pcm, dtype="<f4").reshape(-1,2)
        manifest["clips"][name] = {"group": group, "duration": len(decoded)/RATE, "bpm": bpm,
                                   "bytes": len(blob), "sha256": hashlib.sha256(blob).hexdigest(),
                                   "peakDbFS": round(20*np.log10(float(np.abs(decoded).max())), 3)}
        manifest["groups"].setdefault(group, []).append(name)
        banks.setdefault(group, {})[name] = base64.b64encode(blob).decode("ascii")
    for family, signature, ultimate, title, bpm, root, instruments, contour, rhythm in BOSSES:
        group = "enc_"+family
        theme = group+"_theme"
        manifest["bosses"].append({"group": group, "theme": theme, "title": title,
                                   "signature": signature, "ultimate": ultimate})
        contact = foley(family, False)
        export(group+"_signature", group, contact)
        export(group+"_resonance", group, resonance(family, contact))
        export(group+"_ultimate", group, foley(family, True))
        export(theme, group, solo(args, destination, theme, bpm, root, instruments, contour, rhythm), bpm)
    for name in ("water_seam", "water_lash", "red_prime", "blue_mark", "gold_field", "gold_pulse"):
        export("enc_"+name, "enc_water" if name.startswith("water_") else "enc_fighters", detail(name))
    for region, (title, bpm, root, instruments, contour, rhythm) in REGIONS.items():
        name = "enc_sector_"+region
        manifest["regions"][region] = {"theme": name, "title": title}
        export(name, name, solo(args, destination, name, bpm, root, instruments, contour, rhythm), bpm)
    export("enc_victory", "enc_victory", stargate(args, destination))
    for group, bank in banks.items():
        (destination / (group+".js")).write_text('"use strict";\nglobalThis.starBreakerNextgenAudio ??= {};\n'
            + "Object.assign(globalThis.starBreakerNextgenAudio," + json.dumps(bank, separators=(",",":")) + ");\n", encoding="utf-8")
    encoded = json.dumps(manifest, ensure_ascii=False, indent=2)
    (destination / "manifest.json").write_text(encoded+"\n", encoding="utf-8")
    catalog = ROOT / "audio-catalog.js"
    marker = "// Encounter soloists and ability Foley."
    catalog.write_text(catalog.read_text(encoding="utf-8").split(marker)[0].rstrip()+"\n\n"+marker+"\n"
                       +"starBreakerAudioCatalog.encounters = "+encoded+";\n", encoding="utf-8")
    print(f"{len(manifest['clips'])} clips / {sum(row['bytes'] for row in manifest['clips'].values())} compressed bytes")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    for argument in ("ffmpeg", "synth", "soundfont", "work"):
        parser.add_argument("--"+argument, type=Path, required=True)
    build(parser.parse_args())
