/**
 * DatePicker for Vue 3 (anatomy page `date-picker.md`): a TextField that takes a date, a native
 * `<input type="date">`. Field-aware; supports `v-model` (a `YYYY-MM-DD` string) and also works uncontrolled. The
 * fallthrough attributes go to the `<input>`.
 */
import { defineComponent, h, mergeProps, ref } from "vue";
import { classes, strataAttributes, strataProps, useFieldControl } from "./shared.ts";

export const DatePicker = defineComponent({
  name: "StrataDatePicker",
  inheritAttrs: false,
  props: {
    modelValue: { type: String, default: undefined },
    invalid: { type: Boolean, default: false },
    ...strataProps,
  },
  emits: ["update:modelValue"],
  setup(props, { attrs, emit, expose }) {
    const field = useFieldControl();
    const input = ref<HTMLInputElement | null>(null);
    expose({ input });
    return () => {
      const { class: className, ...rest } = attrs;
      const native = mergeProps({
        ...field?.value, ...(props.invalid ? { "aria-invalid": "true" } : {}),
        ...(props.modelValue !== undefined ? { value: props.modelValue } : {}),
        onInput: (event: Event) => emit("update:modelValue", (event.target as HTMLInputElement).value),
        ref: input,
      }, rest);
      return h("input", { "data-strata-face": "well", ...strataAttributes(props), ...native, type: "date", class: classes("ug-text-field ug-date-picker", className as string) });
    };
  },
});
