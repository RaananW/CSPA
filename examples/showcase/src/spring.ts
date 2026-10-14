import type { CanvasController } from "@underglass/react";
import { keepInside, toTransform, type Pose, type Rect } from "./pose";

/** How a spring feels: `response` is its period in seconds, `bounce` 0 (no overshoot) to 0.85 (very springy). */
export interface SpringFeel { response: number; bounce: number }
interface Channel { value: number; velocity: number; target: number }
interface Body {
  rect: Rect;
  dx: Channel; dy: Channel; rotation: Channel; scale: Channel; opacity: Channel;
  /** Pointer-held bodies follow the pointer exactly; their velocity is measured, not simulated. */
  held?: { at: number };
  rest: boolean;
  arrive?: { within: number; from: { x: number; y: number }; done: () => void };
  done?: () => void;
}
const channel = (value: number): Channel => ({ value, velocity: 0, target: value });
const STEP = 1 / 240;

/**
 * Damped springs that drive layer transforms from JavaScript, one frame at a time.
 *
 * Every frame each moving body is integrated and written with `setTransform`: in
 * GPU mode that only updates the layer's matrix; in ordinary DOM it becomes a CSS
 * transform. Unlike a CSS transition, a spring keeps its velocity when its target
 * changes, can start from a gesture's release velocity, and tilts with its speed.
 * Poses stay inside the stage so no corner leaves the output canvas.
 */
export class Springs {
  private bodies = new Map<string, Body>();
  private frame: number | undefined;
  private last: number | undefined;
  private reduced = matchMedia("(prefers-reduced-motion: reduce)");
  constructor(private controller: CanvasController, private feel: () => SpringFeel, private tilt: () => boolean) {}

  /** Starts tracking a layer that is already presented at `pose`. */
  add(id: string, rect: Rect, pose: Pose) {
    this.bodies.set(id, { rect, dx: channel(pose.dx), dy: channel(pose.dy), rotation: channel(pose.rotation),
      scale: channel(pose.scale), opacity: channel(pose.opacity ?? 1), rest: true });
  }
  remove(id: string) { this.bodies.get(id)?.done?.(); this.bodies.delete(id); }
  pose(id: string): Pose | undefined {
    const body = this.bodies.get(id);
    return body && { dx: body.dx.value, dy: body.dy.value, rotation: body.rotation.value, scale: body.scale.value, opacity: body.opacity.value };
  }
  velocity(id: string) {
    const body = this.bodies.get(id);
    return { dx: body?.dx.velocity ?? 0, dy: body?.dy.velocity ?? 0 };
  }
  /** Retargets a body. Its current position and velocity carry over, so motion stays continuous. */
  to(id: string, pose: Partial<Pose>, done?: () => void) {
    const body = this.bodies.get(id);
    if (!body) return;
    if (pose.dx !== undefined) body.dx.target = pose.dx;
    if (pose.dy !== undefined) body.dy.target = pose.dy;
    if (pose.scale !== undefined) body.scale.target = pose.scale;
    if (pose.opacity !== undefined) body.opacity.target = pose.opacity;
    if (done) { body.done?.(); body.done = done; }
    body.rest = false;
    if (this.reduced.matches && !body.held) { this.snap(body); this.present(id, body); }
    else this.start();
  }
  /** Moves a body with the pointer, measuring the velocity a release will carry. */
  hold(id: string, dx: number, dy: number) {
    const body = this.bodies.get(id);
    if (!body) return;
    const now = performance.now() / 1000;
    if (body.held) {
      const elapsed = Math.max(now - body.held.at, 1 / 240);
      // Smoothed so a single jittery event does not dominate the fling.
      body.dx.velocity = body.dx.velocity * .6 + (dx - body.dx.value) / elapsed * .4;
      body.dy.velocity = body.dy.velocity * .6 + (dy - body.dy.value) / elapsed * .4;
    } else { body.dx.velocity = 0; body.dy.velocity = 0; }
    body.held = { at: now };
    body.dx.value = body.dx.target = dx;
    body.dy.value = body.dy.target = dy;
    body.scale.target = 1.06;
    body.rest = false;
    this.start();
  }
  /** Lets go of a held body; it keeps the measured velocity. */
  release(id: string) {
    const body = this.bodies.get(id);
    if (!body?.held) return { dx: 0, dy: 0 };
    // A pointer that stopped before release should not fling.
    if (performance.now() / 1000 - body.held.at > .08) { body.dx.velocity = 0; body.dy.velocity = 0; }
    body.held = undefined;
    body.scale.target = 1;
    return { dx: body.dx.velocity, dy: body.dy.velocity };
  }
  /**
   * Calls `done` when the body first reaches its target: within `within` px or past it (a fast
   * body can cross the target between two frames), before any overshoot settles.
   */
  arrived(id: string, done: () => void, within = 6) {
    const body = this.bodies.get(id);
    if (!body || body.rest) { done(); return; }
    body.arrive = { within, from: { x: body.dx.target - body.dx.value, y: body.dy.target - body.dy.value }, done };
  }
  moving() { return [...this.bodies.values()].some(body => !body.rest); }
  stop() {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.last = undefined;
  }
  dispose() { this.stop(); this.bodies.clear(); }

  private start() {
    if (this.frame === undefined) this.frame = requestAnimationFrame(time => this.tick(time));
  }
  private tick(time: number) {
    this.frame = undefined;
    // Hidden tabs pause rAF; never integrate a long gap in one jump.
    const elapsed = Math.min(this.last === undefined ? 1 / 60 : (time - this.last) / 1000, 1 / 20);
    this.last = time;
    const { response, bounce } = this.feel();
    const stiffness = (2 * Math.PI / response) ** 2, damping = 4 * Math.PI * (1 - bounce) / response;
    const tilt = this.tilt() && !this.reduced.matches;
    for (const [id, body] of this.bodies) {
      if (body.rest) continue;
      if (this.reduced.matches && !body.held) this.snap(body);
      else for (let left = elapsed; left > 1e-6; left -= STEP) {
        const dt = Math.min(STEP, left);
        if (!body.held) { this.integrate(body.dx, dt, stiffness, damping); this.integrate(body.dy, dt, stiffness, damping); }
        // The card leans into its horizontal speed, like a sheet of paper in air.
        body.rotation.target = tilt ? Math.max(-14, Math.min(14, body.dx.velocity * .012)) : 0;
        this.integrate(body.rotation, dt, stiffness * 2.2, damping * 1.5);
        this.integrate(body.scale, dt, stiffness * 1.6, damping * 1.3);
        this.integrate(body.opacity, dt, stiffness, damping * 1.4);
      }
      this.present(id, body);
      const left = { x: body.dx.target - body.dx.value, y: body.dy.target - body.dy.value };
      if (body.arrive && !body.held && (Math.hypot(left.x, left.y) < body.arrive.within || left.x * body.arrive.from.x + left.y * body.arrive.from.y <= 0)) {
        const { done } = body.arrive;
        body.arrive = undefined;
        done();
      }
      if (!body.held && [body.dx, body.dy, body.rotation].every(value => Math.abs(value.value - value.target) < .05 && Math.abs(value.velocity) < .5)
        && [body.scale, body.opacity].every(value => Math.abs(value.value - value.target) < .002 && Math.abs(value.velocity) < .01)) {
        this.snap(body);
        this.present(id, body);
      }
    }
    if (this.moving()) this.start();
    else this.last = undefined;
  }
  private integrate(value: Channel, dt: number, stiffness: number, damping: number) {
    value.velocity += (-stiffness * (value.value - value.target) - damping * value.velocity) * dt;
    value.value += value.velocity * dt;
  }
  private snap(body: Body) {
    for (const value of [body.dx, body.dy, body.rotation, body.scale, body.opacity]) { value.value = value.target; value.velocity = 0; }
    body.rotation.value = body.rotation.target = 0;
    body.rest = true;
    const done = body.done;
    body.done = undefined;
    done?.();
  }
  private present(id: string, body: Body) {
    const pose: Pose = { dx: body.dx.value, dy: body.dy.value, rotation: body.rotation.value,
      scale: Math.max(.05, body.scale.value), opacity: Math.min(1, Math.max(0, body.opacity.value)) };
    // A wall stops the spring instead of letting it push the layer out of the canvas. It bounds the
    // upright shape (with room for lean and lift): bounding the leaning shape would feed the lean
    // back into the position and pin the layer to the wall.
    const wall = keepInside(body.rect, { ...pose, rotation: 0, scale: 1 }, 16);
    if (Math.abs(wall.dx - pose.dx) > 1e-6) { body.dx.value = pose.dx = wall.dx; body.dx.velocity = 0; }
    if (Math.abs(wall.dy - pose.dy) > 1e-6) { body.dy.value = pose.dy = wall.dy; body.dy.velocity = 0; }
    try { this.controller.setTransform(id, toTransform(keepInside(body.rect, pose, 2))); }
    catch (error) { console.error(error); this.bodies.delete(id); }
  }
}
