# Art

The photographs in `public/art/` were generated with FAL (`google/nano-banana-2.1`,
2K), cut out with `fal-ai/birefnet/v2`, then flood-fill re-keyed where the
cut-out ate pale plastic or white labels, cropped to content and saved as WebP.
The keyboard's maker's badge was painted out.

`crops.json` records each crop. Hotspots are fractions of the cropped images
and live in `src/lib/hardware/geometry.ts`; **re-measure them if an image is
regenerated** — the glass of each monitor was found by scanning for the dark
rectangle, the buttons by reading gridded proofs.

Prompts were all of the form: *studio product photograph, perfectly
straight-on front orthographic view of a 1996 beige …, pure white seamless
background, no shadows*. Straight-on matters: a hotspot on a photo taken at an
angle is a trapezoid.

The room is a frontal elevation with the desk seen almost edge-on (camera
level with the desk top), because the hardware is photographed straight-on:
a top-down desk under straight-on hardware looks pasted in. The desk and shelf
are empty so the scene's own objects are the only things on them. The
keyboard, mouse and CD wallet lie flat, so they were shot from the same low
angle (~12°) instead of straight-on. Its desk-top lines (wall 41cqw, front lip
43.2cqw) and the drawer's rectangle are in `src/App.svelte`.

The monitors' glass is cut out of their photos by `art/punch.py` (from the
un-punched copies in `art/orig/`), so the emulator's screen sits behind the
bezel and the real corners frame it.
