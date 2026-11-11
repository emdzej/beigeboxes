import { isWritable } from "@emdzej/csfs-core";
import { canPersist, open, type MediaItem } from "../../media/library";
import type { BootConfig, Driver, DriverHost, Slot } from "../../machines/types";
import { sfx } from "../../sfx";
import { getRom } from "../roms";

const base = import.meta.env.BASE_URL;
const DIR = `${base}emulators/mac/`;

/** Where the user's ROM is kept (src/lib/emulator/roms.ts). */
export const MAC_ROM_ID = "mac-plus";

/** The disk images the drives read, by extension; anything else stays out. */
export const MAC_FLOPPY_FORMATS = ["dsk", "img", "image", "dc42", "moof"];
export const MAC_HDD_FORMATS = ["hda", "img", "hdd", "raw"];

/**
 * The Mac ejects disks by itself (the Finder's Eject, a disk dragged to the Trash, shutting
 * down). When it does, the driver has already saved the disk and let go of it; the host only
 * has to take it off the drive. Optional, so it fits any DriverHost.
 */
export interface MacDriverHost extends DriverHost {
  ejected?(slot: Slot): void;
}

/** public/emulators/mac/snow_web.js, wasm-bindgen over Snow (built from emulators/snow-web). */
interface SnowModule {
  default(wasmUrl?: string): Promise<unknown>;
  MacMachine: new (rom: Uint8Array, model: string, ramKb: number) => MacMachine;
}

interface MacMachine {
  model_name(): string;
  ram_kb(): number;
  run(ms: number): void;
  frame_ready(): boolean;
  frame(): Uint8Array;
  frame_width(): number;
  frame_height(): number;
  audio(): Float32Array;
  audio_rate(): number;
  key_down(code: string): boolean;
  key_up(code: string): boolean;
  release_all(): void;
  mouse_abs(x: number, y: number): void;
  mouse_rel(dx: number, dy: number): void;
  mouse_button(down: boolean): void;
  set_mouse_mode(mode: "absolute" | "relative"): void;
  reset(): void;
  insert_floppy(drive: number, bytes: Uint8Array, name: string, locked: boolean): void;
  eject_floppy(drive: number): Uint8Array | undefined;
  floppy_bytes(drive: number): Uint8Array | undefined;
  guest_ejects(): Uint32Array;
  take_guest_eject(drive: number): Uint8Array | undefined;
  floppy_motor(drive: number): boolean;
  attach_hdd(id: number, bytes: Uint8Array): void;
  hdd_bytes(id: number): Uint8Array | undefined;
  hdd_activity(): number;
  take_message(): string | undefined;
  running(): boolean;
  free(): void;
}

let loaded: Promise<SnowModule> | null = null;

/** The 1986 Macintosh Plus: Snow, cycle-accurate, with the user's own ROM. */
export async function start(config: BootConfig, host: MacDriverHost): Promise<Driver> {
  const rom = await getRom(MAC_ROM_ID).catch(() => null);
  if (!rom) {
    throw new Error(
      "There's no ROM in it. Apple's can't come with the site: put your own Mac Plus ROM (128 KB) in the envelope on the desk.",
    );
  }
  if (rom.length !== 131072 && rom.length !== 65536) {
    throw new Error(`The ROM image is ${Math.round(rom.length / 1024)} KB; a Mac Plus ROM is 128 KB.`);
  }
  loaded ??= import(/* @vite-ignore */ `${DIR}snow_web.js`).then(async (m: SnowModule) => {
    await m.default();
    return m;
  });
  const mod = await loaded.catch((err: unknown) => {
    loaded = null;
    throw err;
  });
  const mac = new Mac(new mod.MacMachine(rom, "", config.memoryKb || 1024), config, host);
  await mac.boot();
  return mac;
}

const DRIVES: Partial<Record<Slot, number>> = { fda: 0, fdb: 1 };
/** SCSI IDs. */
const DISKS: Partial<Record<Slot, number>> = { hda: 0, hdb: 1 };
const W = 512;
const H = 342;

class Mac implements Driver {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private image: ImageData;
  private raf = 0;
  private last = 0;
  private audio: AudioContext | null = new AudioContext();
  private audioAt = 0;
  private input = true;
  private locked = false;
  private media: BootConfig["media"];
  private motor = [false, false];
  private hddSeen = 0;
  private cursor = "";
  private stopped = false;

  constructor(
    private machine: MacMachine,
    config: BootConfig,
    private host: MacDriverHost,
  ) {
    this.media = { ...config.media };
    const text = host.screen.querySelector("div");
    if (text) text.textContent = "";
    this.canvas = host.screen.querySelector("canvas")!;
    // v86 hides its canvas in text mode; after a PC, show it again.
    this.canvas.style.display = "block";
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext("2d")!;
    this.image = this.ctx.createImageData(W, H);
    host.setScreen(W, H);
    // The Mac draws its own arrow where the pointer is.
    this.cursor = this.canvas.style.cursor;
    this.canvas.style.cursor = "none";
  }

  async boot(): Promise<void> {
    for (const slot of ["hda", "hdb"] as const) {
      const m = this.media[slot];
      if (m) await this.attach(slot, m);
    }
    for (const slot of ["fda", "fdb"] as const) {
      const m = this.media[slot];
      if (m) await this.insert(slot, m);
    }
    addEventListener("keydown", this.onKey, true);
    addEventListener("keyup", this.onKey, true);
    addEventListener("blur", this.onBlur);
    this.canvas.addEventListener("pointermove", this.onMove);
    this.canvas.addEventListener("pointerdown", this.onButton);
    addEventListener("pointerup", this.onButton);
    document.addEventListener("pointerlockchange", this.onLock);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
    this.host.started();
  }

  private tick = (now: number) => {
    const ms = Math.min(100, now - this.last);
    this.last = now;
    this.machine.run(ms);
    if (this.machine.frame_ready()) {
      this.image.data.set(this.machine.frame());
      this.ctx.putImageData(this.image, 0, 0);
    }
    this.play();
    this.lights();
    void this.guestEjects();
    const msg = this.machine.take_message();
    if (msg) this.host.say(msg);
    if (!this.machine.running()) {
      this.host.say("The Mac has stopped: its CPU hit something the emulator can't run.");
      return;
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  /** The Mac's PWM sound, 22 kHz, each frame's queued just behind the last. */
  private play(): void {
    const samples = this.machine.audio();
    const ctx = this.audio;
    if (!ctx || !samples.length || sfx.muted) return;
    if (ctx.state === "suspended") void ctx.resume();
    const buf = ctx.createBuffer(1, samples.length, this.machine.audio_rate());
    buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    if (this.audioAt < ctx.currentTime || this.audioAt > ctx.currentTime + 0.25) this.audioAt = ctx.currentTime + 0.05;
    src.start(this.audioAt);
    this.audioAt += buf.duration;
  }

  private lights(): void {
    for (const i of [0, 1]) {
      const on = this.machine.floppy_motor(i);
      if (on === this.motor[i]) continue;
      this.motor[i] = on;
      this.host.light(i ? "fdb" : "fdd", on);
      if (on) sfx.floppySeek();
    }
    const hdd = this.machine.hdd_activity();
    if (hdd !== this.hddSeen) {
      this.hddSeen = hdd;
      this.host.blink("hdd", 120);
    }
  }

  /** The Mac pushed a disk out: save what it wrote, and tell the host the drive is empty. */
  private async guestEjects(): Promise<void> {
    // Taken all at once before anything waits, so the next frame can't take them again.
    const out = Array.from(this.machine.guest_ejects(), (drive) => {
      const slot: Slot = drive ? "fdb" : "fda";
      const media = this.media[slot];
      delete this.media[slot];
      return { slot, media, bytes: this.machine.take_guest_eject(drive) };
    });
    for (const { slot, media, bytes } of out) {
      if (media && bytes) await this.save(media, bytes);
      sfx.floppyEject();
      this.host.ejected?.(slot);
    }
  }

  // --- input -----------------------------------------------------------------

  private onKey = (e: KeyboardEvent) => {
    if (!this.input) return;
    // Ctrl+Alt+End is the page's Ctrl+Alt+Del; let the page have it.
    if (e.ctrlKey && e.altKey && e.key === "End") return;
    if (e.repeat) {
      // The Mac repeats keys itself.
      if (e.type === "keydown") e.preventDefault();
      return;
    }
    const known = e.type === "keydown" ? this.machine.key_down(e.code) : this.machine.key_up(e.code);
    if (known) e.preventDefault();
  };

  private onBlur = () => this.machine.release_all();

  private onMove = (e: PointerEvent) => {
    if (!this.input) return;
    if (this.locked) {
      this.machine.mouse_rel(Math.round(e.movementX), Math.round(e.movementY));
      return;
    }
    // The canvas may be scaled into the monitor; the Mac's screen is 512 x 342.
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const x = Math.round(((e.clientX - r.left) / r.width) * W);
    const y = Math.round(((e.clientY - r.top) / r.height) * H);
    this.machine.mouse_abs(Math.max(0, Math.min(W - 1, x)), Math.max(0, Math.min(H - 1, y)));
  };

  private onButton = (e: PointerEvent) => {
    if (!this.input || e.button !== 0) return;
    // Up anywhere, so a drag released off the screen still lets go; down only on the screen.
    if (e.type === "pointerdown") {
      this.onMove(e);
      this.machine.mouse_button(true);
      e.preventDefault();
    } else {
      this.machine.mouse_button(false);
    }
  };

  private onLock = () => {
    this.locked = document.pointerLockElement === this.canvas;
    this.machine.set_mouse_mode(this.locked ? "relative" : "absolute");
  };

  setInput(enabled: boolean): void {
    this.input = enabled;
    if (!enabled) this.machine.release_all();
  }

  /**
   * The pointer drives the Mac's cursor directly, no lock needed. Locking switches to a
   * hardware mouse, for games that read it themselves; Esc lets go.
   */
  lockMouse(): void {
    void this.canvas.requestPointerLock?.();
  }

  sendCtrlAltDel(): void {
    // No such thing on a Mac: the programmer's switch's reset button.
    this.machine.reset();
  }

  reset(): void {
    this.machine.reset();
  }

  // --- drives ------------------------------------------------------------------

  async insert(slot: Slot, media: MediaItem): Promise<void> {
    const drive = DRIVES[slot];
    if (drive === undefined) return;
    const bytes = await (await open(media)).bytes();
    try {
      // A disk whose writes can't be kept goes in locked, as an original would.
      this.machine.insert_floppy(drive, bytes, media.path.split(/[/#]/).pop() ?? "disk", !canPersist(media));
      this.media[slot] = media;
    } catch (err) {
      console.error(err);
      this.host.say(`${media.label} won't go in: ${(err as Error).message}.`);
    }
  }

  async eject(slot: Slot): Promise<void> {
    const drive = DRIVES[slot];
    const media = this.media[slot];
    if (drive === undefined || !media) return;
    delete this.media[slot];
    const bytes = this.machine.eject_floppy(drive);
    if (bytes) await this.save(media, bytes);
  }

  private async attach(slot: Slot, media: MediaItem): Promise<void> {
    const id = DISKS[slot];
    if (id === undefined) return;
    try {
      this.machine.attach_hdd(id, await (await open(media)).bytes());
    } catch (err) {
      console.error(err);
      delete this.media[slot];
      this.host.say(`${media.label} isn't a disk the Mac can use: ${(err as Error).message}.`);
    }
  }

  private async save(media: MediaItem, bytes: Uint8Array): Promise<void> {
    if (!canPersist(media) || !isWritable(media.fs)) return;
    try {
      await media.fs.write(media.path, bytes.slice());
    } catch (err) {
      console.error(err);
      this.host.say(`Couldn't save ${media.label}.`);
    }
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    removeEventListener("keydown", this.onKey, true);
    removeEventListener("keyup", this.onKey, true);
    removeEventListener("blur", this.onBlur);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerdown", this.onButton);
    removeEventListener("pointerup", this.onButton);
    document.removeEventListener("pointerlockchange", this.onLock);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.canvas.style.cursor = this.cursor;
    // A disk the Mac ejected in its last frame, then what is still in the drives.
    await this.guestEjects();
    for (const slot of ["fda", "fdb"] as const) {
      const drive = DRIVES[slot]!;
      const media = this.media[slot];
      const bytes = media ? this.machine.floppy_bytes(drive) : undefined;
      if (media && bytes) await this.save(media, bytes);
    }
    for (const slot of ["hda", "hdb"] as const) {
      const media = this.media[slot];
      const bytes = media ? this.machine.hdd_bytes(DISKS[slot]!) : undefined;
      if (media && bytes) await this.save(media, bytes);
    }
    this.machine.free();
    void this.audio?.close();
    this.audio = null;
  }
}
