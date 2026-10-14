/**
 * Card component of the fixture package `@underglass/fixture-card`, standing in for a third-party
 * component library. It forwards its `ref` to the root `section`, which is the enrollment boundary, and
 * keeps its own state (an input, a saved value and a glyph toggle) so tests can verify that it survives
 * GPU presentation. `onCommit` lets the host count renders.
 */
import { createElement, forwardRef, useState } from "react";
export const Card = forwardRef(function Card({ className, onCommit }, ref) {
  const [value, setValue] = useState("Original package input");
  const [saved, setSaved] = useState("");
  const [glyph, setGlyph] = useState("WWWWWWWW");
  onCommit?.();
  return createElement("section", { ref, className, id: "card", style: { transform: "none", opacity: 1, transformOrigin: "0 0" } },
    createElement("h2", { id: "title" }, glyph),
    createElement("button", { id: "glyph", onClick: () => setGlyph(value => value[0] === "W" ? "IIIIIIII" : "WWWWWWWW") }, "Change glyph"),
    createElement("form", { onSubmit(event) { event.preventDefault(); setSaved(value); } },
      createElement("label", { htmlFor: "input" }, "Package editor"),
      createElement("input", { id: "input", value, onChange(event) { setValue(event.target.value); } }),
      createElement("button", { id: "save", type: "submit" }, "Save"),
      createElement("output", { id: "saved" }, saved)));
});
