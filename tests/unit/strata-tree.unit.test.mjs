/** TreeView's shared data helper (`packages/ui/src/shared/tree.ts`, anatomy page `tree-view.md`). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { strataTreeVisible } from "../../packages/ui/src/shared/tree.ts";

const items = [{ value: "src", children: [{ value: "app", children: [{ value: "deep" }] }, { value: "ui" }] }, { value: "readme" }];

test("the shown items are the top level and the children of open items, in order", () => {
  assert.deepEqual(strataTreeVisible(items, []), ["src", "readme"]);
  assert.deepEqual(strataTreeVisible(items, ["src"]), ["src", "app", "ui", "readme"]);
  // An open item inside a closed one stays hidden.
  assert.deepEqual(strataTreeVisible(items, ["app"]), ["src", "readme"]);
  assert.deepEqual(strataTreeVisible(items, ["src", "app"]), ["src", "app", "deep", "ui", "readme"]);
});
