"""Measure captured Web Audio PCM and package an audible, chaptered review montage."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import wave
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument("--ffmpeg", type=Path, required=True)
parser.add_argument("--captures", type=Path, required=True)
args = parser.parse_args()
directory = args.captures.resolve()
report = json.loads((directory / "report.json").read_text(encoding="utf-8"))
metrics, sequence, chapters = {}, [], []
elapsed = 0
for name in report["recordings"]:
    path = directory / (name + ".wav")
    with wave.open(str(path), "rb") as stream:
        rate = stream.getframerate()
        pcm = np.frombuffer(stream.readframes(stream.getnframes()), dtype="<i2").reshape(-1, 2)
    result = subprocess.run([str(args.ffmpeg), "-hide_banner", "-i", str(path), "-af", "ebur128=peak=true",
                             "-f", "null", "-"], capture_output=True, text=True, check=True)
    summary = result.stderr.split("Summary:")[-1]
    loudness = re.search(r"I:\s+([-\w.]+) LUFS", summary)
    peak = re.search(r"Peak:\s+([-\w.]+) dBFS", summary)
    metrics[name] = {"integratedLUFS": loudness[1] if loudness else None,
                     "truePeakDbTP": peak[1] if peak else None,
                     "duration": len(pcm) / rate, "clippedSamples": int(np.sum(np.abs(pcm.astype(float)) >= 32767))}
    if name != "muted":
        chapters.append({"start": round(elapsed, 3), "name": name})
        sequence.extend([pcm, np.zeros((round(rate * .25), 2), dtype="<i2")])
        elapsed += len(pcm) / rate + .25
montage = np.concatenate(sequence)
destination = directory / "nextgen-runtime-showcase.wav"
with wave.open(str(destination), "wb") as stream:
    stream.setparams((2, 2, rate, len(montage), "NONE", "not compressed"))
    stream.writeframes(montage.tobytes())
subprocess.run([str(args.ffmpeg), "-y", "-v", "error", "-i", str(destination), "-c:a", "libmp3lame",
                "-b:a", "192k", str(destination.with_suffix(".mp3"))], check=True)
(directory / "measured-loudness.json").write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")
(directory / "showcase-chapters.json").write_text(json.dumps(chapters, indent=2) + "\n", encoding="utf-8")
assert all(row["clippedSamples"] == 0 for row in metrics.values()), "clipped PCM"
assert all(float(row["truePeakDbTP"]) <= -1 for row in metrics.values()), "insufficient true-peak headroom"
print(json.dumps({"files": len(metrics), "maximumTruePeak": max(float(x["truePeakDbTP"]) for x in metrics.values()),
                  "showcase": str(destination.with_suffix(".mp3")), "resident": report.get("resident")}, indent=2))
