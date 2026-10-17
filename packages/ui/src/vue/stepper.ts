/**
 * Stepper for Vue 3 (anatomy page `stepper.md`): where the user is in a task of ordered steps, as an `<ol>` whose
 * current step carries `aria-current="step"`. Steps before it are complete (a visually hidden status says so).
 */
import { defineComponent, h, type PropType } from "vue";
import { stepperFace } from "../shared/stepper.ts";
import { classes, strataAttributes, strataProps } from "./shared.ts";

export const Stepper = defineComponent({
  name: "StrataStepper",
  props: {
    /** The list's name, such as "Checkout progress". */
    label: { type: String, required: true },
    /** Each step's label, in order. */
    steps: { type: Array as PropType<readonly string[]>, required: true },
    /** The current step, from 0. */
    current: { type: Number, required: true },
    /** Read after a complete step's label; " (completed)" by default. */
    completedLabel: { type: String, default: " (completed)" },
    orientation: { type: String as PropType<"horizontal" | "vertical">, default: "horizontal" },
    ...strataProps,
  },
  setup(props) {
    return () => h("ol", { class: classes("ug-stepper", props.orientation === "vertical" && "ug-stepper--vertical"), "aria-label": props.label, ...strataAttributes(props) },
      props.steps.map((step, index) => h("li", { key: index, class: "ug-stepper__step", "aria-current": index === props.current ? "step" : undefined }, [
        index > 0 && h("span", { class: "ug-stepper__line", "data-strata-face": "groove", "aria-hidden": "true" }),
        h("span", { class: "ug-stepper__marker", "data-strata-face": stepperFace(index, props.current), "aria-hidden": "true" }, String(index + 1)),
        h("span", { class: "ug-stepper__label" }, [step, index < props.current && h("span", { class: "ug-stepper__status" }, props.completedLabel)]),
      ])));
  },
});
