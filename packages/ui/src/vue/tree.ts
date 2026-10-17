/**
 * TreeView for Vue 3 (anatomy page `tree-view.md`), the WAI-ARIA Tree View pattern: a `role="tree"` of nested
 * `treeitem`s, one tab stop, the arrow keys, Home and End to move, open and close, and Enter, Space or a click to
 * select. Use `v-model:expanded` and `v-model:selected` (or `defaultExpanded` and `defaultSelected`).
 */
import { defineComponent, h, ref, type PropType, type VNode } from "vue";
import { strataTreeAction, type StrataTreeAction } from "../dom/tree.ts";
import { strataTreeVisible } from "../shared/tree.ts";
import { strataAttributes, strataProps } from "./shared.ts";

export interface TreeNode {
  value: string;
  label: string;
  children?: readonly TreeNode[];
}

export const TreeView = defineComponent({
  name: "StrataTreeView",
  props: {
    /** The tree's name, such as "Files". */
    label: { type: String, required: true },
    items: { type: Array as PropType<readonly TreeNode[]>, required: true },
    /** The values of the open items; use `v-model:expanded`. */
    expanded: { type: Array as PropType<readonly string[]>, default: undefined },
    defaultExpanded: { type: Array as PropType<readonly string[]>, default: () => [] },
    /** The selected item's value; use `v-model:selected`. */
    selected: { type: String, default: undefined },
    defaultSelected: { type: String, default: undefined },
    ...strataProps,
  },
  emits: { "update:expanded": (expanded: string[]) => Array.isArray(expanded), "update:selected": (value: string) => typeof value === "string" },
  setup(props, { emit }) {
    const ownExpanded = ref<readonly string[]>(props.defaultExpanded), ownSelected = ref(props.defaultSelected), active = ref<string | undefined>(undefined);
    const apply = (action: StrataTreeAction) => {
      const open = props.expanded ?? ownExpanded.value;
      if (action.expand) {
        const value = action.expand.item.getAttribute("data-strata-value")!;
        const next = action.expand.open ? [...new Set([...open, value])] : open.filter(entry => entry !== value);
        if (props.expanded === undefined) ownExpanded.value = next;
        emit("update:expanded", next);
      }
      if (action.select) {
        const value = action.select.getAttribute("data-strata-value")!;
        if (props.selected === undefined) ownSelected.value = value;
        emit("update:selected", value);
      }
      const focus = action.focus ?? action.select ?? action.expand?.item;
      if (focus) { active.value = focus.getAttribute("data-strata-value")!; focus.focus(); }
    };
    const onKeydown = (event: KeyboardEvent) => {
      const entry = event.target as HTMLElement;
      if (!entry.matches("[role='treeitem']") || event.altKey || event.ctrlKey || event.metaKey) return;
      const action = strataTreeAction(entry, event.key);
      if (!action) return;
      event.preventDefault();
      apply(action);
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element, row = target.closest(".ug-tree__row"), entry = row?.parentElement;
      if (!row || !entry?.matches("[role='treeitem']")) return;
      if (target.closest(".ug-tree__toggle")) apply({ expand: { item: entry, open: entry.getAttribute("aria-expanded") !== "true" } });
      else apply({ select: entry });
    };
    return () => {
      const open = props.expanded ?? ownExpanded.value, current = props.selected ?? ownSelected.value;
      const shown = strataTreeVisible(props.items, open);
      const stop = active.value !== undefined && shown.includes(active.value) ? active.value : current !== undefined && shown.includes(current) ? current : shown[0];
      const render = (nodes: readonly TreeNode[]): VNode[] => nodes.map(node => {
        const parent = !!node.children?.length;
        return h("li", {
          key: node.value, class: "ug-tree__item", role: "treeitem", "data-strata-value": node.value, "aria-expanded": parent ? String(open.includes(node.value)) : undefined,
          "aria-selected": String(node.value === current), tabindex: node.value === stop ? "0" : "-1",
          onFocus: (event: FocusEvent) => { if (event.target === event.currentTarget) active.value = node.value; },
        }, [
          h("span", { class: "ug-tree__row" }, [parent && h("span", { class: "ug-tree__toggle", "aria-hidden": "true" }), h("span", { class: "ug-tree__label" }, node.label)]),
          parent && h("ul", { class: "ug-tree__group", role: "group" }, render(node.children!)),
        ]);
      });
      return h("ul", { class: "ug-tree", "data-strata-face": "raised", role: "tree", "aria-label": props.label, ...strataAttributes(props), onKeydown, onClick }, render(props.items));
    };
  },
});
