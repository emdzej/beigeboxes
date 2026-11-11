import type { Board } from "./types";

/**
 * The open midi tower, side panel off, lying down (art/interior.webp).
 * Measured on its gridded proof; re-measure if the photo is regenerated.
 */
export const PENTIUM_BOARD: Board = {
  image: "art/interior.webp",
  size: [1800, 1344],
  // Two banks of two, nearest the CPU first. The fifth socket on the photo is
  // a spare the board's manual says not to use with the fourth.
  bank: 2,
  bracket: { at: 0.118, side: "left" },
  memory: [
    { kind: "simm72", rect: { x: 0.387, y: 0.276, w: 0.014, h: 0.316 } },
    { kind: "simm72", rect: { x: 0.404, y: 0.276, w: 0.014, h: 0.316 } },
    { kind: "simm72", rect: { x: 0.423, y: 0.276, w: 0.011, h: 0.316 } },
    { kind: "simm72", rect: { x: 0.439, y: 0.276, w: 0.011, h: 0.316 } },
  ],
  slots: [
    { bus: "pci", rect: { x: 0.215, y: 0.64, w: 0.137, h: 0.015 } },
    { bus: "pci", rect: { x: 0.215, y: 0.683, w: 0.137, h: 0.015 } },
    { bus: "pci", rect: { x: 0.215, y: 0.727, w: 0.137, h: 0.018 } },
    { bus: "isa", rect: { x: 0.187, y: 0.763, w: 0.223, h: 0.014 } },
    { bus: "isa", rect: { x: 0.187, y: 0.804, w: 0.223, h: 0.015 } },
    { bus: "isa", rect: { x: 0.187, y: 0.845, w: 0.223, h: 0.015 } },
  ],
  bays: [
    { slot: "hda", rect: { x: 0.665, y: 0.355, w: 0.19, h: 0.09 } },
    { slot: "hdb", rect: { x: 0.665, y: 0.455, w: 0.19, h: 0.09 } },
  ],
};

const xtSlot = (x: number) => ({ bus: "isa8" as const, rect: { x, y: 0.224, w: 0.0122, h: 0.215 } });
const xtBank = (x: number, w: number) => ({ kind: "dip64" as const, rect: { x, y: 0.634, w, h: 0.184 } });

/**
 * The IBM PC/XT 5160, lid off, from above (art/xt/interior.webp): eight
 * 8-bit slots at the back, six banks of nine DIP sockets at the front left.
 * Cards stand up from the slots towards the back panel at the top.
 */
export const XT_BOARD: Board = {
  image: "art/xt/interior.webp",
  size: [1800, 1344],
  bank: 1,
  bracket: { at: 0.1, side: "top" },
  maxKb: 640,
  memory: [
    xtBank(0.141, 0.037),
    xtBank(0.185, 0.038),
    xtBank(0.231, 0.038),
    xtBank(0.281, 0.038),
    xtBank(0.328, 0.036),
    xtBank(0.375, 0.039),
  ],
  slots: [0.135, 0.171, 0.209, 0.246, 0.282, 0.32, 0.356, 0.392].map(xtSlot),
  bays: [],
};

/**
 * The Amiga 500 upside down with its trapdoor off: 512 KB of chip RAM on the
 * board, and one edge connector for an A501 card to lie flat in the bay.
 */
export const AMIGA_BOARD: Board = {
  image: "art/amiga/trapdoor.webp",
  size: [1800, 1344],
  memory: [],
  bank: 1,
  bracket: { at: 0, side: "top" },
  baseKb: 512,
  maxKb: 2048,
  slots: [{ bus: "trapdoor", rect: { x: 0.232, y: 0.525, w: 0.263, h: 0.165 } }],
  bays: [],
};
