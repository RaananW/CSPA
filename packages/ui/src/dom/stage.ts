/**
 * The stage hook between top-level overlays and a GPU presentation. A root that presents Strata panels on the GPU
 * (the Underglass root, with `@underglass/ui/gpu` attached) carries a presenter under a registered symbol, so this
 * module and the GPU helper agree on it even when they come from separate bundles.
 *
 * A dialog's panel and scrim appear and disappear by script. The presenter takes them on before they show and lets
 * them go before they hide, in the same task: a GPU layer must never be hidden or removed while it is presented.
 */
export const strataStage = Symbol.for("underglass.strata.stage");

export interface StagePresenter {
  /** Starts presenting a shown root child (a panel or a scrim) now. */
  present(element: HTMLElement): void;
  /** Stops presenting a root child now, before it is hidden or removed. */
  withdraw(element: HTMLElement): void;
}

/** The presenter of the root `element` is a child of, if that root has one. */
export function stageOf(element: HTMLElement): StagePresenter | undefined {
  return (element.parentElement as (HTMLElement & { [strataStage]?: StagePresenter }) | null)?.[strataStage];
}
