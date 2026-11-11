import type { NES as NESType } from "jsnes";
import { open, type MediaItem } from "../../media/library";
import type { BootConfig, Driver, DriverHost, Slot } from "../../machines/types";
import { sfx } from "../../sfx";

const FRAME_MS = 1000 / 60.0988;

/** The keyboard as pad 1: arrows, Z = B, X = A, Enter = Start, right Shift = Select. */
const KEYS: Record<string, number> = {
  ArrowUp: 4,
  ArrowDown: 5,
  ArrowLeft: 6,
  ArrowRight: 7,
  KeyZ: 1,
  KeyX: 0,
  Enter: 3,
  ShiftRight: 2,
};

/** A 1985 NES: jsnes, with the cartridge in the slot. */
export async function start(config: BootConfig, host: DriverHost): Promise<Driver> {
  const { NES } = await import("jsnes");
  const nes = new Console(NES, host);
  await nes.boot(config.media.cart);
  return nes;
}

class Console implements Driver {
  private nes: NESType;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private image: ImageData;
  private pixels: Uint32Array;
  private audio = new AudioContext();
  private samples: number[] = [];
  private audioAt = 0;
  private raf = 0;
  private last = 0;
  private owed = 0;
  private input = true;
  private hasCart = false;
  private pads: boolean[] = [];
  /** Pressed since the last frame: a tap shorter than a frame must still be seen. */
  private fresh = new Set<number>();
  private late = new Set<number>();

  constructor(
    NES: typeof NESType,
    private host: DriverHost,
  ) {
    this.nes = new NES({
      sampleRate: this.audio.sampleRate,
      onFrame: (buffer) => {
        // jsnes packs 0xBBGGRR; little-endian, that is RGBA with the alpha to fill in.
        for (let i = 0; i < buffer.length; i++) this.pixels[i] = 0xff000000 | buffer[i]!;
      },
      onAudioSample: (left, right) => this.samples.push((left + right) / 2),
    });
    const text = host.screen.querySelector("div");
    if (text) text.textContent = "";
    this.canvas = host.screen.querySelector("canvas")!;
    // v86 hides its canvas in text mode; after a PC, show it again.
    this.canvas.style.display = "block";
    this.canvas.width = 256;
    this.canvas.height = 240;
    this.ctx = this.canvas.getContext("2d")!;
    this.image = this.ctx.createImageData(256, 240);
    this.pixels = new Uint32Array(this.image.data.buffer);
    host.setScreen(256, 240);
  }

  async boot(cart: MediaItem | undefined): Promise<void> {
    if (cart) {
      this.nes.loadROM(await (await open(cart)).bytes());
      this.hasCart = true;
    }
    addEventListener("keydown", this.onKey, true);
    addEventListener("keyup", this.onKey, true);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
    this.host.started();
    // No cartridge: the power light comes on and the TV shows nothing at all.
    if (!this.hasCart) this.host.say("The red light's on, but the TV shows nothing. There's no cartridge in it.");
  }

  private tick = (now: number) => {
    this.owed = Math.min(this.owed + now - this.last, FRAME_MS * 4);
    this.last = now;
    this.gamepad();
    if (this.hasCart) {
      while (this.owed >= FRAME_MS) {
        this.nes.frame();
        this.owed -= FRAME_MS;
        this.fresh.clear();
        for (const b of this.late) this.nes.buttonUp(1, b as never);
        this.late.clear();
      }
      this.ctx.putImageData(this.image, 0, 0);
      this.play();
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  private play(): void {
    const ctx = this.audio;
    if (!this.samples.length) return;
    const samples = this.samples;
    this.samples = [];
    if (sfx.muted) return;
    if (ctx.state === "suspended") void ctx.resume();
    const buf = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buf.copyToChannel(Float32Array.from(samples), 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    if (this.audioAt < ctx.currentTime || this.audioAt > ctx.currentTime + 0.25) this.audioAt = ctx.currentTime + 0.05;
    src.start(this.audioAt);
    this.audioAt += buf.duration;
  }

  /** A real pad, if one is plugged in: the first gamepad is player 1. */
  private gamepad(): void {
    const pad = navigator.getGamepads?.()[0];
    if (!pad || !this.input) return;
    const axes = pad.axes;
    const state = [
      pad.buttons[0]?.pressed, // A
      pad.buttons[1]?.pressed || pad.buttons[2]?.pressed, // B
      pad.buttons[8]?.pressed, // Select
      pad.buttons[9]?.pressed, // Start
      pad.buttons[12]?.pressed || (axes[1] ?? 0) < -0.5,
      pad.buttons[13]?.pressed || (axes[1] ?? 0) > 0.5,
      pad.buttons[14]?.pressed || (axes[0] ?? 0) < -0.5,
      pad.buttons[15]?.pressed || (axes[0] ?? 0) > 0.5,
    ].map(Boolean);
    state.forEach((down, b) => {
      if (down === !!this.pads[b]) return;
      if (down) this.nes.buttonDown(1, b as never);
      else this.nes.buttonUp(1, b as never);
    });
    this.pads = state;
  }

  private onKey = (e: KeyboardEvent) => {
    if (!this.input) return;
    const button = KEYS[e.code];
    if (button === undefined) return;
    e.preventDefault();
    if (e.type === "keydown") {
      if (e.repeat) return;
      this.nes.buttonDown(1, button as never);
      this.fresh.add(button);
      this.late.delete(button);
    } else if (this.fresh.has(button)) {
      this.late.add(button);
    } else {
      this.nes.buttonUp(1, button as never);
    }
  };

  async stop(): Promise<void> {
    cancelAnimationFrame(this.raf);
    removeEventListener("keydown", this.onKey, true);
    removeEventListener("keyup", this.onKey, true);
    await this.audio.close();
  }

  reset(): void {
    if (this.hasCart) this.nes.reset();
  }

  async insert(_slot: Slot, _media: MediaItem): Promise<void> {
    // Cartridges only go in with the power off; the machine sees to that.
  }

  async eject(_slot: Slot): Promise<void> {}

  setInput(enabled: boolean): void {
    this.input = enabled;
  }

  lockMouse(): void {}

  sendCtrlAltDel(): void {}
}
