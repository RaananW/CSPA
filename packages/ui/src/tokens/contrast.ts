/**
 * Colour contrast as WCAG 2.2 defines it, and Strata's derived on-colours (text on role colours).
 */

export type Rgb = readonly [number, number, number];

/** `#rrggbb` (or `#rgb`) to 0–255 channels. */
export function parseHex(hex: string): Rgb {
  const digits = hex.replace(/^#/, "");
  const full = digits.length === 3 ? [...digits].map(digit => digit + digit).join("") : digits;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new TypeError(`Not a hex colour: ${hex}`);
  return [0, 2, 4].map(index => Number.parseInt(full.slice(index, index + 2), 16)) as unknown as Rgb;
}

/** 0–255 channels to `#rrggbb`. */
export function toHex(colour: Rgb): string {
  return `#${colour.map(channel => Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, "0")).join("")}`;
}

/** WCAG relative luminance. */
export function luminance([red, green, blue]: Rgb): number {
  const linear = (channel: number) => { const c = channel / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

/** WCAG contrast ratio, 1–21. */
export function contrast(a: Rgb, b: Rgb): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

/** A colour brightened or darkened by `factor` (the lit interior: 1 ± `interior.max`). */
export function scale(colour: Rgb, factor: number): Rgb {
  return colour.map(channel => Math.min(255, channel * factor)) as unknown as Rgb;
}

/** Near-black used for text on light role colours. */
export const nearBlack: Rgb = [16, 18, 22];
const white: Rgb = [255, 255, 255];

/** Text on a role colour (`on-accent` and so on): white or near-black, whichever contrasts more. */
export function onColour(colour: Rgb): Rgb {
  return contrast(colour, white) >= contrast(colour, nearBlack) ? white : nearBlack;
}
