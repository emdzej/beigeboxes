import { open, type MediaItem } from "../../media/library";
import type { BootConfig, Driver, DriverHost, Slot } from "../../machines/types";
import { createHoffmannEmbed, type HoffmannEmbed, type HoffmannMachine, type JoyState, type MediaKind } from "./hoffmann";

/** The 1982 Commodore 64: VirtualC64 with Open ROMs. */
export const startC64 = (config: BootConfig, host: DriverHost) => start("c64", config, host);

/** The 1987 Amiga 500: vAmiga with AROS for a Kickstart. */
export const startAmiga = (config: BootConfig, host: DriverHost) => start("amiga", config, host);

const DRIVES: Partial<Record<Slot, number>> = { fda: 0, fdb: 1 };

async function start(which: HoffmannMachine, config: BootConfig, host: DriverHost): Promise<Driver> {
  const emu = createHoffmannEmbed();
  const c = new Commodore(emu, which, host);
  await c.boot(config);
  return c;
}

/** What a file is to the emulator, from its format. */
function kindOf(media: MediaItem): MediaKind {
  switch (media.format) {
    case "prg":
      return "prg";
    case "adf":
      return "adf";
    case "tap":
      return "tape";
    case "crt":
      return "cart";
    default:
      return "disk";
  }
}

class Commodore implements Driver {
  private frame: HTMLElement;
  private raf = 0;
  private input = true;

  constructor(
    private emu: HoffmannEmbed,
    private which: HoffmannMachine,
    private host: DriverHost,
  ) {
    // The emulators draw in their own page; it goes where the canvas would.
    const canvas = host.screen.querySelector("canvas");
    if (canvas) canvas.style.display = "none";
    const text = host.screen.querySelector("div");
    if (text) text.textContent = "";
    // Not a div: the monitor hides the screen's divs, which are v86's text layer.
    this.frame = document.createElement("section");
    this.frame.className = "embed";
    this.frame.style.cssText = "position:absolute;inset:0";
    host.screen.appendChild(this.frame);
    // A PAL C64's visible screen with a slim border, an Amiga's low-res PAL.
    host.setScreen(which === "c64" ? 403 : 720, which === "c64" ? 284 : 568);
  }

  async boot(config: BootConfig): Promise<void> {
    this.emu.on("led", (e) => {
      if (e.which === "drive") this.host.light(e.drive ? "fdb" : "fdd", e.on);
      else if (e.which === "hdd") this.host.light("hdd", e.on);
      else if (e.which === "tape") this.host.light("tape", e.on);
    });
    // The tube warms up while it boots: the emulators wait for a screen with a
    // size before they run, and the monitor only unfolds one once started.
    this.host.started();
    await this.emu.start({ container: this.frame, machine: this.which, config: this.settings(config) });
    // The cartridge is in before the power goes on; then whatever is in the drives.
    const { cart, tape, fda } = config.media;
    if (cart) await this.insert("cart", cart);
    if (tape) await this.insert("tape", tape);
    if (fda) await this.insert("fda", fda);
    if (config.media.fdb && this.which === "amiga") await this.insert("fdb", config.media.fdb);
    this.emu.setInput(this.input);
    this.raf = requestAnimationFrame(this.poll);
  }

  private settings(config: BootConfig): Record<string, unknown> {
    if (this.which === "c64") return {};
    // Chip RAM is on the board; the trapdoor card is "slow" RAM, as on the real A501.
    // AROS needs a megabyte to get anywhere; without the card it stops at its boot screen.
    return { model: "A500", chip_kb: 512, slow_kb: Math.max(0, Math.min(1536, config.memoryKb - 512)), fast_kb: 0, rom: "aros" };
  }

  /** A gamepad is the joystick in port 2, where nearly every game reads it. */
  private poll = () => {
    const pad = navigator.getGamepads?.()[0];
    if (pad && this.input) {
      const ax = pad.axes;
      const s: JoyState = {
        up: !!pad.buttons[12]?.pressed || (ax[1] ?? 0) < -0.5,
        down: !!pad.buttons[13]?.pressed || (ax[1] ?? 0) > 0.5,
        left: !!pad.buttons[14]?.pressed || (ax[0] ?? 0) < -0.5,
        right: !!pad.buttons[15]?.pressed || (ax[0] ?? 0) > 0.5,
        fire: !!pad.buttons[0]?.pressed || !!pad.buttons[1]?.pressed,
      };
      this.emu.joystick(2, s);
    }
    this.raf = requestAnimationFrame(this.poll);
  };

  async stop(): Promise<void> {
    cancelAnimationFrame(this.raf);
    await this.emu.stop();
    this.frame.remove();
    const canvas = this.host.screen.querySelector("canvas");
    if (canvas) canvas.style.display = "";
  }

  reset(): void {
    this.emu.reset();
  }

  async insert(slot: Slot, media: MediaItem): Promise<void> {
    const bytes = await (await open(media)).bytes();
    const name = media.path.split(/[/#]/).pop() ?? "file";
    try {
      await this.emu.insert(kindOf(media), bytes, name, DRIVES[slot] ?? 0);
    } catch (err) {
      console.error(err);
      this.host.say(`${media.label} won't load: ${(err as Error).message.replace(/^\w+: /, "")}.`);
    }
  }

  async eject(slot: Slot): Promise<void> {
    if (slot === "tape") return this.emu.eject("tape");
    if (slot === "cart") return this.emu.eject("cart");
    const drive = DRIVES[slot];
    if (drive !== undefined) await this.emu.eject("disk", drive);
  }

  tape(button: "play" | "stop" | "rewind"): void {
    this.emu.tape(button);
  }

  setInput(enabled: boolean): void {
    this.input = enabled;
    this.emu.setInput(enabled);
  }

  lockMouse(): void {
    // The Amiga's mouse is the pointer over its screen; nothing to lock.
  }

  sendCtrlAltDel(): void {
    // Ctrl-Amiga-Amiga on the Amiga; the C64's RESTORE is not a reset. Both: the reset line.
    this.emu.reset();
  }
}
