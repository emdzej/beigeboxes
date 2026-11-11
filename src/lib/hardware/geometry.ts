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
  /** A TV has no power light: the picture is the light. */
  led?: Point;
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

/** The PC/XT 5160 system unit: two full-height 5¼" drives and the red switch on its side. */
export const XT_CASE = {
  image: "art/xt/xt5160.webp",
  size: [1600, 549] as [number, number],
  /** The paddle peeking out of the right-hand side, near the back. */
  power: { x: 0.972, y: 0.33, w: 0.028, h: 0.22 },
  drives: [
    {
      slot: { x: 0.386, y: 0.525, w: 0.257, h: 0.045 },
      lever: { x: 0.48, y: 0.385, w: 0.069, h: 0.335 },
      led: { x: 0.4336, y: 0.679 },
    },
    {
      slot: { x: 0.671, y: 0.525, w: 0.258, h: 0.045 },
      lever: { x: 0.764, y: 0.385, w: 0.068, h: 0.335 },
      led: { x: 0.718, y: 0.679 },
    },
  ],
  ledSize: 0.009,
};

/** IBM 5151 monochrome display: green phosphor, knobs bottom right, power at the back. */
export const M5151: MonitorGeometry = {
  image: "art/xt/m5151.webp",
  size: [1200, 1105],
  glass: { x: 0.1, y: 0.1023, w: 0.7983, h: 0.6805 },
  power: { x: 0.85, y: 0.89, w: 0.04, h: 0.05 },
  led: { x: 0.79, y: 0.915 },
};

/** IBM 5153 color display: knobs along the bottom, a push switch on the right. */
export const M5153: MonitorGeometry = {
  image: "art/xt/m5153.webp",
  size: [1200, 1095],
  glass: { x: 0.0842, y: 0.0831, w: 0.8316, h: 0.7032 },
  power: { x: 0.871, y: 0.896, w: 0.039, h: 0.042 },
  led: { x: 0.89, y: 0.872 },
};

/** A walnut-veneer 13" colour TV, 1982: the NES's monitor. Pull the knob for on. */
export const TV: MonitorGeometry = {
  image: "art/nes/tv.webp",
  size: [1200, 838],
  glass: { x: 0.125, y: 0.179, w: 0.5717, h: 0.6444 },
  power: { x: 0.876, y: 0.57, w: 0.044, h: 0.06 },
};

/** The front-loading NES: the flap the cartridge goes under, POWER, RESET and the red light. */
export const NES = {
  image: "art/nes/console.webp",
  size: [1400, 563] as [number, number],
  flap: { x: 0.113, y: 0.115, w: 0.388, h: 0.32 } as Rect,
  power: { x: 0.132, y: 0.693, w: 0.064, h: 0.146 } as Rect,
  reset: { x: 0.229, y: 0.746, w: 0.041, h: 0.094 } as Rect,
  led: { x: 0.3086, y: 0.785 } as Point,
  ledSize: 0.011,
};

/** The C64's 13" colour monitor, a 1702 in all but name. */
export const C1702: MonitorGeometry = {
  image: "art/c64/c1702.webp",
  size: [1200, 1142],
  glass: { x: 0.1167, y: 0.1095, w: 0.7683, h: 0.6226 },
  power: { x: 0.932, y: 0.842, w: 0.042, h: 0.025 },
  led: { x: 0.9, y: 0.8538 },
};

/** The Amiga's 14" RGB monitor, a 1084S in all but name. */
export const C1084: MonitorGeometry = {
  image: "art/amiga/c1084.webp",
  size: [1200, 1150],
  glass: { x: 0.1042, y: 0.1017, w: 0.7925, h: 0.6757 },
  power: { x: 0.843, y: 0.883, w: 0.044, h: 0.045 },
  led: { x: 0.8642, y: 0.8574 },
};

/** The breadbin, seen from the front. Its power switch is on the right flank: see C64_SIDE. */
export const C64 = {
  image: "art/c64/c64.webp",
  size: [1600, 556] as [number, number],
  led: { x: 0.843, y: 0.057 } as Point,
  ledSize: 0.007,
};

/** The C64's right flank, close up: power socket, rocker switch, joystick ports. */
export const C64_SIDE = {
  image: "art/c64/c64-side.webp",
  power: { x: 0.429, y: 0.357, w: 0.214, h: 0.321 } as Rect,
};

/** The 1541: a slot with a lever across it, a power light and a busy light. */
export const DRIVE1541 = {
  image: "art/c64/1541.webp",
  size: [1000, 481] as [number, number],
  slot: { x: 0.18, y: 0.43, w: 0.64, h: 0.1 } as Rect,
  lever: { x: 0.4, y: 0.32, w: 0.2, h: 0.33 } as Rect,
  power: { x: 0.1, y: 0.807 } as Point,
  busy: { x: 0.172, y: 0.807 } as Point,
  ledSize: 0.03,
};

/** The Datasette from the front: the cassette lid on top, the piano keys along the front. */
export const DATASETTE = {
  image: "art/c64/datasette.webp",
  size: [900, 657] as [number, number],
  lid: { x: 0.144, y: 0.327, w: 0.711, h: 0.221 } as Rect,
  keys: {
    play: { x: 0.256, y: 0.624, w: 0.12, h: 0.175 },
    rewind: { x: 0.381, y: 0.624, w: 0.116, h: 0.175 },
    stop: { x: 0.626, y: 0.624, w: 0.121, h: 0.175 },
  } as Record<"play" | "rewind" | "stop", Rect>,
};

/** The Amiga 500 from the front: power and drive lights top left. Its drive is on the right flank. */
export const A500 = {
  image: "art/amiga/a500.webp",
  size: [1600, 493] as [number, number],
  powerLed: { x: 0.131, y: 0.209 } as Point,
  driveLed: { x: 0.153, y: 0.209 } as Point,
  ledSize: 0.0075,
};

/** The A500's right flank, close up: the drive slot and its eject button. */
export const A500_SIDE = {
  image: "art/amiga/a500-side.webp",
  slot: { x: 0.071, y: 0.405, w: 0.859, h: 0.071 } as Rect,
  eject: { x: 0.694, y: 0.522, w: 0.153, h: 0.071 } as Rect,
};

/** The A500's power brick: the switch is on it, not on the computer. */
export const A500_PSU = {
  image: "art/amiga/psu.webp",
  size: [600, 368] as [number, number],
  power: { x: 0.358, y: 0.701, w: 0.142, h: 0.147 } as Rect,
};
