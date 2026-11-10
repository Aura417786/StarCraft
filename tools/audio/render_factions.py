"""Build sample-aligned faction scores with contrasting A/B arrangements."""
from __future__ import annotations

import argparse
import base64
import json
from pathlib import Path

import numpy as np

from render_bank import RATE, ROOT, Score, command, normalized, render_synth, write_wav

BARS = 32
SECTION_BARS = 8
LAYERS = ("harmony", "pressure", "finale")
FACTIONS = {
    "mechanical": {"bpm": 124, "title": "Iron Meridian", "root": 38,
                   "harmony": [(0, (0, 3, 7)), (-2, (0, 5, 9)), (1, (0, 3, 7)), (-5, (0, 4, 7)),
                               (0, (0, 3, 10)), (-4, (0, 4, 7)), (3, (0, 4, 7)), (-5, (0, 4, 8))],
                   "motif": (0, 6, 7, 3), "voices": (38, 61, 45, 115, 48, 12),
                   "answer": (7, 3, 6, 0), "answer_voices": (112, 84, 117),
                   "answer_rhythm": (.18, .78, 1.65, 2.55, 3.38), "chords_b": (0, 4, 2, 5, 6, 4, 3, 7)},
    "bio": {"bpm": 112, "title": "Hadal Heart", "root": 40,
            "harmony": [(0, (0, 3, 7)), (-4, (0, 4, 7)), (-2, (0, 5, 9)), (-5, (0, 3, 7)),
                        (0, (0, 3, 7)), (1, (0, 3, 6)), (-4, (0, 4, 9)), (-5, (0, 4, 7))],
            "motif": (0, 3, 2, -5), "voices": (42, 60, 48, 47, 52, 14),
            "answer": (-5, 2, 3, 0), "answer_voices": (73, 46, 15),
            "answer_rhythm": (.25, 1.58, 2.32, 3.18), "chords_b": (0, 5, 4, 1, 6, 2, 5, 7)},
    "void": {"bpm": 104, "title": "Event Horizon Choir", "root": 37,
             "harmony": [(0, (0, 1, 7)), (-1, (0, 4, 8)), (6, (0, 3, 7)), (-2, (0, 3, 6)),
                         (0, (0, 3, 7)), (1, (0, 3, 7)), (-5, (0, 2, 7)), (-1, (0, 1, 6))],
             "motif": (0, 1, 7, 6), "voices": (19, 10, 53, 116, 91, 98),
             "answer": (6, 7, 1, 0), "answer_voices": (54, 99, 11),
             "answer_rhythm": (.3, 1.28, 2.02, 2.7, 3.38), "chords_b": (0, 5, 2, 6, 4, 2, 1, 7)},
}


def boss_score(faction: str, layer: str, repeats: int = 1) -> Score:
    profile = FACTIONS[faction]
    root, chords, motif, voices = (profile[key] for key in ("root", "harmony", "motif", "voices"))
    score = Score(profile["bpm"])
    if layer == "harmony":
        score.voice(0, voices[0], 54, 42)
        score.voice(1, voices[1], 69, 58)
        score.voice(2, voices[2], 77, 66)
        score.voice(3, profile["answer_voices"][0], 62, 74)
        score.voice(9, 0, 64, 29)
    elif layer == "pressure":
        score.voice(0, voices[3], 57, 32)
        score.voice(1, voices[2], 76, 44)
        score.voice(3, profile["answer_voices"][1], 66, 79)
        score.voice(9, 0, 64, 32)
    else:
        score.voice(0, voices[4], 78, 63)
        score.voice(1, voices[5], 50, 67)
        score.voice(3, profile["answer_voices"][2], 61, 46)
        score.voice(9, 0, 64, 27)
    for measure in range(repeats * BARS):
        bar = measure % BARS
        phrase, local = divmod(bar, SECTION_BARS)
        answer = phrase % 2 == 1
        chord_index = profile["chords_b"][local] if answer else (local + (2 if phrase == 2 else 0)) % len(chords)
        interval, chord = chords[chord_index]
        if bar == 31:
            interval, chord = chords[-1]
        bass = root + interval
        rhythm = (0, 1.5, 3.0) if faction == "mechanical" else (0, .72, 2.5) if faction == "bio" else (.12, 1.75, 3.33)

        def play(channel: int, at: float, duration: float, pitch: int, velocity: int) -> None:
            score.note(channel, measure * 4 + at, min(duration, 4 - at), pitch, velocity)

        if answer:
            # B answers the same leitmotif using contrary motion and a more
            # spacious bass. Each part follows the common bar grid so the
            # adaptive mix stays in time during either section.
            counter = profile["answer"]
            cadence = profile["answer_rhythm"]
            if layer == "harmony":
                play(0, 0, 1.75 if faction != "mechanical" else .85, bass, 76)
                if local != 7:
                    play(0, 2.67, .63, bass + (7 if faction == "void" else 12), 64)
                for number, degree in enumerate(chord):
                    play(2, .22 + number * .08, 3.4 - number * .08,
                         bass + 12 + degree + (12 if number == 0 else 0), 48 - number * 4)
                if local in (0, 2, 4, 5, 6):
                    for number, degree in enumerate(counter):
                        play(3, cadence[number], .31 + number * .20, bass + 24 + degree, 76 - number * 6)
                elif local != 7:
                    play(1, .73, 1.04, bass + 12 + chord[-1], 65)
                    play(3, 2.06, 1.27, bass + 24 + counter[1], 62)
                else:
                    play(1, .43, 2.68, bass + 19, 65)
                    play(3, 3.23, .41, root + 23, 59)
            elif layer == "pressure":
                for index, beat in enumerate(cadence if local != 7 else cadence[:2]):
                    hit = (41, 37, 43, 50, 39)[index] if faction != "mechanical" else (36, 42, 38, 42, 45)[index]
                    play(9, beat, .15, hit, 69 + (index % 2) * 12)
                    if index % 2 == 0:
                        play(0, beat, .26, bass + 12, 62 - index * 2)
                        play(3, beat + .12, .38, bass + 24 + chord[index % 3], 68 - index * 2)
                if local in (3, 7):
                    for index, beat in enumerate((2.7, 3.15, 3.52)):
                        play(9, beat, .1, 43 + index * 2, 63 + index * 7)
            else:
                if local in (0, 2, 4, 6):
                    for index, degree in enumerate(counter):
                        play(0, .24 + index * .74, .56 + index * .12, bass + 36 + degree, 74 - index * 3)
                    play(3, 1.6, 1.13, bass + 24 + chord[1], 70)
                if local in (1, 3, 5, 7):
                    play(1, .65, 2.18, bass + 36 + chord[-1], 65)
                    play(3, 3.02, .57, bass + 24 + counter[-1], 62)
                if local in (1, 4, 7):
                    play(9, 2.15, .23, 49 if faction == "mechanical" else 57, 77)
            continue

        if layer == "harmony":
            if local in (3, 7) and phrase > 0:
                play(0, 0, 2.65, bass, 61)
            else:
                for beat, power in zip(rhythm, (80, 63, 72)):
                    length = .31 if faction == "mechanical" else .47 if faction == "bio" else .68
                    play(0, beat, length, bass + (12 if phrase == 2 and beat > 1 else 0), power)
            for number, degree in enumerate(chord):
                delay = .2 + number * (.04 if faction == "mechanical" else .21)
                play(2, delay, 3.65 - delay, bass + 12 + degree, 49 - 3 * number)
            if local % 2 == 0:
                attacks = (.35, 1.13, 2.15, 2.92) if faction == "bio" else (0, .84, 1.65, 2.72) if faction == "mechanical" else (.18, 1.23, 2.02, 3.05)
                for number, degree in enumerate(motif if phrase != 2 else tuple(-pitch for pitch in motif)):
                    play(1, attacks[number], .33 + number * .13, bass + 24 + degree, 78 - 4 * number)
            elif local in (1, 5):
                play(1, 1.72, 1.35, bass + 19, 69)
                play(1, 3.3, .45, bass + 17, 58)
            if local != 7 or phrase == 3:
                play(9, .03, .18, 36 if faction != "void" else 41, 76)
            if bar == 31:
                play(0, 3.48, .19, root - 1, 62)
        elif layer == "pressure":
            cadence = (0, .75, 1.5, 2.5, 3.25) if faction == "mechanical" else (0, 1.2, 2.0, 2.72) if faction == "bio" else (.15, 1.72, 2.38, 3.33)
            if local != 7:
                for index, beat in enumerate(cadence):
                    drum = 36 if index % 2 == 0 else (38 if faction == "mechanical" else 45 if faction == "bio" else 49)
                    play(9, beat, .12, drum, 80 - (index % 3) * 7)
                    play(0, beat, .34, bass - (0 if faction == "bio" else 1), 70 - 5 * (index % 3))
                    if index % 2 == 1:
                        play(1, beat + .13, .21, bass + 24 + chord[index % 3], 70 - 4 * index)
            if local in (3, 7):
                for index in range(4 if phrase > 0 else 3):
                    play(9, 2.8 + index * .27, .09, 47 + (index % 2) * 3, 66 + index * 7)
        else:
            pickup = (0, .42, 1.48, 2.52) if faction == "mechanical" else (.12, .77, 2.14, 3.05) if faction == "bio" else (0, .74, 1.81, 2.9)
            if local in (0, 2, 4, 6):
                for index, degree in enumerate(motif):
                    play(0, pickup[index], .34 + index * .17, bass + 24 + degree, 75 - 4 * index)
                for number, degree in enumerate(chord[1:]):
                    play(1, 1.1 + number * 1.47, .66, bass + 36 + degree, 63 - 4 * number)
            elif local in (1, 3, 5):
                play(0, .45, 2.30, bass + 19 + (5 if phrase == 2 else 0), 71)
                play(1, 3.06, .53, bass + 37, 59)
            if local in (0, 3, 4, 7):
                play(9, 0, .22, 41 if faction != "mechanical" else 49, 81)
                play(9, 2.5, .15, 57 if faction == "void" else 39, 70)
    return score


def victory_score() -> Score:
    score = Score(128)
    score.voice(0, 60, 58, 64)
    score.voice(1, 48, 69, 59)
    score.voice(2, 46, 73, 57)
    score.voice(3, 42, 48, 49)
    roots = (40, 36, 43, 38, 40, 36, 35, 40)
    chords = ((55, 59, 64), (55, 60, 64), (55, 59, 62), (54, 57, 64),
              (55, 59, 66), (55, 60, 64), (54, 59, 63), (56, 59, 64))
    for bar, (bass, chord) in enumerate(zip(roots, chords)):
        start = bar * 4
        score.note(3, start, 3.35, bass, 65 if bar < 7 else 53)
        for number, pitch in enumerate(chord):
            score.note(1, start + number * .09, 3.6 - number * .1, pitch, 56 - number * 3)
        if bar in (0, 2, 4, 6):
            for index, pitch in enumerate((64, 67, 66, 59) if bar != 6 else (63, 66, 68, 71)):
                score.note(0, start + .12 + index * .69, .54 + index * .12, pitch, 73 - 3 * index)
        if bar == 7:
            score.note(0, start + .02, 2.3, 76, 73)
        else:
            for beat, note in zip((.26, .81, 1.44, 2.24, 2.85), (*chord, chord[1] + 12, chord[2] + 12)):
                score.note(2, start + beat, .37, note, 56)
    return score


def encode(ffmpeg: Path, wav: Path, output: Path, bitrate: str) -> None:
    filters = ("highpass=f=33,equalizer=f=250:t=q:w=1.3:g=-1.8,"
               "equalizer=f=2700:t=q:w=1.1:g=-2.1,alimiter=limit=0.78:level=disabled:latency=1")
    command(ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", wav, "-af", filters,
            "-map_metadata", "-1", "-c:a", "libopus", "-b:a", bitrate, "-application", "audio", output)


def render(args: argparse.Namespace) -> None:
    work = args.work.resolve()
    work.mkdir(parents=True, exist_ok=True)
    score_dir = ROOT / "tools" / "audio" / "scores"
    bank: dict[str, object] = {"factions": {}, "victory": None}
    midi, wave = work / "render.mid", work / "render.wav"
    for faction, profile in FACTIONS.items():
        faction_bank = {"bpm": profile["bpm"], "title": profile["title"], "sectionBars": SECTION_BARS,
                        "sequence": ["A", "B", "A'", "B'"], "layers": {}}
        for layer in LAYERS:
            name = f"{faction}_{layer}"
            score = boss_score(faction, layer)
            score.save(score_dir / f"{name}.mid", BARS * 4)
            boss_score(faction, layer, 3).save(midi, BARS * 12)
            raw = render_synth(args.synth, args.soundfont, midi, wave)
            length = round(score.tempo * BARS * 4 * RATE / 1_000_000)
            clip = raw[length:length * 2].copy()
            overlap = round(.018 * RATE)
            blend = .5 - .5 * np.cos(np.linspace(0, np.pi, overlap)[:, None])
            clip[:overlap] = raw[length * 2:length * 2 + overlap] * (1 - blend) + clip[:overlap] * blend
            source, encoded = work / f"{name}.wav", work / f"{name}.opus"
            peak = {"harmony": .64, "pressure": .59, "finale": .56}[layer]
            write_wav(source, normalized(clip, peak))
            encode(args.ffmpeg, source, encoded, "56k")
            faction_bank["layers"][layer] = [length / RATE, base64.b64encode(encoded.read_bytes()).decode("ascii")]
            print(f"{name}: {length / RATE:.3f} s, {encoded.stat().st_size / 1024:.0f} KiB", flush=True)
        bank["factions"][faction] = faction_bank
    score = victory_score()
    score.save(score_dir / "victory_stargate.mid", 32)
    score.save(midi, 32)
    clip = render_synth(args.synth, args.soundfont, midi, wave)[:15 * RATE].copy()
    fade = round(.6 * RATE)
    clip[-fade:] *= np.linspace(1, 0, fade)[:, None]
    source, encoded = work / "victory_stargate.wav", work / "victory_stargate.opus"
    write_wav(source, normalized(clip, .65))
    encode(args.ffmpeg, source, encoded, "72k")
    bank["victory"] = [len(clip) / RATE, base64.b64encode(encoded.read_bytes()).decode("ascii")]
    output = ROOT / "audio-faction-bank.js"
    output.write_text('"use strict";\n// Generated by tools/audio/render_factions.py. Original music, see assets/audio-LICENSE.md.\nconst starBreakerFactionAudio = '
                      + json.dumps(bank, separators=(",", ":")) + ";\n", encoding="utf-8")
    print(f"{output.name}: {output.stat().st_size} bytes", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for parameter in ("synth", "soundfont", "ffmpeg", "work"):
        parser.add_argument(f"--{parameter}", type=Path, required=True)
    render(parser.parse_args())
