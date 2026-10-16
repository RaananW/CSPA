/**
 * Toolbar for Vue 3 (anatomy page `toolbar.md`): controls on one plinth that are one tab stop (a roving tabindex
 * applied when focus first enters), with the arrow keys, Home and End between them (`@underglass/ui/dom`).
 */
import { defineComponent, h, type PropType } from "vue";
import { rovingStrataToolbar, strataToolbarTarget } from "../dom/toolbar.ts";
import { classes, strataAttributes, strataProps } from "./shared.ts";

export const Toolbar = defineComponent({
  name: "StrataToolbar",
  props: {
    /** The toolbar's accessible name (`aria-label`). */
    label: { type: String, required: true },
    orientation: { type: String as PropType<"horizontal" | "vertical">, default: "horizontal" },
    ...strataProps,
  },
  setup(props, { slots }) {
    const focusin = (event: FocusEvent) => { if (event.target !== event.currentTarget) rovingStrataToolbar(event.currentTarget as Element, event.target as Element); };
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = strataToolbarTarget(event.target as Element, event.key);
      if (!target) return;
      event.preventDefault();
      target.focus();
    };
    return () => h("div", {
      class: classes("ug-toolbar", props.orientation === "vertical" && "ug-toolbar--vertical"), role: "toolbar", "aria-label": props.label,
      "aria-orientation": props.orientation === "vertical" ? "vertical" : undefined, "data-strata-face": "raised", ...strataAttributes(props),
      onFocusin: focusin, onKeydown: keydown,
    }, slots.default?.());
  },
});
