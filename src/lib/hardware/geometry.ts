/**
 * Where things are on the photographs.
 *
 * Every rectangle is a fraction of its image — `x`, `y`, `w`, `h` in 0…1 — so
 * hotspots, LEDs and the emulator screen scale with the picture rather than
 * with the viewport. Measured on the cropped WebPs in `public/art/` (see
 * `art/` for the gridded proofs); re-measure if an image is regenerated.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface CaseGeometry {
  image: string;
  /** Pixel size of the image, for its aspect ratio. */
  size: [number, number];
  power: Rect;
  reset: Rect;
  turbo: Rect;
  powerLed: Point;
  hddLed: Point;
  /** LED diameter, as a fraction of the image width. */
  ledSize: number;
  /** The 7-segment MHz readout, if the case has one. */
  display?: Rect;
  cd: { bay: Rect; tray: Rect; eject: Rect; led: Point };
  floppy: { bay: Rect; slot: Rect; eject: Rect; led: Point };
  /** Where a monitor's base rests, as a fraction from the top. Desktop only. */
  monitorRest?: number;
}

export const TOWER: CaseGeometry = {
  image: "art/tower.webp",
  size: [900, 1842],
  power: { x: 0.19, y: 0.535, w: 0.14, h: 0.07 },
  reset: { x: 0.408, y: 0.555, w: 0.064, h: 0.034 },
  turbo: { x: 0.528, y: 0.555, w: 0.064, h: 0.034 },
  powerLed: { x: 0.783, y: 0.477 },
  hddLed: { x: 0.783, y: 0.514 },
  ledSize: 0.028,
  display: { x: 0.185, y: 0.46, w: 0.145, h: 0.045 },
  cd: {
    bay: { x: 0.1, y: 0.035, w: 0.795, h: 0.117 },
    tray: { x: 0.15, y: 0.047, w: 0.7, h: 0.048 },
    eject: { x: 0.755, y: 0.118, w: 0.08, h: 0.02 },
    led: { x: 0.665, y: 0.128 },
  },
  floppy: {
    bay: { x: 0.22, y: 0.305, w: 0.56, h: 0.08 },
    slot: { x: 0.26, y: 0.325, w: 0.48, h: 0.02 },
    eject: { x: 0.62, y: 0.356, w: 0.075, h: 0.018 },
    led: { x: 0.36, y: 0.365 },
  },
};

export const DESKTOP: CaseGeometry = {
  image: "art/desktop.webp",
  size: [1400, 533],
  power: { x: 0.054, y: 0.368, w: 0.061, h: 0.162 },
  reset: { x: 0.137, y: 0.452, w: 0.03, h: 0.076 },
  turbo: { x: 0.189, y: 0.452, w: 0.03, h: 0.076 },
  powerLed: { x: 0.152, y: 0.39 },
  hddLed: { x: 0.204, y: 0.39 },
  ledSize: 0.011,
  cd: {
    bay: { x: 0.602, y: 0.246, w: 0.348, h: 0.284 },
    tray: { x: 0.623, y: 0.269, w: 0.306, h: 0.131 },
    eject: { x: 0.883, y: 0.45, w: 0.036, h: 0.04 },
    led: { x: 0.727, y: 0.469 },
  },
  floppy: {
    bay: { x: 0.648, y: 0.535, w: 0.254, h: 0.192 },
    slot: { x: 0.662, y: 0.59, w: 0.223, h: 0.04 },
    eject: { x: 0.837, y: 0.667, w: 0.031, h: 0.04 },
    led: { x: 0.702, y: 0.689 },
  },
  monitorRest: 0.13,
};

export interface MonitorGeometry {
  image: string;
  size: [number, number];
  /**
   * The hole cut where the glass was (art/punch.py), a little oversized: the
   * emulator screen sits behind the photo and the bezel frames it.
   */
  glass: Rect;
  power: Rect;
  led: Point;
}

export const CRT: MonitorGeometry = {
  image: "art/crt.webp",
  size: [1200, 1274],
  glass: { x: 0.097, y: 0.096, w: 0.806, h: 0.589 },
  power: { x: 0.816, y: 0.756, w: 0.04, h: 0.038 },
  led: { x: 0.792, y: 0.775 },
};

export const LCD: MonitorGeometry = {
  image: "art/lcd.webp",
  size: [1200, 1181],
  glass: { x: 0.08, y: 0.076, w: 0.84, h: 0.678 },
  power: { x: 0.852, y: 0.805, w: 0.03, h: 0.03 },
  led: { x: 0.835, y: 0.823 },
};

/** Modem front panel lights, left to right: AA CD OH RD SD TR MR CS. */
export const MODEM = {
  image: "art/modem.webp",
  size: [900, 239] as [number, number],
  leds: [0.543, 0.592, 0.64, 0.689, 0.738, 0.787, 0.835, 0.884],
  ledY: 0.61,
};
