/**
 * AppBar for Vue 3 (anatomy page `app-bar.md`): the application's top bar, a `<header>` on a raised slab with
 * optional `start` and `end` slots and a title between them (the `title` prop, or the `title` slot).
 */
import { defineComponent, h } from "vue";
import { strataAttributes, strataProps } from "./shared.ts";

export const AppBar = defineComponent({
  name: "StrataAppBar",
  props: {
    title: { type: String, default: undefined },
    ...strataProps,
  },
  setup(props, { slots }) {
    return () => h("header", { class: "ug-app-bar", "data-strata-face": "raised", ...strataAttributes(props) }, [
      slots.start && h("div", { class: "ug-app-bar__start" }, slots.start()),
      h("span", { class: "ug-app-bar__title" }, slots.title?.() ?? props.title),
      slots.end && h("div", { class: "ug-app-bar__end" }, slots.end()),
    ]);
  },
});
