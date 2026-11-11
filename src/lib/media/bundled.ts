/**
 * Labels for the disks that ship on the shelf, keyed by path under
 * `public/media/`. A file dropped there without an entry still shows up — it
 * just gets its file name written on the label.
 */
export const BUNDLED: Record<string, { label: string; note: string; color?: string }> = {
  "/floppy/freedos722.img": { label: "FreeDOS", note: "boot disk · 286 and up", color: "#1f3f8f" },
  "/floppy/freedos-xt.img": { label: "FreeDOS XT", note: "boot disk · for an 8088", color: "#1f7a3a" },
  "/floppy/kolibri.img": { label: "KolibriOS", note: "GUI in 1.44MB!", color: "#d9a400" },
  "/floppy/openbsd-floppy.img": { label: "OpenBSD", note: "install floppy", color: "#d65a00" },
  "/cdrom/linux4.iso": { label: "Linux", note: "buildroot live CD" },
  "/floppy/cryptmorrow.d64": { label: "Cryptmorrow", note: "C64 dungeon crawl · 2025", color: "#5a2a82" },
  "/floppy/laserinvaders.d64": { label: "Laser Invaders", note: "C64 shoot-'em-up", color: "#9b1d20" },
  "/floppy/phatfinger.d64": { label: "Phat Finger", note: "C64 typing game", color: "#d9a400" },
  "/floppy/c64doku.prg": { label: "C64doku", note: "C64 sudoku", color: "#1f7a3a" },
  "/floppy/aros-boot.adf": { label: "AROS", note: "Amiga boot disk · nightly", color: "#1f3f8f" },
  "/cart/soulless.crt": { label: "Soulless", note: "C64 cartridge · 2016", color: "#202024" },
  "/tape/hello.tap": { label: "HELLO", note: "a one-line BASIC program", color: "#d65a00" },
  "/cart/thwaite.nes": { label: "Thwaite", note: "defend the towns · 2011", color: "#9b1d20" },
  "/cart/croom.nes": { label: "Concentration Room", note: "a memory game · 2010", color: "#1f3f8f" },
  "/cart/snake.nes": { label: "Snake", note: "openNES · 2022", color: "#1f7a3a" },
  "/cart/dabg.nes": { label: "Double Action Blaster Guys", note: "two-player blaster · 2014", color: "#d65a00" },
};
