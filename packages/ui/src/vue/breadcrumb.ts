/**
 * Breadcrumb for Vue 3 (anatomy page `breadcrumb.md`): a `<nav>` landmark around an ordered list of links. The last
 * item is the current page (`aria-current="page"`).
 */
import { defineComponent, h, type PropType } from "vue";

/** A breadcrumb item: a level of the site, and its address. */
export interface BreadcrumbItem {
  label: string;
  href: string;
}

export const Breadcrumb = defineComponent({
  name: "StrataBreadcrumb",
  props: {
    /** From the top level to the current page. */
    items: { type: Array as PropType<BreadcrumbItem[]>, required: true },
    /** The landmark's name; "Breadcrumb" by default. */
    label: { type: String, default: "Breadcrumb" },
  },
  setup(props) {
    return () => h("nav", { class: "ug-breadcrumb", "aria-label": props.label }, [
      h("ol", { class: "ug-breadcrumb__list" }, props.items.map((item, index) => h("li", { key: item.href, class: "ug-breadcrumb__item" }, [
        h("a", { class: "ug-link ug-breadcrumb__link", href: item.href, "aria-current": index === props.items.length - 1 ? "page" : undefined }, item.label),
      ]))),
    ]);
  },
});
