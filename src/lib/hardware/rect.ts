import type { Point, Rect } from "./geometry";

const pct = (v: number) => `${(v * 100).toFixed(3)}%`;

/** Absolute-position a box at a fractional rectangle of its parent. */
export function place(r: Rect): string {
  return `left:${pct(r.x)};top:${pct(r.y)};width:${pct(r.w)};height:${pct(r.h)}`;
}

/** Centre a fixed-size dot (in parent-width %) on a fractional point. */
export function dot(p: Point, size: number, aspect: number): string {
  // `aspect` is the parent's width / height, so the dot stays round.
  return `left:${pct(p.x - size / 2)};top:${pct(p.y - (size * aspect) / 2)};width:${pct(size)};height:${pct(size * aspect)}`;
}
