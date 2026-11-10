# The shelf

Everything here is on the desk when the site loads: `floppy/` in the floppy
box, `cdrom/` in the CD wallet, `hdd/` in the drawer. A `.zip` is opened in
place, by range, and any disk images inside it are listed too. The build
writes `csfs-manifest.json` so a static host can be listed; drop a file in,
rebuild, and it is on the shelf. Labels live in `src/lib/media/bundled.ts`.

Only ship images you may redistribute. GitHub Pages caps a site at 1 GB and a
file at 100 MB.

| File | What | Licence / source |
| --- | --- | --- |
| `floppy/freedos722.img` | FreeDOS boot disk | GPL — <https://www.freedos.org/> |
| `floppy/kolibri.img` | KolibriOS | GPL — <https://kolibrios.org/> |
| `floppy/openbsd-floppy.img` | OpenBSD install floppy | ISC/BSD — <https://www.openbsd.org/> |
| `cdrom/linux4.iso` | Buildroot Linux live CD | GPL — <https://buildroot.org/> |

All four are the builds published by the v86 project at <https://copy.sh/v86/>.

The BIOS images in `public/v86/` are SeaBIOS and the SeaBIOS VGA BIOS (LGPLv3), copied from v86's `bios/`.
