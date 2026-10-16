/**
 * Accordion and AccordionItem for Vue 3 (anatomy page `accordion.md`): native `<details>` sections, each a raised
 * slab with a `<summary>` header. `exclusive` (or a `name`) makes opening one section close the others, natively. An
 * item is uncontrolled with `defaultOpen`, or controlled with `v-model:open`, from the native `toggle` event.
 * Attributes and listeners fall through to each part's root element.
 */
import { computed, defineComponent, h, inject, provide, useId, type ComputedRef, type InjectionKey } from "vue";
import { classes, strataAttributes, strataProps } from "./shared.ts";

const accordionKey: InjectionKey<ComputedRef<{ name?: string }>> = Symbol("strata-accordion");

export const Accordion = defineComponent({
  name: "StrataAccordion",
  props: {
    /** Only one section open at a time: a generated `name` on every section. */
    exclusive: { type: Boolean, default: false },
    /** The sections' shared `name`, for an exclusive accordion with a name of your own. */
    name: { type: String, default: undefined },
    ...strataProps,
  },
  setup(props, { slots }) {
    const generated = useId().replace(/[^a-zA-Z0-9_-]/g, "");
    provide(accordionKey, computed(() => ({ name: props.name ?? (props.exclusive ? `accordion-${generated}` : undefined) })));
    return () => h("div", { class: "ug-accordion", ...strataAttributes(props) }, slots.default?.());
  },
});

export const AccordionItem = defineComponent({
  name: "StrataAccordionItem",
  props: {
    /** The header's text. */
    title: { type: String, required: true },
    /** Controlled open state; use `v-model:open`. */
    open: { type: Boolean, default: undefined },
    /** Initial open state when uncontrolled. */
    defaultOpen: { type: Boolean, default: undefined },
    ...strataProps,
  },
  emits: ["update:open"],
  setup(props, { slots, emit }) {
    const accordion = inject(accordionKey, undefined);
    // Uncontrolled: the first value only, so Vue never sets `open` again after the user toggles.
    const initial = props.defaultOpen;
    return () => h("details", {
      class: classes("ug-accordion__item"), "data-strata-face": "raised", name: accordion?.value.name, open: props.open ?? initial,
      onToggle: (event: Event) => emit("update:open", (event.currentTarget as HTMLDetailsElement).open),
      ...strataAttributes(props),
    }, [
      h("summary", { class: "ug-accordion__header" }, [
        h("span", { class: "ug-accordion__title" }, slots.title?.() ?? props.title),
        h("span", { class: "ug-accordion__chevron", "aria-hidden": "true" }),
      ]),
      h("div", { class: "ug-accordion__body" }, slots.default?.()),
    ]);
  },
});
