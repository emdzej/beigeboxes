# atari800-web

[atari800](https://github.com/atari800/atari800) 7.2.1 built as **libatari800** with Emscripten,
so a beigeboxes page can drive an Atari 65XE (XL/XE, 64 KB, PAL) one frame at a time from
JavaScript. The 1050 disk drive is D1:, the XC12 tape deck is the cassette, and there's a cartridge slot.

AltirraOS 3.49 and Altirra BASIC 1.59, Avery Lee's free replacements for Atari's ROMs, are compiled
into atari800, so no Atari ROM images are needed or shipped. With nothing inserted, the machine boots
to BASIC's `Ready`.

It's a single-threaded wasm module, with no threads, SharedArrayBuffer or cross-origin isolation, so
GitHub Pages can serve it. The wasm is about 300 KB and the JS glue about 65 KB.

## Build

```sh
emulators/atari800-web/build.sh
```

Requirements:

- git, plus autoconf and automake (`brew install autoconf automake`) to turn `configure.ac` into
  `configure`
- emsdk, installed and activated. If `emcc` isn't on `PATH`, the script sources
  `${EMSDK:-~/emsdk}/emsdk_env.sh`. It was built with emcc 7.0.0:
  `git clone https://github.com/emscripten-core/emsdk ~/emsdk && ~/emsdk/emsdk install latest && ~/emsdk/emsdk activate latest`

Steps:

1. Clone the `ATARI800_7_2_1` tag into `build/atari800`. The commit is checked.
2. Apply `patches/`.
3. `autogen.sh`, then `emconfigure ./configure --target=libatari800`, without the monitor, recording,
   networking or PBI extras.
4. `emmake make libatari800.a`.
5. Link `src/bbx.c` with `emcc -O2 -flto`.

`build/` is git-ignored. Delete it for a clean rebuild.

The output goes to `public/emulators/atari800/`:

| file | |
|---|---|
| `atari800.mjs` | ES module factory (`MODULARIZE`, `EXPORT_ES6`): `createAtari800({ locateFile })` |
| `atari800.wasm` | the emulator |
| `COPYING.txt`, `NOTICE.txt` | GPL-2.0-or-later, attributions, the Altirra ROMs' notice |

### Patches

- `0001-tape-gap-shorter-than-a-byte.patch`: upstream dc59301 (#295), after 7.2.1. With the SIO patch,
  a tape gap under one byte's time looped forever.
- `0002-altirraos-3.49-cassette-wait.patch`: 7.2.1 updated AltirraOS to 3.49 but still placed the
  tape-leader escape at 3.11's `CassetteWait` address (`$EE4A`, which in 3.49 is
  `CassetteClose`). As a result, no tape would boot with the SIO patch. The patch moves it to
  `$EE67`. This bug is still upstream.

## API

`src/bbx.c` is a flat C API over libatari800. Paths are in Emscripten's in-memory FS, and the driver
writes media there with `FS.writeFile`. Every function is exported with a leading underscore.

| call | |
|---|---|
| `bbx_init(pal, basic, rate)` | start an XL/XE with AltirraOS, PAL or NTSC, BASIC in or out, 16-bit mono audio at `rate` Hz |
| `bbx_frame(key, shift, ctrl, consol, joy, trig)` | run one video frame. `key` is an AKEY code with its shift/ctrl bits, or -1, or a negative special such as -5 BREAK. `consol` bits: 1 START, 2 SELECT, 4 OPTION. `joy` bits: 1 up, 2 down, 4 left, 8 right |
| `bbx_screen()` / `bbx_palette()` | 384x240 bytes of palette indices; 256 x `0x00RRGGBB` |
| `bbx_sound()` / `bbx_sound_len()` | the last frame's samples (int16), and their length in bytes |
| `bbx_coldstart()` / `bbx_warmstart()` | power-cycle, or RESET |
| `bbx_set_basic(on)` | BASIC at the next cold start, or OPTION held through it |
| `bbx_mount_disk(n, path, ro)` / `bbx_unmount_disk(n)` | ATR / XFD / ATX / DCM / PRO in Dn: |
| `bbx_load_exe(path)` | XEX/COM: cold start, then atari800's loader runs it |
| `bbx_insert_cart(path)` / `bbx_remove_cart()` | CAR (typed), or a raw dump typed by size: 2/4/8/16 KB standard, 32 KB to 1 MB XEGS |
| `bbx_insert_tape(path)`, `bbx_remove_tape()`, `bbx_tape_seek(block)`, `bbx_tape_position()`, `bbx_tape_size()` | the cassette |
| `bbx_tape_boot(on)` | hold START at the next cold start, so the machine boots the tape |
| `bbx_tape_motor()` | the PIA's motor line |
| `bbx_disk_activity()` | drives read or written since the last call (bit n = D(n+1):) |
| `bbx_sio_patch(on)` | instant disk and tape I/O (the default), or real SIO timing |
| `bbx_memory()` | the 64 KB the CPU sees, for tests |

The page's driver is `src/lib/emulator/drivers/atari.ts`.

## Test page

`test/harness.html` isn't shipped. It drives the real driver with a fake `DriverHost`. Serve the
repo with Vite on a spare port, then open
`http://localhost:5299/emulators/atari800-web/test/harness.html`:

```sh
pnpm exec vite --port 5299 --strictPort
```

`window.bbx.power({ fda, cart, tape })` powers on with media URLs. `insert`, `eject`, `tape`,
`setInput` and `off` do what their names say.

Test media are git-ignored. Make them with
`python3 -I emulators/atari800-web/test/make_boot_media.py emulators/atari800-web/test`. Everything it
writes was made for beigeboxes:

- `bootdisk.atr` and `boottape.cas`: boot images that print a line and run colour bars.
  `public/media/tape/hello.cas` is a copy of the tape.
- `rainbow.xex`: a 24-byte executable.
- `stripes.car` and `stripes.rom`: an 8 KB cartridge, typed and raw.
