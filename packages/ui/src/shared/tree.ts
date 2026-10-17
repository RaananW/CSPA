/** TreeView (anatomy page `tree-view.md`): what the bindings share about the data. */

export interface StrataTreeNode {
  value: string;
  children?: readonly StrataTreeNode[];
}

/** The values of the items shown, in order, when the items in `open` are open. */
export function strataTreeVisible(nodes: readonly StrataTreeNode[], open: readonly string[]): string[] {
  return nodes.flatMap(node => [node.value, ...(node.children?.length && open.includes(node.value) ? strataTreeVisible(node.children, open) : [])]);
}

/** An item with a text label, as plain HTML and Astro render it. */
export interface StrataTreeTextNode extends StrataTreeNode {
  label: string;
  children?: readonly StrataTreeTextNode[];
}
