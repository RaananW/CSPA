/**
 * List and ListItem for Vue 3 (anatomy page `list.md`): a native `<ul role="list">` on one raised slab. A row is
 * static, a link (`href`) or a button (`button`, or a click listener), and an actionable row's link or button fills it.
 * Slots: `start`, `secondary` and `end` beside the `primary` prop (or the default slot).
 */
import { defineComponent, h, type PropType } from "vue";
import { strataAttributes, strataProps } from "./shared.ts";

export const List = defineComponent({
  name: "StrataList",
  props: {
    /** The list's accessible name (`aria-label`). */
    label: { type: String, default: undefined },
    ...strataProps,
  },
  setup(props, { slots }) {
    return () => h("ul", { class: "ug-list", role: "list", "data-strata-face": "raised", "aria-label": props.label, ...strataAttributes(props) }, slots.default?.());
  },
});

export const ListItem = defineComponent({
  name: "StrataListItem",
  inheritAttrs: false,
  props: {
    primary: { type: String, default: undefined },
    secondary: { type: String, default: undefined },
    end: { type: String, default: undefined },
    /** A link row. */
    href: { type: String, default: undefined },
    /** A button row (without `href`); a click listener makes one too. */
    button: { type: Boolean, default: false },
    /** Marks the current row (`aria-current`) on a link row. */
    current: { type: [String, Boolean] as PropType<string | boolean>, default: undefined },
    disabled: { type: Boolean, default: false },
  },
  setup(props, { slots, attrs }) {
    return () => {
      const { onClick, class: className, style, ...rowAttrs } = attrs as Record<string, unknown>;
      const secondary = slots.secondary?.() ?? props.secondary;
      const end = slots.end?.() ?? props.end;
      const content = [
        slots.start && h("span", { class: "ug-list__start", "aria-hidden": "true" }, slots.start()),
        h("span", { class: "ug-list__text" }, [
          h("span", { class: "ug-list__primary" }, slots.default?.() ?? props.primary),
          secondary !== undefined && h("span", { class: "ug-list__secondary" }, secondary),
        ]),
        end !== undefined && h("span", { class: "ug-list__end" }, end),
      ];
      const action = props.href !== undefined
        ? h("a", { class: "ug-list__action", href: props.href, "aria-current": props.current === true ? "true" : props.current || undefined, onClick }, content)
        : props.button || onClick
          ? h("button", { class: "ug-list__action", type: "button", disabled: props.disabled || undefined, onClick }, content)
          : content;
      return h("li", { ...rowAttrs, class: ["ug-list__item", className], style }, action);
    };
  },
});
