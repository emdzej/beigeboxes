import type { MediaItem } from "../media/library";
import { model, MODELS } from "../machines/catalog";
import { cardsWith, memoryOf, partsFor } from "../machines/parts";
import type { Build, Driver, DriverHost, Era, Led, ModemSettings, NetworkChoice, Slot } from "../machines/types";
import { sfx } from "../sfx";

export type { NetworkChoice, ModemSettings } from "../machines/types";

export type PowerState = "off" | "post" | "on";
export type CaseStyle = "tower" | "desktop";
export type DisplayStyle = "crt" | "lcd";

export interface Settings {
  era: Era;
  model: string;
  caseStyle: CaseStyle;
  display: DisplayStyle;
  /** What is mounted in each machine, by model id. */
  builds: Record<string, Build>;
  modem: ModemSettings;
}

const SETTINGS_KEY = "beigeboxes:settings";

const DEFAULTS: Settings = {
  era: "90s",
  model: "pc-pentium",
  caseStyle: "tower",
  display: "crt",
  builds: {},
  modem: {
    enabled: false,
    phonebook: { "5551234": "wss://relay.widgetry.org/" },
  },
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const s = raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : { ...DEFAULTS };
    if (!MODELS.some((m) => m.id === s.model)) s.model = DEFAULTS.model;
    return withBuilds(s);
  } catch {
    return withBuilds({ ...DEFAULTS });
  }
}

/** Every machine starts as it came from the shop. */
function withBuilds(s: Settings): Settings {
  const builds = { ...s.builds };
  for (const m of MODELS) builds[m.id] ??= clone(m.defaults);
  return { ...s, builds };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * The computer on the desk: which one it is, what is mounted inside and
 * inserted in front, whether it is on. Components only talk to this; the
 * emulator is behind a driver.
 */
export class Machine {
  settings = $state<Settings>(loadSettings());
  power = $state<PowerState>("off");
  monitorOn = $state(true);

  fda = $state<MediaItem | null>(null);
  fdb = $state<MediaItem | null>(null);
  cdrom = $state<MediaItem | null>(null);
  hda = $state<MediaItem | null>(null);
  hdb = $state<MediaItem | null>(null);
  cart = $state<MediaItem | null>(null);
  tape = $state<MediaItem | null>(null);

  /** Lit right now. Driven by real guest I/O, not by a timer. */
  led = $state({ hdd: false, fdd: false, fdb: false, cd: false, tape: false });
  /** Modem front-panel lights. */
  modemLed = $state({ oh: false, cd: false, sd: false, rd: false, tr: false });
  /** Guest screen size in pixels. */
  screen = $state({ width: 720, height: 400 });
  /** Whether a video card is sending the monitor anything. */
  signal = $state(true);
  /** Something to say on a sticky note when it goes wrong. */
  message = $state<string | null>(null);

  private driver: Driver | null = null;
  private ledTimers: Record<string, ReturnType<typeof setTimeout>> = {};
  private screenEl: HTMLElement | null = null;

  constructor() {
    $effect.root(() => {
      $effect(() => {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
      });
    });
  }

  get model() {
    return model(this.settings.model);
  }

  /** What is mounted in the machine on the desk; starts as it came from the shop. */
  get build(): Build {
    return this.settings.builds[this.settings.model]!;
  }

  get memoryKb(): number {
    return memoryOf(this.model.board, this.build).kb;
  }

  get network(): NetworkChoice {
    return cardsWith(this.build, "network")[0]?.net ?? { kind: "none" };
  }

  attachScreen(el: HTMLElement): void {
    this.screenEl = el;
  }

  get running(): boolean {
    return this.power !== "off";
  }

  /** Swap the machine on the desk. Only with it switched off. */
  choose(id: string): boolean {
    if (this.power !== "off") {
      this.message = "Switch it off before you carry it away.";
      return false;
    }
    if (id === this.settings.model) return true;
    this.fda = this.fdb = this.cdrom = this.hda = this.hdb = this.cart = this.tape = null;
    this.settings.model = id;
    return true;
  }

  /** The hard disks wired up in the build, once the library has loaded. */
  restoreDrives(library: MediaItem[]): void {
    for (const slot of ["hda", "hdb"] as const) {
      const id = this.build.drives[slot];
      this[slot] = id ? (library.find((m) => m.id === id) ?? null) : null;
    }
  }

  /** What the guest shows right now, as a PNG; null when the screen is dark. */
  async screenshot(): Promise<Blob | null> {
    const canvas = this.screenEl?.querySelector("canvas");
    if (!canvas || this.power === "off" || !canvas.width || !canvas.height) return null;
    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  }

  // --- power ---------------------------------------------------------------

  async togglePower(): Promise<void> {
    sfx.click();
    if (this.power === "off") await this.powerOn();
    else await this.powerOff();
  }

  async powerOn(): Promise<void> {
    if (this.power !== "off" || !this.screenEl) return;
    const m = this.model;
    if (!m.driver) {
      this.message = `The ${m.name} isn't wired up yet — its emulator is still being ported.`;
      return;
    }
    this.power = "post";
    this.message = null;
    // Only the computers have a fan; a console just clicks on.
    if (m.board) sfx.fanStart();
    if (this.hda || this.hdb) sfx.hddSpinUp();

    const memory = memoryOf(m.board, this.build);
    if (m.board && memory.kb === 0) {
      // No memory, no POST: the BIOS beeps and the screen stays dark.
      sfx.beeps([400, 400, 400]);
      this.message = memory.halfBanks
        ? "Beep, beep, beep. The SIMMs go in matching pairs on a Pentium — fill a whole bank."
        : "Beep, beep, beep. There's no RAM in it. Open the case and fit some.";
      sfx.fanStop();
      this.settle();
      return;
    }
    if (memory.halfBanks) this.message = "A half-filled memory bank is ignored: SIMMs go in matching pairs.";
    // Only a board that takes video cards needs one; an Amiga's video is on the board.
    const needsCard = !!m.board && partsFor(m.board).some((p) => p.role === "video");
    this.signal = !needsCard || cardsWith(this.build, "video").length > 0;
    if (!this.signal) sfx.beeps([900, 300, 300]);

    try {
      const start = await m.driver();
      this.driver = await start(
        {
          build: $state.snapshot(this.build) as Build,
          memoryKb: memory.kb,
          media: this.inserted(),
          modem: $state.snapshot(this.settings.modem) as ModemSettings,
        },
        this.host(),
      );
    } catch (err) {
      console.error(err);
      this.message = `It won't POST: ${(err as Error).message}`;
      sfx.fanStop();
      this.settle();
    }
  }

  async powerOff(): Promise<void> {
    if (this.power === "off") return;
    sfx.fanStop();
    const driver = this.driver;
    this.power = "off";
    this.led = { hdd: false, fdd: false, fdb: false, cd: false, tape: false };
    // Stopped before the screen is wiped, or it would draw one more frame.
    if (driver) await driver.stop();
    this.settle();
  }

  reset(): void {
    sfx.click();
    if (this.power === "off") return;
    this.driver?.reset();
  }

  /**
   * Whether keys and mouse go to the guest. Off while a box or drawer is
   * open, or typing a label would also type into DOS.
   */
  setInput(enabled: boolean): void {
    this.driver?.setInput(enabled);
  }

  lockMouse(): void {
    this.driver?.lockMouse();
  }

  sendCtrlAltDel(): void {
    this.driver?.sendCtrlAltDel();
  }

  toggleMonitor(): void {
    sfx.click();
    this.monitorOn = !this.monitorOn;
    if (this.monitorOn && this.settings.display === "crt") sfx.degauss();
  }

  // --- media ---------------------------------------------------------------

  async insertFloppy(media: MediaItem, drive: "fda" | "fdb" = "fda"): Promise<void> {
    if (this[drive]) await this.ejectFloppy(drive);
    sfx.floppyInsert();
    this[drive] = media;
    await this.driver?.insert(drive, media);
  }

  async ejectFloppy(drive: "fda" | "fdb" = "fda"): Promise<void> {
    if (!this[drive]) return;
    sfx.floppyEject();
    await this.driver?.eject(drive);
    this[drive] = null;
  }

  async insertCd(media: MediaItem): Promise<void> {
    sfx.trayClose();
    this.cdrom = media;
    await this.driver?.insert("cdrom", media);
  }

  ejectCd(): void {
    if (!this.cdrom) return;
    void this.driver?.eject("cdrom");
    this.cdrom = null;
  }

  /** A cartridge only goes in or out with the power off: the edge connector is live. */
  setCart(media: MediaItem | null): boolean {
    if (this.power !== "off") {
      this.message = "Switch it off first — you don't pull a cartridge out of a running console.";
      return false;
    }
    sfx.floppyInsert();
    this.cart = media;
    return true;
  }

  /** A cassette in the Datasette. Tapes go in and out whenever; the motor stops. */
  async insertTape(media: MediaItem): Promise<void> {
    if (this.tape) await this.ejectTape();
    sfx.floppyInsert();
    this.tape = media;
    await this.driver?.insert("tape", media);
  }

  async ejectTape(): Promise<void> {
    if (!this.tape) return;
    sfx.floppyEject();
    await this.driver?.eject("tape");
    this.tape = null;
    this.led.tape = false;
  }

  /** The Datasette's piano keys. */
  tapeButton(button: "play" | "stop" | "rewind"): void {
    sfx.click();
    this.driver?.tape?.(button);
  }

  /** Hard disks only go in and out with the power off, as with real IDE. */
  installHdd(slot: "hda" | "hdb", media: MediaItem | null): boolean {
    if (this.power !== "off") {
      this.message = "Turn it off first! You don't hot-swap IDE.";
      return false;
    }
    const drives = this.build.drives;
    if (media) {
      // Moving a drive between master and slave.
      for (const s of ["hda", "hdb"] as const) {
        if (this[s]?.id === media.id) {
          this[s] = null;
          delete drives[s];
        }
      }
    }
    this[slot] = media;
    if (media) drives[slot] = media.id;
    else delete drives[slot];
    return true;
  }

  // --- internals -----------------------------------------------------------

  private inserted(): Partial<Record<Slot, MediaItem>> {
    const media: Partial<Record<Slot, MediaItem>> = {};
    for (const slot of this.model.slots) {
      const m = this[slot];
      if (m) media[slot] = m;
    }
    return media;
  }

  private host(): DriverHost {
    return {
      screen: this.screenEl!,
      blink: (led, ms) => this.blink(led, ms),
      light: (led, on) => {
        clearTimeout(this.ledTimers[led]);
        this.led[led] = on;
      },
      setScreen: (width, height) => (this.screen = { width, height }),
      started: () => (this.power = "on"),
      modem: {
        set: (led, on) => (this.modemLed[led] = on),
        blink: (led) => {
          this.modemLed[led] = true;
          clearTimeout(this.ledTimers[led]);
          this.ledTimers[led] = setTimeout(() => (this.modemLed[led] = false), 60);
        },
      },
      say: (text) => (this.message = text),
    };
  }

  private blink(which: Led, ms = 90): void {
    if (!this.led[which]) this.led[which] = true;
    clearTimeout(this.ledTimers[which]);
    this.ledTimers[which] = setTimeout(() => (this.led[which] = false), ms);
  }

  /** Back to dark: fans down, lights out, last frame wiped. */
  private settle(): void {
    this.power = "off";
    this.driver = null;
    this.signal = true;
    this.led = { hdd: false, fdd: false, fdb: false, cd: false, tape: false };
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

export const machine = new Machine();
