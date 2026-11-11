/**
 * The noises a 1996 PC made, synthesised rather than sampled — nothing to
 * download, and a floppy seek can be triggered per sector without a sample
 * library's worth of variation.
 *
 * Audio contexts may only start after a user gesture; every entry point here
 * is called from a click, so the context is created lazily on the first one.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let fan: { stop(): void } | null = null;
let muted = localStorage.getItem("beigeboxes:muted") === "1";
let lastSeek = 0;

function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (muted) return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return { ctx, out: master! };
}

function noise(ctx: AudioContext, seconds: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** A short filtered noise burst with an envelope — the basis of every clunk. */
function burst(opts: { dur: number; freq: number; q?: number; gain: number; type?: BiquadFilterType; delay?: number }): void {
  const a = audio();
  if (!a) return;
  const t = a.ctx.currentTime + (opts.delay ?? 0);
  const src = a.ctx.createBufferSource();
  src.buffer = noise(a.ctx, opts.dur);
  const filter = a.ctx.createBiquadFilter();
  filter.type = opts.type ?? "bandpass";
  filter.frequency.value = opts.freq;
  filter.Q.value = opts.q ?? 1;
  const g = a.ctx.createGain();
  g.gain.setValueAtTime(opts.gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
  src.connect(filter).connect(g).connect(a.out);
  src.start(t);
}

function tone(opts: { freq: number; dur: number; gain: number; type?: OscillatorType; to?: number; delay?: number }): void {
  const a = audio();
  if (!a) return;
  const t = a.ctx.currentTime + (opts.delay ?? 0);
  const osc = a.ctx.createOscillator();
  osc.type = opts.type ?? "square";
  osc.frequency.setValueAtTime(opts.freq, t);
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t + opts.dur);
  const g = a.ctx.createGain();
  g.gain.setValueAtTime(opts.gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
  osc.connect(g).connect(a.out);
  osc.start(t);
  osc.stop(t + opts.dur);
}

export const sfx = {
  get muted() {
    return muted;
  },
  setMuted(value: boolean) {
    muted = value;
    localStorage.setItem("beigeboxes:muted", value ? "1" : "0");
    if (value) {
      fan?.stop();
      fan = null;
    }
  },

  click() {
    burst({ dur: 0.03, freq: 3000, q: 2, gain: 0.6 });
    burst({ dur: 0.05, freq: 900, q: 3, gain: 0.4, delay: 0.06 });
  },

  fanStart() {
    const a = audio();
    if (!a || fan) return;
    const src = a.ctx.createBufferSource();
    src.buffer = noise(a.ctx, 2);
    src.loop = true;
    const filter = a.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 400;
    const g = a.ctx.createGain();
    const t = a.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 1.5);
    src.connect(filter).connect(g).connect(a.out);
    src.start();
    // The PSU's mains hum under the fan.
    const hum = a.ctx.createOscillator();
    hum.frequency.value = 100;
    const hg = a.ctx.createGain();
    hg.gain.value = 0.012;
    hum.connect(hg).connect(a.out);
    hum.start();
    fan = {
      stop() {
        const now = a.ctx.currentTime;
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(g.gain.value, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 2.5);
        src.stop(now + 2.6);
        hum.stop(now + 0.3);
      },
    };
  },

  fanStop() {
    fan?.stop();
    fan = null;
  },

  hddSpinUp() {
    tone({ freq: 60, to: 240, dur: 3.5, gain: 0.03, type: "sawtooth" });
  },

  hddSeek() {
    const now = performance.now();
    if (now - lastSeek < 45) return;
    lastSeek = now;
    burst({ dur: 0.018, freq: 2200 + Math.random() * 1400, q: 6, gain: 0.18 });
  },

  floppySeek() {
    const now = performance.now();
    if (now - lastSeek < 70) return;
    lastSeek = now;
    // The stepper motor: a buzzy tone that steps in pitch.
    tone({ freq: 180 + Math.random() * 120, dur: 0.07, gain: 0.06, type: "square" });
    burst({ dur: 0.05, freq: 600, q: 4, gain: 0.15 });
  },

  floppyInsert() {
    burst({ dur: 0.08, freq: 1500, q: 1, gain: 0.3 });
    burst({ dur: 0.12, freq: 400, q: 2, gain: 0.5, delay: 0.12 });
  },

  floppyEject() {
    burst({ dur: 0.06, freq: 2500, q: 2, gain: 0.4 });
    burst({ dur: 0.1, freq: 700, q: 1, gain: 0.3, delay: 0.05 });
  },

  trayOpen() {
    tone({ freq: 90, to: 140, dur: 0.9, gain: 0.04, type: "sawtooth" });
    burst({ dur: 0.08, freq: 800, gain: 0.3, delay: 0.9 });
  },

  trayClose() {
    tone({ freq: 140, to: 90, dur: 0.9, gain: 0.04, type: "sawtooth" });
    burst({ dur: 0.1, freq: 500, gain: 0.4, delay: 0.9 });
    // The disc spinning up.
    tone({ freq: 200, to: 900, dur: 1.6, gain: 0.015, type: "sine", delay: 1.1 });
  },

  /** Abridged: dial tone, a few DTMF digits, the screech, then silence. */
  modemHandshake() {
    tone({ freq: 350, dur: 0.6, gain: 0.05, type: "sine" });
    tone({ freq: 440, dur: 0.6, gain: 0.05, type: "sine" });
    const dtmf = [[697, 1209], [770, 1336], [852, 1477], [941, 1336]];
    dtmf.forEach(([lo, hi], i) => {
      tone({ freq: lo!, dur: 0.09, gain: 0.05, type: "sine", delay: 0.7 + i * 0.13 });
      tone({ freq: hi!, dur: 0.09, gain: 0.05, type: "sine", delay: 0.7 + i * 0.13 });
    });
    tone({ freq: 2100, dur: 0.9, gain: 0.04, type: "sine", delay: 1.4 });
    tone({ freq: 1200, to: 2400, dur: 0.5, gain: 0.03, type: "square", delay: 2.3 });
    burst({ dur: 1.4, freq: 1800, q: 0.7, gain: 0.08, delay: 2.8 });
  },

  /** A BIOS beep code from the PC speaker: lengths in ms, with short gaps. */
  beeps(lengths: number[]) {
    let at = 0.4;
    for (const ms of lengths) {
      tone({ freq: 880, dur: ms / 1000, gain: 0.05, delay: at });
      at += ms / 1000 + 0.15;
    }
  },

  degauss() {
    tone({ freq: 50, dur: 0.6, gain: 0.2, type: "sawtooth" });
    burst({ dur: 0.4, freq: 120, type: "lowpass", gain: 0.5 });
  },
};
