/**
 * Carousel for Vue 3 (anatomy page `carousel.md`), the WAI-ARIA Carousel pattern without rotation: each element of the
 * default slot is a slide, one shown at a time in a polite live region, stepped by Previous and Next (wrapping) or
 * picked by a key. Use `v-model:index` (or `defaultIndex`).
 */
import { Comment, Fragment, defineComponent, h, ref, type PropType, type VNode } from "vue";
import { strataSlideLabels } from "../shared/carousel.ts";
import { strataAttributes, strataProps } from "./shared.ts";

/** The slot's elements, with fragments (a `v-for`) flattened and comments left out. */
const flatten = (nodes: VNode[]): VNode[] => nodes.flatMap(node => (node.type === Fragment ? flatten(node.children as VNode[]) : node.type === Comment ? [] : [node]));

export const Carousel = defineComponent({
  name: "StrataCarousel",
  props: {
    /** The carousel's name, such as "Featured". */
    label: { type: String, required: true },
    /** The shown slide, from 0; use `v-model:index`. */
    index: { type: Number, default: undefined },
    defaultIndex: { type: Number, default: 0 },
    previousLabel: { type: String, default: "Previous slide" },
    nextLabel: { type: String, default: "Next slide" },
    pickerLabel: { type: String, default: "Slides" },
    slideLabel: { type: Function as PropType<(number: number, count: number) => string>, default: undefined },
    keyLabel: { type: Function as PropType<(number: number) => string>, default: undefined },
    ...strataProps,
  },
  emits: { "update:index": (index: number) => typeof index === "number" },
  setup(props, { slots, emit }) {
    const own = ref(props.defaultIndex);
    return () => {
      const slides = flatten(slots.default?.() ?? []), count = slides.length, current = props.index ?? own.value;
      const labels = strataSlideLabels(count, props.slideLabel, props.keyLabel);
      const show = (next: number) => { if (props.index === undefined) own.value = next; emit("update:index", next); };
      return h("section", { class: "ug-carousel", "aria-roledescription": "carousel", "aria-label": props.label, ...strataAttributes(props) }, [
        h("div", { class: "ug-carousel__slides", "aria-live": "polite" }, slides.map((slide, at) =>
          h("div", { key: at, class: "ug-carousel__slide", role: "group", "aria-roledescription": "slide", "aria-label": labels.slides[at], hidden: at !== current || undefined }, [slide]))),
        h("div", { class: "ug-carousel__controls" }, [
          h("button", { type: "button", class: "ug-icon-button ug-carousel__previous", "data-strata-face": "raised", "aria-label": props.previousLabel, onClick: () => show((current - 1 + count) % count) },
            [h("span", { class: "ug-icon-button__icon", "aria-hidden": "true" }, slots.previousIcon?.())]),
          h("div", { class: "ug-carousel__picker", role: "group", "aria-label": props.pickerLabel }, labels.keys.map((name, at) =>
            h("button", { key: at, type: "button", class: "ug-carousel__key", "data-strata-face": "raised", "aria-label": name, "aria-current": at === current ? "true" : undefined, onClick: () => show(at) }))),
          h("button", { type: "button", class: "ug-icon-button ug-carousel__next", "data-strata-face": "raised", "aria-label": props.nextLabel, onClick: () => show((current + 1) % count) },
            [h("span", { class: "ug-icon-button__icon", "aria-hidden": "true" }, slots.nextIcon?.())]),
        ]),
      ]);
    };
  },
});
