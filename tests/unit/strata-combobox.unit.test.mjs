/** Combobox's shared suggestions and list id (`packages/ui/src/shared/combobox.ts`, anatomy page `combobox.md`). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { comboboxListId, comboboxOptions } from "../../packages/ui/src/shared/combobox.ts";

test("suggestions are values, or values with a label, in order", () => {
  assert.deepEqual(comboboxOptions(["Apple", { value: "Banana", label: "Yellow" }, { value: "Cherry" }]),
    [{ value: "Apple" }, { value: "Banana", label: "Yellow" }, { value: "Cherry" }]);
  assert.deepEqual(comboboxOptions([]), []);
});

test("the list's id is the input's id with -options", () => {
  assert.equal(comboboxListId("fruit"), "fruit-options");
});
