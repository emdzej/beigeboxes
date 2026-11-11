import { isWritable } from "@emdzej/csfs-core";
import { canPersist, open, type MediaItem } from "../../media/library";
import { cardsWith, part } from "../../machines/parts";
import type { BootConfig, Driver, DriverHost, Slot } from "../../machines/types";
import { sfx } from "../../sfx";

const base = import.meta.env.BASE_URL;
const DIR = `${base}emulators/martypc/`;

/** public/emulators/martypc/martypc.js, over the wasm-bindgen core (built from emulators/martypc-web). */
interface MartyModule {
  default(wasmUrl?: string): Promise<void>;
  fetchBios(url?: string): Promise<Uint8Array>;
  XtMachine: new (config: object) => XtMachine;
}

interface XtMachine {
  run(ms: number): void;
  frame(): Uint8Array;
  frame_width(): number;
  frame_height(): number;
  audio(): Float32Array;
  key_down(code: string): boolean;
  key_up(code: string): boolean;
  ctrl_alt_del(): void;
  reset(): void;
  insert_floppy(drive: number, bytes: Uint8Array, name: string): void;
  eject_floppy(drive: number): Uint8Array | undefined;
  floppy_active(drive: number): boolean;
  free(): void;
}

let loaded: Promise<MartyModule> | null = null;

/** The 1983 PC/XT: MartyPC, cycle-accurate, booted from what is in the case. */
export async function start(config: BootConfig, host: DriverHost): Promise<Driver> {
  loaded ??= import(/* @vite-ignore */ `${DIR}martypc.js`).then(async (m: MartyModule) => {
    await m.default();
    return m;
  });
  const mod = await loaded;
  // GLaBIOS 0.4.2, the free XT BIOS, shipped beside the core.
  const bios = await mod.fetchBios();
  const xt = new Xt(mod, bios, config, host);
  await xt.boot();
  return xt;
}

const DRIVES: Record<string, number> = { fda: 0, fdb: 1 };

class Xt implements Driver {
  private machine: XtMachine;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private image: ImageData | null = null;
  private raf = 0;
  private last = 0;
  private audio: AudioContext | null = null;
  private audioAt = 0;
  private input = true;
  private media: BootConfig["media"];
  /** What each floppy held when it went in, so an unchanged disk isn't rewritten. */
  private loadedBytes = new Map<Slot, Uint8Array>();
  private wasActive = [false, false];

  constructor(
    mod: MartyModule,
    bios: Uint8Array,
    private config: BootConfig,
    private host: DriverHost,
  ) {
    const video = cardsWith(config.build, "video").map((c) => part(c.part)?.video)[0];
    const fdc = cardsWith(config.build, "floppy").length > 0;
    this.audio = new AudioContext();
    this.machine = new mod.XtMachine({
      memory_kb: config.memoryKb,
      // No video card fitted: a CGA nobody is looking at; the monitor stays dark.
      video: video === "mda" || video === "hercules" ? video : "cga",
      bios,
      sample_rate: this.audio.sampleRate,
      floppy_drives: fdc ? 2 : 0,
      // Half-height 720K drives, as a late XT had: the 360K disks read in them too.
      floppy_type: "720k",
    });
    this.media = { ...config.media };

    // The one screen element: v86's text layer stays empty, its canvas is ours.
    const text = host.screen.querySelector("div");
    if (text) text.textContent = "";
    this.canvas = host.screen.querySelector("canvas")!;
    // v86 hides its canvas in text mode; after a PC, show it again.
    this.canvas.style.display = "block";
    this.ctx = this.canvas.getContext("2d")!;
  }

  async boot(): Promise<void> {
    for (const slot of ["fda", "fdb"] as const) {
      const m = this.media[slot];
      if (m) await this.insert(slot, m);
    }
    addEventListener("keydown", this.onKey, true);
    addEventListener("keyup", this.onKey, true);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
    this.host.started();
  }

  private tick = (now: number) => {
    const ms = Math.min(100, now - this.last);
    this.last = now;
    this.machine.run(ms);
    this.draw();
    this.play();
    this.lights();
    this.raf = requestAnimationFrame(this.tick);
  };

  private draw(): void {
    const w = this.machine.frame_width();
    const h = this.machine.frame_height();
    if (!w || !h) return;
    if (!this.image || this.image.width !== w || this.image.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.image = this.ctx.createImageData(w, h);
      this.host.setScreen(w, h);
    }
    this.image.data.set(this.machine.frame());
    this.ctx.putImageData(this.image, 0, 0);
  }

  /** The PC speaker: each frame's samples queued just behind the last. */
  private play(): void {
    const samples = this.machine.audio();
    const ctx = this.audio;
    if (!ctx || !samples.length || sfx.muted) return;
    if (ctx.state === "suspended") void ctx.resume();
    const buf = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    // Behind by more than a frame or so: catch up rather than drift.
    if (this.audioAt < ctx.currentTime || this.audioAt > ctx.currentTime + 0.25) this.audioAt = ctx.currentTime + 0.05;
    src.start(this.audioAt);
    this.audioAt += buf.duration;
  }

  private lights(): void {
    for (const i of [0, 1]) {
      const active = this.machine.floppy_active(i);
      if (active) this.host.blink(i ? "fdb" : "fdd", 150);
      if (active && !this.wasActive[i]) sfx.floppySeek();
      this.wasActive[i] = active;
    }
  }

  private onKey = (e: KeyboardEvent) => {
    if (!this.input) return;
    // Ctrl+Alt+End is the page's Ctrl+Alt+Del; let the page have it.
    if (e.ctrlKey && e.altKey && e.key === "End") return;
    if (e.repeat && e.type === "keydown") return; // the XT keyboard repeats by itself
    e.preventDefault();
    if (e.type === "keydown") this.machine.key_down(e.code);
    else this.machine.key_up(e.code);
  };

  async stop(): Promise<void> {
    cancelAnimationFrame(this.raf);
    removeEventListener("keydown", this.onKey, true);
    removeEventListener("keyup", this.onKey, true);
    for (const slot of ["fda", "fdb"] as const) await this.saveFloppy(slot);
    this.machine.free();
    void this.audio?.close();
    this.audio = null;
  }

  reset(): void {
    this.machine.reset();
  }

  async insert(slot: Slot, media: MediaItem): Promise<void> {
    const drive = DRIVES[slot];
    if (drive === undefined) return;
    const bytes = await (await open(media)).bytes();
    this.loadedBytes.set(slot, bytes.slice());
    this.media[slot] = media;
    this.machine.insert_floppy(drive, bytes, media.path.split("/").pop() ?? "disk.img");
  }

  async eject(slot: Slot): Promise<void> {
    await this.saveFloppy(slot);
    delete this.media[slot];
    this.loadedBytes.delete(slot);
  }

  setInput(enabled: boolean): void {
    this.input = enabled;
  }

  lockMouse(): void {
    // No mouse on a 1983 XT.
  }

  sendCtrlAltDel(): void {
    this.machine.ctrl_alt_del();
  }

  /** Take the disk out of the drive and, if the guest wrote to it, put it back where it came from. */
  private async saveFloppy(slot: Slot): Promise<void> {
    const drive = DRIVES[slot];
    const media = this.media[slot];
    if (drive === undefined || !media) return;
    const bytes = this.machine.eject_floppy(drive);
    const before = this.loadedBytes.get(slot);
    if (!bytes || !canPersist(media) || !isWritable(media.fs)) return;
    if (before && before.length === bytes.length && before.every((b, i) => b === bytes[i])) return;
    try {
      await media.fs.write(media.path, bytes.slice());
    } catch (err) {
      console.error(err);
      this.host.say(`Couldn't save ${media.label}.`);
    }
  }
}
