# vAmigaWeb (vAmiga for the web), embedded

Upstream: Dirk W. Hoffmann (vAmiga core) and mithrendal (vAmigaWeb).

| What | Where | Exact version |
|---|---|---|
| Binaries copied here (`vAmiga.js`, `vAmiga.wasm`, `js/`, `css/`, `sounds/`, `roms/`) | https://github.com/vAmigaWeb/vAmigaWeb.github.io | commit `a83eb5361b078fe332ac6a5af3da17bf5fcb3c68` (2026-11-03), core 4.3.6 |
| Corresponding source | https://github.com/vAmigaWeb/vAmigaWeb | commit `9e2a2ea9ec0b937579a471be0c09d43c07736383` (main, 2026-11-04), core 4.3.6; the JS files here are byte-identical to it |

Source: https://github.com/vAmigaWeb/vAmigaWeb/tree/9e2a2ea9ec0b937579a471be0c09d43c07736383

Licences:
- vAmigaWeb: GPL-3.0 (`LICENSE`). The vAmiga core is MPL-2.0.
- `roms/aros-rom-20260820.bin`, `roms/aros-ext-20260820.bin`: AROS Kickstart replacement,
  AROS Public License 1.1 (MPL-based), https://github.com/aros-development-team/AROS
- `roms/emutos-amiga.bin`: EmuTOS, GPL-2.0-or-later, https://github.com/emutos/emutos
- Both are shipped by vAmigaWeb as above; no Commodore Kickstart is included.

Changes for beigebox:
- `embed.html` is upstream `index.html` with the analytics script, PWA manifest, icons, service worker
  registration, CodeMirror editor bundle and the redirect to the upstream "legacy" site removed, plus
  `embed.css` (only the canvas is visible) and `embed.js` (sets the hardware, injects the shipped
  Kickstart replacement, gates the keyboard, forwards core messages to the parent window).
- Not copied: `doc/`, `img/`, `js/eruda.js`, `js/cm6/`, `sw.js`, `runcbm.html`, older ROM builds, source maps.
