/**
 * Typed authoring styles for `Surface` and `Box`. `compileStyle` turns the narrow `Layout` and
 * `Appearance` props into ordinary React inline styles, so layout stays browser HTML/CSS layout
 * rather than a custom layout engine. Used by `react.tsx` and the experimental worker surface.
 * Not to be confused with the opt-in build-time CSS compiler in `packages/css-compiler`.
 */
import type { CSSProperties } from "react";

/**
 * Typed layout for an authored layer or box. Numbers are CSS pixels. `x`/`y` position a
 * `Surface` inside the Underglass root (ignored for `Box`, which stays in flow); `direction`
 * makes the element a flex container and `gap` applies only then. `overflow: "scroll"` maps
 * to CSS `overflow: auto`.
 */
export interface Layout {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  direction?: "row" | "column";
  overflow?: "visible" | "hidden" | "scroll";
}
/**
 * Typed appearance for an authored layer or box. Colors are any CSS color the browser accepts
 * (checked with `CSS.supports`); `borderWidth`, `radius` and `fontSize` are CSS pixels.
 */
export interface Appearance {
  background?: string;
  color?: string;
  borderColor?: string;
  borderWidth?: number;
  radius?: number;
  fontSize?: number;
}

/**
 * Compiles typed layout and appearance into React inline styles. `positioned` (used for
 * layers) adds `position: absolute` at `layout.x`/`layout.y`. Throws on a non-finite number,
 * a negative number (only `x`/`y` may be negative) or a color the browser does not support.
 */
export function compileStyle(layout: Layout = {}, appearance: Appearance = {}, positioned = false): CSSProperties {
  for (const [key, value] of Object.entries({ ...layout, ...appearance })) {
    if (typeof value === "number" && (!Number.isFinite(value) || value < 0 && key !== "x" && key !== "y")) {
      throw new Error(`Invalid authored ${key}`);
    }
  }
  // Only string appearance fields are colors; `background` is restricted to a plain color.
  for (const [key, value] of Object.entries(appearance)) {
    if (typeof value === "string" && !CSS.supports(key === "background" ? "background-color" : "color", value)) {
      throw new Error(`Invalid authored color: ${key}`);
    }
  }
  return {
    boxSizing: "border-box",
    ...(positioned ? { position: "absolute", left: layout.x ?? 0, top: layout.y ?? 0 } : {}),
    width: layout.width, height: layout.height, padding: layout.padding,
    ...(layout.direction ? { display: "flex", flexDirection: layout.direction, gap: layout.gap } : {}),
    overflow: layout.overflow === "scroll" ? "auto" : layout.overflow ?? "visible",
    backgroundColor: appearance.background, color: appearance.color,
    borderColor: appearance.borderColor, borderWidth: appearance.borderWidth,
    // CSS draws no border without a style, so a nonzero width implies a solid border.
    borderStyle: appearance.borderWidth ? "solid" : undefined,
    borderRadius: appearance.radius, fontSize: appearance.fontSize,
  };
}
