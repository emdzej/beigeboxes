# snow-web

A WebAssembly wrapper around [Snow](https://github.com/twvd/snow)'s emulator core, so a beigeboxes
page can drive a cycle-accurate Macintosh Plus (or 128K / 512K) from its own JavaScript: 68000 at
7.83 MHz, IWM and two 800K drives, SCSI hard disks, the M0110 keyboard, mouse, PWM sound, the
512 x 342 screen.

It builds Snow's `snow_core` and `snow_floppy` (no egui frontend) into a single-threaded wasm
module: no threads, SharedArrayBuffer or atomics. It runs on the main thread and needs no
cross-origin isolation headers, so GitHub Pages can serve it. The page calls `run(ms)` from
`requestAnimationFrame`; on an M-series laptop it emulates about 17x real time.

No ROM is included. The user supplies their own (`src/lib/emulator/roms.ts`).

## Build

```sh
emulators/snow-web/build.sh
```

Requirements:

- git, rustup with the `1.95.0` toolchain and `wasm32-unknown-unknown` (see
  `rust-toolchain.toml`, Snow's own toolchain). The script calls that toolchain's `cargo`/`rustc`
  by path.
- `cargo install wasm-bindgen-cli --version 0.2.108 --locked`
- optional: `wasm-opt` (binaryen) on `PATH`, or `WASM_OPT_BIN=...`; `WASM_OPT=0` skips it.

The script clones Snow into `vendor/` (git-ignored), checks out
`e339af646787bac5effed80426c38be5a2c291cd`, applies `patches/snow-wasm.patch`, then
`cargo build --release --locked`, `wasm-bindgen --target web`, and optionally `wasm-opt`.
`.cargo/config.toml` sets `getrandom_backend="wasm_js"`.

Tests (native, for the floppy write-back decoder): `cargo test --release --lib` with the same
toolchain.

### The patch

`patches/snow-wasm.patch`, against Snow at the pinned commit:

- `std::time::Instant` → `web_time::Instant` (std's panics on wasm32-unknown-unknown).
- `socket2` only off wasm32; the TCP serial bridge and LocalTalk-over-UDP return `Unsupported` on
  wasm32 (no sockets in a browser).
- `retrocompressor` only off wasm32 (it pulls in a process-spawning test helper); LZHUF-compressed
  DART images are refused on wasm32. Other DART, raw, DiskCopy 4.2, MOOF, WOZ, A2R, PFI/PRI load.
- `[lints] workspace = true` removed from the three crates, so they build outside Snow's
  workspace.
- Four accessors on `Emulator` for an in-process frontend: `is_running`, `fdd_state`,
  `fdd_image`, `poll_status`.

To change it: edit `vendor/snow`, then `git -C vendor/snow diff > patches/snow-wasm.patch`.

## Output

`public/emulators/mac/`:

| file | |
|---|---|
| `snow_web.js` / `.d.ts`, `snow_web_bg.wasm` | wasm-bindgen `--target web` output |
| `NOTICE.txt`, `LICENSE-Snow-MIT.txt` | attributions and Snow's licence |

## API

```js
const snow = await import('/emulators/mac/snow_web.js');
await snow.default();

const mac = new snow.MacMachine(rom, '', 4096); // model '' = from the ROM; RAM in KB
```

| method | |
|---|---|
| `new MacMachine(rom, model, ram_kb)` | `model`: `"plus"`, `"512k"`, `"128k"`, or `""` to tell from the ROM (an unknown 128 KB ROM runs as a Plus). Plus RAM: 1024, 2048 or 4096 KB; others round down (2.5 MB runs as 2 MB, Snow's RAM is a power of two). 128K and 512K have their own. Throws on a ROM it can't use. |
| `run(ms)` | run `ms` of emulated time, at most 100 at once. Snow runs 10,000 instructions a tick; the overshoot is paid back next call, so emulated time tracks wall time. |
| `frame_ready()`, `frame()` | a new frame since the last `frame()`; RGBA, `frame_width()` x `frame_height()` (512 x 342) |
| `audio()` | sound since the last call: mono f32, `audio_rate()` (22050) Hz. Keeps at most 1 s. |
| `key_down(code)`, `key_up(code)`, `release_all()` | `KeyboardEvent.code`. Alt and Meta are Command, Ctrl is Option. False if the Mac has no such key (the Plus's M0110 keymap in Snow has no arrows or keypad). |
| `mouse_abs(x, y)` | absolute mode (default): the cursor jumps to screen pixel x, y, by writing the Mac's mouse globals (MTemp/RawMouse/CrsrNew), as Snow's frontend does. Works with the system and well-behaved applications, from when the ROM has set the mouse up. |
| `mouse_rel(dx, dy)`, `set_mouse_mode("relative" \| "absolute")` | relative mode: quadrature signals through the SCC/VIA, as a real mouse. For games that read the hardware. |
| `mouse_button(down)` | |
| `reset()`, `interrupt()` | the programmer's switch |
| `insert_floppy(drive, bytes, name, locked)` | drive 0 internal, 1 external. Raw 400K/800K (`.dsk`, `.img`, `.image`), DiskCopy 4.2 (any extension), MOOF and the rest of Snow's loaders. Throws on unreadable images. |
| `eject_floppy(drive)` | the host takes it out; returns the image with the guest's writes, or `undefined` if unchanged or not saveable |
| `floppy_bytes(drive)` | the same without ejecting (for power-off) |
| `guest_ejects()`, `take_guest_eject(drive)` | drives the Mac ejected a disk from by itself, and the disk's bytes if written to |
| `floppy_inserted(drive)`, `floppy_motor(drive)` | the light |
| `attach_hdd(id, bytes)`, `hdd_bytes(id)`, `hdd_activity()` | SCSI disk at ID 0..6 (Plus only): a whole-disk image with an Apple partition map and driver, a multiple of 512 bytes. `hdd_bytes` returns the bytes if written since last asked. `hdd_activity` is a counter bumped on each access. |
| `take_message()` | a message Snow has for the user (a disk it couldn't insert) |
| `model_name()`, `ram_kb()`, `cycles()`, `running()`, `free()`, `set_log_level(l)`, `rom_model(rom)` | |

### Floppy write-back

Snow keeps a floppy as a GCR bitstream and only writes MOOF files back. `src/gcr.rs` reads the
sectors back out of the bitstream (the IWM's byte framing, address/data marks, 6-and-2 GCR and its
checksums, the inverse of Snow's encoder) so a guest's writes go back into the raw or DiskCopy 4.2
file they came from. A sector it can't read is kept as it was. DiskCopy checksums are recomputed.

## Licences

| part | licence |
|---|---|
| this wrapper (`src/`, `web/`, `patches/`, `build.sh`) | GPL-3.0-or-later, like beigeboxes |
| Snow (`snow_core`, `snow_floppy`), statically linked | MIT, (c) Thomas W. and contributors; `LICENSE-Snow-MIT.txt` |
| other crates | MIT and/or Apache-2.0 (see `Cargo.lock`) |
| GCR tables and checksum algorithm in `src/gcr.rs` | as in Snow's encoder (MIT), after MESS / FluxEngine / Greaseweazle |
