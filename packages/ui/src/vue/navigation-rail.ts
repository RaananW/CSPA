/**
 * NavigationRail for Vue 3 (anatomy page `navigation-rail.md`): an application's top-level destinations, as a `<nav>`
 * landmark holding a list of native links on a raised rail; the current one carries `aria-current="page"`. A click
 * emits `navigate(href, event)`, so a router can prevent the default and route instead.
 */
import { defineComponent, h, type PropType, type VNodeChild } from "vue";
import { strataAttributes, strataProps } from "./shared.ts";

export interface NavigationRailItem {
  label: string;
  href: string;
  /** Decorative: the label names the destination. */
  icon?: VNodeChild;
}

export const NavigationRail = defineComponent({
  name: "StrataNavigationRail",
  props: {
    /** The landmark's name, such as "Main". */
    label: { type: String, required: true },
    items: { type: Array as PropType<readonly NavigationRailItem[]>, required: true },
    /** The current destination's `href`. */
    current: { type: String, default: undefined },
    ...strataProps,
  },
  emits: { navigate: (href: string, event: MouseEvent) => typeof href === "string" && !!event },
  setup(props, { emit }) {
    return () => h("nav", { class: "ug-nav-rail", "data-strata-face": "raised", "aria-label": props.label, ...strataAttributes(props) }, [
      h("ul", { class: "ug-nav-rail__list", role: "list" }, props.items.map(item => h("li", { key: item.href, class: "ug-nav-rail__entry" }, [
        h("a", { class: "ug-nav-rail__item", "data-strata-face": "raised", href: item.href, "aria-current": item.href === props.current ? "page" : undefined,
          onClick: (event: MouseEvent) => emit("navigate", item.href, event) }, [
          h("span", { class: "ug-nav-rail__icon", "aria-hidden": "true" }, item.icon as never),
          h("span", { class: "ug-nav-rail__label" }, item.label),
        ]),
      ]))),
    ]);
  },
});
