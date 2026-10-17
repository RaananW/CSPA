/** Combobox (anatomy page `combobox.md`): the suggestions and the list's id, shared by the bindings. */

/** A suggestion: a value, or a value with a label the browser shows beside it. */
export type ComboboxOption = string | { value: string; label?: string };

/** The suggestions as `{ value, label }`, in order. */
export function comboboxOptions(options: readonly ComboboxOption[]): { value: string; label?: string }[] {
  return options.map(option => typeof option === "string" ? { value: option } : option);
}

/** The `<datalist>`'s id: the input's id with `-options`. */
export function comboboxListId(id: string): string {
  return `${id}-options`;
}
