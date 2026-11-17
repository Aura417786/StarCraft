"""Original v35 material Foley and synchronized MIDI stems, rendered by FFmpeg/FluidSynth.

No external recordings or paid services. SFX are offline physical/spectral models;
music uses the existing MIT-licensed MuseScore General SoundFont.
"""
from __future__ import annotations
import argparse
import base64
import hashlib
import json
from pathlib import Path
import subprocess
import numpy as np
from render_bank import RATE, ROOT, Score, command, normalized, render_synth, write_wav
from render_factions import FACTIONS

FAMILIES = [
    ("water", ["broodArc", "broodSweep", "broodSpawn"], "turbulence, pressure slap, falling droplets"),
    ("bone", ["boneSpears", "boneRibs", "bonePounce"], "dry fractures, hollow rib resonances, falling chips"),
    ("magma", ["cinderLava", "cinderHeart", "cinderFurnace"], "subsurface rumble, brittle cracks, pressurized eruption"),
    ("silk", ["weaverCross", "weaverWeb", "weaverSnare"], "tensioned filaments, bowed harmonics, snapping strands"),
    ("chitin", ["binderClaw", "binderPin", "binderSpines"], "ratcheting joints, plate closure, chain scrape"),
    ("crystal", ["mirrorPrism", "mirrorBlades", "mirrorDecoy"], "inharmonic glass modes, refracted shimmer, shards"),
    ("plasma", ["wyrmPulse", "wyrmCurrent", "wyrmStreak"], "electrical corona, interrupted arcs, thunder body"),
    ("spore", ["sporeSwarm", "sporeField", "sporePollen"], "wet membrane pops, organic exhale, granular swarm"),
    ("void", ["mawEclipse", "mawScars", "mawFragments"], "descending suction, detuned gravity, vacuum tear"),
    ("nerve", ["neuralSynapse", "neuralPulse", "neuralRupture"], "syncopated impulses, nerve tremolo, discharged synapses"),
    ("fusion", ["fusionBind", "fusionCorridor", "fusionPrism"], "multi-body call-response, plate mass, unstable rift"),
]


def colored(rng, n, slope=1.0, center=0):
    frequencies = np.fft.rfftfreq(n, 1 / RATE)
    spectral = np.fft.rfft(rng.normal(size=n))
    shape = np.maximum(45, frequencies) ** (-slope / 2)
    if center:
        shape *= np.exp(-.5 * (np.log2(np.maximum(20, frequencies) / center) / .85) ** 2)
    spectral *= shape
    out = np.fft.irfft(spectral, n)
    return out / max(.001, np.std(out))


def tone(t, frequency, end=None, fm=0, speed=1):
    end = frequency if end is None else end
    phase = 2 * np.pi * (frequency * t + .5 * (end - frequency) * t * t / max(t[-1], .001))
    return np.sin(phase + fm * np.sin(2 * np.pi * speed * t))


def material(family, phase, variant=0):
    index = [row[0] for row in FAMILIES].index(family)
    rng = np.random.default_rng(3500 + index * 51 + variant * 7 + ["tell", "active", "impact", "tail"].index(phase))
    duration = {"tell": .88, "active": (1.75, 1.15, 2.05)[variant], "impact": .72, "tail": 1.34}[phase]
    t = np.arange(round(duration * RATE)) / RATE
    p = t / duration
    low = colored(rng, len(t), 1.9, 220)
    air = colored(rng, len(t), .35, 1600)
    ring = np.zeros_like(t)
    # Sparse physical events differ from a continuous noise/oscillator bed.
    events = 10 if family in ("bone", "chitin", "crystal") else 26 if family in ("water", "magma", "spore") else 6
    for onset in rng.uniform(0, duration * .87, events):
        age = np.maximum(0, t - onset)
        hz = rng.uniform(220, 1800) * (1.35 if family == "crystal" else .7)
        ring += (t >= onset) * np.exp(-age * rng.uniform(18, 65)) * tone(age, hz, hz * .3) * rng.uniform(.12, .42)
    if family == "water":
        out = .28 * low * (1 + .45 * np.sin(2 * np.pi * 2.7 * t)) + .12 * air + .6 * ring
        out += .35 * tone(t, 86, 38) * np.exp(-3 * p)
    elif family == "bone":
        out = ring + .13 * air * np.maximum(0, np.sin(2 * np.pi * 17 * t)) ** 8
        out += .21 * (tone(t, 183) + .4 * tone(t, 471)) * np.exp(-7 * p)
    elif family == "magma":
        out = .3 * low + .18 * air * np.maximum(0, np.sin(2 * np.pi * 29.3 * t)) ** 6 + .18 * ring
        out += .48 * tone(t, 74, 29, 1.2, 2.1) * np.exp(-1.7 * p)
    elif family == "silk":
        out = .24 * tone(t, 143, 517, 4, 26) + .18 * tone(t, 279, 780) + .05 * air
        out *= .45 + .55 * np.sin(np.pi * p) ** 2
        out += .38 * ring * np.exp(-12 * p)
    elif family == "chitin":
        ratchet = np.maximum(0, np.sin(2 * np.pi * (9 * t + 6 * t * t))) ** 12
        out = .45 * ratchet * (air + tone(t, 247)) + .5 * ring + .2 * low
    elif family == "crystal":
        out = sum(.19 / (j + 1) * tone(t, 380 * ratio, 380 * ratio * 1.008) * np.exp(-(1 + j * .3) * p)
                  for j, ratio in enumerate([1, 1.49, 2.13, 2.81, 3.74, 5.12])) + .20 * ring + .025 * air
    elif family == "plasma":
        arc = (.18 + .82 * np.maximum(0, np.sin(2 * np.pi * 8.7 * t)) ** 4)
        out = .24 * tone(t, 1350, 120, 5, 64) * arc + .2 * air * arc + .28 * tone(t, 68, 35)
    elif family == "spore":
        out = .35 * low * (1 + .5 * tone(t, 19, 7)) + .32 * ring + .10 * air
        out += .22 * tone(t, 155, 52, 2.2, 12)
    elif family == "void":
        out = .30 * tone(t, 97, 24, 2, 1.7) + .22 * tone(t, 100, 26) + .14 * low
        out += .13 * air * np.sin(np.pi * p) ** 3 + .15 * tone(t, 770, 61, 6, 3)
    elif family == "nerve":
        pulses = np.maximum(0, np.sin(2 * np.pi * (5 * t + 3 * t * t))) ** 6
        out = .33 * tone(t, 327, 147, 3, 47) * pulses + .13 * air * pulses + .2 * tone(t, 91, 53)
    else:
        out = .24 * low + .2 * tone(t, 67, 29, 2, 4) + .18 * ring
        out += (.2 * tone(t, 370, 83, 5, 9) + .12 * air) * (.4 + .6 * np.sin(2 * np.pi * 3 * t) ** 2)
    if phase == "tell":
        # Rising energy, but no false attack transient before the gameplay release.
        out = out[::-1] * (.12 + .88 * p ** 1.5)
        out += .12 * tone(t, 160 + index * 13, 280 + index * 21) * np.sin(np.pi * p) ** 2
    elif phase == "impact":
        out *= np.exp(-4 * p)
        out += .48 * tone(t, 115 - index * 3, 34) * np.exp(-8 * p)
    elif phase == "tail":
        out *= np.exp(-3 * p) * .58
    else:
        # Three authored actions: surge/sustain; short fracture; swirling/pulsed motion.
        out *= (np.exp(-1.8 * p) if variant == 0 else np.exp(-4.5 * p) if variant == 1
                else (.4 + .6 * np.sin(2 * np.pi * 2.7 * t) ** 2) * np.exp(-1.4 * p))
    out *= np.minimum(1, t / .008) * np.minimum(1, (duration - t) / .065)
    return normalized(np.column_stack((out, out)), .63 if phase == "active" else .50)


def ship_sound(ship, event):
    family = {"red": "magma", "blue": "plasma", "gold": "crystal"}[ship]
    phase = "tell" if event == "charge" else "tail" if event == "shield" else "impact" if event in ("hit", "perfect") else "active"
    variant = 2 if event in ("chain", "launch", "shield") else 1
    out = material(family, phase, variant)
    lengths = {"shot": .17, "wing": .23, "chain": .48, "missile": .64, "pierce": .45,
               "perfect": .58, "hit": .32, "destroy": 1.5, "charge": .88, "launch": 2.05, "shield": 1.34}
    length = round(lengths[event] * RATE)
    out = out[:length].copy()
    if event in ("shot", "wing", "pierce"):
        t = np.arange(len(out)) / RATE
        f = {"red": 480, "blue": 1120, "gold": 710}[ship]
        out += np.column_stack([tone(t, f, f * .2) * np.exp(-19 * t)] * 2) * .2
    fade = min(round(.035 * RATE), len(out))
    out[-fade:] *= np.linspace(1, 0, fade)[:, None]
    return normalized(out, .61)


def music_score(name, repeats=3):
    bpm = {"hangar_harmony": 84, "hangar_detail": 84, "flight_alert": 116,
           "bio_danger": 112, "mechanical_danger": 124, "void_danger": 104}[name]
    bars = 8 if name.startswith("hangar") else 16 if name.startswith("flight") else 32
    score = Score(bpm)
    score.voice(0, 4 if name.startswith("hangar") else 45, 50, 66)
    score.voice(1, 89 if name.startswith("hangar") else 42, 77, 70)
    score.voice(2, 10 if name.startswith("hangar") else 14, 82, 58)
    roots = [45, 41, 48, 43] if name.startswith("hangar") else [40, 36, 38, 35] if name.startswith("bio") else [37, 36, 43, 35] if name.startswith("void") else [38, 36, 39, 33]
    if name.startswith("flight"):
        roots = [45, 41, 48, 43]
    for bar in range(bars * repeats):
        local = bar % bars
        root = roots[(local // 2) % 4]
        degrees = (0, 3, 7)
        if name.endswith("_danger"):
            profile = FACTIONS[name.removesuffix("_danger")]
            phrase, position = divmod(local, 8)
            chord_index = profile["chords_b"][position] if phrase % 2 else (position + (2 if phrase == 2 else 0)) % 8
            interval, degrees = profile["harmony"][7 if local == 31 else chord_index]
            root = profile["root"] + interval
        elif name == "flight_alert":
            root = [40, 40, 36, 38, 40, 35, 36, 38, 43, 38, 36, 33, 36, 38, 35, 35][local]
        at = bar * 4
        if name == "hangar_harmony":
            for j, step in enumerate((0, 7, 10, 14)):
                score.note(1, at + j * .06, 4.2, root + step, 40 - j * 3)
            score.note(0, at + .25, 1.7, root + 24, 58)
            if local % 2 == 0:
                for beat, note in [(1.6, 3), (2.7, 7), (3.4, 2)]:
                    score.note(0, at + beat, 1.1, root + 24 + note, 52)
        elif name == "hangar_detail":
            if local in (1, 3, 5, 7):
                for beat, step in [(1, 14), (2.25, 10), (3.5, 7)]:
                    score.note(2, at + beat, 1.5, root + 24 + step, 39)
        else:
            # Low-health/elite counterline follows existing tonal centers and grid.
            # No alarm oscillator and no relentless snare: unresolved paired notes.
            for beat, step in [(0, 12), (.75, 12 + degrees[2]), (2.5, 12 + degrees[1]), (3.25, 12)]:
                if local % 4 == 3 and beat > 2:
                    continue
                score.note(0, at + beat, .30, root + step, 66 if beat == 0 else 49)
            if local % 2 == 0:
                score.note(1, at + .15, 2.7, root + 24, 38)
            if local % 8 in (3, 7):
                score.note(2, at + 3, .8, root + 31, 38)
    return score, bpm, bars


def build(args):
    dest = ROOT / "assets/audio/nextgen"
    dest.mkdir(parents=True, exist_ok=True)
    work = args.work.resolve()
    work.mkdir(parents=True, exist_ok=True)
    metadata = {"version": 35, "sampleRate": 32000, "bosses": [], "clips": {}, "groups": {}}
    banks = {}
    showcase = []

    def export(name, samples, group, loop=False, bpm=None):
        raw = work / (name + ".wav")
        write_wav(raw, samples)
        encoded = dest / (name + ".ogg")
        command(args.ffmpeg, "-y", "-v", "error", "-i", raw, "-af",
                "highpass=f=32,lowpass=f=12500,alimiter=limit=0.79:level=disabled:latency=1",
                "-ar", "48000", "-ac", "2" if name.startswith("ng_hangar") else "1", "-c:a", "libopus", "-b:a", "56k" if loop else "40k",
                "-map_metadata", "-1", encoded)
        decoded = subprocess.run([str(args.ffmpeg), "-v", "error", "-i", str(encoded), "-f", "f32le", "-ar", str(RATE), "-ac", "2", "-"], capture_output=True, check=True).stdout
        data = np.frombuffer(decoded, dtype="<f4").reshape(-1, 2)
        duration = len(samples) / RATE
        metadata["clips"][name] = {"group": group, "duration": duration, "loop": loop, "bpm": bpm,
            "bytes": encoded.stat().st_size, "sha256": hashlib.sha256(encoded.read_bytes()).hexdigest(),
            "peakDbFS": round(float(20 * np.log10(max(1e-8, np.max(np.abs(data))))), 3),
            "rmsDbFS": round(float(20 * np.log10(max(1e-8, np.sqrt(np.mean(data ** 2))))), 3),
            "seamDelta": round(float(np.max(np.abs(data[0] - data[-1]))), 7) if loop else None}
        metadata["groups"].setdefault(group, []).append(name)
        banks.setdefault(group, {})[name] = base64.b64encode(encoded.read_bytes()).decode()
        return samples

    for family, skills, identity in FAMILIES:
        metadata["bosses"].append({"family": family, "skills": skills, "identity": identity})
        for phase in ("tell", "active", "impact", "tail"):
            for variant in range(3 if phase == "active" else 1):
                name = "ng_" + family + "_" + (str(variant) if phase == "active" else phase)
                clip = export(name, material(family, phase, variant), family)
                if variant == 0:
                    showcase.extend([clip * .60, np.zeros((round(RATE * .22), 2))])
    for ship in ("red", "blue", "gold"):
        for event in ("shot", "charge", "launch", "pierce", "chain", "missile", "wing", "shield", "perfect", "hit", "destroy"):
            clip = export("ng_" + ship + "_" + event, ship_sound(ship, event), "fighters")
            if event in ("charge", "launch", "perfect"):
                showcase.extend([clip * .6, np.zeros((round(RATE * .25), 2))])
    for name in ("hangar_harmony", "hangar_detail", "flight_alert", "bio_danger", "mechanical_danger", "void_danger"):
        score, bpm, bars = music_score(name)
        midi_path = dest / (name + ".mid")
        score.save(midi_path, bars * 12)
        samples = render_synth(args.synth, args.soundfont, midi_path, work / (name + "-render.wav"))
        length = round(bars * 240 / bpm * RATE)
        samples = samples[length:2 * length].copy()
        # Match waveform endpoints without fading a hole into the musical loop.
        fade = round(.015 * RATE)
        difference = samples[-1] - samples[0]
        samples[:fade] += difference[None, :] * (.5 + .5 * np.cos(np.linspace(0, np.pi, fade)))[:, None]
        samples = normalized(samples, .47 if "harmony" in name else .39)
        export("ng_" + name, samples, "music", True, bpm)
    for group, bank in banks.items():
        (dest / (group + ".js")).write_text('"use strict";\nglobalThis.starBreakerNextgenAudio ??= {};\nObject.assign(globalThis.starBreakerNextgenAudio, ' + json.dumps(bank, separators=(",", ":")) + ");\n", encoding="utf-8")
    (dest / "manifest.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    catalog_file = ROOT / "audio-catalog.js"
    text = catalog_file.read_text(encoding="utf-8").split("\n// v35 authored")[0]
    catalog_file.write_text(text + "\n// v35 authored material Foley and adaptive score additions.\nstarBreakerAudioCatalog.nextgen = " + json.dumps(metadata, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")
    montage = np.concatenate(showcase)
    write_wav(work / "nextgen-material-showcase.wav", montage)
    command(args.ffmpeg, "-y", "-v", "error", "-i", work / "nextgen-material-showcase.wav", "-c:a", "libmp3lame", "-b:a", "192k", work / "nextgen-material-showcase.mp3")
    stats = command(args.ffmpeg, "-hide_banner", "-i", work / "nextgen-material-showcase.wav", "-af", "ebur128=peak=true", "-f", "null", "-")
    (work / "loudness.txt").write_text(stats, encoding="utf-8")
    print(json.dumps({"clips": len(metadata["clips"]), "bytes": sum(x["bytes"] for x in metadata["clips"].values()), "showcase": str(work / "nextgen-material-showcase.mp3")}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--ffmpeg", type=Path, required=True)
    parser.add_argument("--synth", type=Path, required=True)
    parser.add_argument("--soundfont", type=Path, required=True)
    parser.add_argument("--work", type=Path, required=True)
    build(parser.parse_args())
