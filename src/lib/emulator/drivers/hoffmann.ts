/**
 * Dirk Hoffmann's emulators, as the web ports ship them: vc64web (VirtualC64)
 * and vAmigaWeb (vAmiga), each in a same-origin iframe running a chrome-less
 * wrapper page (public/emulators/{c64,amiga}/embed.html). The iframe posts the
 * core's messages back (see embed.js); everything else is driven by calling the
 * upstream `wasm_*` functions on the iframe's window directly.
 */

const base = import.meta.env.BASE_URL;

export type HoffmannMachine = "c64" | "amiga";
export type MediaKind = "disk" | "tape" | "cart" | "prg" | "adf" | "hdf";
export type LedEvent = { which: "power" | "drive" | "hdd" | "tape"; drive?: number; on: boolean };
export type JoyState = { up: boolean; down: boolean; left: boolean; right: boolean; fire: boolean };

export interface C64Config {
  /** REU or GeoRAM in the expansion port (a cartridge replaces it). */
  ram_expansion?: "none" | "reu128" | "reu256" | "reu512" | "reu1024" | "reu2048" | "reu16384" | "georam512" | "georam1024" | "georam4096";
  /** VIC-II and mains frequency. Default PAL. */
  video?: "pal" | "ntsc";
  /** A 1541 ROM the user owns. Without it disks go through the virtual drive below. */
  drive_rom?: Uint8Array;
}

export interface AmigaConfig {
  model: "A500" | "A500+" | "A1200";
  chip_kb?: number;
  slow_kb?: number;
  fast_kb?: number;
  cpu?: "68000" | "68010" | "68020";
  /** Kickstart replacement. Default AROS. */
  rom?: "aros" | "emutos";
}

export interface HoffmannEmbed {
  /** Create the iframe inside `container`, boot the machine, resolve when it's running. */
  start(opts: { container: HTMLElement; machine: HoffmannMachine; config: Record<string, unknown> }): Promise<void>;
  insert(kind: MediaKind, bytes: Uint8Array, name: string, drive?: number): Promise<void>;
  eject(kind: "disk" | "tape" | "cart", drive?: number): Promise<void>;
  /** C64 Datasette buttons. */
  tape(button: "play" | "stop" | "rewind"): void;
  reset(): void;
  power(off: boolean): void;
  joystick(port: 1 | 2, state: JoyState): void;
  /** Keyboard focus to/away from the emulator. */
  setInput(enabled: boolean): void;
  /** Type text on the C64's keyboard (60 ms a key); resolves once it's typed. */
  type(text: string): Promise<void>;
  /** LEDs and motors: power, floppy (per drive), hard disk (Amiga), tape motor. */
  on(event: "led", cb: (e: LedEvent) => void): void;
  stop(): Promise<void>;
}

/** The upstream globals this module touches inside the iframe. */
type EmuWindow = Window & {
  hoffmann: { input: boolean; powered: boolean; setPowered(on: boolean): void; romsInstalled: Promise<void> | null };
  wasm_loadfile(name: string, bytes: Uint8Array, len?: number, drive?: number): string;
  wasm_reset(): void;
  wasm_run(): void;
  wasm_halt(): void;
  wasm_joystick(ev: string): void;
  wasm_auto_type(text: string): void;
  wasm_press_play(): void;
  wasm_press_stop(): void;
  wasm_rewind(): void;
  wasm_eject_disk(drive: string): void;
  wasm_configure(option: string, value: number | string): string | undefined;
  /** A BigInt in these builds (i64). */
  wasm_get_cpu_cycles(): number | bigint;
  wasm_power_on(on: number): string;
  wasm_has_disk(drive: string): number;
  reset_keyboard?(): void;
  Module: Record<string, (...a: number[]) => number>;
};

type CoreMsg = { source: "hoffmann"; msg: string; data1?: number; data2?: number; error?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** C64 cold start to READY. with Open ROMs is ~0.25 s; the upstream UI waits 500k cycles. */
const C64_BOOT_CYCLES = 500_000;
/** autoType holds each key 30 ms and releases it 30 ms (PAL clock, a little slack). */
const C64_CYCLES_PER_KEY = 62_000;

export function createHoffmannEmbed(): HoffmannEmbed {
  return new Hoffmann();
}

class Hoffmann implements HoffmannEmbed {
  private iframe: HTMLIFrameElement | null = null;
  private machine: HoffmannMachine = "c64";
  private listeners: ((e: LedEvent) => void)[] = [];
  private waiters: { msg: string; resolve: (m: CoreMsg) => void }[] = [];
  private joy: Record<number, JoyState> = {};
  private realDrive = false;
  private running = false;
  private typing: Promise<void> = Promise.resolve();
  private leds = new Map<string, boolean>();
  private motorBurst = 0;
  private motorTimer: ReturnType<typeof setTimeout> | undefined;
  private onMessage = (ev: MessageEvent) => {
    if (!this.iframe || ev.source !== this.iframe.contentWindow) return;
    const m = ev.data as CoreMsg;
    if (!m || m.source !== "hoffmann") return;
    this.handle(m);
  };

  private get win(): EmuWindow {
    const w = this.iframe?.contentWindow as EmuWindow | null | undefined;
    if (!w) throw new Error("hoffmann: not started");
    return w;
  }

  async start(opts: { container: HTMLElement; machine: HoffmannMachine; config: Record<string, unknown> }): Promise<void> {
    if (this.iframe) await this.stop();
    this.machine = opts.machine;
    const iframe = document.createElement("iframe");
    iframe.title = opts.machine === "c64" ? "Commodore 64" : "Amiga";
    iframe.allow = "autoplay; gamepad; fullscreen";
    iframe.style.cssText = "border:0;width:100%;height:100%;display:block;background:#000";
    iframe.src = opts.machine === "c64" ? c64Url() : amigaUrl(opts.config as unknown as AmigaConfig);
    this.iframe = iframe;
    window.addEventListener("message", this.onMessage);
    const running = this.waitFor("MSG_RUN", 60_000);
    opts.container.appendChild(iframe);
    await running;
    this.running = true;
    if (opts.machine === "c64") await this.configureC64(opts.config as C64Config);
    this.emit({ which: "power", on: true });
  }

  private async configureC64(cfg: C64Config): Promise<void> {
    const w = this.win;
    if (cfg.video === "ntsc") w.wasm_configure("NTSC 60Hz 6567", 0);
    const x = cfg.ram_expansion;
    if (x && x !== "none") {
      const kb = Number(x.replace(/\D+/g, ""));
      w.wasm_configure(x.startsWith("reu") ? "REU" : "GeoRAM", kb);
    }
    if (cfg.drive_rom) {
      w.wasm_loadfile("1541.rom", cfg.drive_rom, cfg.drive_rom.byteLength);
      this.realDrive = true;
      w.wasm_reset();
    }
    if (cfg.video === "ntsc" || cfg.drive_rom) await this.c64Booted();
  }

  /** Wait until the C64 has passed its cold start (cycle counter restarts on reset). */
  private async c64Booted(): Promise<void> {
    const w = this.win;
    for (let i = 0; i < 100 && cycles(w) < C64_BOOT_CYCLES; i++) await sleep(50);
  }

  async insert(kind: MediaKind, bytes: Uint8Array, name: string, drive = 0): Promise<void> {
    const w = this.win;
    if (this.machine === "amiga") {
      if (kind !== "adf" && kind !== "hdf" && kind !== "disk") throw new Error(`amiga: cannot insert ${kind}`);
      const isHdf = kind === "hdf" || /\.hdf$/i.test(name);
      const file = isHdf ? withExt(name, "hdf") : withExt(name, "adf");
      const err = w.wasm_loadfile(file, bytes, drive);
      if (err) throw new Error(`amiga: ${err}`);
      // Attaching a hard drive power-cycles the machine and leaves it paused.
      if (isHdf) w.wasm_run();
      return;
    }
    switch (kind) {
      case "prg": {
        await this.c64Reset();
        flashOrThrow(w, withExt(name, "prg"), bytes);
        await this.type("run\n");
        return;
      }
      case "disk": {
        if (this.realDrive) {
          flashOrThrow(w, withExt(name, /\.g64$/i.test(name) ? "g64" : "d64"), bytes, 8 + drive);
          await this.type('load"*",8,1\n');
          return;
        }
        // Virtual drive: no 1541 ROM, so read the disk's directory here and
        // put the first program straight into memory, as LOAD"*",8,1 would.
        const prg = firstPrg(bytes);
        if (!prg) throw new Error("c64: no program on that disk");
        this.emit({ which: "drive", drive, on: true });
        try {
          await this.c64Reset();
          flashOrThrow(w, withExt(prg.name || "disk", "prg"), prg.bytes);
          await sleep(300);
        } finally {
          this.emit({ which: "drive", drive, on: false });
        }
        await this.type("run\n");
        return;
      }
      case "tape": {
        flashOrThrow(w, withExt(name, "tap"), bytes);
        return;
      }
      case "cart": {
        // The core attaches it and hard-resets the machine.
        flashOrThrow(w, withExt(name, "crt"), bytes);
        return;
      }
      default:
        throw new Error(`c64: cannot insert ${kind}`);
    }
  }

  private async c64Reset(): Promise<void> {
    const w = this.win;
    w.Module._wasm_hard_reset!();
    w.reset_keyboard?.();
    await sleep(20);
    await this.c64Booted();
  }

  async eject(kind: "disk" | "tape" | "cart", drive = 0): Promise<void> {
    const w = this.win;
    if (this.machine === "amiga") {
      if (kind === "disk") w.wasm_eject_disk(`df${drive}`);
      return;
    }
    if (kind === "disk" && this.realDrive) w.wasm_eject_disk(`drive${8 + drive}`);
    // The core keeps no handle to eject a tape; stopping is the nearest thing.
    if (kind === "tape") w.wasm_press_stop();
    if (kind === "cart") w.Module._wasm_detach_cartridge!();
  }

  tape(button: "play" | "stop" | "rewind"): void {
    if (this.machine !== "c64") return;
    const w = this.win;
    if (button === "play") w.wasm_press_play();
    else if (button === "stop") w.wasm_press_stop();
    else w.wasm_rewind();
  }

  reset(): void {
    const w = this.win;
    if (this.machine === "c64") {
      // The reset button: the expansion port keeps its cartridge.
      w.Module._wasm_hard_reset!();
      w.reset_keyboard?.();
    } else w.wasm_reset();
  }

  power(off: boolean): void {
    const w = this.win;
    if (off === !w.hoffmann.powered) return;
    if (this.machine === "amiga") {
      w.wasm_power_on(off ? 0 : 1);
    } else if (off) {
      w.wasm_halt();
    } else {
      w.Module._wasm_hard_reset!();
      w.wasm_run();
    }
    w.hoffmann.setPowered(!off);
    this.emit({ which: "power", on: !off });
  }

  joystick(port: 1 | 2, s: JoyState): void {
    const w = this.win;
    const was = this.joy[port] ?? { up: false, down: false, left: false, right: false, fire: false };
    const send = (ev: string) => w.wasm_joystick(`${port}${ev}`);
    if (s.up !== was.up || s.down !== was.down) send(s.up ? "PULL_UP" : s.down ? "PULL_DOWN" : "RELEASE_Y");
    if (s.left !== was.left || s.right !== was.right) send(s.left ? "PULL_LEFT" : s.right ? "PULL_RIGHT" : "RELEASE_X");
    if (s.fire !== was.fire) send(s.fire ? "PRESS_FIRE" : "RELEASE_FIRE");
    this.joy[port] = { ...s };
  }

  setInput(enabled: boolean): void {
    const w = this.win;
    w.hoffmann.input = enabled;
    if (enabled) {
      this.iframe!.focus();
      (w.document.getElementById("canvas") as HTMLCanvasElement | null)?.focus();
    } else {
      w.reset_keyboard?.();
      this.iframe!.blur();
    }
  }

  type(text: string): Promise<void> {
    if (this.machine !== "c64") return Promise.reject(new Error("amiga: type() not implemented; use keyboard input"));
    // The core schedules every auto-typed key from "now", so two calls in flight
    // interleave their keys. Queue them; each waits for the last to finish.
    const run = async () => {
      const w = this.win;
      w.wasm_auto_type(text);
      const done = cycles(w) + text.length * C64_CYCLES_PER_KEY;
      for (let i = 0; i < 2000 && this.iframe && cycles(w) < done; i++) await sleep(20);
    };
    this.typing = this.typing.then(run, run);
    return this.typing;
  }

  on(_event: "led", cb: (e: LedEvent) => void): void {
    this.listeners.push(cb);
  }

  async stop(): Promise<void> {
    window.removeEventListener("message", this.onMessage);
    const iframe = this.iframe;
    this.iframe = null;
    if (iframe) {
      // Unloading the document takes its AudioContext and wasm heap with it.
      iframe.src = "about:blank";
      iframe.remove();
    }
    clearTimeout(this.motorTimer);
    if (this.running) this.emit({ which: "power", on: false });
    this.leds.clear();
    this.running = false;
    this.realDrive = false;
    this.joy = {};
    for (const w of this.waiters) w.resolve({ source: "hoffmann", msg: "stopped" });
    this.waiters = [];
  }

  private waitFor(msg: string, timeoutMs: number): Promise<CoreMsg> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`hoffmann: timed out waiting for ${msg}`)), timeoutMs);
      this.waiters.push({ msg, resolve: (m) => (clearTimeout(t), resolve(m)) });
    });
  }

  private handle(m: CoreMsg): void {
    if (m.msg === "error") console.error("hoffmann:", m.error);
    const due = this.waiters.filter((w) => w.msg === m.msg);
    this.waiters = this.waiters.filter((w) => w.msg !== m.msg);
    for (const w of due) w.resolve(m);

    const d = m.data1 ?? 0;
    // Drive messages carry { i16 nr; i16 value } squeezed into one 32-bit int.
    const nr = d & 0xffff;
    const val = (d >> 16) & 0xffff;
    switch (m.msg) {
      case "MSG_DRIVE_LED":
        // VirtualC64 numbers drives by object id (8, 9); vAmiga by df number.
        this.emit({ which: "drive", drive: this.machine === "c64" ? Math.max(0, nr - 8) : nr, on: val !== 0 });
        break;
      case "MSG_VC1530_MOTOR":
        // vc64web 5.1.3's Datasette::processMotEvent lacks a `break`: a motor
        // start posts MOTOR twice (on, off) and a stop once, and the payload
        // reads 0 either way. Count the burst instead of trusting the value.
        this.motorBurst++;
        clearTimeout(this.motorTimer);
        this.motorTimer = setTimeout(() => {
          const on = this.motorBurst >= 2;
          this.motorBurst = 0;
          this.emit({ which: "tape", on });
        }, 40);
        break;
      case "MSG_POWER_LED_ON":
        this.emit({ which: "power", on: true });
        break;
      case "MSG_POWER_LED_DIM":
      case "MSG_POWER_LED_OFF":
        // The A500's power LED doubles as the audio filter LED: dim, not off.
        this.emit({ which: "power", on: false });
        break;
      case "MSG_HDR_READ":
      case "MSG_HDR_WRITE":
        this.emit({ which: "hdd", drive: 0, on: true });
        break;
      case "MSG_HDR_IDLE":
        this.emit({ which: "hdd", drive: 0, on: false });
        break;
    }
  }

  private emit(e: LedEvent): void {
    // Only changes: vAmiga repeats the power LED state, and drive polls blink in pairs.
    const key = `${e.which}:${e.drive ?? 0}`;
    if (this.leds.get(key) === e.on) return;
    this.leds.set(key, e.on);
    for (const cb of this.listeners) cb(e);
  }
}

const cycles = (w: EmuWindow) => Number(w.wasm_get_cpu_cycles());

function c64Url(): string {
  const opts = { dialog_on_missing_roms: false, dialog_on_disk: false, wide: false, border: 0.3 };
  return `${base}emulators/c64/embed.html#${encodeURIComponent(JSON.stringify(opts))}`;
}

const MODELS: Record<AmigaConfig["model"], { agnus: string; denise: string; chip: number; slow: number; fast: number; cpu: number; clock: number }> = {
  // A later A500 (8372A Agnus) so 1 MB chip RAM is possible; AROS wants >= 1 MB in total.
  A500: { agnus: "ECS_1MB", denise: "OCS", chip: 512, slow: 512, fast: 0, cpu: 0, clock: 0 },
  "A500+": { agnus: "ECS_2MB", denise: "ECS", chip: 1024, slow: 0, fast: 0, cpu: 0, clock: 0 },
  A1200: { agnus: "AGA", denise: "AGA", chip: 2048, slow: 0, fast: 0, cpu: 2, clock: 2 },
};
const CPUS = { "68000": 0, "68010": 1, "68020": 2 } as const;

function amigaUrl(c: AmigaConfig): string {
  const m = MODELS[c.model] ?? MODELS.A500;
  const cfg = {
    rom: c.rom ?? "aros",
    agnus: m.agnus,
    denise: m.denise,
    chip_kb: c.chip_kb ?? m.chip,
    slow_kb: c.slow_kb ?? m.slow,
    fast_kb: c.fast_kb ?? m.fast,
    cpu: c.cpu ? CPUS[c.cpu] : m.cpu,
    clock: m.clock,
  };
  const opts = { wait_for_kickstart_injection: true, dialog_on_missing_roms: false, dialog_on_disk: false, wide: false };
  return `${base}emulators/amiga/embed.html?cfg=${encodeURIComponent(JSON.stringify(cfg))}#${encodeURIComponent(JSON.stringify(opts))}`;
}

function withExt(name: string, ext: string): string {
  const stem = name.replace(/\.[^./]*$/, "") || "file";
  return `${stem}.${ext}`;
}

function flashOrThrow(w: EmuWindow, name: string, bytes: Uint8Array, drive?: number): void {
  // vc64web's wasm_loadfile returns the ROM type for ROMs and "" for media;
  // media errors only reach the console, so there is nothing to check here.
  if (drive === undefined) w.wasm_loadfile(name, bytes, bytes.byteLength);
  else w.wasm_loadfile(name, bytes, bytes.byteLength, drive);
}

// ---- D64: just enough of the 1541 file system to find and read a program.

const SECTORS = (t: number) => (t <= 17 ? 21 : t <= 24 ? 19 : t <= 30 ? 18 : 17);

function sectorOffset(track: number, sector: number): number {
  let off = 0;
  for (let t = 1; t < track; t++) off += SECTORS(t) * 256;
  return off + sector * 256;
}

const petscii = (b: Uint8Array) =>
  Array.from(b)
    .filter((c) => c !== 0xa0)
    .map((c) => String.fromCharCode(c >= 0x41 && c <= 0x5a ? c + 32 : c >= 0xc1 && c <= 0xda ? c - 128 : c))
    .join("");

/** The first PRG in a D64's directory, as LOAD"*",8 picks it. */
export function firstPrg(d64: Uint8Array): { name: string; bytes: Uint8Array } | null {
  if (d64.length < 174848) return null;
  const at = (t: number, s: number) => {
    if (t < 1 || t > 40 || s >= SECTORS(t)) return -1;
    const o = sectorOffset(t, s);
    return o + 256 <= d64.length ? o : -1;
  };
  let t = 18, s = 1;
  for (let guard = 0; t !== 0 && guard < 20; guard++) {
    const o = at(t, s);
    if (o < 0) return null;
    for (let e = 0; e < 8; e++) {
      const en = o + e * 32;
      const type = d64[en + 2]!;
      if ((type & 0x07) !== 2 || (type & 0x80) === 0) continue; // closed PRG only
      const name = petscii(d64.subarray(en + 5, en + 21));
      const bytes = readChain(d64, d64[en + 3]!, d64[en + 4]!, at);
      if (bytes && bytes.length > 2) return { name, bytes };
    }
    t = d64[o]!;
    s = d64[o + 1]!;
  }
  return null;
}

function readChain(d64: Uint8Array, t: number, s: number, at: (t: number, s: number) => number): Uint8Array | null {
  const parts: Uint8Array[] = [];
  for (let guard = 0; guard < 800; guard++) {
    const o = at(t, s);
    if (o < 0) return null;
    const nt = d64[o]!, ns = d64[o + 1]!;
    if (nt === 0) {
      parts.push(d64.subarray(o + 2, o + Math.max(2, ns + 1)));
      const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
      let i = 0;
      for (const p of parts) out.set(p, (i += p.length) - p.length);
      return out;
    }
    parts.push(d64.subarray(o + 2, o + 256));
    t = nt;
    s = ns;
  }
  return null;
}
