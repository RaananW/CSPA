/**
 * Table (anatomy page `table.md`): a native `<table>` on one raised slab, from `columns` and `rows`. Sorting is
 * controlled (`sort` and `onSortChange`) or left to the component (`defaultSort`).
 */
import { forwardRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { ariaSort, nextSort, sortRows, type TableColumn, type TableRow, type TableSort } from "../shared/table.ts";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

export type { SortDirection, TableColumn, TableRow, TableSort } from "../shared/table.ts";

export interface TableProps extends HTMLAttributes<HTMLDivElement>, StrataProps {
  /** The table's name, rendered as its `<caption>`. */
  caption: ReactNode;
  columns: TableColumn[];
  rows: TableRow[];
  /** The column whose value identifies a row (React keys); the first column by default. */
  rowKey?: string;
  /** Controlled order; pair it with `onSortChange`. */
  sort?: TableSort;
  /** Initial order when uncontrolled; the component sorts the rows. */
  defaultSort?: TableSort;
  onSortChange?: (sort: TableSort) => void;
  /** Renders a cell's content; the value by default. */
  renderCell?: (row: TableRow, column: TableColumn) => ReactNode;
}

export const Table = forwardRef<HTMLDivElement, TableProps>(function Table(
  { caption, columns, rows, rowKey, sort, defaultSort, onSortChange, renderCell, size, material, level, className, ...rest }, ref,
) {
  const [own, setOwn] = useState(defaultSort);
  const order = sort ?? own;
  const key = rowKey ?? columns[0]?.key ?? "";
  const sortBy = (column: string) => {
    const next = nextSort(order, column);
    if (sort === undefined) setOwn(next);
    onSortChange?.(next);
  };
  // A controlled table shows the rows in the order it is given; an uncontrolled one sorts them.
  const shown = sort === undefined ? sortRows(rows, own) : rows;
  return (
    <div ref={ref} className={classes("ug-table", className)} data-strata-face="raised" {...strataAttributes({ size, material, level })} {...rest}>
      <table className="ug-table__table">
        <caption className="ug-table__caption">{caption}</caption>
        <thead>
          <tr>
            {columns.map(column => (
              <th key={column.key} className={classes("ug-table__header", column.numeric && "ug-table__header--numeric")} scope="col" aria-sort={ariaSort(order, column.key)}>
                {column.sortable ? <button className="ug-table__sort" type="button" onClick={() => sortBy(column.key)}>{column.header}</button> : column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map(row => (
            <tr key={String(row[key])} className="ug-table__row">
              {columns.map(column => (
                <td key={column.key} className={classes("ug-table__cell", column.numeric && "ug-table__cell--numeric")}>{renderCell ? renderCell(row, column) : row[column.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
