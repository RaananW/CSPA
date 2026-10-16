/**
 * Button, IconButton, ToggleButton, ButtonGroup and Link for Vue 3 (anatomy pages `button.md`, `icon-button.md`,
 * `toggle-button.md`, `button-group.md`, `link.md`). Attributes and listeners fall through to the native element.
 * `aria-disabled` blocks activation and keeps the control focusable.
 */
import { defineComponent, h, ref, type PropType } from "vue";
import { classes, strataAttributes, strataProps } from "./shared.ts";

const blocked = (value: unknown) => value === true || value === "true";

/** Stops a click on an `aria-disabled` control before any listener sees it. */
const guard = (attrs: Record<string, unknown>) => (event: MouseEvent) => {
  if (blocked(attrs["aria-disabled"])) { event.preventDefault(); event.stopImmediatePropagation(); }
};

export const Button = defineComponent({
  name: "StrataButton",
  props: {
    variant: { type: String as PropType<"secondary" | "accent" | "danger">, default: "secondary" },
    type: { type: String as PropType<"button" | "submit" | "reset">, default: "button" },
    busy: { type: Boolean, default: false },
    ...strataProps,
  },
  setup(props, { attrs, slots }) {
    return () => h("button", {
      type: props.type,
      class: classes("ug-button", props.variant !== "secondary" && `ug-button--${props.variant}`),
      "data-strata-face": "raised",
      "aria-busy": props.busy ? "true" : undefined,
      ...strataAttributes(props),
      onClickCapture: guard(attrs),
    }, [
      slots.icon && h("span", { class: "ug-button__icon", "aria-hidden": "true" }, slots.icon()),
      h("span", { class: "ug-button__label" }, slots.default?.()),
    ]);
  },
});

export const IconButton = defineComponent({
  name: "StrataIconButton",
  props: {
    /** The accessible name; an icon-only button has no visible text. */
    label: { type: String, required: true },
    type: { type: String as PropType<"button" | "submit" | "reset">, default: "button" },
    ...strataProps,
  },
  setup(props, { attrs, slots }) {
    return () => h("button", {
      type: props.type, class: "ug-icon-button", "data-strata-face": "raised", "aria-label": props.label,
      ...strataAttributes(props), onClickCapture: guard(attrs),
    }, [h("span", { class: "ug-icon-button__icon", "aria-hidden": "true" }, slots.default?.())]);
  },
});

export const ToggleButton = defineComponent({
  name: "StrataToggleButton",
  props: {
    /** Controlled state; use `v-model:pressed`. */
    pressed: { type: Boolean, default: undefined },
    defaultPressed: { type: Boolean, default: false },
    type: { type: String as PropType<"button" | "submit" | "reset">, default: "button" },
    ...strataProps,
  },
  emits: { "update:pressed": (pressed: boolean) => typeof pressed === "boolean" },
  setup(props, { attrs, slots, emit }) {
    const own = ref(props.defaultPressed);
    return () => {
      const current = props.pressed ?? own.value;
      return h("button", {
        type: props.type, class: "ug-toggle-button", "data-strata-face": "raised", "aria-pressed": String(current),
        ...strataAttributes(props),
        onClickCapture: guard(attrs),
        onClick: (event: MouseEvent) => {
          if (event.defaultPrevented) return;
          if (props.pressed === undefined) own.value = !current;
          emit("update:pressed", !current);
        },
      }, [h("span", { class: "ug-toggle-button__label" }, slots.default?.())]);
    };
  },
});

export const ButtonGroup = defineComponent({
  name: "StrataButtonGroup",
  props: {
    /** The group's accessible name. */
    label: { type: String, required: true },
    orientation: { type: String as PropType<"horizontal" | "vertical">, default: "horizontal" },
    ...strataProps,
  },
  setup(props, { slots }) {
    return () => h("div", {
      class: classes("ug-button-group", props.orientation === "vertical" && "ug-button-group--vertical"),
      role: "group", "aria-label": props.label, "data-strata-face": "raised", ...strataAttributes(props),
    }, slots.default?.());
  },
});

export const Link = defineComponent({
  name: "StrataLink",
  props: {
    href: { type: String, required: true },
    /** A link that stands alone rather than inside a sentence: at least 24 by 24. */
    standalone: { type: Boolean, default: false },
  },
  setup(props, { slots }) {
    return () => h("a", { class: classes("ug-link", props.standalone && "ug-link--standalone"), href: props.href }, slots.default?.());
  },
});
