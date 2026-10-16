/**
 * Chip for Vue 3 (anatomy page `chip.md`): a tag (a `<span>`), a filter chip (a `<button aria-pressed>`, with
 * `v-model:pressed` or `defaultPressed`) or a removable chip (with a `remove` listener, and a remove button named
 * "Remove {label}"). The label is the default slot.
 */
import { defineComponent, getCurrentInstance, h, ref } from "vue";
import { strataAttributes, strataProps } from "./shared.ts";

export const Chip = defineComponent({
  name: "StrataChip",
  props: {
    /** A filter chip: its state; use `v-model:pressed`. */
    pressed: { type: Boolean, default: undefined },
    /** A filter chip: initial state when uncontrolled. */
    defaultPressed: { type: Boolean, default: undefined },
    /** The remove button's name; "Remove" and the label by default. */
    removeLabel: { type: String, default: undefined },
    ...strataProps,
  },
  emits: { "update:pressed": (pressed: boolean) => typeof pressed === "boolean", remove: () => true },
  setup(props, { slots, emit }) {
    const own = ref(props.defaultPressed ?? false);
    // A declared event's listener is not in `attrs`: a chip is removable when its vnode has a `remove` listener.
    const instance = getCurrentInstance();
    return () => {
      const label = h("span", { class: "ug-chip__label" }, slots.default?.());
      const common = { class: "ug-chip", "data-strata-face": "raised", ...strataAttributes(props) };
      if (props.pressed !== undefined || props.defaultPressed !== undefined) {
        const current = props.pressed ?? own.value;
        return h("button", { ...common, type: "button", "aria-pressed": String(current), onClick: (event: MouseEvent) => {
          if (event.defaultPrevented) return;
          if (props.pressed === undefined) own.value = !current;
          emit("update:pressed", !current);
        } }, label);
      }
      const removable = !!instance?.vnode.props?.onRemove;
      const text = slots.default?.().map(node => (typeof node.children === "string" ? node.children : "")).join("") ?? "";
      return h("span", common, [label, removable && h("button", {
        class: "ug-chip__remove", type: "button", "aria-label": props.removeLabel ?? `Remove ${text}`.trim(), onClick: () => emit("remove"),
      })]);
    };
  },
});
