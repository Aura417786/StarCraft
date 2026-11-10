"""Author editable MIDI and build the original Star Breaker browser audio bank."""
from __future__ import annotations

import argparse
import base64
import json
from pathlib import Path
import struct
import subprocess
import wave

import numpy as np

RATE = 48_000
PPQ = 480
BARS = 16
ROOT = Path(__file__).resolve().parents[2]


def command(*args: object) -> str:
    result = subprocess.run([str(arg) for arg in args], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(f"{Path(str(args[0])).name} returned {result.returncode}\n{result.stderr}")
    return result.stderr


def delta(value: int) -> bytes:
    chunk = [value & 0x7f]
    while value >= 128:
        value >>= 7
        chunk.insert(0, 0x80 | (value & 0x7f))
    return bytes(chunk)


class Score:
    def __init__(self, bpm: int):
        self.tempo = round(60_000_000 / bpm)
        self.tracks: dict[int, list[tuple[int, int, bytes]]] = {}

    def voice(self, channel: int, instrument: int, pan: int = 64, room: int = 45) -> None:
        self.tracks[channel] = [
            (0, 0, bytes((0xc0 | channel, instrument))),
            (0, 0, bytes((0xb0 | channel, 10, pan))),
            (0, 0, bytes((0xb0 | channel, 91, room))),
        ]

    def note(self, channel: int, beat: float, length: float, pitch: int, power: int) -> None:
        start = round(beat * PPQ)
        end = round((beat + length) * PPQ)
        self.tracks[channel].extend((
            (start, 2, bytes((0x90 | channel, pitch, power))),
            (end, 1, bytes((0x80 | channel, pitch, 0))),
        ))

    def save(self, target: Path, beats: float) -> None:
        def track(events: list[tuple[int, int, bytes]]) -> bytes:
            payload = bytearray()
            elapsed = 0
            for tick, _, event in sorted(events):
                payload.extend(delta(tick - elapsed))
                payload.extend(event)
                elapsed = tick
            payload.extend(delta(max(0, round(beats * PPQ) - elapsed)))
            payload.extend(b"\xff\x2f\x00")
            return b"MTrk" + struct.pack(">I", len(payload)) + payload

        conductor = b"\xff\x51\x03" + self.tempo.to_bytes(3, "big")
        tracks = [track([(0, 0, conductor), (0, 0, b"\xff\x58\x04\x04\x02\x18\x08")])]
        tracks.extend(track(events) for events in self.tracks.values())
        target.write_bytes(b"MThd" + struct.pack(">IHHH", 6, 1, len(tracks), PPQ) + b"".join(tracks))


def music(stem: str, repeats: int = 1) -> Score:
    flight = stem.startswith("flight")
    score = Score(116 if flight else 132)
    if stem == "flight_harmony":
        score.voice(0, 89, 64, 54)  # warm pad
        score.voice(1, 4, 44, 57)   # electric piano
        score.voice(2, 42, 81, 44)  # cello
        score.voice(3, 74, 77, 78)  # pan flute
    elif stem == "flight_pulse":
        score.voice(0, 38, 64, 21)  # analog bass
        score.voice(1, 45, 82, 48)  # pizzicato strings
        score.voice(9, 0, 61, 29)   # percussion
    elif stem == "boss_harmony":
        score.voice(0, 42, 41, 32)
        score.voice(1, 61, 73, 56)  # brass section
        score.voice(2, 52, 65, 72)  # choir
        score.voice(3, 43, 69, 28)  # contrabass
    elif stem == "boss_pressure":
        score.voice(0, 47, 48, 51)  # timpani
        score.voice(1, 45, 80, 40)
        score.voice(9, 0, 64, 26)
    else:
        score.voice(0, 48, 75, 44)
        score.voice(1, 53, 43, 75)  # voice oohs
        score.voice(2, 14, 69, 67)  # tubular bells
        score.voice(9, 0, 64, 38)

    flight_chords = [
        (40, (55, 59, 66)), (40, (55, 59, 64)), (36, (55, 59, 64)), (38, (54, 57, 64)),
        (40, (55, 59, 66)), (35, (54, 57, 64)), (36, (55, 60, 64)), (38, (54, 57, 66)),
        (43, (55, 59, 66)), (38, (54, 57, 64)), (36, (55, 59, 64)), (33, (55, 59, 64)),
        (36, (55, 60, 67)), (38, (57, 64, 66)), (35, (54, 57, 63)), (35, (54, 59, 66)),
    ]
    boss_chords = [
        (40, (52, 55, 61)), (40, (52, 56, 59)), (41, (53, 56, 59)), (40, (53, 55, 58)),
        (40, (52, 55, 62)), (46, (53, 56, 62)), (41, (53, 57, 60)), (35, (51, 54, 57)),
        (43, (55, 58, 62)), (38, (54, 57, 60)), (40, (52, 55, 61)), (41, (53, 56, 59)),
        (36, (52, 55, 61)), (37, (53, 56, 62)), (35, (53, 56, 59)), (35, (51, 54, 61)),
    ]
    chord_progression = flight_chords if flight else boss_chords
    for index in range(repeats * BARS):
        bar = index % BARS
        beat = index * 4
        root, chord = chord_progression[bar]

        def play(channel: int, at: float, length: float, pitch: int, power: int) -> None:
            score.note(channel, beat + at, length, pitch, power)

        if stem == "flight_harmony":
            for index, pitch in enumerate(chord):
                play(0, index * .06, 3.8 - index * .06, pitch, 60 - index * 3)
            play(2, 0, 3.1, root, 58 if bar % 2 == 0 else 49)
            if bar % 4 in (0, 2):
                # Rising third, step, retreat. The flute answers the second phrase.
                for at, length, pitch in ((.42, .39, 64), (1.15, .57, 67), (2.0, .52, 66), (2.91, .58, 59)):
                    lift = 5 if bar in (8, 10) else 0
                    play(1, at, length, pitch + lift, 72)
            if bar % 4 == 3:
                play(3, 1.2, 1.3, chord[2] + 12, 64)
                play(3, 2.65, .85, chord[1] + 12, 58)
        elif stem == "flight_pulse":
            for step, offset, power in ((0, 0, 91), (1.5, 0, 70), (3, 7, 80)):
                if bar != 15 or step < 2:
                    play(0, step, .31, root + offset, power)
                    play(9, step, .15, 36 if step != 1.5 else 41, 76)
            for step, pitch in ((.75, chord[0]), (2.5, chord[1]), (3.5, chord[2])):
                if bar % 4 != 3 or step < 3:
                    play(1, step, .22, pitch, 65)
            if bar in (3, 7, 11, 15):
                play(9, 3.62, .16, 54, 66)
        elif stem == "boss_harmony":
            for step, offset, duration, power in ((0, 0, .43, 96), (1.48, 1, .48, 87), (2.98, 0, .69, 93)):
                play(0, step, duration, root + offset, power)
                play(3, step, duration, root - 7 if bar % 4 == 3 else root - 12, power - 10)
            if bar in (0, 2, 4, 6, 8, 10, 12, 14):
                play(1, .12, .9, chord[1], 82)
                play(1, 1.52, .53, chord[2], 73)
                play(1, 2.98, .43, chord[0], 81)
            else:
                play(1, 1.5, .7, chord[0] + 12, 76)
                play(1, 3.25, .33, chord[1] + 12, 69)
            for pitch in chord[:2]:
                play(2, .14, 3.57, pitch, 60)
        elif stem == "boss_pressure":
            for step, key, power in ((0, 36, 102), (.75, 41, 71), (1.5, 36, 89), (3, 43, 91), (3.5, 46, 62)):
                if bar != 15 or step < 2:
                    play(9, step, .14, key, power)
            for step, offset in ((0, 12), (1.5, 0), (3, 1 if bar % 2 else 7)):
                play(0, step, .48, root + offset, 88)
            for step, pitch in ((.53, chord[0]), (1.84, chord[1]), (2.47, chord[2]), (3.49, chord[1])):
                play(1, step, .19, pitch + 12, 77)
        else:
            play(1, .23, 3.44, chord[0] + 12, 74)
            play(1, .52, 3.22, chord[2] + 12, 67)
            for step, offset in ((0, 0), (.5, 1), (1.5, 6), (2.25, 5), (3.0, 0), (3.5, 7)):
                play(0, step, .22, root + 24 + offset, 75 if step in (0, 3) else 66)
            if bar % 4 in (0, 3):
                play(2, .04, 1.9, chord[1] + 12, 88)
            if bar % 2:
                play(9, 3.2, .58, 49, 67)
    return score


# Each boss has a short identifiable interval/rhythm and a dedicated material texture.
BOSS_VOICES = [
    (60, (38, 45, 39), (0, .34, .91), (115, 850), 1.83),   # submerged horn / water pressure
    (115, (52, 51, 43), (0, .12, .39), (730, 3500), .98), # wood block / dry bone
    (58, (41, 41, 37), (0, .19, .76), (165, 1550), 1.6),   # tuba / burning gas
    (14, (66, 71, 65), (0, .15, .44), (1200, 5000), 1.27),# bells / silk fibers
    (114, (46, 38, 34), (0, .22, .58), (260, 2300), 1.39),# steel drum / locking claw
    (8, (69, 76, 73), (0, .28, .57), (1900, 7800), 1.34), # celesta / reflections
    (87, (43, 55, 44), (0, .17, .62), (680, 4400), 1.52), # bass lead / segmented electricity
    (11, (57, 62, 48), (0, .38, .71), (460, 2800), 1.28), # vibraphone / spore shell
    (19, (38, 37, 32), (0, .32, .98), (74, 900), 1.95),   # organ / inversion
    (98, (55, 61, 59), (0, .11, .25), (920, 6100), 1.31), # crystal / neural pulses
    (53, (40, 46, 41), (0, .38, .81), (125, 5600), 1.96), # choir / synthesis
]
MATERIAL = (
    "water", "bone", "furnace", "silk", "chitin", "mirror",
    "storm", "spore", "void", "nerve", "fusion",
)


def white_texture(size: int, band: tuple[int, int], seed: int) -> np.ndarray:
    samples = np.random.default_rng(seed).normal(0, 1, size)
    bins = np.fft.rfftfreq(size, 1 / RATE)
    spectrum = np.fft.rfft(samples)
    spectrum *= (bins / np.maximum(bins, band[0])) ** 2 / (1 + (bins / band[1]) ** 4)
    signal = np.fft.irfft(spectrum, n=size)
    return signal / (np.max(np.abs(signal)) or 1)


def timebase(duration: float) -> np.ndarray:
    return np.arange(round(duration * RATE)) / RATE


def sweep(t: np.ndarray, start: float, end: float) -> np.ndarray:
    # Integrate frequency to keep pitch changes smooth and phase-continuous.
    return np.sin(2 * np.pi * (start * t + (end - start) * t * t / (2 * max(.01, t[-1]))))


def effect(name: str, duration: float, band: tuple[int, int], a: float, b: float,
           seed: int, rise: bool = False) -> np.ndarray:
    t = timebase(duration)
    texture_l = white_texture(t.size, band, seed)
    texture_r = white_texture(t.size, band, seed + 31)
    attack = np.minimum(t / (.24 if rise else .009), 1)
    fall = (1 - t / duration) ** (1.2 if rise else 3.2)
    pulse = (.55 + .45 * np.cos(2 * np.pi * (3.2 + seed % 8) * t)) if duration > .44 else 1
    tone = sweep(t, a, b) + .24 * sweep(t, a * 2.009, b * 2.009)
    if name in ("pressure", "collapse", "blast", "launch_red"):
        tone += .45 * sweep(t, 105, 43)
    if name in ("warning", "charge", "stage"):
        pulse = .50 + .50 * (np.cos(2 * np.pi * (3 + 2.1 * t) * t) > -.2)
    envelope = attack * fall
    body = tone * envelope * .45
    noise = envelope * pulse * (.52 if duration > .35 else .29)
    if name == "pressure":
        body *= .5 + .5 * np.sin(2 * np.pi * 2.15 * t) ** 2
    return np.column_stack((body + noise * texture_l, body + noise * texture_r))


def read_wav(path: Path) -> np.ndarray:
    with wave.open(str(path), "rb") as wav:
        assert wav.getframerate() == RATE and wav.getsampwidth() == 2 and wav.getnchannels() == 2
        return np.frombuffer(wav.readframes(wav.getnframes()), dtype="<i2").reshape((-1, 2)) / 32768.0


def write_wav(path: Path, samples: np.ndarray) -> None:
    with wave.open(str(path), "wb") as wav:
        wav.setparams((2, 2, RATE, len(samples), "NONE", "not compressed"))
        wav.writeframes((np.clip(samples, -.999, .999) * 32767).astype("<i2").tobytes())


def normalized(samples: np.ndarray, peak: float) -> np.ndarray:
    return samples * (peak / max(.0001, np.max(np.abs(samples))))


def render_synth(synth: Path, soundfont: Path, midi: Path, wave_path: Path) -> np.ndarray:
    command(synth, "-niq", "-g", "0.55", "-r", RATE, "-R", "1", "-C", "1", "-F", wave_path, soundfont, midi)
    return read_wav(wave_path)


def master(ffmpeg: Path, source: Path, encoded: Path, *, stem: bool) -> None:
    # Preserve the relative levels and loop lengths while equalizing and limiting
    # the original authored recordings before Opus encoding.
    filters = (
        "highpass=f=33,equalizer=f=250:t=q:w=1.3:g=-1.8,"
        "equalizer=f=2700:t=q:w=1.1:g=-2.1,alimiter=limit=0.80:level=disabled:latency=1"
        if stem else
        "highpass=f=32,equalizer=f=320:t=q:w=1.2:g=-1.1,"
        "alimiter=limit=0.83:level=disabled:latency=1"
    )
    command(ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", source, "-af", filters,
            "-map_metadata", "-1", "-c:a", "libopus", "-b:a", "58k" if stem else "37k",
            "-application", "audio", "-fflags", "+bitexact", encoded)


def build(args: argparse.Namespace) -> None:
    build_dir = args.work.resolve()
    build_dir.mkdir(parents=True, exist_ok=True)
    if not args.soundfont.is_file():
        raise FileNotFoundError(args.soundfont)
    source = build_dir / "master-input.wav"
    render_wave = build_dir / "synth-render.wav"
    midi_dir = ROOT / "tools" / "audio" / "scores"
    midi_dir.mkdir(exist_ok=True)
    stems = {}
    for name in ("flight_harmony", "flight_pulse", "boss_harmony", "boss_pressure", "boss_finale"):
        original = music(name)
        original.save(midi_dir / f"{name}.mid", BARS * 4)
        score = music(name, 3)
        render_midi = build_dir / f"{name}-render.mid"
        score.save(render_midi, BARS * 12)
        raw = render_synth(args.synth, args.soundfont, render_midi, render_wave)
        length = round(original.tempo * BARS * 4 * RATE / 1_000_000)
        clip = raw[length:length * 2].copy()
        # Blend only the first few milliseconds with the real render continuation;
        # sample-accurate loop seams survive buffer playback at other sample rates.
        overlap = round(.012 * RATE)
        blend = np.linspace(0, 1, overlap)[:, None]
        clip[:overlap] = raw[length * 2:length * 2 + overlap] * (1 - blend) + clip[:overlap] * blend
        write_wav(source, normalized(clip, .59 if name.endswith("harmony") else .56))
        encoded = build_dir / f"{name}.opus"
        master(args.ffmpeg, source, encoded, stem=True)
        stems[name] = (length / RATE, encoded)
        print(f"{name} | {length / RATE:.3f}s | {encoded.stat().st_size / 1024:.0f} KiB")

    effects = {}
    room = timebase(8)
    floor = .56 * np.sin(2 * np.pi * 48.5 * room) + .29 * np.sin(2 * np.pi * 72.75 * room)
    airflow = .58 + .42 * np.cos(2 * np.pi * .375 * room)
    room_mix = np.column_stack([
        floor * .42 + airflow * white_texture(room.size, (39, 470), 177 + side)
        for side in range(2)
    ])
    # Warm the EQ/limiter on both sides of the start before cutting a seamless room loop.
    write_wav(source, np.tile(normalized(room_mix, .31), (3, 1)))
    effects["room"] = build_dir / "room.opus"
    command(args.ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", source,
            "-af", "highpass=f=38,lowpass=f=790,atrim=start=8:end=16,asetpts=PTS-STARTPTS",
            "-map_metadata", "-1", "-c:a", "libopus", "-b:a", "34k", "-fflags", "+bitexact", effects["room"])

    templates = {
        "shot_red": (.10, (430, 2500), 710, 170),
        "shot_blue": (.079, (650, 4100), 1050, 365),
        "shot_gold": (.12, (470, 4200), 840, 282),
        "hit_metal": (.10, (930, 6800), 680, 142),
        "hit_organic": (.15, (180, 2400), 250, 77),
        "hurt": (.32, (330, 4500), 380, 93),
        "blast": (.71, (84, 2600), 145, 53),
        "collapse": (1.79, (69, 3700), 103, 39),
        "pressure": (1.28, (80, 3900), 214, 54),
        "snap": (.46, (1150, 6700), 970, 341),
        "warning": (1.30, (300, 1800), 242, 511),
        "stage": (.96, (250, 3200), 105, 471),
        "charge": (.85, (290, 4200), 155, 913),
        "launch_red": (.88, (110, 4550), 490, 65),
        "launch_blue": (.64, (520, 6900), 890, 164),
        "launch_gold": (.73, (300, 4600), 670, 107),
    }
    for index, (name, values) in enumerate(templates.items()):
        duration, band, a, b = values
        clip = effect(name, duration, band, a, b, seed=index + 151,
                      rise=name in ("warning", "charge", "stage"))
        write_wav(source, normalized(clip, .76))
        effects[name] = build_dir / f"{name}.opus"
        master(args.ffmpeg, source, effects[name], stem=False)

    for index, (program, pitches, starts, band, duration) in enumerate(BOSS_VOICES):
        score = Score(120)
        score.voice(0, program, 50, 61)
        score.voice(1, program, 79, 70)
        for note, (pitch, start) in enumerate(zip(pitches, starts)):
            score.note(note % 2, start * 2, (.17 + note * .07) * 2, pitch, 87 + note * 6)
        name = f"boss_{index + 1:02d}"
        midi = build_dir / f"{name}.mid"
        score.save(midi, duration * 2 + .16)
        timbre = render_synth(args.synth, args.soundfont, midi, render_wave)
        pitch = 440 * 2 ** ((pitches[0] - 69) / 12)
        clip = effect(MATERIAL[index], duration, band, pitch * 1.2, pitch * .52, seed=index + 41,
                      rise=index in (0, 5, 8, 10))
        timbre = timbre[:len(clip)]
        clip = .52 * normalized(clip, .7) + .62 * normalized(timbre, .7)
        tail = round(.050 * RATE)
        clip[-tail:] *= np.linspace(1, 0, tail)[:, None]
        write_wav(source, normalized(clip, .76))
        effects[name] = build_dir / f"{name}.opus"
        master(args.ffmpeg, source, effects[name], stem=False)

    def payload(file: Path) -> str:
        return base64.b64encode(file.read_bytes()).decode("ascii")

    bank = {"stems": {key: [seconds, payload(file)] for key, (seconds, file) in stems.items()},
            "effects": {key: payload(file) for key, file in effects.items()}}
    script = "// Generated by tools/audio/render_bank.py. The compressed buffers also work from file URLs.\n"
    script += "const starBreakerAudioBank = " + json.dumps(bank, indent=2) + ";\n"
    (ROOT / "audio-bank.js").write_text(script, encoding="utf-8")
    print(f"Built {len(stems)} synchronized score stems and {len(effects)} effects.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--synth", type=Path, required=True, help="FluidSynth executable")
    parser.add_argument("--soundfont", type=Path, required=True, help="MuseScore General .sf3")
    parser.add_argument("--ffmpeg", type=Path, required=True, help="FFmpeg with libopus")
    parser.add_argument("--work", type=Path, required=True, help="Temporary mastering directory outside the checkout")
    build(parser.parse_args())
