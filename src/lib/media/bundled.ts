/**
 * Labels for the disks that ship on the shelf, keyed by path under
 * `public/media/`. A file dropped there without an entry still shows up — it
 * just gets its file name written on the label.
 */
export const BUNDLED: Record<string, { label: string; note: string; color?: string }> = {
  "/floppy/freedos722.img": { label: "FreeDOS", note: "boot disk · 720K", color: "#1f3f8f" },
  "/floppy/kolibri.img": { label: "KolibriOS", note: "GUI in 1.44MB!", color: "#d9a400" },
  "/floppy/openbsd-floppy.img": { label: "OpenBSD", note: "install floppy", color: "#d65a00" },
  "/cdrom/linux4.iso": { label: "Linux", note: "buildroot live CD" },
};
