/**
 * Table sorting (anatomy page `table.md`), shared by the React and Vue bindings: the order a click on a column's sort
 * button gives, and rows sorted by it.
 */

export type SortDirection = "ascending" | "descending";

export interface TableSort {
  key: string;
  direction: SortDirection;
}

/** A Table column. */
export interface TableColumn {
  key: string;
  header: string;
  /** Aligned to the end, with tabular figures, and sorted by value. */
  numeric?: boolean;
  sortable?: boolean;
}

export type TableRow = Record<string, string | number>;

/** The order after a click on `key`'s sort button: the sorted column reverses; another column sorts ascending. */
export function nextSort(current: TableSort | undefined, key: string): TableSort {
  return current?.key === key ? { key, direction: current.direction === "ascending" ? "descending" : "ascending" } : { key, direction: "ascending" };
}

/** `rows` sorted by `sort` (a copy): numbers by value, text with `localeCompare`; equal rows keep their order. */
export function sortRows(rows: readonly TableRow[], sort: TableSort | undefined): TableRow[] {
  if (!sort) return [...rows];
  const sign = sort.direction === "ascending" ? 1 : -1;
  return rows.map((row, index) => ({ row, index })).sort((a, b) => {
    const x = a.row[sort.key], y = b.row[sort.key];
    const order = typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""), undefined, { numeric: true });
    return order * sign || a.index - b.index;
  }).map(({ row }) => row);
}

/** The `aria-sort` of a column under `sort`, or undefined when it is not the sorted column. */
export function ariaSort(sort: TableSort | undefined, key: string): SortDirection | undefined {
  return sort?.key === key ? sort.direction : undefined;
}
