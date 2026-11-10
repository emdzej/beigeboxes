/**
 * Diskette colours, as CSS filters over the one photographed blue diskette.
 *
 * Hue rotation leaves unsaturated pixels alone, so the metal shutter stays
 * metal and the paper label stays white while the plastic changes colour —
 * which is why this is a filter and not a tint layer.
 */
export const PLASTIC: Record<string, string> = {
  "#1f3f8f": "none",
  "#202024": "saturate(0) brightness(0.38) contrast(1.2)",
  "#9b1d20": "hue-rotate(140deg) saturate(1.3) brightness(0.95)",
  "#d9a400": "hue-rotate(190deg) saturate(1.6) brightness(1.55)",
  "#1f7a3a": "hue-rotate(-80deg) saturate(1.1)",
  "#5a2a82": "hue-rotate(50deg)",
  "#d65a00": "hue-rotate(170deg) saturate(1.8) brightness(1.4)",
  "#6a6a6a": "saturate(0) brightness(0.8)",
};

export function plasticFilter(color: string): string {
  return PLASTIC[color] ?? "none";
}

export function humanSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
