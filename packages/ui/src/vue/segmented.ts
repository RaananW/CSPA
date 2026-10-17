/**
 * SegmentedControl for Vue 3 (anatomy page `segmented-control.md`): native radios in a `<fieldset>` named by its
 * `<legend>`, each visually hidden over its key on one plinth. Use `v-model` (or `defaultValue`); arrow keys, Tab and
 * Space stay native.
 */
import { defineComponent, h, useId, type PropType } from "vue";
import { classes, strataAttributes, strataProps } from "./shared.ts";

export interface SegmentedOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export const SegmentedControl = defineComponent({
  name: "StrataSegmentedControl",
  props: {
    /** Names the group, as the `<legend>`. */
    label: { type: String, required: true },
    /** Hides the legend visually; it still names the group. */
    hideLabel: { type: Boolean, default: false },
    /** Two to five short options. */
    options: { type: Array as PropType<readonly SegmentedOption[]>, required: true },
    /** The radios' shared `name`; generated when absent. */
    name: { type: String, default: undefined },
    /** The selection; use `v-model`. */
    modelValue: { type: String, default: undefined },
    /** Initial selection when uncontrolled. */
    defaultValue: { type: String, default: undefined },
    ...strataProps,
  },
  emits: { "update:modelValue": (value: string) => typeof value === "string" },
  setup(props, { emit }) {
    const generated = (useId() ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
    return () => {
      const name = props.name ?? `segmented-${generated}`;
      return h("fieldset", { class: "ug-segmented", ...strataAttributes(props) }, [
        h("legend", { class: classes("ug-segmented__legend", props.hideLabel && "ug-segmented__legend--hidden") }, props.label),
        h("div", { class: "ug-segmented__plinth" }, props.options.map(option => h("label", { key: option.value, class: "ug-segmented__item" }, [
          h("input", {
            class: "ug-segmented__input", type: "radio", name, value: option.value, disabled: option.disabled || undefined,
            // Controlled: the checked property. Uncontrolled: the checked attribute (the default selection), as in HTML.
            ...(props.modelValue !== undefined ? { checked: props.modelValue === option.value } : props.defaultValue === option.value ? { "^checked": "" } : {}),
            onChange: (event: Event) => { if ((event.target as HTMLInputElement).checked) emit("update:modelValue", option.value); },
          }),
          h("span", { class: "ug-segmented__key", "data-strata-face": "raised" }, option.label),
        ]))),
      ]);
    };
  },
});
