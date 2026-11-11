# martypc-web

A WebAssembly wrapper around [MartyPC](https://github.com/dbalsom/martypc)'s emulator core, so a
beigeboxes page can drive a cycle-accurate IBM PC/XT (5160) from its own JavaScript: 8088 at
4.77 MHz, NEC floppy controller, Model F keyboard, PC speaker, one MDA, Hercules or CGA card, and
optionally an XT-IDE hard disk.

It builds only `marty_core` (no egui/eframe/wgpu frontend) into a single-threaded wasm module: no
threads, SharedArrayBuffer or atomics. It runs on the main thread or in a plain (module) Worker,
and needs no cross-origin isolation headers, so GitHub Pages can serve it.

MartyPC is pulled by git, pinned to `05c0d088e84ad6bbfac9b3f0d051e7eadefd9f44`. `Cargo.lock` pins
everything else, including fluxfox at `5a1fb836`, the same commit MartyPC's own lock uses.

## Build

```sh
emulators/martypc-web/build.sh
```

Requirements:

- rustup with the `1.92.0` toolchain and `wasm32-unknown-unknown` (see `rust-toolchain.toml`).
  The script calls that toolchain's `cargo`/`rustc` by path, so a Homebrew `cargo` on `PATH`
  doesn't get in the way.
- `cargo install wasm-bindgen-cli --version 0.2.108 --locked`
- `python3`
- optional: `wasm-opt` (binaryen) on `PATH`, or `WASM_OPT_BIN=...`. If it's there, the script
  runs `-O3` and says so. If not, it ships the LTO'd rustc output. `WASM_OPT=0` skips it.

The output goes to `public/emulators/martypc/`:

| file | |
|---|---|
| `martypc.js` / `.d.ts` | the ES module the page loads with `import()`: re-exports, ROM URLs, `init` |
| `martypc_web.js` / `.d.ts`, `martypc_web_bg.wasm` | wasm-bindgen `--target web` output |
| `roms/` | GLaBIOS and XTIDE Universal BIOS images with their licences (checked in, not built) |
| `NOTICE.txt`, `LICENSE-*.txt` | attributions and licence texts |

Build steps: `cargo build --release` (LTO, `panic=abort`), then `tools/patch_fonts.py` (see
Fonts), then `wasm-bindgen`, then optionally `wasm-opt`.

## API

```js
const { default: init, XtMachine, fetchBios, GLABIOS_URL, XTIDE_BIOS_URL } =
  await import('/emulators/martypc/martypc.js');
await init();                                   // or init(wasmUrl)

const pc = new XtMachine({
  memory_kb: 640,               // 64..640
  video: 'cga',                 // 'mda' | 'hercules' | 'cga'
  bios: await fetchBios(),      // GLaBIOS by default; mapped to end at 0xFFFFF
  sample_rate: audioCtx.sampleRate,
  floppy_drives: 2,             // optional, 0..4
  floppy_type: '720k',          // optional: '360k' | '720k' | '1.2m' | '1.44m'
  phosphor: 'green',            // optional, MDA/Hercules: 'green' | 'amber' | 'white'
  xtide_bios: await fetchBios(XTIDE_BIOS_URL),   // optional: adds the XT-IDE controller
});
```

| method | |
|---|---|
| `run(ms)` | run `ms` of emulated time, capped at 100 per call. Pass the rAF delta. |
| `frame(): Uint8Array` | the current frame as RGBA. MDA/Hercules 720×350, CGA 640×200 line-doubled to 640×400. |
| `frame_width()`, `frame_height()` | read these every frame, because they can change with the video mode |
| `audio(): Float32Array` | PC speaker output since the last call: mono, `sample_rate`, DC removed, about ±0.5. Holds at most 1 s if you never call it. |
| `key_down(code)`, `key_up(code)` | `KeyboardEvent.code` names. Returns `false` if the code isn't known. |
| `ctrl_alt_del()` | warm boot through the BIOS |
| `reset()` | cold reset: RAM is cleared, floppies stay in |
| `insert_floppy(drive, bytes, name)` | any image fluxfox reads: raw 160K..1.44M, IMD, PSI/PRI/PFI, 86F, HFE, MFM, TC, MFI, SCP, Kryoflux, zip/gz. Throws on unreadable images or bad drives. |
| `eject_floppy(drive)` | returns the image's current bytes with guest writes, in the source format if fluxfox can write it losslessly, otherwise raw sectors. Returns `undefined` if the drive is empty. |
| `floppy_active(drive)` | true while the drive motor is on, for the LED and the seek noise |
| `floppy_drives()` | number of fitted drives |
| `attach_hdd(bytes)` | fixed VHD as the XT-IDE master. Needs `xtide_bios`. Attach before the first `run()`, or `reset()` afterwards, because XUB scans at POST. The geometry must be one MartyPC's XT-IDE lists, e.g. 615/4/17 (20 MB) or 306/4/17 (10 MB). |
| `detach_hdd()`, `hdd_bytes()` | get the disk's bytes, with writes. `detach_hdd` also removes it. `undefined` if there's no disk. |
| `hdd_active()` | true for 120 ms (emulated) after each sector transfer |
| `peek(addr, len)` | side-effect-free read of the 1 MB address space, video RAM included. For tests or reading the text screen. |
| `cpu_mhz()`, `emulated_ms()` | for speed measurements |
| `free()` | release the wasm memory |
| `set_log_level(l)` | core log level in the console, default `"warn"` |

Notes:

- The core takes at most one queued keyboard event per `Machine::run`. `run()` therefore cuts
  time into 2 ms slices while keys are pending, and 16.7 ms slices otherwise.
- `run()` carries cycle overshoot and fractional cycles from one call to the next, so emulated
  time tracks the `ms` you pass exactly.
- Composite CGA isn't implemented. The wrapper draws RGBI using its own copy of MartyPC's direct
  renderer, so EGA/VGA code and fonts stay out of the module.

## ROMs and fonts

- **BIOS:** GLaBIOS 0.4.2, 5160 8088 build (`GLABIOS_0.4.2_8X.ROM`, 8 KiB at 0xFE000,
  GPL-3.0), unmodified from the
  [v0.4.2 release](https://github.com/640-KB/GLaBIOS/releases/tag/v0.4.2). MartyPC's ROM-set
  resolver isn't used. The wrapper builds a `MachineRomManifest` itself.
- **Hard disk BIOS:** XTIDE Universal BIOS r631 (`ide_xtl.bin`, 12 KiB at 0xC8000,
  GPL-2.0-or-later, source at <https://www.xtideuniversalbios.org/>). This is the build MartyPC
  ships, configured for its XT-IDE rev 2 at 0x300.
- **No IBM ROMs**: no IBM BIOS, BASIC, Xebec HDC ROM or character generator ROM.
- **Character generators:** MDA, Hercules and CGA don't load a chargen ROM in MartyPC. Their
  glyphs are compiled into `marty_core` (`assets/mda_8by14.bin`, `cga_8by8.bin`,
  `tga_8by9.bin`). `fonts/` holds the same three tables generated by `tools/fon2bin.py` from
  VileR's [Ultimate Oldschool PC Font Pack](https://int10h.org/oldschool-pc-fonts/) v2.2
  (CC BY-SA 4.0): `Bm437_IBM_MDA.FON` (leftmost 8 of 9 columns), `Bm437_IBM_CGA.FON` and
  `Bm437_Tandy1K-I_200L.FON`. `tools/patch_fonts.py` writes them over the core's copies in the
  raw wasm, failing unless each copy occurs exactly once. It also checks that EGA's 8×14 font
  isn't linked in. At this MartyPC revision the VileR tables are bit-identical to the
  core's, so the patch changes no bytes. It guarantees the shipped glyph data is the CC BY-SA
  set, and it will catch any upstream change.
- To regenerate the fonts: download `oldschool_pc_font_pack_v2.2_FULL.zip` (sha256
  `21b3c0a3…2e08`), then run
  `python3 tools/fon2bin.py "fon - Bm (windows bitmap)/Bm437_IBM_MDA.FON" 16 fonts/mda_8by14.bin`
  (use `8` rows for CGA and `9` for Tandy).

## Licences

| part | licence |
|---|---|
| this wrapper (`src/`, `tools/`, `web/`, `build.sh`) | GPL-3.0-or-later, like beigeboxes |
| MartyPC core (`marty_core`, `marty_common`), fluxfox | MIT, (c) Daniel Balsom. Statically linked into the wasm. See `LICENSE-MartyPC-MIT.txt` in the output. Other crates are MIT/Apache-2.0. |
| `render.rs` loops and palette | adapted from `marty_videocard_renderer` (MIT) |
| glyph bitmaps in the wasm (`fonts/`) | CC BY-SA 4.0, (c) 2016-2020 VileR |
| `roms/GLABIOS_0.4.2_8X.ROM` | GPL-3.0, (c) 640KB |
| `roms/ide_xtl.bin` | GPL-2.0-or-later, (c) Tomi Tilli and the XTIDE Universal BIOS Team |
