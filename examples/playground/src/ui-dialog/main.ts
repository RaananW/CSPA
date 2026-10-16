/**
 * Strata dialog check page (`ui-dialog.html`): plain markup from the Dialog and Drawer anatomy pages, with no
 * framework. `data-strata-open` and `data-strata-close` wire most of it through `attachStrata`; one dialog is opened
 * from script with `showStrataDialog`, and a native `<dialog>` with the same content sits beside them so the browser
 * test can compare accessibility snapshots. `window.dialogCheck` exposes what the test reads.
 */
import "@underglass/ui/css";
import { attachStrata, showStrataDialog } from "@underglass/ui/dom";

declare global { interface Window { dialogCheck: { reasons: string[]; backgroundClicks: number; focusTimes: number[] } } }

attachStrata();

const check = { reasons: [] as string[], backgroundClicks: 0, focusTimes: [] as number[] };
window.dialogCheck = check;

// A click that reaches the background is a bug in the modal behaviour.
document.getElementById("bg-button")!.addEventListener("click", () => { check.backgroundClicks++; });

// Time from the opening click to focus inside a panel: instant under reduced motion.
let clickedAt = 0;
document.addEventListener("click", () => { clickedAt = performance.now(); }, true);
document.addEventListener("focusin", event => {
  if ((event.target as Element).closest(".ug-dialog, .ug-drawer")) check.focusTimes.push(performance.now() - clickedAt);
});

// Opened from script: reports why it was asked to close, then closes; the scrim closes it too.
document.getElementById("open-api")!.addEventListener("click", () => {
  const handle = showStrataDialog(document.getElementById("api-dialog")!, {
    closeOnScrim: true,
    onClose: reason => { check.reasons.push(reason); void handle.close(); },
  });
});

document.getElementById("open-native")!.addEventListener("click", () => (document.getElementById("native") as HTMLDialogElement).showModal());
