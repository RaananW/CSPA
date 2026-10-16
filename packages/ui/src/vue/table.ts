/**
 * Table for Vue 3 (anatomy page `table.md`): a native `<table>` on one raised slab, from `columns` and `rows`.
 * Sorting is controlled (`v-model:sort`) or left to the component (`defaultSort`). A `cell` slot renders a cell's
 * content (`{ row, column }`); the value by default.
 */
import { defineComponent, h, ref, type PropType } from "vue";
import { ariaSort, nextSort, sortRows, type TableColumn, type TableRow, type TableSort } from "../shared/table.ts";
import { classes, strataAttributes, strataProps } from "./shared.ts";

export const Table = defineComponent({
  name: "StrataTable",
  props: {
    /** The table's name, rendered as its `<caption>`. */
    caption: { type: String, required: true },
    columns: { type: Array as PropType<TableColumn[]>, required: true },
    rows: { type: Array as PropType<TableRow[]>, required: true },
    /** The column whose value identifies a row; the first column by default. */
    rowKey: { type: String, default: undefined },
    /** Controlled order; use `v-model:sort`. */
    sort: { type: Object as PropType<TableSort>, default: undefined },
    /** Initial order when uncontrolled; the component sorts the rows. */
    defaultSort: { type: Object as PropType<TableSort>, default: undefined },
    ...strataProps,
  },
  emits: ["update:sort"],
  setup(props, { slots, emit }) {
    const own = ref(props.defaultSort);
    return () => {
      const order = props.sort ?? own.value;
      const key = props.rowKey ?? props.columns[0]?.key ?? "";
      const sortBy = (column: string) => {
        const next = nextSort(order, column);
        if (props.sort === undefined) own.value = next;
        emit("update:sort", next);
      };
      // A controlled table shows the rows in the order it is given; an uncontrolled one sorts them.
      const shown = props.sort === undefined ? sortRows(props.rows, own.value) : props.rows;
      return h("div", { class: "ug-table", "data-strata-face": "raised", ...strataAttributes(props) }, [
        h("table", { class: "ug-table__table" }, [
          h("caption", { class: "ug-table__caption" }, slots.caption?.() ?? props.caption),
          h("thead", null, [h("tr", null, props.columns.map(column => h("th", {
            key: column.key, class: classes("ug-table__header", column.numeric && "ug-table__header--numeric"), scope: "col", "aria-sort": ariaSort(order, column.key),
          }, column.sortable ? [h("button", { class: "ug-table__sort", type: "button", onClick: () => sortBy(column.key) }, column.header)] : column.header)))]),
          h("tbody", null, shown.map(row => h("tr", { key: String(row[key]), class: "ug-table__row" }, props.columns.map(column => h("td", {
            key: column.key, class: classes("ug-table__cell", column.numeric && "ug-table__cell--numeric"),
          }, slots.cell?.({ row, column }) ?? String(row[column.key] ?? "")))))),
        ]),
      ]);
    };
  },
});
