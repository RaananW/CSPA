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
