"""Pack Blender camera frames into a static, file:// compatible WebP grid."""
import argparse
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument("frames", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
for name in ("crimson", "azure", "auric"):
    cell = 224
    atlas = Image.new("RGBA", (cell*4, cell*3))
    for i in range(12):
        frame = Image.open(args.frames / f"{name}-{i:02}.png").convert("RGBA")
        box = frame.getchannel("A").point(lambda a: 255 if a > 28 else 0).getbbox()
        assert frame.size == (cell, cell) and box and min(box[:2]) >= 3 and max(box[2:]) <= cell-3, (name, i, box)
        atlas.paste(frame, (i%4*cell, i//4*cell))
    atlas.save(args.output / f"{name}.webp", quality=91, method=5)
