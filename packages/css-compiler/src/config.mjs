import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

function object(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw new Error(`${label}: unknown option ${key}`);
}
export function validateConfig(value) {
  object(value, ["version", "target", "unsupported", "maxLayers", "entries"], "CanvasSPA config");
  if (value.version !== 1 || value.target !== "webgpu" || value.unsupported !== "error") {
    throw new Error("CanvasSPA config requires version:1, target:webgpu and unsupported:error");
  }
  const maxLayers = value.maxLayers ?? 8;
  if (!Number.isInteger(maxLayers) || maxLayers < 1 || maxLayers > 8) throw new Error("maxLayers must be 1..8");
  if (!Array.isArray(value.entries) || value.entries.length < 1 || value.entries.length > 32) throw new Error("entries must contain 1..32 explicit targets");
  const ids = new Set(), targets = new Set();
  const entries = value.entries.map(entry => {
    object(entry, ["id", "stylesheet", "selector", "animations"], "CanvasSPA entry");
    if (typeof entry.id !== "string" || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(entry.id) || ids.has(entry.id)) throw new Error("Entry IDs must be valid and unique");
    if (typeof entry.stylesheet !== "string" || !entry.stylesheet.trim() || entry.stylesheet.includes("\0") || entry.stylesheet.includes("?")) {
      throw new Error("stylesheet must be an explicit local path or package export specifier");
    }
    if (typeof entry.selector !== "string" || !/^[.#][a-zA-Z_][a-zA-Z0-9_-]*$/.test(entry.selector)) throw new Error("Only one simple class or ID selector is supported");
    if (!Array.isArray(entry.animations) || entry.animations.length !== 1
      || typeof entry.animations[0] !== "string" || !/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(entry.animations[0])) {
      throw new Error("Each target must select exactly one static animation name");
    }
    const target = `${entry.stylesheet}\0${entry.selector}`;
    if (targets.has(target)) throw new Error("Duplicate stylesheet/selector target");
    targets.add(target); ids.add(entry.id);
    return { ...entry, animations: [...entry.animations] };
  });
  return { version: 1, target: "webgpu", unsupported: "error", maxLayers, entries };
}
export async function readConfig(root, filename = "canvas-spa.config.json") {
  const path = resolve(root, filename);
  const value = JSON.parse(await readFile(path, "utf8"));
  return { path, config: validateConfig(value) };
}
