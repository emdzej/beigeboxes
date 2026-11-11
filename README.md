# beigeboxes

80s and 90s computers on a teenager's desk, in your browser. Press the big **POWER** button.
**[beigeboxes.emdzej.pl](https://beigeboxes.emdzej.pl)**

![beigeboxes](docs/screenshot.webp)

- **Floppies** stand in the disk box: open it, pick one, it goes into drive A:.
- **CDs** are in the wallet: press the drive's eject button, then click the tray.
- **Hard disks** are in the drawer under the desk. Unwrap a blank one, FDISK and
  FORMAT it from a DOS floppy, and it remembers what you install.
- **The screwdriver** opens the case. Fit SIMMs (in matching pairs: no RAM, no
  POST), put cards in the slots (VGA, Sound Blaster 16, NE2000 and its cable) and
  screw drives into the bays as master or slave. Only with the power off.
- **The catalogue** on the shelf has the machines: the Pentium PC today (tower or
  desktop, CRT or LCD), the rest back-ordered until their emulators are in.
- **The calendar** on the cork board flips the room between 1986 and 1996.
- **The modem's phone book**: click the modem.
- **Tech support**: the flyer on the cork board. Say what's wrong, add a picture of
  the screen (black out what it shouldn't show), and the answers come back live —
  anonymously, through [ALIAS](https://getalias.support). [What's kept](public/privacy.html).
- **Drop** any `.img`, `.iso` or `.zip` onto the page and it is filed in the right place.

Click the monitor to lean in; click again to capture the mouse.
<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>End</kbd> sends Ctrl+Alt+Del.

## How it fits together

- **Machines** are listed in `src/lib/machines/catalog.ts`: each has its era,
  its drives, the photo of its open case (`boards.ts`, measured hotspots), what
  it ships with, and a driver. The machine on the desk (`machine.svelte.ts`)
  keeps power, media and lights; what is mounted in the case is its *build*,
  saved per machine.
- **Drivers** (`src/lib/emulator/drivers/`) run an emulator behind one interface:
  start from a build, stop and write disks back, reset, insert and eject, input.
  Each is loaded only on the first press of POWER.
- [**v86**](https://github.com/copy/v86) emulates the PC. The BIOS images in
  `public/v86/` come from its repository. Its Sound Blaster is always on the
  bus, so without the card fitted the machine is simply silent.
- [**csfs**](https://github.com/emdzej/csfs) is every disk's file system. One
  adapter, `src/lib/emulator/disk-buffer.ts`, serves a csfs file to v86 as a
  disk, so the same code reads from:
  - the **shelf** — `public/media/`, over static HTTP with `Range` requests (a
    700 MB CD costs only what the guest reads), including images inside zips;
  - the **drawer** — your disks, in the browser's private storage (OPFS);
  - a **linked folder** on your computer (File System Access, Chromium).

  Guest writes go to an in-memory overlay. On power-off (and floppy eject) they
  are written back to your own disks; changes to shelf disks are discarded.
- **Network**: an NE2000 on the `fetch` backend (HTTP, no server) or a WebSocket
  ethernet relay. **Modem**: Hayes 56K on COM2, dialling WebSocket URLs from the
  phone book (`ATDT 5551234`).

## Machines to come

| Machine | Emulator | Licence | State |
|---|---|---|---|
| IBM PC/XT, MDA/Hercules/CGA | [MartyPC](https://github.com/dbalsom/martypc) | MIT | to port: a wasm-bindgen API over its core |
| Commodore 64 | [VirtualC64 web](https://github.com/vc64web/virtualc64web) | GPL-3.0 | to embed |
| Amiga 500/1200 | [vAmigaWeb](https://github.com/vAmigaWeb/vAmigaWeb) | GPL-3.0 | to embed (AROS ROMs) |
| Atari 65XE | [atari800](https://github.com/atari800/atari800) | GPL-2.0 | to port (its libretro build has an Emscripten target) |
| NES | [jsnes](https://github.com/bfirsh/jsnes) | Apache-2.0 | to wire up |
| Macintosh Plus | [Snow](https://github.com/twvd/snow) | MIT | to port; bring your own ROM |

GPL emulators are shipped as separate files next to their licence and a link to
their exact source.

## Tech support

Calls go to the `beigebox` product on the ALIAS desk at `help.getalias.support`, made with
`aliasctl products apply` (its settings: `aliasctl products export beigebox`). The browser key in
`src/lib/support.svelte.ts` names the product and only works from its origins; a new one is
`aliasctl keys issue beigebox <name>`. Answer with `aliasctl tickets list --product beigebox` and
`aliasctl tickets answer beigebox <id>`, or from the panel.

## Develop

```sh
pnpm install
pnpm dev        # copies v86.wasm, builds the media manifest, starts vite
pnpm typecheck
BASE_PATH=/beigeboxes/ pnpm build
```

Pushing to `main` deploys to GitHub Pages (`.github/workflows/pages.yml`).

## Licence

Code GPL-3.0-or-later (see `LICENSE`). Bundled OS images keep their own licences — see `public/media/README.md`.
