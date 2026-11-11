"""Cut an object out of a pure-white studio background by flooding the white
in from the corners (no model needed when the backdrop is clean).

    python3 -I art/flood_key.py in.png out.webp [max_width] [threshold]
"""
import sys
from PIL import Image, ImageDraw, ImageChops, ImageFilter

src, dst = sys.argv[1], sys.argv[2]
max_w = int(sys.argv[3]) if len(sys.argv) > 3 else 1400
threshold = int(sys.argv[4]) if len(sys.argv) > 4 else 246

raw = Image.open(src).convert("RGB")
w, h = raw.size
near = raw.convert("L").point(lambda v: 255 if v >= threshold else 0)
for pt in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
    if near.getpixel(pt) == 255:
        ImageDraw.floodfill(near, pt, 128)
bg = near.point(lambda v: 255 if v == 128 else 0)
alpha = ImageChops.invert(bg).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1))
im = raw.convert("RGBA")
im.putalpha(alpha)
im = im.crop(alpha.point(lambda v: 255 if v > 24 else 0).getbbox())
im.thumbnail((max_w, max_w), Image.LANCZOS)
im.save(dst, quality=88, method=6)
print(dst, im.size)
