/** React helpers for the bindings, and the shared markup helpers. */
import type { Ref, RefCallback } from "react";

export { classes, strataAttributes } from "../shared/markup.ts";
export type { StrataLevel, StrataProps, StrataSize } from "../shared/markup.ts";

/** One callback ref that sets every given ref: a component's own, and the one forwarded to it. */
export function mergeRefs<T>(...refs: (Ref<T> | undefined)[]): RefCallback<T> {
  return value => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(value);
      else if (ref) (ref as { current: T | null }).current = value;
    }
  };
}
