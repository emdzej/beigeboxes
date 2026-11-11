import { AMIGA_BOARD, PENTIUM_BOARD, XT_BOARD } from "./boards";
import type { Build, Model } from "./types";

const EMPTY: Build = { memory: [], cards: [], drives: {} };

/**
 * Every machine that can stand on the desk. The ones without a driver are
 * in the catalogue as "coming soon" while their emulator is ported.
 */
export const MODELS: Model[] = [
  {
    id: "pc-pentium",
    name: "Pentium 133 multimedia PC",
    maker: "a no-name clone",
    year: 1996,
    era: "90s",
    blurb: "Midi tower or desktop, 15\" CRT or a fancy LCD, a CD-ROM and a 3½\" drive. Open it up and fit RAM and cards.",
    slots: ["fda", "cdrom", "hda", "hdb"],
    board: PENTIUM_BOARD,
    defaults: {
      memory: ["simm-32", "simm-32", null, null],
      cards: [{ part: "vga-s3" }, null, null, { part: "sb16" }, { part: "ne2000", net: { kind: "none" } }, null],
      drives: {},
    },
    driver: () => import("../emulator/drivers/v86").then((m) => m.start),
    emulator: "v86",
  },
  {
    id: "pc-xt",
    name: "IBM PC/XT 5160",
    maker: "IBM",
    year: 1983,
    era: "80s",
    blurb: "An 8088 at 4.77 MHz and two 5¼\" drives. Open it up for memory banks and an MDA, Hercules or CGA card.",
    slots: ["fda", "fdb"],
    board: XT_BOARD,
    defaults: {
      memory: ["dip-64k", "dip-64k", "dip-64k", "dip-64k", null, null],
      cards: [{ part: "ibm-cga" }, null, null, null, null, null, { part: "ibm-fdc" }, null],
      drives: {},
    },
    driver: () => import("../emulator/drivers/martypc").then((m) => m.start),
    emulator: "MartyPC",
  },
  {
    id: "c64",
    name: "Commodore 64",
    maker: "Commodore",
    year: 1982,
    era: "80s",
    blurb: "The breadbin, a 1541 floppy drive, a Datasette and cartridges.",
    slots: ["fda", "tape", "cart"],
    formats: ["d64", "g64", "prg", "tap", "crt"],
    defaults: EMPTY,
    driver: () => import("../emulator/drivers/commodore").then((m) => m.startC64),
    emulator: "VirtualC64",
  },
  {
    id: "atari-65xe",
    name: "Atari 65XE",
    maker: "Atari",
    year: 1985,
    era: "80s",
    blurb: "64 KB, a 1050 drive, an XC12 tape recorder and cartridges.",
    slots: [],
    defaults: EMPTY,
    emulator: "atari800",
  },
  {
    id: "amiga-500",
    name: "Amiga 500",
    maker: "Commodore",
    year: 1987,
    era: "80s",
    blurb: "A 68000, a trapdoor RAM expansion and a 1084S monitor.",
    slots: ["fda"],
    formats: ["adf"],
    board: AMIGA_BOARD,
    defaults: { memory: [], cards: [{ part: "a501" }], drives: {} },
    driver: () => import("../emulator/drivers/commodore").then((m) => m.startAmiga),
    emulator: "vAmiga",
  },
  {
    id: "mac-plus",
    name: "Macintosh Plus",
    maker: "Apple",
    year: 1986,
    era: "80s",
    blurb: "A compact Mac with a 9\" screen. Bring your own ROM.",
    slots: [],
    defaults: EMPTY,
    emulator: "Snow",
  },
  {
    id: "nes",
    name: "Nintendo Entertainment System",
    maker: "Nintendo",
    year: 1985,
    era: "80s",
    blurb: "The grey toaster on a wood-grain TV, a pad and a stack of homebrew cartridges.",
    slots: ["cart"],
    formats: ["nes"],
    defaults: EMPTY,
    driver: () => import("../emulator/drivers/nes").then((m) => m.start),
    emulator: "jsnes",
  },
];

export function model(id: string): Model {
  return MODELS.find((m) => m.id === id) ?? MODELS[0]!;
}
