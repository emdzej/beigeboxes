import type { V86 } from "v86";
import { isWritable } from "@emdzej/csfs-core";
import { CsfsDiskBuffer } from "../disk-buffer";
import { canPersist, open, type MediaItem } from "../../media/library";
import { cardsWith } from "../../machines/parts";
import type { BootConfig, Driver, DriverHost, Slot } from "../../machines/types";
import { sfx } from "../../sfx";

const base = import.meta.env.BASE_URL;

/** A 1990s PC: v86, booted from what is mounted in the case. */
export async function start(config: BootConfig, host: DriverHost): Promise<Driver> {
  const { V86 } = await import("v86");
  const pc = new V86Pc(config, host);
  await pc.boot(V86);
  return pc;
}

class V86Pc implements Driver {
  private emulator: V86 | null = null;
  private disks = new Map<Slot, CsfsDiskBuffer>();
  private media: BootConfig["media"];
  private floppyBytes: Uint8Array | null = null;

  constructor(
    private config: BootConfig,
    private host: DriverHost,
  ) {
    this.media = { ...config.media };
  }

  async boot(V86Ctor: typeof V86): Promise<void> {
    const { build, memoryKb, media, modem } = this.config;
    const sound = cardsWith(build, "sound").length > 0;
    const nic = cardsWith(build, "network")[0];

    const opts: Record<string, unknown> = {
      wasm_path: `${base}v86/v86.wasm`,
      bios: { url: `${base}v86/seabios.bin` },
      vga_bios: { url: `${base}v86/vgabios.bin` },
      screen: { container: this.host.screen, use_graphical_text: true },
      memory_size: memoryKb * 1024,
      vga_memory_size: 8 * 1024 * 1024,
      autostart: true,
      boot_order: bootOrder(media),
      // v86's Sound Blaster is always on the bus; without the card in a slot
      // the closest it gets is no sound at all, PC speaker included.
      disable_speaker: !sound,
    };

    if (media.fda) opts.fda = { buffer: await this.readFloppy(media.fda) };
    for (const slot of ["cdrom", "hda", "hdb"] as const) {
      const m = media[slot];
      if (m) opts[slot] = await this.diskFor(slot, m);
    }

    const net = nic?.net;
    if (net?.kind === "fetch") {
      opts.net_device = { type: "ne2k", relay_url: "fetch", ...(net.corsProxy ? { cors_proxy: net.corsProxy } : {}) };
    } else if (net?.kind === "relay") {
      opts.net_device = { type: "ne2k", relay_url: net.url };
    }
    if (modem.enabled) {
      // COM2, so a serial mouse or a terminal can still have COM1.
      opts.modem = { uart: 1, phonebook: { ...modem.phonebook } };
    }

    const emulator = new V86Ctor(opts as never);
    this.emulator = emulator;
    this.wire(emulator, modem.enabled);
    emulator.add_listener("emulator-started", () => {
      this.host.started();
      this.hookFloppy();
    });
  }

  async stop(): Promise<void> {
    const emulator = this.emulator;
    if (!emulator) return;
    await emulator.stop();
    await this.persistAll();
    emulator.destroy();
    this.emulator = null;
    this.disks.clear();
  }

  reset(): void {
    this.emulator?.restart();
  }

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

  async insert(slot: Slot, media: MediaItem): Promise<void> {
    const emulator = this.emulator;
    this.media[slot] = media;
    if (!emulator) return;
    if (slot === "fda") {
      await emulator.set_fda({ buffer: await this.readFloppy(media) });
      this.hookFloppy();
    } else if (slot === "cdrom") {
      const disk = await this.diskFor("cdrom", media);
      // `set_cdrom` only takes URLs and buffers; a custom buffer goes straight
      // to the drive, which is what `set_cdrom` does after loading anyway.
      const cpu = (emulator as unknown as { v86: { cpu: { devices: { cdrom?: { set_cdrom(b: unknown): void } } } } }).v86.cpu;
      cpu.devices.cdrom?.set_cdrom(disk);
    }
  }

  async eject(slot: Slot): Promise<void> {
    const emulator = this.emulator;
    const media = this.media[slot];
    delete this.media[slot];
    if (!emulator) return;
    if (slot === "fda") {
      const bytes = diskFda(emulator);
      emulator.eject_fda();
      if (media && bytes) await this.saveFloppy(media, bytes);
      this.floppyBytes = null;
    } else if (slot === "cdrom") {
      emulator.eject_cdrom();
      this.disks.delete("cdrom");
    }
  }

  // --- internals -----------------------------------------------------------

  private async readFloppy(media: MediaItem): Promise<ArrayBuffer> {
    const bytes = await (await open(media)).bytes();
    this.floppyBytes = bytes;
    // A fresh copy for v86, which writes into the buffer it is given.
    return bytes.slice().buffer;
  }

  private async diskFor(slot: Slot, media: MediaItem): Promise<CsfsDiskBuffer> {
    const disk = new CsfsDiskBuffer(await open(media), {
      // A CD is read in long runs; a hard disk is seeky.
      readAhead: slot === "cdrom" ? 256 * 1024 : 64 * 1024,
    });
    disk.onActivity = () => {
      this.host.blink(slot === "cdrom" ? "cd" : "hdd");
      if (slot !== "cdrom") sfx.hddSeek();
    };
    this.disks.set(slot, disk);
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
        this.host.blink("fdd", 400);
        sfx.floppySeek();
        return original.apply(buffer, args);
      };
    }
  }

  private wire(emulator: V86, modem: boolean): void {
    emulator.add_listener("screen-set-size", ([w, h, bpp]: [number, number, number]) => {
      // Text mode reports columns × rows with bpp 0.
      if (bpp) this.host.setScreen(w, h);
      else this.host.setScreen(w * 9, h * 16);
    });
    if (!modem) return;
    // Watch the AT conversation for what the front panel would show: the
    // guest dialling takes the line off-hook, the modem's CONNECT raises
    // carrier detect, NO CARRIER drops both.
    const leds = this.host.modem;
    let sent = "";
    let heard = "";
    emulator.add_listener("serial1-output-byte", (byte: number) => {
      leds.set("tr", true);
      leds.blink("sd");
      sent = (sent + String.fromCharCode(byte)).slice(-16).toUpperCase();
      if (/ATD[TP]?\s*\S/.test(sent) && sent.endsWith("\r")) leds.set("oh", true);
      if (/ATH0?\r$/.test(sent)) {
        leds.set("oh", false);
        leds.set("cd", false);
      }
    });
    emulator.add_listener("serial1-input", (byte: number) => {
      leds.blink("rd");
      heard = (heard + String.fromCharCode(byte)).slice(-16).toUpperCase();
      if (heard.endsWith("CONNECT")) {
        leds.set("cd", true);
        sfx.modemHandshake();
      }
      if (heard.endsWith("NO CARRIER") || heard.endsWith("BUSY")) {
        leds.set("oh", false);
        leds.set("cd", false);
      }
    });
  }

  private async saveFloppy(media: MediaItem, bytes: Uint8Array): Promise<void> {
    if (!canPersist(media) || !isWritable(media.fs)) return;
    if (this.floppyBytes && equal(this.floppyBytes, bytes)) return;
    await media.fs.write(media.path, bytes.slice());
  }

  /** Write every changed disk back to where it came from, if it can go back. */
  private async persistAll(): Promise<void> {
    const saves: Promise<void>[] = [];
    const fda = this.media.fda;
    if (fda && this.emulator) {
      const bytes = diskFda(this.emulator);
      if (bytes) saves.push(this.saveFloppy(fda, bytes));
    }
    for (const slot of ["hda", "hdb"] as const) {
      const media = this.media[slot];
      const disk = this.disks.get(slot);
      if (!media || !disk?.dirty || !canPersist(media) || !isWritable(media.fs)) continue;
      saves.push(media.fs.write(media.path, disk.stream()));
    }
    const results = await Promise.allSettled(saves);
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length) {
      console.error(failed);
      this.host.say("Some disk changes could not be saved.");
    }
  }
}

function bootOrder(media: BootConfig["media"]): number {
  // A:, then CD, then C: — but only for drives with something in them, so a
  // machine with just a hard disk does not sit asking a floppy drive first.
  if (media.fda) return 0x231; // floppy, CD, hard disk
  if (media.cdrom) return 0x123; // CD, hard disk, floppy
  return 0x132; // hard disk, CD, floppy
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
