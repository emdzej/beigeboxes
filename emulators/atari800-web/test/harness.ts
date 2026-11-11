// Not shipped: a fake DriverHost around the atari driver, for Playwright.
import { start } from "../../../src/lib/emulator/drivers/atari";
import type { BootConfig, Driver, DriverHost, Slot } from "../../../src/lib/machines/types";
import type { MediaItem } from "../../../src/lib/media/library";

const log = document.getElementById("log")!;
const say = (s: string) => (log.textContent += s + "\n");
const screen = document.getElementById("screen")!;

const events: string[] = [];
const host: DriverHost = {
  screen,
  blink: (led) => events.push(`blink ${led}`),
  light: (led, on) => events.push(`light ${led} ${on}`),
  setScreen: (w, h) => events.push(`screen ${w}x${h}`),
  started: () => events.push("started"),
  modem: { set() {}, blink() {} },
  say: (t) => events.push(`say ${t}`),
};

function item(url: string): MediaItem {
  const name = url.split("/").pop()!;
  return {
    id: url,
    kind: "floppy",
    label: name,
    note: "",
    color: "#000",
    size: 0,
    format: name.split(".").pop()!.toLowerCase(),
    home: "shelf",
    path: url,
    fs: {
      async file(path: string) {
        const r = await fetch(path);
        if (!r.ok) return null;
        const b = new Uint8Array(await r.arrayBuffer());
        return { bytes: async () => b };
      },
    } as unknown as MediaItem["fs"],
  };
}

function config(media: Partial<Record<Slot, string>>): BootConfig {
  const m: Partial<Record<Slot, MediaItem>> = {};
  for (const [k, v] of Object.entries(media)) if (v) m[k as Slot] = item(v);
  return { build: { memory: [], cards: [], drives: {} }, memoryKb: 64, media: m, modem: { enabled: false, phonebook: {} } };
}

let driver: Driver | null = null;
const api = {
  events,
  item,
  async power(media: Partial<Record<Slot, string>> = {}) {
    if (driver) await driver.stop();
    driver = await start(config(media), host);
    return true;
  },
  async off() {
    await driver?.stop();
    driver = null;
  },
  insert: (slot: Slot, url: string) => driver!.insert(slot, item(url)),
  eject: (slot: Slot) => driver!.eject(slot),
  tape: (b: "play" | "stop" | "rewind") => driver!.tape?.(b),
  setInput: (on: boolean) => driver!.setInput(on),
  reset: () => driver!.reset(),
};
(window as unknown as { bbx: typeof api }).bbx = api;

const q = new URLSearchParams(location.search);
if (q.has("auto")) {
  void api.power({ fda: q.get("fda") ?? undefined, cart: q.get("cart") ?? undefined, tape: q.get("tape") ?? undefined } as Partial<Record<Slot, string>>);
}
say("ready");
