import type { CanvasController } from "@canvas-spa/react";
import type { taskTransitions } from "../apps/todo/transition";
import { TODO_DECORATION } from "../apps/todo/TodoApp";

export function todoProbe(controller: CanvasController, transitions: ReturnType<typeof taskTransitions>,
  commits: { count: number }, listeners: () => number, dispose: () => Promise<unknown>) {
  const state = () => ({ ...controller.state(), commits: { ...commits }, transition: transitions.state(), demoListeners: listeners() });
  return {
    state, controller: () => controller, dispose,
    async holdEffect(seconds: number) {
      const effect = controller.state().decorativeEffects.find(effect => effect.id === TODO_DECORATION);
      if (controller.state().mode !== "gpu" || !effect) throw new Error("Hold requires a real task-triggered GPU transition");
      transitions.stop(false);
      controller.setRipple(TODO_DECORATION, { amplitude: effect.amplitude, seconds, playing: false });
      await controller.settle();
      return state();
    },
    async advance(frames: number, milliseconds: number) {
      await controller.settle();
      const preparation = state();
      const interval = await controller.advance(frames, milliseconds);
      return { preparation, before: { ...interval.before, commits: preparation.commits },
        after: { ...interval.after, commits: { ...commits } } };
    },
  };
}
declare global { interface Window { todoProbe: ReturnType<typeof todoProbe> } }
