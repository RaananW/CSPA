/**
 * Pagination for Vue 3 (anatomy page `pagination.md`): a `<nav>` landmark around a row of page keys, links (`href`, a
 * function) or buttons (`v-model:page`). The current page is `aria-current="page"` and its key is held down.
 */
import { defineComponent, h, type PropType } from "vue";
import { pageItems } from "../shared/pagination.ts";
import { classes, strataAttributes, strataProps } from "./shared.ts";

export const Pagination = defineComponent({
  name: "StrataPagination",
  props: {
    /** The current page, from 1; use `v-model:page` for buttons. */
    page: { type: Number, required: true },
    count: { type: Number, required: true },
    /** Links: the address of each page. */
    href: { type: Function as PropType<(page: number) => string>, default: undefined },
    siblings: { type: Number, default: 1 },
    label: { type: String, default: "Pagination" },
    ...strataProps,
  },
  emits: { "update:page": (page: number) => typeof page === "number" },
  setup(props, { emit }) {
    const key = (target: number, name: string, content: string | null, extra: string | false, current = false, disabled = false) => {
      const common = { class: classes("ug-pagination__link", extra), "data-strata-face": "raised", "aria-label": name, "aria-current": current ? "page" : undefined };
      return props.href
        ? h("a", { ...common, href: disabled ? undefined : props.href(target), "aria-disabled": disabled ? "true" : undefined }, content ?? undefined)
        : h("button", { ...common, type: "button", disabled: disabled || undefined, onClick: () => emit("update:page", target) }, content ?? undefined);
    };
    return () => h("nav", { class: "ug-pagination", "aria-label": props.label, ...strataAttributes(props) }, [
      h("ul", { class: "ug-pagination__list" }, [
        h("li", { class: "ug-pagination__item" }, [key(props.page - 1, "Previous page", null, "ug-pagination__link--previous", false, props.page <= 1)]),
        ...pageItems(props.page, props.count, props.siblings).map((item, index) => item === "ellipsis"
          ? h("li", { key: `ellipsis-${index}`, class: "ug-pagination__item", "aria-hidden": "true" }, [h("span", { class: "ug-pagination__ellipsis" }, "…")])
          : h("li", { key: item, class: "ug-pagination__item" }, [key(item, `Page ${item}`, String(item), false, item === props.page)])),
        h("li", { class: "ug-pagination__item" }, [key(props.page + 1, "Next page", null, "ug-pagination__link--next", false, props.page >= props.count)]),
      ]),
    ]);
  },
});
