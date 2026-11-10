import { loadLibrary, type MediaItem, type MediaKind } from "./media/library";
import { machine } from "./emulator/machine.svelte";

export type Overlay = "floppies" | "cds" | "drawer" | "setup" | "support" | null;

/** What is open on the desk, and everything that can be put in a drive. */
class Ui {
  overlay = $state<Overlay>(null);
  /** Leaning in to the monitor, so the screen fills the window. */
  leanIn = $state(false);
  trayOpen = $state(false);
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
    } finally {
      this.loading = false;
    }
  }

  of(kind: MediaKind): MediaItem[] {
    return this.library.filter((m) => m.kind === kind);
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
