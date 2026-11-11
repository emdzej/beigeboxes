import { loadLibrary, type MediaItem, type MediaKind } from "./media/library";
import { machine } from "./emulator/machine.svelte";

/** A PC reads raw sector images; the extension is only a name. */
const PC_FORMATS = ["img", "ima", "vfd", "flp", "dsk", "iso", "hdd", "hda", "raw", "bin", "vhd"];

export type Overlay = "floppies" | "cds" | "drawer" | "phonebook" | "support" | "inside" | "catalogue" | "carts" | "tapes" | "rom" | null;

/** What is open on the desk, and everything that can be put in a drive. */
class Ui {
  overlay = $state<Overlay>(null);
  /** Leaning in to the monitor, so the screen fills the window. */
  leanIn = $state(false);
  trayOpen = $state(false);
  /** Which drive the floppy box is filling: A:, or B: on a machine with two. */
  floppyTarget = $state<"fda" | "fdb">("fda");
  library = $state<MediaItem[]>([]);
  loading = $state(true);
  /** A short-lived caption, like "Filed DOOM.ISO in your CD wallet". */
  toast = $state<string | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    $effect.root(() => {
      $effect(() => {
        machine.setInput(this.overlay === null);
      });
    });
  }

  async refresh(): Promise<void> {
    this.loading = true;
    try {
      this.library = await loadLibrary();
      // Drives stay in the case across reloads; find them in the new list.
      if (machine.power === "off") machine.restoreDrives(this.library);
    } finally {
      this.loading = false;
    }
  }

  /** Everything of a kind that the machine on the desk can read. */
  of(kind: MediaKind): MediaItem[] {
    const formats = machine.model.formats ?? PC_FORMATS;
    return this.library.filter((m) => m.kind === kind && formats.includes(m.format));
  }

  open(overlay: Overlay): void {
    this.overlay = overlay;
    if (overlay) this.leanIn = false;
  }

  close(): void {
    this.overlay = null;
  }

  say(text: string, ms = 3500): void {
    this.toast = text;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = null), ms);
  }
}

export const ui = new Ui();
