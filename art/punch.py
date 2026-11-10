"""Cut each monitor's glass out of its photo, so the emulator's screen sits
*behind* the bezel and the real corners frame it.

    python3 -I art/punch.py   # reads art/orig/, writes public/art/
"""
from PIL import Image, ImageDraw, ImageFilter, ImageChops

GLASS = {"crt": (0.1025, 0.1008, 0.794, 0.5769), "lcd": (0.0862, 0.081, 0.8286, 0.6652)}
DARK = {"crt": 70, "lcd": 110}  # glass is below this; the beige bezel and its bevel above

for name, (gx, gy, gw, gh) in GLASS.items():
    im = Image.open(f"art/orig/{name}.webp").convert("RGBA")
    w, h = im.size
    dark = im.convert("L").point(lambda v: 255 if v < DARK[name] else 0)
    ImageDraw.floodfill(dark, (int((gx + gw / 2) * w), int((gy + gh / 2) * h)), 128)
    hole = dark.point(lambda v: 255 if v == 128 else 0)
    # Fill any bright islands (reflections) the flood did not reach.
    outside = ImageChops.invert(hole)
    ImageDraw.floodfill(outside, (0, 0), 64)
    hole = outside.point(lambda v: 0 if v == 64 else 255)
    hole = hole.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    a = ImageChops.multiply(im.getchannel("A"), ImageChops.invert(hole))
    im.putalpha(a)
    bbox = hole.point(lambda v: 255 if v > 128 else 0).getbbox()
    print(name, "hole", [round(v / s, 4) for v, s in zip(bbox, (w, h, w, h))])
    im.save(f"public/art/{name}.webp", quality=88, method=6)
