import type { CSSProperties } from "react";

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
export interface Appearance {
  background?: string;
  color?: string;
  borderColor?: string;
  borderWidth?: number;
  radius?: number;
  fontSize?: number;
}

export function compileStyle(layout: Layout = {}, appearance: Appearance = {}, positioned = false): CSSProperties {
  for (const [key, value] of Object.entries({ ...layout, ...appearance })) {
    if (typeof value === "number" && (!Number.isFinite(value) || value < 0 && key !== "x" && key !== "y")) {
      throw new Error(`Invalid authored ${key}`);
    }
  }
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
    borderStyle: appearance.borderWidth ? "solid" : undefined,
    borderRadius: appearance.radius, fontSize: appearance.fontSize,
  };
}
