# The shelf

Everything here is on the desk when the site loads: `floppy/` in the floppy
box, `cdrom/` in the CD wallet, `hdd/` in the drawer, `cart/` by the console, `tape/` by the Datasette.
Each machine only sees the formats its drives read (`formats` in
`src/lib/machines/catalog.ts`): a `.d64` is in the C64's box, not the PC's. A `.zip` is opened in
place, by range, and any disk images inside it are listed too. The build
writes `csfs-manifest.json` so a static host can be listed; drop a file in,
rebuild, and it is on the shelf. Labels live in `src/lib/media/bundled.ts`.

Only ship images you may redistribute. GitHub Pages caps a site at 1 GB and a
file at 100 MB.

| File | What | Licence / source |
| --- | --- | --- |
| `floppy/freedos722.img` | FreeDOS boot disk | GPL — <https://www.freedos.org/> |
| `floppy/freedos-xt.img` | The same disk for an 8088: HIMEM, DOS=HIGH and IDLEHALT commented out of CONFIG.SYS | GPL — <https://www.freedos.org/> |
| `floppy/kolibri.img` | KolibriOS | GPL — <https://kolibrios.org/> |
| `floppy/openbsd-floppy.img` | OpenBSD install floppy | ISC/BSD — <https://www.openbsd.org/> |
| `cdrom/linux4.iso` | Buildroot Linux live CD | GPL — <https://buildroot.org/> |
| `cart/thwaite.nes` | Thwaite, by Damian Yerrick | GPL-3.0 — <https://github.com/pinobatch/thwaite-nes> (v0.04) |
| `cart/croom.nes` | Concentration Room, by Damian Yerrick | GPL-3.0 — <https://github.com/pinobatch/croom-nes> (v0.02a) |
| `cart/snake.nes` | openNES Snake, by Sebastian Dine | Zlib — <https://github.com/sebastiandine/openNES-Snake> (v1.0.9) |
| `cart/dabg.nes` | Double Action Blaster Guys, by NovaSquirrel | Zlib — <https://github.com/NovaSquirrel/DABG> (v2) |
| `floppy/cryptmorrow.d64` | Cryptmorrow 1.0.1, C64 | MIT — <https://github.com/codeEbooks/Cryptmorrow_C64> |
| `floppy/laserinvaders.d64` | Laser Invaders, C64 | MIT — <https://github.com/TedDallas/laserinvaders> |
| `floppy/phatfinger.d64` | Phat Finger, C64 | CC0-1.0 — <https://github.com/we-art-o-nauts/phatfinger> |
| `floppy/c64doku.prg` | C64doku, C64 | CC0-1.0 — <https://github.com/sidchoudhuri/c64doku> |
| `floppy/aros-boot.adf` | AROS m68k boot floppy, nightly 2026-11-10 | AROS Public License — <https://aros.sourceforge.io/nightly1.php> |
| `cart/soulless.crt` | Soulless, C64 cartridge build | MIT — <https://github.com/GeorgRottensteiner/Soulless> |
| `tape/hello.tap` | A one-line BASIC program on tape, made for beigeboxes | GPL-3.0-or-later, like the rest of the site |

The FreeDOS, KolibriOS, OpenBSD and Linux images are the builds published by
the v86 project at <https://copy.sh/v86/>.

The BIOS images in `public/v86/` are SeaBIOS and the SeaBIOS VGA BIOS (LGPLv3), copied from v86's `bios/`.
