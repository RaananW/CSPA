/**
 * Combobox for Vue 3 (anatomy page `combobox.md`): a TextField with the browser's own suggestion list, a native
 * `<input list>` and its `<datalist>`. Field-aware; supports `v-model` and also works uncontrolled. The fallthrough
 * attributes go to the `<input>`.
 */
import { Fragment, defineComponent, h, mergeProps, ref, useId, type PropType } from "vue";
import { comboboxListId, comboboxOptions, type ComboboxOption } from "../shared/combobox.ts";
import { classes, strataAttributes, strataProps, useFieldControl } from "./shared.ts";

export type { ComboboxOption } from "../shared/combobox.ts";

export const Combobox = defineComponent({
  name: "StrataCombobox",
  inheritAttrs: false,
  props: {
    /** The suggestions, in order: a value, or `{ value, label }`. Any other text may still be typed. */
    options: { type: Array as PropType<readonly ComboboxOption[]>, required: true },
    modelValue: { type: String, default: undefined },
    invalid: { type: Boolean, default: false },
    ...strataProps,
  },
  emits: ["update:modelValue"],
  setup(props, { attrs, emit, expose }) {
    const field = useFieldControl();
    const generated = (useId() ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
    const input = ref<HTMLInputElement | null>(null);
    expose({ input });
    return () => {
      const { class: className, ...rest } = attrs;
      // The datalist needs an id: the input's own, the Field's, or a generated one.
      const id = (rest.id as string | undefined) ?? field?.value.id ?? `combobox-${generated}`;
      const listId = comboboxListId(id);
      const native = mergeProps({
        ...field?.value, ...(props.invalid ? { "aria-invalid": "true" } : {}),
        ...(props.modelValue !== undefined ? { value: props.modelValue } : {}),
        onInput: (event: Event) => emit("update:modelValue", (event.target as HTMLInputElement).value),
        ref: input,
      }, rest);
      return h(Fragment, [
        h("input", {
          "data-strata-face": "well", type: "text", autocomplete: "off", ...strataAttributes(props), ...native,
          id, list: listId, class: classes("ug-text-field ug-combobox", className as string),
        }),
        h("datalist", { id: listId }, comboboxOptions(props.options).map(option => h("option", { key: option.value, value: option.value }, option.label))),
      ]);
    };
  },
});
