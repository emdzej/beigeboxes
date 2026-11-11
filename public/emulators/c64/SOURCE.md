# vc64web (VirtualC64 for the web), embedded

Upstream: Dirk W. Hoffmann (VirtualC64 core) and mithrendal (vc64web).

| What | Where | Exact version |
|---|---|---|
| Binaries copied here (`vc64.js`, `vc64.wasm`, `js/`, `css/`, `sounds/`) | https://github.com/vc64web/vc64web.github.io | commit `469b63818d1a8f4d654fd3985b82aeb4e03fabba` (2026-10-28), core 5.1.3 |
| Corresponding source | https://github.com/vc64web/virtualc64web | commit `68b837ac2260d69d8137aff143fa131f0597002a` (master, 2026-07-26), core 5.1.3; the JS files here are byte-identical to it |
| System ROMs (`roms/`) | https://github.com/MEGA65/open-roms | commit `ad178dbe4d48cd6a317737a8e0e7e662f7e33d32`, `bin/basic_generic.rom`, `bin/kernal_generic.rom`, `bin/chargen_pxlfont_2.3.rom` |

Source: https://github.com/vc64web/virtualc64web/tree/68b837ac2260d69d8137aff143fa131f0597002a

Licences:
- vc64web: GPL-3.0 (`LICENSE`). The VirtualC64 core files are dual GPL-3.0-or-later / MPL-2.0.
- MEGA65 Open ROMs: LGPL-3.0-or-later (`roms/LICENSE`, `roms/COPYING`, `roms/COPYING.LESSER`); parts of BASIC are MIT (Microsoft). PXL font by Retrofan, LGPL-3.0 with permission (see the open-roms `bin/README.md`).
- No 1541 drive ROM is shipped: there is no freely licensed one.

Changes for beigebox:
- `embed.html` is upstream `index.html` with the analytics script, PWA manifest, icons, service worker
  registration, CodeMirror editor bundle and the redirect to the upstream "legacy" site removed, plus
  `embed.css` (only the canvas is visible) and `embed.js` (installs the local Open ROMs, gates the
  keyboard, forwards core messages to the parent window).
- `css/vc64.css`: the C64 Pro Mono font is not shipped; its `@font-face` points at a local font.
- Not copied: `doc/`, `img/`, `js/eruda.js`, `js/cm6/`, `sw.js`, source maps.
