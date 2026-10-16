/**
 * Skeleton for Vue 3 (anatomy page `skeleton.md`): flat placeholders, hidden from assistive technology, that hold the
 * place of loading content. Put `aria-busy` and a status on the region that is loading.
 */
import { defineComponent, h, type PropType } from "vue";

const length = (value: string | number | undefined) => (typeof value === "number" ? `${value}px` : value);

export const Skeleton = defineComponent({
  name: "StrataSkeleton",
  props: {
    /** `text` (default): lines of text; `circle`: an avatar; `rect`: an image or a block. */
    shape: { type: String as PropType<"text" | "circle" | "rect">, default: "text" },
    /** Text lines; one by default. */
    lines: { type: Number, default: 1 },
    width: { type: [String, Number], default: undefined },
    height: { type: [String, Number], default: undefined },
  },
  setup(props) {
    return () => {
      const style = props.width !== undefined || props.height !== undefined ? { width: length(props.width), height: length(props.height) } : undefined;
      if (props.shape === "text" && props.lines > 1) {
        return h("span", { class: "ug-skeleton-text", "aria-hidden": "true", style },
          Array.from({ length: props.lines }, () => h("span", { class: "ug-skeleton ug-skeleton--text" })));
      }
      return h("span", { class: `ug-skeleton ug-skeleton--${props.shape}`, "aria-hidden": "true", style });
    };
  },
});
