/**
 * TreeView (anatomy page `tree-view.md`), the WAI-ARIA Tree View pattern: a `role="tree"` of nested `treeitem`s, one
 * tab stop, the arrow keys, Home and End to move, open and close, and Enter, Space or a click to select. The keys are
 * decided by `strataTreeAction` from `@underglass/ui/dom` and applied to this component's state.
 */
import { forwardRef, useState, type HTMLAttributes, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { strataTreeAction, type StrataTreeAction } from "../dom/tree.ts";
import { strataTreeVisible, type StrataTreeNode } from "../shared/tree.ts";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

export interface TreeNode extends StrataTreeNode {
  label: ReactNode;
  children?: readonly TreeNode[];
}

export interface TreeViewProps extends Omit<HTMLAttributes<HTMLUListElement>, "onSelect" | "defaultValue">, StrataProps {
  /** The tree's name, such as "Files". */
  label: string;
  items: readonly TreeNode[];
  /** Controlled: the values of the open items. */
  expanded?: readonly string[];
  /** Initially open items when uncontrolled. */
  defaultExpanded?: readonly string[];
  onExpandedChange?: (expanded: string[]) => void;
  /** Controlled: the selected item's value. */
  selected?: string;
  /** Initial selection when uncontrolled. */
  defaultSelected?: string;
  onSelect?: (value: string) => void;
}

export const TreeView = forwardRef<HTMLUListElement, TreeViewProps>(function TreeView(
  { label, items, expanded, defaultExpanded = [], onExpandedChange, selected, defaultSelected, onSelect, size, material, level, className, ...rest }, ref,
) {
  const [ownExpanded, setOwnExpanded] = useState<readonly string[]>(defaultExpanded);
  const [ownSelected, setOwnSelected] = useState(defaultSelected);
  const [active, setActive] = useState<string | undefined>(undefined);
  const open = expanded ?? ownExpanded, current = selected ?? ownSelected;
  const shown = strataTreeVisible(items, open);
  const stop = active !== undefined && shown.includes(active) ? active : current !== undefined && shown.includes(current) ? current : shown[0];
  const apply = (action: StrataTreeAction) => {
    if (action.expand) {
      const value = action.expand.item.getAttribute("data-strata-value")!;
      const next = action.expand.open ? [...new Set([...open, value])] : open.filter(entry => entry !== value);
      if (expanded === undefined) setOwnExpanded(next);
      onExpandedChange?.(next);
    }
    if (action.select) {
      const value = action.select.getAttribute("data-strata-value")!;
      if (selected === undefined) setOwnSelected(value);
      onSelect?.(value);
    }
    const focus = action.focus ?? action.select ?? action.expand?.item;
    if (focus) { setActive(focus.getAttribute("data-strata-value")!); focus.focus(); }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const entry = event.target as HTMLElement;
    if (!entry.matches("[role='treeitem']") || event.altKey || event.ctrlKey || event.metaKey) return;
    const action = strataTreeAction(entry, event.key);
    if (!action) return;
    event.preventDefault();
    apply(action);
  };
  const onClick = (event: MouseEvent<HTMLUListElement>) => {
    const target = event.target as Element, row = target.closest(".ug-tree__row"), entry = row?.parentElement;
    if (!row || !entry?.matches("[role='treeitem']")) return;
    if (target.closest(".ug-tree__toggle")) apply({ expand: { item: entry, open: entry.getAttribute("aria-expanded") !== "true" } });
    else apply({ select: entry });
  };
  const render = (nodes: readonly TreeNode[]): ReactNode => nodes.map(node => {
    const parent = !!node.children?.length;
    return (
      <li key={node.value} className="ug-tree__item" role="treeitem" data-strata-value={node.value} aria-expanded={parent ? open.includes(node.value) : undefined}
        aria-selected={node.value === current} tabIndex={node.value === stop ? 0 : -1} onFocus={event => { if (event.target === event.currentTarget) setActive(node.value); }}>
        <span className="ug-tree__row">{parent && <span className="ug-tree__toggle" aria-hidden="true" />}<span className="ug-tree__label">{node.label}</span></span>
        {parent && <ul className="ug-tree__group" role="group">{render(node.children!)}</ul>}
      </li>
    );
  });
  return (
    <ul ref={ref} className={classes("ug-tree", className)} data-strata-face="raised" role="tree" aria-label={label}
      {...strataAttributes({ size, material, level })} {...rest} onKeyDown={onKeyDown} onClick={onClick}>
      {render(items)}
    </ul>
  );
});
