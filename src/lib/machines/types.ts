import type { MediaItem } from "../media/library";
import type { Rect } from "../hardware/geometry";

export type Era = "80s" | "90s";

/** A drive or port something can be put into. */
export type Slot = "fda" | "fdb" | "cdrom" | "hda" | "hdb" | "cart" | "tape";

/** `tape`: the cassette motor is running. */
export type Led = "hdd" | "fdd" | "fdb" | "cd" | "tape";

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

/** A card standing in an expansion slot, with whatever it was set up with. */
export interface CardInstance {
  part: string;
  /** For a network card: what its cable goes to. */
  net?: NetworkChoice;
}

/** What is mounted inside a machine's case. */
export interface Build {
  /** Memory sockets, in board order: a part id, or empty. */
  memory: (string | null)[];
  /** Expansion slots, in board order. */
  cards: (CardInstance | null)[];
  /** Hard disks on the IDE cable, by media id, so they're still there after a reload. */
  drives: Partial<Record<"hda" | "hdb", string>>;
}

/** What a part plugs into: 72-pin SIMM, a bank of DIP sockets, 16/8-bit ISA, PCI. */
/** `trapdoor`: the Amiga 500's expansion bay underneath; its card lies flat. */
export type PartKind = "simm72" | "dip64" | "isa" | "isa8" | "pci" | "trapdoor";

export interface Part {
  id: string;
  kind: PartKind;
  name: string;
  /** Cut-out photo, front-on. */
  image: string;
  size: [number, number];
  /** Memory it adds, in KB: a stick, a bank of chips, or a memory card. */
  kb?: number;
  /** The colour of its board's edge: fitted, from above, that's all you see of it. */
  pcb: string;
  /** What the card gives the machine. */
  role?: "video" | "sound" | "network" | "floppy" | "disk" | "memory";
  /** For a video card: what it is, to the emulator and to the monitor. */
  video?: "vga" | "mda" | "hercules" | "cga";
}

/** Where things go on the photo of the open case; fractions of the image, as in geometry.ts. */
export interface Board {
  image: string;
  size: [number, number];
  /** Memory sockets; pairs fill a bank on a 64-bit bus. */
  memory: { kind: PartKind; rect: Rect }[];
  /** How many sockets make a bank. */
  bank: number;
  /** Expansion slots: the rect is the slot itself, a card stands up from it. */
  slots: { bus: PartKind; rect: Rect }[];
  /** Where the back panel is, as a fraction across the slots: cards' brackets are screwed there. */
  bracket: { at: number; side: "left" | "top" };
  /** Most memory the machine can address with its cards, in KB. */
  maxKb?: number;
  /** Memory soldered to the board, before anything is fitted. */
  baseKb?: number;
  /** Drive bays, wired to the IDE cable. */
  bays: { slot: "hda" | "hdb"; rect: Rect }[];
}

/** The host side a driver reports to: lights, screen size, the modem's front panel. */
export interface DriverHost {
  screen: HTMLElement;
  blink(led: Led, ms?: number): void;
  /** For a light the emulator reports on and off itself, like a motor. */
  light(led: Led, on: boolean): void;
  setScreen(width: number, height: number): void;
  started(): void;
  modem: { set(led: "oh" | "cd" | "tr", on: boolean): void; blink(led: "sd" | "rd"): void };
  say(text: string): void;
}

export interface BootConfig {
  build: Build;
  memoryKb: number;
  media: Partial<Record<Slot, MediaItem>>;
  modem: ModemSettings;
}

/** A running emulator. One per power-on. */
export interface Driver {
  /** Stop, write changed disks back, let go of everything. */
  stop(): Promise<void>;
  reset(): void;
  insert(slot: Slot, media: MediaItem): Promise<void>;
  eject(slot: Slot): Promise<void>;
  setInput(enabled: boolean): void;
  lockMouse(): void;
  sendCtrlAltDel(): void;
  /** The tape deck's buttons, on a machine with one. */
  tape?(button: "play" | "stop" | "rewind"): void;
}

export type StartDriver = (config: BootConfig, host: DriverHost) => Promise<Driver>;

export interface Model {
  id: string;
  name: string;
  maker: string;
  year: number;
  era: Era;
  blurb: string;
  /** Drives it has on the front. */
  slots: Slot[];
  /** The file formats its drives read; a disk in any other stays out of its box. Default: PC images. */
  formats?: string[];
  /** The open case; machines without one can't be customised yet. */
  board?: Board;
  defaults: Build;
  /** Loaded on the first press of POWER. Missing while the emulator is still to come. */
  driver?: () => Promise<StartDriver>;
  /** What runs it, for the catalogue's small print. */
  emulator: string;
}
