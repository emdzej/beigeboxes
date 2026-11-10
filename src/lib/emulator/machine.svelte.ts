import type { V86 } from "v86";
import { CsfsDiskBuffer } from "./disk-buffer";
import { canPersist, open, type MediaItem } from "../media/library";
import { isWritable } from "@emdzej/csfs-core";
import { sfx } from "../sfx";

export type PowerState = "off" | "post" | "on";
export type CaseStyle = "tower" | "desktop";
export type DisplayStyle = "crt" | "lcd";

/** What the network cable is plugged into. */
export type NetworkChoice =
  | { kind: "none" }
  /** HTTP only, through the browser's own fetch. No server needed. */
  | { kind: "fetch"; corsProxy?: string }
  /** Real ethernet frames through a WebSocket relay. */
  | { kind: "relay"; url: string };

export interface ModemSettings {
  enabled: boolean;
  /** Number dialled → WebSocket URL. `ATDT 5551234` dials `phonebook["5551234"]`. */
  phonebook: Record<string, string>;
}

export interface Settings {
  caseStyle: CaseStyle;
  display: DisplayStyle;
  memoryMB: number;
  network: NetworkChoice;
  modem: ModemSettings;
}

const SETTINGS_KEY = "beigebox:settings";

const DEFAULTS: Settings = {
  caseStyle: "tower",
  display: "crt",
  memoryMB: 64,
  network: { kind: "none" },
  modem: {
    enabled: false,
    phonebook: { "5551234": "wss://relay.widgetry.org/" },
  },
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

type Drive = "fda" | "cdrom" | "hda" | "hdb";

const base = import.meta.env.BASE_URL;

/**
 * The computer on the desk: what is plugged in, what is inserted, whether it
 * is on. The components only ever talk to this; v86 is an implementation
 * detail behind it.
 */
export class Machine {
  settings = $state<Settings>(loadSettings());
  power = $state<PowerState>("off");
  monitorOn = $state(true);

  fda = $state<MediaItem | null>(null);
  cdrom = $state<MediaItem | null>(null);
  hda = $state<MediaItem | null>(null);
  hdb = $state<MediaItem | null>(null);

  /** Lit right now. Driven by real guest I/O, not by a timer. */
  led = $state({ hdd: false, fdd: false, cd: false });
  /** Modem front-panel lights. */
  modemLed = $state({ oh: false, cd: false, sd: false, rd: false, tr: false });
  /** Guest screen size in pixels, or text columns × rows ×(8|16). */
  screen = $state({ width: 720, height: 400 });
  /** Something to say on a sticky note when it goes wrong. */
  message = $state<string | null>(null);

  private emulator: V86 | null = null;
  private disks = new Map<Drive, CsfsDiskBuffer>();
  private floppyBytes: Uint8Array | null = null;
  private ledTimers: Record<string, ReturnType<typeof setTimeout>> = {};
  private screenEl: HTMLElement | null = null;

  constructor() {
    $effect.root(() => {
      $effect(() => {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
      });
    });
  }

  attachScreen(el: HTMLElement): void {
    this.screenEl = el;
  }

  get running(): boolean {
    return this.power !== "off";
  }

  // --- power ---------------------------------------------------------------

  async togglePower(): Promise<void> {
    sfx.click();
    if (this.power === "off") await this.powerOn();
    else await this.powerOff();
  }

  async powerOn(): Promise<void> {
    if (this.power !== "off" || !this.screenEl) return;
    this.power = "post";
    this.message = null;
    sfx.fanStart();
    if (this.hda || this.hdb) sfx.hddSpinUp();

    try {
      const opts: Record<string, unknown> = {
        wasm_path: `${base}v86/v86.wasm`,
        bios: { url: `${base}v86/seabios.bin` },
        vga_bios: { url: `${base}v86/vgabios.bin` },
        screen: { container: this.screenEl, use_graphical_text: true },
        memory_size: this.settings.memoryMB * 1024 * 1024,
        vga_memory_size: 8 * 1024 * 1024,
        autostart: true,
        boot_order: this.bootOrder(),
      };

      if (this.fda) opts.fda = { buffer: await this.readFloppy(this.fda) };
      for (const drive of ["cdrom", "hda", "hdb"] as const) {
        const media = this[drive];
        if (media) opts[drive] = await this.diskFor(drive, media);
      }

      const net = this.settings.network;
      if (net.kind === "fetch") {
        opts.net_device = { type: "ne2k", relay_url: "fetch", ...(net.corsProxy ? { cors_proxy: net.corsProxy } : {}) };
      } else if (net.kind === "relay") {
        opts.net_device = { type: "ne2k", relay_url: net.url };
      }
      if (this.settings.modem.enabled) {
        // COM2, so a serial mouse or a terminal can still have COM1.
        opts.modem = { uart: 1, phonebook: { ...this.settings.modem.phonebook } };
      }

      // Loaded on the first press of POWER: a 360 kB emulator is not needed
      // to look at a desk.
      const { V86 } = await import("v86");
      const emulator = new V86(opts as never);
      this.emulator = emulator;
      this.wire(emulator);
      emulator.add_listener("emulator-started", () => {
        this.power = "on";
        this.hookFloppy();
      });
    } catch (err) {
      console.error(err);
      this.message = `It won't POST: ${(err as Error).message}`;
      this.power = "off";
      this.teardown();
    }
  }

  async powerOff(): Promise<void> {
    if (this.power === "off") return;
    sfx.fanStop();
    const emulator = this.emulator;
    this.power = "off";
    this.led = { hdd: false, fdd: false, cd: false };
    if (emulator) {
      await emulator.stop();
      await this.persistAll();
      emulator.destroy();
    }
    this.teardown();
  }

  reset(): void {
    sfx.click();
    if (this.power === "off" || !this.emulator) return;
    this.emulator.restart();
  }

  /**
   * Whether keys and mouse go to the guest. Off while a box or drawer is
   * open, or typing a label would also type into DOS.
   */
  setInput(enabled: boolean): void {
    this.emulator?.keyboard_set_enabled(enabled);
    this.emulator?.mouse_set_enabled(enabled);
  }

  lockMouse(): void {
    this.emulator?.lock_mouse();
  }

  sendCtrlAltDel(): void {
    this.emulator?.keyboard_send_scancodes([0x1d, 0x38, 0x53, 0xd3, 0xb8, 0x9d]);
  }

  toggleMonitor(): void {
    sfx.click();
    this.monitorOn = !this.monitorOn;
    if (this.monitorOn && this.settings.display === "crt") sfx.degauss();
  }

  // --- media ---------------------------------------------------------------

  async insertFloppy(media: MediaItem): Promise<void> {
    if (this.fda) await this.ejectFloppy();
    sfx.floppyInsert();
    this.fda = media;
    if (this.emulator && this.power !== "off") {
      const buffer = await this.readFloppy(media);
      await this.emulator.set_fda({ buffer });
      this.hookFloppy();
    }
  }

  async ejectFloppy(): Promise<void> {
    if (!this.fda) return;
    sfx.floppyEject();
    const media = this.fda;
    if (this.emulator && this.power !== "off") {
      const bytes = diskFda(this.emulator);
      this.emulator.eject_fda();
      if (bytes) await this.saveFloppy(media, bytes);
    }
    this.fda = null;
    this.floppyBytes = null;
  }

  async insertCd(media: MediaItem): Promise<void> {
    sfx.trayClose();
    this.cdrom = media;
    if (this.emulator && this.power !== "off") {
      const disk = await this.diskFor("cdrom", media);
      // `set_cdrom` only takes URLs and buffers; a custom buffer goes straight
      // to the drive, which is what `set_cdrom` does after loading anyway.
      const cpu = (this.emulator as unknown as { v86: { cpu: { devices: { cdrom?: { set_cdrom(b: unknown): void } } } } }).v86.cpu;
      cpu.devices.cdrom?.set_cdrom(disk);
    }
  }

  ejectCd(): void {
    if (!this.cdrom) return;
    if (this.emulator && this.power !== "off") this.emulator.eject_cdrom();
    this.cdrom = null;
    this.disks.delete("cdrom");
  }

  /** Hard disks only go in and out with the power off, as with real IDE. */
  installHdd(slot: "hda" | "hdb", media: MediaItem | null): boolean {
    if (this.power !== "off") {
      this.message = "Turn it off first! You don't hot-swap IDE.";
      return false;
    }
    if (media && (this.hda?.id === media.id || this.hdb?.id === media.id)) {
      // Moving a drive between master and slave.
      if (this.hda?.id === media.id) this.hda = null;
      if (this.hdb?.id === media.id) this.hdb = null;
    }
    this[slot] = media;
    return true;
  }

  // --- internals -----------------------------------------------------------

  private bootOrder(): number {
    // A:, then CD, then C: — but only for drives with something in them, so a
    // machine with just a hard disk does not sit asking a floppy drive first.
    if (this.fda) return 0x231; // floppy, CD, hard disk
    if (this.cdrom) return 0x123; // CD, hard disk, floppy
    return 0x132; // hard disk, CD, floppy
  }

  private async readFloppy(media: MediaItem): Promise<ArrayBuffer> {
    const bytes = await (await open(media)).bytes();
    this.floppyBytes = bytes;
    // A fresh copy for v86, which writes into the buffer it is given.
    return bytes.slice().buffer;
  }

  private async diskFor(drive: Drive, media: MediaItem): Promise<CsfsDiskBuffer> {
    const disk = new CsfsDiskBuffer(await open(media), {
      // A CD is read in long runs; a hard disk is seeky.
      readAhead: drive === "cdrom" ? 256 * 1024 : 64 * 1024,
    });
    disk.onActivity = () => {
      this.blink(drive === "cdrom" ? "cd" : "hdd");
      if (drive !== "cdrom") sfx.hddSeek();
    };
    this.disks.set(drive, disk);
    return disk;
  }

  /** The floppy LED and its grinding: v86 has no event for floppy I/O. */
  private hookFloppy(): void {
    const cpu = (this.emulator as unknown as { v86?: { cpu: { devices: { fdc?: { drives: { buffer?: { get: Function; set: Function } }[] } } } } })?.v86?.cpu;
    const buffer = cpu?.devices.fdc?.drives[0]?.buffer;
    if (!buffer || (buffer as { __bb?: boolean }).__bb) return;
    (buffer as { __bb?: boolean }).__bb = true;
    for (const name of ["get", "set"] as const) {
      const original = buffer[name];
      buffer[name] = (...args: unknown[]) => {
        this.blink("fdd", 400);
        sfx.floppySeek();
        return original.apply(buffer, args);
      };
    }
  }

  private blink(which: "hdd" | "fdd" | "cd", ms = 90): void {
    if (!this.led[which]) this.led[which] = true;
    clearTimeout(this.ledTimers[which]);
    this.ledTimers[which] = setTimeout(() => (this.led[which] = false), ms);
  }

  private modemBlink(which: "sd" | "rd"): void {
    this.modemLed[which] = true;
    clearTimeout(this.ledTimers[which]);
    this.ledTimers[which] = setTimeout(() => (this.modemLed[which] = false), 60);
  }

  private wire(emulator: V86): void {
    emulator.add_listener("screen-set-size", ([w, h, bpp]: [number, number, number]) => {
      // Text mode reports columns × rows with bpp 0.
      this.screen = bpp ? { width: w, height: h } : { width: w * 9, height: h * 16 };
    });
    if (this.settings.modem.enabled) {
      // Watch the AT conversation for what the front panel would show: the
      // guest dialling takes the line off-hook, the modem's CONNECT raises
      // carrier detect, NO CARRIER drops both.
      let sent = "";
      let heard = "";
      emulator.add_listener("serial1-output-byte", (byte: number) => {
        this.modemLed.tr = true;
        this.modemBlink("sd");
        sent = (sent + String.fromCharCode(byte)).slice(-16).toUpperCase();
        if (/ATD[TP]?\s*\S/.test(sent) && sent.endsWith("\r")) this.modemLed.oh = true;
        if (/ATH0?\r$/.test(sent)) this.modemLed.oh = this.modemLed.cd = false;
      });
      emulator.add_listener("serial1-input", (byte: number) => {
        this.modemBlink("rd");
        heard = (heard + String.fromCharCode(byte)).slice(-16).toUpperCase();
        if (heard.endsWith("CONNECT")) {
          this.modemLed.cd = true;
          sfx.modemHandshake();
        }
        if (heard.endsWith("NO CARRIER") || heard.endsWith("BUSY")) this.modemLed.oh = this.modemLed.cd = false;
      });
    }
  }

  private async saveFloppy(media: MediaItem, bytes: Uint8Array): Promise<void> {
    if (!canPersist(media) || !isWritable(media.fs)) return;
    if (this.floppyBytes && equal(this.floppyBytes, bytes)) return;
    await media.fs.write(media.path, bytes.slice());
  }

  /** Write every changed disk back to where it came from, if it can go back. */
  private async persistAll(): Promise<void> {
    const saves: Promise<void>[] = [];
    if (this.fda && this.emulator) {
      const bytes = diskFda(this.emulator);
      if (bytes) saves.push(this.saveFloppy(this.fda, bytes));
    }
    for (const drive of ["hda", "hdb"] as const) {
      const media = this[drive];
      const disk = this.disks.get(drive);
      if (!media || !disk?.dirty || !canPersist(media) || !isWritable(media.fs)) continue;
      saves.push(media.fs.write(media.path, disk.stream()));
    }
    const results = await Promise.allSettled(saves);
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length) {
      console.error(failed);
      this.message = "Some disk changes could not be saved.";
    }
  }

  private teardown(): void {
    this.emulator = null;
    this.disks.clear();
    this.modemLed = { oh: false, cd: false, sd: false, rd: false, tr: false };
    if (this.screenEl) {
      // v86 leaves its last frame behind; a dead monitor shows nothing.
      const canvas = this.screenEl.querySelector("canvas");
      canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      const text = this.screenEl.querySelector("div");
      if (text) text.textContent = "";
    }
  }
}

/** In v86 since 2024, missing from its type declarations. */
function diskFda(emulator: V86): Uint8Array | null {
  return (emulator as unknown as { get_disk_fda(): Uint8Array | null }).get_disk_fda();
}

function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export const machine = new Machine();
