import { isWritable } from "@emdzej/csfs-core";
import { canPersist, open, type MediaItem } from "../../media/library";
import type { BootConfig, Driver, DriverHost, Slot } from "../../machines/types";
import { sfx } from "../../sfx";

const DIR = `${import.meta.env.BASE_URL}emulators/atari800/`;

/** public/emulators/atari800/atari800.mjs: libatari800 with emulators/atari800-web/src/bbx.c. */
interface Atari800Module {
  HEAPU8: Uint8Array;
  HEAP16: Int16Array;
  HEAP32: Int32Array;
  FS: {
    writeFile(path: string, data: Uint8Array): void;
    readFile(path: string): Uint8Array;
    unlink(path: string): void;
    mkdir(path: string): void;
  };
  _malloc(n: number): number;
  _free(p: number): void;
  _bbx_init(pal: number, basic: number, rate: number): number;
  _bbx_frame(key: number, shift: number, ctrl: number, consol: number, joy: number, trig: number): number;
  _bbx_screen(): number;
  _bbx_palette(): number;
  _bbx_sound(): number;
  _bbx_sound_len(): number;
  _bbx_coldstart(): void;
  _bbx_warmstart(): void;
  _bbx_disk_activity(): number;
  _bbx_set_basic(on: number): void;
  _bbx_mount_disk(drive: number, path: number, readonly: number): number;
  _bbx_unmount_disk(drive: number): void;
  _bbx_load_exe(path: number): number;
  _bbx_insert_cart(path: number): number;
  _bbx_remove_cart(): void;
  _bbx_insert_tape(path: number): number;
  _bbx_remove_tape(): void;
  _bbx_tape_position(): number;
  _bbx_tape_seek(block: number): void;
  _bbx_tape_boot(on: number): void;
  _bbx_tape_motor(): number;
}

type Factory = (opts: object) => Promise<Atari800Module>;

/** The emulator keeps its machine in C globals: one instance per page, so each power-on gets a fresh one. */
async function load(): Promise<Atari800Module> {
  const { default: create } = (await import(/* @vite-ignore */ `${DIR}atari800.mjs`)) as { default: Factory };
  return create({
    locateFile: (file: string) => DIR + file,
    print: () => {},
    printErr: (s: string) => console.debug("atari800:", s),
  });
}

/** PAL: 49.86 frames a second. */
const FRAME_MS = 1000 / 49.8607;
/** The full overscan Atari picture is 336x240 of the 384-wide buffer. */
const SCREEN_W = 336;
const SCREEN_H = 240;
const SCREEN_X = 24;
const BUFFER_W = 384;

/** Disks D1: holds; executables go in the same slot and load as if from it. */
const DISK = new Set(["atr", "xfd", "atx", "dcm", "pro"]);
const EXE = new Set(["xex", "com", "exe", "obx"]);

/** What a 65XE reads, for `Model.formats`. */
export const FORMATS = ["atr", "xfd", "atx", "xex", "com", "exe", "car", "rom", "bin", "cas"];

/**
 * The 1985 Atari 65XE: atari800 with AltirraOS and Altirra BASIC built in,
 * a 1050 as D1:, an XC12 tape deck and the cartridge slot.
 */
export async function start(config: BootConfig, host: DriverHost): Promise<Driver> {
  const mod = await load();
  const xe = new Atari(mod, host);
  await xe.boot(config);
  return xe;
}

const AKEY_SHFT = 0x40;
const AKEY_CTRL = 0x80;

/** Printable characters as the PC types them, to Atari key codes (shift included where the Atari needs it). */
const CHARS: Record<string, number> = {
  "0": 0x32, "1": 0x1f, "2": 0x1e, "3": 0x1a, "4": 0x18, "5": 0x1d, "6": 0x1b, "7": 0x33, "8": 0x35, "9": 0x30,
  a: 0x3f, b: 0x15, c: 0x12, d: 0x3a, e: 0x2a, f: 0x38, g: 0x3d, h: 0x39, i: 0x0d, j: 0x01, k: 0x05, l: 0x00, m: 0x25,
  n: 0x23, o: 0x08, p: 0x0a, q: 0x2f, r: 0x28, s: 0x3e, t: 0x2d, u: 0x0b, v: 0x10, w: 0x2e, x: 0x16, y: 0x2b, z: 0x17,
  " ": 0x21, "!": 0x5f, '"': 0x5e, "#": 0x5a, $: 0x58, "%": 0x5d, "&": 0x5b, "'": 0x73, "@": 0x75, "(": 0x70,
  ")": 0x72, "<": 0x36, ">": 0x37, "=": 0x0f, "?": 0x66, "-": 0x0e, "+": 0x06, "*": 0x07, "/": 0x26, ":": 0x42,
  ";": 0x02, ",": 0x20, ".": 0x22, _: 0x4e, "[": 0x60, "]": 0x62, "^": 0x47, "\\": 0x46, "|": 0x4f,
};

/** Keys by position that aren't characters. Shift/Ctrl are added from the event. */
const CODES: Record<string, number> = {
  Enter: 0x0c, NumpadEnter: 0x0c, Backspace: 0x34, Tab: 0x2c, Escape: 0x1c, CapsLock: 0x3c,
  Delete: 0xb4, Insert: 0xb7, Home: 0x76, Backquote: 0x27,
  F1: 0x11, F6: 0x11,
};

/** Ctrl+arrows are the Atari's own cursor keys (Ctrl and - = + *); plain arrows are the joystick. */
const CURSOR: Record<string, number> = { ArrowUp: 0x8e, ArrowDown: 0x8f, ArrowLeft: 0x86, ArrowRight: 0x87 };
const JOY: Record<string, number> = { ArrowUp: 1, ArrowDown: 2, ArrowLeft: 4, ArrowRight: 8 };
const FIRE = new Set(["AltLeft", "AltRight"]);
/** Console keys, as atari800 has them: F2 OPTION, F3 SELECT, F4 START. Bits as bbx_frame takes them. */
const CONSOL: Record<string, number> = { F4: 1, F3: 2, F2: 4 };
const AKEY_BREAK = -5;

class Atari implements Driver {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private image: ImageData;
  private pixels: Uint32Array;
  private palette = new Uint32Array(256);
  private audio = new AudioContext();
  private audioAt = 0;
  private raf = 0;
  private last = 0;
  private owed = 0;
  private input = true;
  private stopped = false;

  /**
   * The keyboard, a frame at a time. POKEY only sees a key go down if it was up
   * before, so each press is held for a couple of frames, then a frame of nothing:
   * fast typing queues rather than being lost, and "LL" is two L's.
   */
  private key = -1;
  /** The physical key behind `key`, while it is still held. */
  private keyCode = "";
  private keyFrames = 0;
  private keyGap = 0;
  private lastKey = -1;
  private queue: { code: number; physical: string }[] = [];
  private consol = 0;
  private shift = false;
  private ctrl = false;
  /** Console keys held by the driver itself while a frame or two runs. */
  private joy = 0;
  private fire = false;
  private padJoy = 0;
  private padFire = false;
  private padConsol = 0;

  private media: Partial<Record<Slot, MediaItem>> = {};
  private loadedBytes = new Map<Slot, Uint8Array>();
  private diskOff = 0;
  private tapeOn = false;
  private tapePlaying = false;
  private tapeLastPos = 0;
  private tapeMovedAt = 0;

  constructor(
    private mod: Atari800Module,
    private host: DriverHost,
  ) {
    const text = host.screen.querySelector("div");
    if (text) text.textContent = "";
    this.canvas = host.screen.querySelector("canvas")!;
    // v86 hides its canvas in text mode; after a PC, show it again.
    this.canvas.style.display = "block";
    this.canvas.width = SCREEN_W;
    this.canvas.height = SCREEN_H;
    this.ctx = this.canvas.getContext("2d")!;
    this.image = this.ctx.createImageData(SCREEN_W, SCREEN_H);
    this.pixels = new Uint32Array(this.image.data.buffer);
    host.setScreen(SCREEN_W, SCREEN_H);
  }

  async boot(config: BootConfig): Promise<void> {
    const m = this.mod;
    m.FS.mkdir("/media");
    // A disk, program or tape in at power-on: OPTION held, BASIC out of the way, as you'd boot a game.
    const { fda, cart, tape } = config.media;
    const basic = !fda && !tape;
    if (!m._bbx_init(1, basic ? 1 : 0, this.audio.sampleRate)) throw new Error("atari800 would not start");
    const pal = m.HEAP32.subarray(m._bbx_palette() >> 2, (m._bbx_palette() >> 2) + 256);
    // 0x00RRGGBB to little-endian RGBA.
    for (let i = 0; i < 256; i++) {
      const c = pal[i]!;
      this.palette[i] = 0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff);
    }
    m._bbx_set_basic(basic ? 1 : 0);
    if (cart) await this.loadCart(cart);
    if (tape) {
      await this.insert("tape", tape);
      // Boot from it, as if START were held at power on; PLAY is down.
      if (!fda) m._bbx_tape_boot(1);
    }
    if (fda) await this.insert("fda", fda);
    else m._bbx_coldstart();

    addEventListener("keydown", this.onKey, true);
    addEventListener("keyup", this.onKey, true);
    addEventListener("blur", this.release);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
    this.host.started();
  }

  private tick = (now: number) => {
    if (this.stopped) return;
    this.owed = Math.min(this.owed + now - this.last, FRAME_MS * 4);
    this.last = now;
    this.gamepad();
    let ran = false;
    while (this.owed >= FRAME_MS) {
      this.frame();
      this.owed -= FRAME_MS;
      ran = true;
    }
    if (ran) {
      this.draw();
      this.lights(now);
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  private frame(): void {
    const m = this.mod;
    const on = this.input;
    const key = on ? this.nextKey() : -1;
    const consol = on ? this.consol | this.padConsol : 0;
    const joy = on ? this.joy | this.padJoy : 0;
    const trig = on && (this.fire || this.padFire) ? 1 : 0;
    m._bbx_frame(key, on && this.shift ? 1 : 0, on && this.ctrl ? 1 : 0, consol, joy, trig);
    this.play();
  }

  private draw(): void {
    const m = this.mod;
    const heap = m.HEAPU8;
    const base = m._bbx_screen();
    const px = this.pixels;
    const pal = this.palette;
    for (let y = 0, o = 0; y < SCREEN_H; y++) {
      let i = base + y * BUFFER_W + SCREEN_X;
      for (let x = 0; x < SCREEN_W; x++) px[o++] = pal[heap[i++]!]!;
    }
    this.ctx.putImageData(this.image, 0, 0);
  }

  /** POKEY: each frame's 16-bit samples queued just behind the last. */
  private play(): void {
    const m = this.mod;
    const n = m._bbx_sound_len() >> 1;
    const ctx = this.audio;
    if (!n || sfx.muted) return;
    if (ctx.state === "suspended") void ctx.resume();
    const src16 = m.HEAP16.subarray(m._bbx_sound() >> 1, (m._bbx_sound() >> 1) + n);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const out = buf.getChannelData(0);
    for (let i = 0; i < n; i++) out[i] = src16[i]! / 32768;
    const node = ctx.createBufferSource();
    node.buffer = buf;
    node.connect(ctx.destination);
    if (this.audioAt < ctx.currentTime || this.audioAt > ctx.currentTime + 0.25) this.audioAt = ctx.currentTime + 0.05;
    node.start(this.audioAt);
    this.audioAt += buf.duration;
  }

  private lights(now: number): void {
    const m = this.mod;
    // The 1050's busy light: on while SIO talks to it, and a moment after.
    if (m._bbx_disk_activity() & 1) {
      if (!this.diskOff) {
        this.host.light("fdd", true);
        sfx.floppySeek();
      }
      this.diskOff = now + 200;
    } else if (this.diskOff && now > this.diskOff) {
      this.diskOff = 0;
      this.host.light("fdd", false);
    }
    // The tape motor: the PIA's motor line, or the tape moving (the fast loader skips the motor).
    let motor = false;
    if (this.media.tape && this.tapePlaying) {
      const pos = m._bbx_tape_position();
      if (pos !== this.tapeLastPos) {
        this.tapeLastPos = pos;
        this.tapeMovedAt = now;
      }
      motor = m._bbx_tape_motor() === 1 || now - this.tapeMovedAt < 300;
    }
    if (motor !== this.tapeOn) {
      this.tapeOn = motor;
      this.host.light("tape", motor);
    }
  }

  /** The first gamepad is the joystick in port 1; its Start and Back are START and SELECT. */
  private gamepad(): void {
    const pad = navigator.getGamepads?.()[0];
    if (!pad) {
      this.padJoy = this.padConsol = 0;
      this.padFire = false;
      return;
    }
    const b = (i: number) => !!pad.buttons[i]?.pressed;
    const ax = pad.axes;
    this.padJoy =
      (b(12) || (ax[1] ?? 0) < -0.5 ? 1 : 0) |
      (b(13) || (ax[1] ?? 0) > 0.5 ? 2 : 0) |
      (b(14) || (ax[0] ?? 0) < -0.5 ? 4 : 0) |
      (b(15) || (ax[0] ?? 0) > 0.5 ? 8 : 0);
    this.padFire = b(0) || b(1) || b(2) || b(3);
    this.padConsol = (b(9) ? 1 : 0) | (b(8) ? 2 : 0);
  }

  private onKey = (e: KeyboardEvent) => {
    if (!this.input) return;
    const down = e.type === "keydown";
    this.shift = e.shiftKey;
    this.ctrl = e.ctrlKey;
    if (e.code === "ShiftLeft" || e.code === "ShiftRight" || e.code === "ControlLeft" || e.code === "ControlRight") {
      e.preventDefault();
      return;
    }
    // Ctrl+Alt+End is the page's Ctrl+Alt+Del; let the page have it.
    if (e.ctrlKey && e.altKey) return;

    const consol = CONSOL[e.code];
    if (consol) {
      e.preventDefault();
      this.consol = down ? this.consol | consol : this.consol & ~consol;
      return;
    }
    if (FIRE.has(e.code)) {
      e.preventDefault();
      this.fire = down;
      return;
    }
    if (e.code === "F5") {
      e.preventDefault();
      if (down && !e.repeat) {
        if (e.shiftKey) this.mod._bbx_coldstart();
        else this.mod._bbx_warmstart();
      }
      return;
    }
    if (e.code === "F7" || e.code === "Pause") {
      e.preventDefault();
      if (down) this.press(e.code, AKEY_BREAK);
      else this.lift(e.code);
      return;
    }
    const joy = JOY[e.code];
    if (joy && !e.ctrlKey) {
      e.preventDefault();
      this.joy = down ? this.joy | joy : this.joy & ~joy;
      return;
    }
    if (!down) {
      this.lift(e.code);
      return;
    }
    // Let the browser keep its own shortcuts.
    if (e.metaKey) return;
    const code = this.atariKey(e);
    if (code === undefined) return;
    e.preventDefault();
    // The Atari repeats a held key by itself.
    if (e.repeat) return;
    this.press(e.code, code);
    // Caps Lock's keyup comes only when it is pressed again: a tap.
    if (e.code === "CapsLock") this.lift(e.code);
  };

  private atariKey(e: KeyboardEvent): number | undefined {
    const cursor = CURSOR[e.code];
    if (cursor !== undefined) return cursor;
    const fixed = CODES[e.code];
    if (fixed !== undefined) {
      // Shift+Insert/Delete insert and delete whole lines; Home is CLEAR.
      if (e.code === "Delete" && e.shiftKey) return 0x74;
      if (e.code === "Insert" && e.shiftKey) return 0x77;
      if (e.code === "Home") return fixed;
      return fixed | (e.shiftKey && fixed < 0x40 ? AKEY_SHFT : 0) | (e.ctrlKey && fixed < 0x80 ? AKEY_CTRL : 0);
    }
    if (e.key.length !== 1) return undefined;
    let ch = e.key;
    // Ctrl+letter: the browser still reports the letter.
    const lower = ch.toLowerCase();
    let code = CHARS[lower];
    if (code !== undefined && lower !== ch.toUpperCase()) {
      if (ch !== lower) code |= AKEY_SHFT;
      if (e.ctrlKey) code |= AKEY_CTRL;
      return code;
    }
    code = CHARS[ch];
    if (code === undefined) return undefined;
    if (e.ctrlKey) {
      // Ctrl+digit or punctuation: control on the unshifted key.
      ch = e.code.startsWith("Digit") ? e.code.slice(5) : ch;
      return ((CHARS[ch] ?? code) & 0x3f) | AKEY_CTRL;
    }
    return code;
  }

  /** The key this frame shows POKEY. */
  private nextKey(): number {
    if (this.key >= 0 || this.key < -1) {
      this.keyFrames++;
      // Held at least three frames (games that poll slowly still see it), then up again.
      const up = !this.keyCode || this.queue.length > 0;
      if (this.keyFrames > 3 && up) {
        this.key = -1;
        this.keyCode = "";
        this.keyGap = 4;
      }
      return this.key;
    }
    if (this.keyGap > 0) this.keyGap--;
    const next = this.queue[0];
    // The OS ignores the same key again within its debounce time: wait it out.
    if (!next || this.keyGap > (next.code === this.lastKey ? 0 : 3)) return -1;
    this.queue.shift();
    this.lastKey = next.code;
    this.key = next.code;
    this.keyCode = next.physical;
    this.keyFrames = 1;
    return this.key;
  }

  private press(physical: string, code: number): void {
    if (this.queue.length < 32) this.queue.push({ code, physical });
  }

  /** Let go of a key: if it hasn't been shown yet, it still will be, briefly. */
  private lift(physical: string): void {
    if (physical === this.keyCode) this.keyCode = "";
    for (const q of this.queue) if (q.physical === physical) q.physical = "";
  }

  private release = () => {
    this.key = -1;
    this.keyCode = "";
    this.queue = [];
    this.consol = this.joy = 0;
    this.fire = this.shift = this.ctrl = false;
  };

  async stop(): Promise<void> {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    removeEventListener("keydown", this.onKey, true);
    removeEventListener("keyup", this.onKey, true);
    removeEventListener("blur", this.release);
    await this.saveDisk();
    this.host.light("fdd", false);
    this.host.light("tape", false);
    await this.audio.close();
  }

  reset(): void {
    this.mod._bbx_warmstart();
  }

  async insert(slot: Slot, media: MediaItem): Promise<void> {
    if (slot === "fda") await this.loadDisk(media);
    else if (slot === "tape") await this.loadTape(media);
    // The cartridge only goes in with the power off: boot() has it.
  }

  async eject(slot: Slot): Promise<void> {
    const m = this.mod;
    if (slot === "fda") {
      await this.saveDisk();
    } else if (slot === "tape" && this.media.tape) {
      m._bbx_remove_tape();
      this.unlink("/media/tape.cas");
      delete this.media.tape;
      this.tapePlaying = false;
    }
  }

  /** PLAY, STOP and REWIND on the XC12. */
  tape(button: "play" | "stop" | "rewind"): void {
    const m = this.mod;
    const media = this.media.tape;
    if (!media) return;
    if (button === "rewind") {
      m._bbx_tape_seek(1);
      this.tapeLastPos = m._bbx_tape_position();
      return;
    }
    const play = button === "play";
    if (play === this.tapePlaying) return;
    // atari800's deck has no buttons: STOP takes the tape out and keeps its place.
    if (play) {
      const at = this.tapeLastPos;
      if (!this.withPath("/media/tape.cas", (p) => m._bbx_insert_tape(p))) return;
      if (at > 1) m._bbx_tape_seek(at);
    } else {
      this.tapeLastPos = m._bbx_tape_position();
      m._bbx_remove_tape();
    }
    this.tapePlaying = play;
  }

  setInput(enabled: boolean): void {
    this.input = enabled;
    if (!enabled) this.release();
  }

  lockMouse(): void {}

  sendCtrlAltDel(): void {
    this.mod._bbx_coldstart();
  }

  private async loadDisk(media: MediaItem): Promise<void> {
    const m = this.mod;
    await this.saveDisk();
    const bytes = await (await open(media)).bytes();
    if (EXE.has(media.format)) {
      // A program, booted by atari800's loader as if a DOS had loaded it from D1:.
      const path = `/media/program.${media.format}`;
      m.FS.writeFile(path, bytes);
      this.media.fda = media;
      if (!this.withPath(path, (p) => m._bbx_load_exe(p))) this.host.say(`The Atari can't load ${media.label}.`);
      return;
    }
    if (!DISK.has(media.format)) {
      this.host.say(`${media.label} isn't an Atari disk.`);
      return;
    }
    const path = `/media/d1.${media.format}`;
    m.FS.writeFile(path, bytes);
    this.loadedBytes.set("fda", bytes.slice());
    this.media.fda = media;
    // Always writable: a shelf disk keeps what's written to it, in memory, until it comes out.
    if (!this.withPath(path, (p) => m._bbx_mount_disk(1, p, 0))) {
      this.host.say(`The 1050 can't read ${media.label}.`);
    }
    // Before power-on boot() cold-starts once the disk is in; later it's a disk swap.
    if (this.raf === 0) m._bbx_coldstart();
  }

  /** Take the disk out of D1: and, if the Atari wrote to it, put it back where it came from. */
  private async saveDisk(): Promise<void> {
    const m = this.mod;
    const media = this.media.fda;
    if (!media) return;
    delete this.media.fda;
    if (EXE.has(media.format)) {
      this.unlink(`/media/program.${media.format}`);
      return;
    }
    const path = `/media/d1.${media.format}`;
    m._bbx_unmount_disk(1);
    let bytes: Uint8Array | null = null;
    try {
      bytes = m.FS.readFile(path).slice();
    } catch {
      return;
    }
    this.unlink(path);
    const before = this.loadedBytes.get("fda");
    this.loadedBytes.delete("fda");
    if (!canPersist(media) || !isWritable(media.fs)) return;
    if (before && before.length === bytes.length && before.every((b, i) => b === bytes[i])) return;
    try {
      await media.fs.write(media.path, bytes);
    } catch (err) {
      console.error(err);
      this.host.say(`Couldn't save ${media.label}.`);
    }
  }

  private async loadCart(media: MediaItem): Promise<void> {
    const m = this.mod;
    const bytes = await (await open(media)).bytes();
    const path = `/media/cart.${media.format || "rom"}`;
    m.FS.writeFile(path, bytes);
    if (!this.withPath(path, (p) => m._bbx_insert_cart(p))) {
      this.host.say(`${media.label} doesn't fit a 65XE's cartridge slot.`);
      return;
    }
    this.media.cart = media;
  }

  private async loadTape(media: MediaItem): Promise<void> {
    const m = this.mod;
    if (this.media.tape) await this.eject("tape");
    const bytes = await (await open(media)).bytes();
    m.FS.writeFile("/media/tape.cas", bytes);
    if (!this.withPath("/media/tape.cas", (p) => m._bbx_insert_tape(p))) {
      this.host.say(`The XC12 can't play ${media.label}.`);
      return;
    }
    this.media.tape = media;
    this.tapePlaying = true;
    this.tapeLastPos = m._bbx_tape_position();
  }

  /** Call into C with a path as a NUL-terminated string. */
  private withPath(path: string, fn: (p: number) => number): number {
    const m = this.mod;
    const bytes = new TextEncoder().encode(path);
    const p = m._malloc(bytes.length + 1);
    m.HEAPU8.set(bytes, p);
    m.HEAPU8[p + bytes.length] = 0;
    try {
      return fn(p);
    } finally {
      m._free(p);
    }
  }

  private unlink(path: string): void {
    try {
      this.mod.FS.unlink(path);
    } catch {
      // Not there.
    }
  }
}
