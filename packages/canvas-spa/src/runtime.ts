import { affine, cssMatrix, point, type Transform } from "./affine.js";
import { createSurfaceRenderer, type SurfaceRendererOptions } from "./renderer.js";
import type { Layout } from "./compiler.js";
import type { MountBoundaryOptions } from "./mount-boundary.js";
import { DeclarationOwnership, prepareAnimation, rejectImportantPresentation, type AnimationPlayback } from "./animation.js";
import { validateCSSSource, type CSSAnimationSource } from "./css-animation.js";
import { decorative, validateRipple, type Ripple } from "./ripple.js";
import { effectNumber, validateEffects, type EffectDescriptor, type EffectHandle, type EffectResult } from "./effects.js";
import { compileMotion, type CoordinatedMotion, type MotionDescriptor, type MotionHandle, type TransitionHandle, type TransitionResult } from "./motion.js";
import { EnrollmentError, type EnrollmentOptions } from "./enrollment.js";
import { nativeEditingControl, nativeScrollKind } from "./native.js";
import { scrollOrigin, intersectViewport, localViewport, canvasContentOrigin, viewportContains, type ViewportRect } from "./viewport.js";
import { validateCompiledPrograms, verifyCompiledAnimation, type CompiledAnimation } from "./compiled.js";

/** `"automatic"` is accepted for compatibility and behaves like `"explicit"`: initial and diagnosed reentry both require `enable()`. */
export type AdmissionPolicy = "explicit" | "automatic";

const presentationProperties = new Set(["transform", "opacity", "translate", "rotate", "scale", "transform-origin", "transformOrigin", "all"]);
/** Whether an animation drives a property that GPU presentation owns exclusively on the enrolled boundary. */
function animatesPresentation(animation: Animation) {
  if (typeof CSSTransition !== "undefined" && animation instanceof CSSTransition) return presentationProperties.has(animation.transitionProperty);
  const effect = animation.effect;
  if (!(effect instanceof KeyframeEffect)) return true;
  return effect.getKeyframes().some(frame => Object.keys(frame).some(key => presentationProperties.has(key)));
}

export interface LayerDefinition {
  id: string;
  element: HTMLElement;
  layout: Layout;
  transform: Transform;
  preserveStyles?: boolean;
  decorative?: boolean;
}
export interface RuntimeOptions extends Omit<MountBoundaryOptions, "mount"> {
  overlayHost?: HTMLElement;
  budgets?: SurfaceRendererOptions["budgets"];
  compiled?: SurfaceRendererOptions["compiled"];
  /** Serialized JSON status; prefer `onStatusChange` for a structured value. */
  onStatus?(message: string): void;
  onStatusChange?: SurfaceRendererOptions["onStatusChange"];
  onMeasure?: SurfaceRendererOptions["onMeasure"];
  admissionPolicy?: AdmissionPolicy;
  mount(container: HTMLDivElement, runtime: CanvasRuntime): () => void;
}

export class CanvasRuntime {
  private core: ReturnType<typeof createSurfaceRenderer> | undefined;
  private readonly registry = new Map<string, LayerDefinition>();
  private readonly removers: (() => void)[] = [];
  private readonly mutation: MutationObserver;
  private readonly resize: ResizeObserver;
  private readonly reduced = matchMedia("(prefers-reduced-motion: reduce)");
  private readonly forced = matchMedia("(forced-colors: active)");
  private drawFrame = 0;
  private motionFrame: { id: number; reject(error: Error): void } | undefined;
  private readonly visibilityWaiters = new Set<{ resolve(): void; reject(error: Error): void }>();
  private stopped = false;
  private disposalRequested = false;
  private moving = false;
  private revision = 0;
  private membershipCommitPending = false;
  private admittedSize = "";
  private admissionIntent: "disabled" | "enabled" | "blocked" = "disabled";
  private readmissionPending = false;
  private admissionEpoch = 0;
  private automaticAttempts = 0;
  private admissionReason = "Explicit enable required";
  private rootContainer: HTMLElement | undefined;
  private releaseDPR: (() => void) | undefined;
  private readonly gpuDeclarations = new Map<string, DeclarationOwnership>();
  private readonly relinquishedDeclarations = new Map<string, ReturnType<DeclarationOwnership["restore"]>>();
  private readonly ownership = new Map<string, { lease: ReturnType<typeof prepareAnimation>; base: Transform; compiled?: CompiledAnimation; check?(): void; restore?(): void; resources?(): number }>();
  private readonly motions = new Map<string, { source: Animation; handle: MotionHandle }>();
  private readonly transitions = new Map<string, { finish(status: TransitionResult["status"], reason: string, transferred?: boolean): void; pause(): void; resume(): void; lease: DeclarationOwnership; start: number; end: number }>();
  private clockFrame = 0;
  private clockTime: number | undefined;
  private readonly effects = new Map<string, { values: EffectDescriptor[]; finish(result: EffectResult): void }>();
  /** Last React-supplied transform per Surface, and one supplied while motion owned the layer. */
  private readonly reactTransforms = new Map<string, Transform>();
  private readonly deferredTransforms = new Map<string, Transform>();
  private reconcileQueued = false;
  private readonly environment = { visible: !document.hidden, reducedMotion: this.reduced.matches, forcedColors: this.forced.matches };
  private readonly resources = { mutationObservers: 1, resizeObservers: 1, environmentListeners: 0, controllerFrames: 0, visibilityWaiters: 0, enrolledLayers: 0, animationOwners: 0, decorativeEffects: 0, nativeMotions: 0, declarativeMotions: 0, readmissionFrames: 0 };

  constructor(private readonly options: RuntimeOptions) {
    if (options.admissionPolicy !== undefined && options.admissionPolicy !== "explicit" && options.admissionPolicy !== "automatic") {
      throw new Error("Admission policy must be explicit or automatic");
    }
    if (options.overlayHost && (!options.overlayHost.isConnected
      || options.overlayHost.ownerDocument !== options.ordinaryHost.ownerDocument
      || options.overlayHost.parentElement !== options.ordinaryHost.parentElement
      || [options.captureHost, options.outputCanvas, options.ordinaryHost].includes(options.overlayHost)
      || options.overlayHost.childNodes.length)) throw new Error("Overlay must be an empty connected adapter-owned sibling outside the root");
    const budget = options.budgets;
    if (options.compiled) {
      validateCompiledPrograms(options.compiled);
      if (budget && budget.layers > options.compiled.programs.length) throw new Error("Insufficient compiled layer capacity");
    }
    if (budget && (!Number.isInteger(budget.layers) || budget.layers < 1 || budget.layers > 8
      || !Number.isInteger(budget.pixels) || budget.pixels < 1)) throw new Error("Invalid layer/pixel budgets; layer limit is 1..8");
    this.mutation = new MutationObserver(records => {
      if (this.stopped) return;
      this.invalidatePolicy();
      for (const record of records) {
        const target = record.target instanceof Element ? record.target : record.target.parentElement;
        if (target && this.rootContainer?.contains(target)) this.core?.invalidate(target);
      }
      this.requestReconcile();
      this.checkPolicy();
    });
    this.resize = new ResizeObserver(() => {
      if (this.stopped || !this.core) return;
      this.invalidatePolicy();
      this.reconcile();
      this.checkPolicy();
    });
    try {
      this.core = createSurfaceRenderer({
        ...options,
        mount: container => {
          this.rootContainer = container;
          Object.assign(container.style, { position: "relative", width: "100%", height: "100%" });
          return options.mount(container, this);
        },
        layers: () => this.ordered().map(layer => ({
          id: layer.id, element: layer.element,
          matrix: () => new DOMMatrix(Array.from(affine(layer.transform, this.origin(layer)))),
          clip: matrix => this.viewportClip(layer, matrix),
          opacity: () => layer.transform.opacity ?? 1,
          effects: () => this.effects.get(layer.id)?.values ?? [],
          effectsEnabled: () => !this.reduced.matches,
          compiledMotion: () => {
            const owner = this.ownership.get(layer.id);
            return owner?.compiled ? { index: options.compiled!.animations.indexOf(owner.compiled),
              phase: owner.compiled.normalizeTime(owner.lease.playback.state().milliseconds), origin: this.origin(layer) } : undefined;
          },
        })),
        size: () => this.size(),
        nativeOrigin: () => this.ownerContentOrigin,
        policy: () => this.policy(),
        presentation: mode => {
          if (mode === "dom") this.cancelTransitions("DOM recovery");
          this.cancelMotion();
          this.presentation(mode, true);
          if (mode === "gpu") this.admittedSize = this.sizeSignature();
        },
        isPaused: () => !this.environment.visible,
        isMoving: () => this.moving,
        onInterrupt: () => this.cancelMotion(),
        onRecovery: reason => this.recovered(reason),
      });
    } catch (error) {
      this.mutation.disconnect();
      this.resize.disconnect();
      this.resources.mutationObservers = this.resources.resizeObservers = 0;
      throw error;
    }
    this.mutation.observe(this.core.container, { subtree: true, attributes: true, characterData: true, childList: true });
    this.resize.observe(options.ordinaryHost.parentElement!);
    for (const layer of this.registry.values()) this.resize.observe(layer.element);
    this.listen(document, "visibilitychange", () => {
      this.environment.visible = !document.hidden;
      if (!this.environment.visible) this.cancelReadmissionFrame();
      if (!this.environment.visible && this.drawFrame) {
        cancelAnimationFrame(this.drawFrame);
        this.drawFrame = 0;
        this.resources.controllerFrames--;
      }
      if (!this.environment.visible) this.core?.pause();
      if (!this.environment.visible) this.stopClock();
      // Hidden documents pause declarative motion; returning resumes it from the same progress.
      if (!this.environment.visible) for (const transition of this.transitions.values()) transition.pause();
      if (this.environment.visible) {
        for (const waiter of this.visibilityWaiters) waiter.resolve();
        this.visibilityWaiters.clear();
        this.resources.visibilityWaiters = 0;
        this.invalidatePolicy();
        this.core?.resume();
        for (const transition of [...this.transitions.values()]) transition.resume();
        this.requestDraw();
        this.startClock();
        this.scheduleReadmission();
      }
    });
    this.listen(this.reduced, "change", () => {
      this.environment.reducedMotion = this.reduced.matches;
      if (this.reduced.matches) this.cancelReadmissionFrame();
      if (this.reduced.matches) this.cancelMotion();
      if (this.reduced.matches) for (const transition of [...this.transitions.values()]) {
        try { transition.finish("completed", "Reduced motion"); }
        catch (error) { transition.finish("cancelled", String(error)); this.recover(`Reduced-motion completion failed: ${String(error)}`); }
      }
      if (this.reduced.matches) {
        for (const owner of this.ownership.values()) owner.lease.playback.pause();
        for (const effect of this.effects.values()) for (const value of effect.values) value.time.playing = false;
      }
      this.requestDraw();
      this.scheduleReadmission();
    });
    this.listen(this.forced, "change", () => {
      this.environment.forcedColors = this.forced.matches;
      this.core?.invalidate();
      this.requestDraw();
    });
    this.listen(window, "resize", () => {
      this.invalidatePolicy();
      this.reconcile();
    });
    // Structural policy is cached; these events can change its inputs without a DOM mutation.
    for (const type of ["animationstart", "animationcancel", "animationend", "transitionrun", "transitioncancel", "transitionend", "input", "focusin", "focusout"]) {
      this.listen(this.core.container, type, () => this.invalidatePolicy(), true);
    }
    this.listen(this.core.container, "scroll", event => { this.invalidatePolicy(); this.nativeScroll(event); }, true);
    this.listen(document, "scroll", event => {
      this.invalidatePolicy();
      const target = event.target;
      if (this.core?.phase() === "gpu" && (target === document
        || target === this.options.outputCanvas || target instanceof HTMLElement && this.externalAncestors.has(target))) {
        this.reconcileProjection();
      }
    }, true);
    for (const type of ["compositionstart", "compositionupdate", "compositionend"]) {
      this.listen(this.core.container, type, event => this.nativeComposition(event));
    }
    this.watchDPR();
    this.removers.push(() => this.releaseDPR?.());
  }

  private nativeEventLayer(event: Event) {
    const target = event.target;
    if (!(target instanceof Element) || !target.isConnected || !this.core?.container.contains(target)) return;
    const layer = [...this.registry.values()].find(layer => layer.element.isConnected
      && layer.element.hasAttribute("drawable") && layer.element.contains(target));
    return layer ? { target, layer } : undefined;
  }
  private nativeScroll(event: Event) {
    if (this.stopped || this.core?.phase() !== "gpu" && this.core?.phase() !== "admitting") return;
    const source = this.nativeEventLayer(event);
    if (!source) {
      if (event.target === this.rootContainer || event.target instanceof HTMLElement
        && [...this.registry.values()].some(layer => event.target instanceof HTMLElement && event.target.contains(layer.element))) {
        this.reconcile();
        this.core?.invalidate();
        return;
      }
      this.recover("Scroll target is outside the bounded adapter-owned viewport contract");
      return;
    }
    const kind = nativeScrollKind(source.target, source.layer.element);
    if (kind === "enrolled-viewport") {
      this.reconcile();
      this.core?.invalidate(source.target);
      return;
    }
    // A descendant viewport changes native contents/hits, not the enrolled boundary's transform.
    this.checkPolicy();
    this.core?.invalidate(source.target);
  }
  private nativeComposition(event: Event) {
    if (this.stopped || this.core?.phase() !== "gpu" && this.core?.phase() !== "admitting") return;
    const source = this.nativeEventLayer(event);
    if (!source || !nativeEditingControl(source.target)) {
      this.recover("Native composition target is outside the enrolled input/textarea editing contract");
      return;
    }
    this.checkPolicy();
    this.core?.invalidate(source.target);
  }
  get overlayHost() { return this.options.overlayHost; }
  get container() { return this.renderer().container; }
  private renderer() {
    if (!this.core) throw new Error("Runtime mount has not completed");
    return this.core;
  }
  private assertLive() { if (this.stopped || this.core?.phase() === "disposed") throw new Error("Runtime is disposed"); }
  private size() {
    const frame = this.options.ordinaryHost.parentElement!;
    return { width: frame.clientWidth, height: frame.clientHeight, dpr: window.devicePixelRatio };
  }
  private sizeSignature() {
    return JSON.stringify({ ...this.size(), revision: this.revision,
      layers: this.ordered().map(layer => [layer.id, layer.element.offsetWidth, layer.element.offsetHeight, this.origin(layer)]) });
  }
  private ordered() {
    return [...this.registry.values()].sort((a, b) =>
      a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
  }
  private origin(layer: LayerDefinition) {
    return this.viewportGeometry.get(layer.element)?.origin ?? scrollOrigin(layer.element, this.rootContainer!);
  }
  private externalAncestors = new Set<HTMLElement>();
  private ownerContentOrigin = { x: 0, y: 0 };
  private reconcileProjection() {
    if (this.stopped || this.core?.phase() !== "gpu") return;
    try {
      this.refreshViewportGeometry();
      this.core.draw();
    } catch (error) {
      console.error("CanvasSPA viewport projection failed", error);
      this.recover(`Native/GPU viewport projection failed: ${String(error)}`);
    }
  }
  private viewportGeometry = new WeakMap<HTMLElement, { origin: { x: number; y: number }; extent: { width: number; height: number }; clip?: ViewportRect; own?: ViewportRect; error?: string }>();
  private viewportAncestors = new Set<HTMLElement>();
  private refreshViewportGeometry() {
    const ancestors = new Set<HTMLElement>();
    const external = new Set<HTMLElement>();
    const owner = this.options.outputCanvas;
    const ownerStyle = getComputedStyle(owner);
    this.ownerContentOrigin = canvasContentOrigin(owner, ownerStyle);
    let externalError: string | undefined;
    for (let node: HTMLElement | null = owner; node; node = node.parentElement) {
      ancestors.add(node);
      if (node !== owner) external.add(node);
      const style = getComputedStyle(node);
      if (style.transform !== "none" || style.rotate !== "none" || style.scale !== "none" || style.translate !== "none") {
        externalError = "Transformed external viewport ancestors are outside the axis-aligned framework contract";
      }
      if (style.direction !== "ltr" || style.writingMode !== "horizontal-tb" || Number(style.zoom) !== 1) {
        externalError = "RTL, writing mode or zoom is outside the bounded external viewport contract";
      }
      if ((style.overflowX === "visible") !== (style.overflowY === "visible")) {
        externalError = "Single-axis visible/clip external overflow is outside the bounded rectangular viewport contract";
      }
    }
    if ([...external].some(node => !this.externalAncestors.has(node))
      || [...this.externalAncestors].some(node => !external.has(node))) {
      this.mutation.disconnect();
      this.mutation.observe(this.core!.container, { subtree: true, attributes: true, characterData: true, childList: true });
      for (const node of external) this.mutation.observe(node, { attributes: true, attributeFilter: ["style", "class"] });
      this.mutation.observe(owner, { attributes: true, attributeFilter: ["style", "class"] });
    }
    this.externalAncestors = external;
    for (const layer of this.registry.values()) {
      const origin = scrollOrigin(layer.element, this.rootContainer!);
      let clip: ViewportRect | undefined, own: ViewportRect | undefined, error = externalError;
      for (let node: HTMLElement | null = layer.element; node; node = node.parentElement) {
        if (node !== layer.element) ancestors.add(node);
        const style = getComputedStyle(node);
        if ((style.overflowX === "visible") !== (style.overflowY === "visible")) {
          error = "Single-axis visible/clip overflow is outside the bounded rectangular viewport contract";
        }
        if (node !== layer.element && (style.transform !== "none" || style.rotate !== "none" || style.scale !== "none" || style.translate !== "none")) {
          error = "Transformed viewport ancestors are outside the axis-aligned framework contract";
        }
        if (style.overflowX !== "visible" || style.overflowY !== "visible") {
          const at = node === layer.element ? origin : node === this.rootContainer
            ? { x: 0, y: 0 } : scrollOrigin(node, this.rootContainer!);
          const rect = { x: at.x + node.clientLeft, y: at.y + node.clientTop,
            width: node.clientWidth, height: node.clientHeight };
          if (node === layer.element) own = { x: 0, y: 0, width: node.offsetWidth, height: node.offsetHeight };
          else clip = clip ? intersectViewport(clip, rect) : rect;
        }
        if (node === this.rootContainer) break;
      }
      this.viewportGeometry.set(layer.element, { origin, extent: { width: layer.element.offsetWidth, height: layer.element.offsetHeight }, clip, own, error });
    }
    for (const node of this.viewportAncestors) if (!ancestors.has(node)) this.resize.unobserve(node);
    for (const node of ancestors) if (!this.viewportAncestors.has(node)) this.resize.observe(node);
    this.viewportAncestors = ancestors;
  }
  private viewportClip(layer: LayerDefinition, matrix?: DOMMatrixReadOnly): ViewportRect | undefined {
    const geometry = this.viewportGeometry.get(layer.element);
    if (geometry?.error) throw new Error(geometry.error);
    let clip = geometry?.clip;
    const { width, height } = this.size();
    const frame = { x: 0, y: 0, width, height };
    const applied = matrix ?? new DOMMatrix(Array.from(affine(layer.transform, this.origin(layer))));
    if (!clip && !geometry?.own && geometry && viewportContains(applied, geometry.extent, frame)) return;
    clip = clip ? intersectViewport(clip, frame) : frame;
    const local = localViewport(applied, clip);
    return geometry?.own ? intersectViewport(local, geometry.own) : local;
  }
  private presentation(mode: "dom" | "gpu", releaseOwnership = false) {
    this.invalidatePolicy();
    const restored = new Map<string, ReturnType<DeclarationOwnership["restore"]>>();
    const owned = new Set(this.ownership.keys());
    if (mode === "dom") {
      for (const [id, lease] of this.gpuDeclarations) {
        const lost = lease.restore();
        restored.set(id, lost);
        if (lost.size && this.registry.has(id)) this.relinquishedDeclarations.set(id, lost);
      }
      this.gpuDeclarations.clear();
      if (releaseOwnership) this.restoreOwnership();
    }
    for (const layer of this.registry.values()) {
      if (mode === "gpu") {
        let lease = this.gpuDeclarations.get(layer.id);
        if (!lease) {
          lease = this.ownership.get(layer.id)?.lease.presentation ?? new DeclarationOwnership(layer.element);
          this.gpuDeclarations.set(layer.id, lease);
        }
        lease.write("transform-origin", "0 0", "important");
        lease.write("transform", "none", "important");
        lease.write("opacity", "1", "important");
      } else if (layer.preserveStyles || owned.has(layer.id)) {
        continue;
      } else {
        const lost = restored.get(layer.id) ?? this.relinquishedDeclarations.get(layer.id);
        if (!lost?.has("transform-origin")) layer.element.style.setProperty("transform-origin", "0 0");
        if (!lost?.has("transform")) layer.element.style.setProperty("transform", cssMatrix(affine(layer.transform)));
        if (!lost?.has("opacity")) layer.element.style.setProperty("opacity", String(layer.transform.opacity ?? 1));
      }
    }
    if (mode === "dom") {
      for (const effect of [...this.effects.values()]) effect.finish(this.disposalRequested
        ? { status: "disposed", reason: "Runtime disposed" }
        : { status: "fallback", reason: "Ordinary DOM uses static original decoration" });
    }
  }
  /**
   * Presentation-contract check, called on every drawn frame. Ownership and
   * transform-dependent geometry are checked on every call; DOM/style-derived
   * structure is cached until a mutation, resize, scroll, animation, input or
   * membership event invalidates it, so steady GPU frames do not force style reads.
   */
  private policy(): string | undefined {
    for (const layer of this.registry.values()) {
      try { const owner = this.ownership.get(layer.id); owner?.check?.(); owner?.lease.check(); this.transitions.get(layer.id)?.lease.check(); this.gpuDeclarations.get(layer.id)?.check(); }
      catch (error) { return `CSS ownership validation failed: ${String(error)}`; }
    }
    const phase = this.core?.phase();
    if (!this.structuralPolicy || this.structuralPolicy.phase !== phase) this.structuralPolicy = { phase, reason: this.structuralViolation() };
    if (this.structuralPolicy.reason) return this.structuralPolicy.reason;
    const { width, height } = this.size();
    for (const layer of this.registry.values()) {
      const matrix = affine(layer.transform, this.origin(layer));
      let viewport: ViewportRect | undefined;
      try { viewport = this.viewportClip(layer); }
      catch (error) { return String(error); }
      const corners = [[0, 0], [layer.element.offsetWidth, 0], [0, layer.element.offsetHeight], [layer.element.offsetWidth, layer.element.offsetHeight]];
      if (!viewport && corners.some(([x, y]) => {
        const p = point(matrix, { x: x!, y: y! });
        return p.x < 0 || p.y < 0 || p.x > width || p.y > height;
      })) return `Transformed layer requires unsupported outer clipping: ${layer.id}`;
    }
    return undefined;
  }
  private structuralPolicy: { phase: string | undefined; reason: string | undefined } | undefined;
  private invalidatePolicy() { this.structuralPolicy = undefined; }
  private structuralViolation(): string | undefined {
    const phase = this.core?.phase();
    const nativeBoundary = '[contenteditable]:not([contenteditable="false" i]), dialog, [popover]';
    const sources = new Set<Animation>([...this.motions.values()].map(motion => motion.source));
    for (const layer of this.registry.values()) {
      if (layer.element.isContentEditable || layer.element.matches(nativeBoundary) || layer.element.querySelector(nativeBoundary)) {
        return "Editable/top-layer boundaries require DOM or the explicit NativeOverlay boundary";
      }
      if (this.effects.has(layer.id) && !decorative(layer.element)) return `Effects are decorative/inert only: ${layer.id}; ordinary DOM required`;
      // Descendant animations repaint native content and are captured by the paint
      // event; only animations of the boundary's own GPU-owned presentation conflict.
      if (layer.element.getAnimations().some(animation => !sources.has(animation) && animatesPresentation(animation))) {
        return `Unowned/overlapping CSS/WAAPI animation requires explicit adapter: ${layer.id}`;
      }
      if (!layer.element.isConnected) return `Detached enrolled layer: ${layer.id}`;
      if (layer.layout.width === 0 || layer.layout.height === 0 || !layer.element.offsetWidth || !layer.element.offsetHeight) return `Zero-sized layer: ${layer.id}`;
      const style = getComputedStyle(layer.element);
      if ((layer.element.scrollWidth > layer.element.clientWidth || layer.element.scrollHeight > layer.element.clientHeight)
        && style.overflowX === "visible" && style.overflowY === "visible") {
        return `Content extends beyond enrolled capture bounds: ${layer.id}; ordinary DOM required`;
      }
      if (layer.preserveStyles && !this.ownership.has(layer.id) && !this.transitions.has(layer.id) && phase === "dom"
        && (style.transform !== "none" || style.opacity !== "1" || style.translate !== "none" || style.rotate !== "none" || style.scale !== "none")) {
        return `Existing presentation needs explicit animation ownership or neutral styles: ${layer.id}`;
      }
      if ((phase === "gpu" || phase === "admitting")
        && (style.transform !== "none" || style.opacity !== "1" || style.transformOrigin !== "0px 0px"
          || style.translate !== "none" || style.rotate !== "none" || style.scale !== "none")) {
        return `Exclusive GPU presentation declarations were changed: ${layer.id}; ordinary DOM required`;
      }
      if (style.zIndex !== "auto" && style.zIndex !== "0") {
        return "Custom stacking/clipping requires ordinary DOM";
      }
    }
    return undefined;
  }
  private checkPolicy() {
    if (this.core?.phase() === "dom" && !this.ownership.size) return;
    const policy = this.policy();
    if (policy) this.recover(policy);
  }
  private cancelReadmissionFrame() {
    this.readmissionPending = false;
  }
  private recovered(reason: string) {
    if (this.options.admissionPolicy !== "automatic" || this.admissionIntent !== "enabled"
      || this.stopped || this.disposalRequested) return;
    this.admissionReason = reason;
    this.admissionIntent = "blocked";
    this.readmissionPending = false;
    this.cancelReadmissionFrame();
  }
  private scheduleReadmission() {
    // Kept as a lifecycle compatibility hook: healthy updates reconcile in the
    // existing engine; diagnosed failures always require explicit reentry.
  }
  private recover(reason: string) {
    if (this.stopped || !this.core) return;
    void this.core.recover(reason).catch(error => {
      console.error("CanvasSPA recovery failed", error);
      this.options.onStatus?.(`CanvasSPA recovery failed: ${String(error)}`);
    });
  }
  private listen(target: EventTarget, name: string, callback: EventListener, capture = false) {
    target.addEventListener(name, callback, capture);
    this.resources.environmentListeners++;
    this.removers.push(() => {
      target.removeEventListener(name, callback, capture);
      this.resources.environmentListeners--;
    });
  }
  private watchDPR() {
    this.releaseDPR?.();
    const query = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const listener = () => {
      this.reconcile();
      this.watchDPR();
    };
    query.addEventListener("change", listener);
    this.resources.environmentListeners++;
    this.releaseDPR = () => {
      query.removeEventListener("change", listener);
      this.resources.environmentListeners--;
    };
  }
  register(definition: LayerDefinition): () => void {
    this.assertLive();
    affine(definition.transform, this.origin(definition));
    if (!definition.element.isConnected || !this.rootContainer?.contains(definition.element)
      || definition.element.ownerDocument !== this.options.ordinaryHost.ownerDocument) {
      throw new Error("Surface must belong to the connected persistent root");
    }
    if (!definition.id || this.registry.has(definition.id)) throw new Error(`Duplicate/empty Surface id: ${definition.id}`);
    if (definition.preserveStyles && definition.element.parentElement !== this.rootContainer) throw new Error("Trusted existing-CSS enrollment must be a direct persistent-root child");
    this.registry.set(definition.id, definition);
    this.reactTransforms.set(definition.id, { ...definition.transform });
    this.invalidatePolicy();
    this.resources.enrolledLayers++;
    this.revision++;
    this.resize.observe(definition.element);
    this.presentation(this.core?.phase() === "gpu" || this.core?.phase() === "admitting" ? "gpu" : "dom");
    this.reconcileMembership();
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.transitions.get(definition.id)?.finish("cancelled", "Unenrolled");
      this.gpuDeclarations.get(definition.id)?.restore();
      this.gpuDeclarations.delete(definition.id);
      this.effects.get(definition.id)?.finish({ status: "disposed", reason: "Enrollment released" });
      const owned = this.ownership.get(definition.id);
      if (owned) {
        owned.restore?.();
        owned.lease.restore();
        this.ownership.delete(definition.id);
        this.resources.animationOwners--;
      }
      this.resize.unobserve(definition.element);
      this.registry.delete(definition.id);
      this.invalidatePolicy();
      this.deferredTransforms.delete(definition.id);
      this.reactTransforms.delete(definition.id);
      this.relinquishedDeclarations.delete(definition.id);
      this.cancelNativeMotion(definition.id);
      this.resources.enrolledLayers--;
      this.revision++;
      this.reconcileMembership();
    };
  }
  enroll(element: HTMLElement, options: EnrollmentOptions): () => void {
    this.assertLive();
    if (typeof options.id !== "string" || !options.id.trim() || this.registry.has(options.id)) throw new EnrollmentError("invalid-id", `Duplicate/empty enrollment id: ${options.id}`);
    if (!(element instanceof HTMLElement) || !element.isConnected || element.ownerDocument !== this.options.ordinaryHost.ownerDocument || !this.rootContainer?.contains(element)) {
      throw new EnrollmentError("foreign-element", "Enrollment requires an original connected persistent-root element");
    }
    if ([...this.registry.values()].some(layer => layer.element === element)) throw new EnrollmentError("duplicate-element", "Element is already enrolled");
    if (element.parentElement !== this.rootContainer || [...this.registry.values()].some(layer => layer.element.contains(element) || element.contains(layer.element))) {
      throw new EnrollmentError("nested-element", "Ref enrollment requires a direct root child without nested enrolled elements");
    }
    if (options.decorative && !decorative(element)) throw new EnrollmentError("decorative-element", "Decorative enrollment requires authored inert, aria-hidden noninteractive content");
    const drawable = element.getAttribute("drawable");
    element.setAttribute("drawable", "");
    let release: () => void;
    try { release = this.register({ ...options, element, layout: {}, transform: {}, preserveStyles: true }); }
    catch (error) {
      if (drawable === null) element.removeAttribute("drawable"); else element.setAttribute("drawable", drawable);
      throw error;
    }
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      release();
      if (element.getAttribute("drawable") === "") {
        if (drawable === null) element.removeAttribute("drawable");
        else element.setAttribute("drawable", drawable);
      }
    };
  }
  /**
   * React-driven layout/transform update. While declarative motion or animation
   * ownership drives the transform, the React value becomes the resting
   * transform applied when that motion ends, instead of throwing inside a commit.
   */
  update(id: string, layout: Layout, transform: Transform) {
    this.assertLive();
    const layer = this.registry.get(id);
    if (!layer) throw new Error(`Unknown Surface: ${id}`);
    affine(transform, this.origin(layer));
    const owner = this.ownership.get(id);
    const supplied = JSON.stringify(transform) !== JSON.stringify(this.reactTransforms.get(id) ?? {});
    this.reactTransforms.set(id, { ...transform });
    if (this.transitions.has(id)) { if (supplied) this.deferredTransforms.set(id, { ...transform }); }
    else if (owner) { if (supplied) owner.base = { ...transform }; }
    else {
      if (JSON.stringify(layer.transform) !== JSON.stringify(transform)) this.relinquishedDeclarations.delete(id);
      layer.transform = { ...transform };
    }
    layer.layout = layout;
    this.invalidatePolicy();
    this.reconcile();
    this.checkPolicy();
    if (this.core?.phase() !== "gpu" && this.core?.phase() !== "admitting") this.presentation("dom");
    this.core?.invalidate(layer.element);
    this.requestDraw();
  }
  setTransform(id: string, transform: Transform) {
    this.assertLive();
    const layer = this.registry.get(id);
    if (!layer) throw new Error(`Unknown Surface: ${id}`);
    if (this.ownership.has(id) || this.transitions.has(id)) throw new Error("Transform is animation-owned; release or cancel first");
    affine(transform, this.origin(layer));
    this.relinquishedDeclarations.delete(id);
    layer.transform = { ...transform };
    this.checkPolicy();
    if (this.core?.phase() !== "gpu") this.presentation("dom");
    else this.reconcile();
  }
  private requestDraw() {
    if (this.stopped || this.drawFrame || !this.environment.visible || this.core?.phase() !== "gpu") return;
    this.resources.controllerFrames++;
    this.drawFrame = requestAnimationFrame(() => {
      this.drawFrame = 0;
      this.resources.controllerFrames--;
      try { this.core?.draw(); } catch (error) { this.recover(`Geometry/draw failure: ${String(error)}`); }
    });
  }
  /**
   * Coalesces reconciliation requests from one React commit (host, every Surface
   * and every enrolled ref) into a single reconcile in a microtask, which still
   * runs before the browser renders or dispatches the next input event.
   */
  requestReconcile() {
    if (this.reconcileQueued || this.stopped) return;
    this.reconcileQueued = true;
    queueMicrotask(() => {
      this.reconcileQueued = false;
      this.reconcile();
    });
  }
  reconcile() {
    if (this.stopped || !this.core || this.core.phase() !== "gpu" && this.core.phase() !== "admitting") return;
    try {
      this.refreshViewportGeometry();
      this.presentation("gpu");
      if (this.core.phase() === "admitting") { this.core.reconcileGeometry(); return; }
      if (this.membershipCommitPending) { this.core.reconcileGeometry(); return; }
      const signature = this.sizeSignature();
      if (signature === this.admittedSize) { this.core.draw(); return; }
      this.admittedSize = signature;
      this.core.reconcile();
    }
    catch (error) { console.error("CanvasSPA reconciliation failed", error); this.recover(`Native/GPU reconciliation failed: ${String(error)}`); }
  }
  private reconcileMembership() {
    if (this.stopped || this.core?.phase() !== "gpu") return;
    this.refreshViewportGeometry();
    this.core.reconcileGeometry();
    if (this.membershipCommitPending) return;
    this.membershipCommitPending = true;
    queueMicrotask(() => {
      this.membershipCommitPending = false;
      this.reconcile();
    });
  }
  private cancelMotion() {
    this.stopClock();
    if (this.drawFrame) {
      cancelAnimationFrame(this.drawFrame);
      this.drawFrame = 0;
      this.resources.controllerFrames--;
    }
    if (this.motionFrame) {
      cancelAnimationFrame(this.motionFrame.id);
      this.motionFrame.reject(new Error("Motion interrupted by lifecycle/media policy"));
      this.motionFrame = undefined;
      this.resources.controllerFrames--;
    }
    for (const waiter of this.visibilityWaiters) waiter.reject(new Error("Motion interrupted while hidden"));
    this.visibilityWaiters.clear();
    this.resources.visibilityWaiters = 0;
  }
  /**
   * GPU-only motion toward `target`. A number steps a fixed count of displayed
   * frames (refresh-rate dependent; kept for deterministic measurement); prefer
   * `{ duration }` in milliseconds, which interpolates by elapsed time.
   */
  async animate(id: string, target: Transform, length: number | { duration: number } = 300) {
    this.assertLive();
    affine(target);
    const duration = typeof length === "object" ? length.duration : undefined;
    if (duration !== undefined && (!Number.isFinite(duration) || duration <= 0 || duration > 60000)) throw new Error("Motion duration requires (0, 60000] ms");
    const frames = typeof length === "number" ? length : 10000;
    if (!Number.isInteger(frames) || frames < 1 || frames > 10000) throw new Error("Motion requires 1..10000 frames");
    await this.settle();
    if (this.moving || this.renderer().phase() !== "gpu" || this.reduced.matches) throw new Error("Motion requires idle GPU mode and no reduced-motion preference");
    const layer = this.registry.get(id);
    if (!layer) throw new Error(`Unknown Surface: ${id}`);
    if (this.ownership.has(id) || this.transitions.has(id)) throw new Error("Transform is animation-owned; release or cancel first");
    const start = { ...layer.transform };
    const version = this.renderer().version();
    const before = this.state();
    this.moving = true;
    let elapsed = 0, previous: number | undefined;
    try {
      for (let index = 1; index <= frames; index++) {
        if (!this.environment.visible) {
          await new Promise<void>((resolve, reject) => {
            this.visibilityWaiters.add({ resolve, reject });
            this.resources.visibilityWaiters++;
          });
          previous = undefined;
        }
        const now = await new Promise<number>((resolve, reject) => {
          this.resources.controllerFrames++;
          const frame = requestAnimationFrame(time => {
            this.motionFrame = undefined;
            this.resources.controllerFrames--;
            resolve(time);
          });
          this.motionFrame = { id: frame, reject };
        });
        if (!this.environment.visible) { index--; continue; }
        if (this.renderer().phase() !== "gpu" || version !== this.renderer().version() || this.reduced.matches) throw new Error("Motion interrupted by renderer/media generation");
        // Hidden time is excluded: elapsed only advances between consecutive visible frames.
        if (previous !== undefined) elapsed += Math.min(100, now - previous);
        previous = now;
        const progress = duration === undefined ? index / frames : Math.min(1, elapsed / duration);
        const next = { ...start };
        for (const key of ["x", "y", "scaleX", "scaleY", "rotation", "opacity"] as const) {
          if (target[key] !== undefined) {
            const from = start[key] ?? (key === "scaleX" || key === "scaleY" || key === "opacity" ? 1 : 0);
            next[key] = from + (target[key]! - from) * progress;
          }
        }
        affine(next);
        layer.transform = next;
        const policy = this.policy();
        if (policy) { await this.renderer().recover(policy); throw new Error(policy); }
        this.renderer().draw();
        if (progress >= 1) break;
      }
    } finally { this.moving = false; this.scheduleReadmission(); }
    return { before, after: this.state() };
  }
  async enable() {
    this.assertLive();
    this.refreshViewportGeometry();
    this.invalidatePolicy();
    const epoch = ++this.admissionEpoch;
    this.admissionIntent = "enabled";
    this.readmissionPending = false;
    this.cancelReadmissionFrame();
    this.cancelTransitions("Fresh admission");
    this.admittedSize = this.sizeSignature();
    const result = await this.renderer().enable();
    if (epoch !== this.admissionEpoch) return this.state();
    if (result.mode === "gpu") { this.admittedSize = this.sizeSignature(); this.watchDPR(); }
    else if (!this.readmissionPending) { this.admissionIntent = "blocked"; this.admissionReason = result.reason; }
    this.scheduleReadmission();
    this.startClock();
    return this.state();
  }
  async disable() {
    this.admissionEpoch++;
    this.admissionIntent = "disabled";
    this.readmissionPending = false;
    this.admissionReason = "Explicit disable; fresh enable required";
    this.cancelReadmissionFrame();
    this.cancelTransitions("Disabled");
    this.cancelMotion();
    await this.renderer().disable();
    return this.state();
  }
  async settle() {
    await new Promise<void>(resolve => queueMicrotask(resolve));
    this.reconcileProjection();
    if (this.drawFrame) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    await this.renderer().settle();
  }
  invalidate(id?: string) { this.assertLive(); this.renderer().invalidate(id); }
  private restoreOwnership() {
    this.stopClock();
    const errors: unknown[] = [];
    for (const [id, owner] of this.ownership) {
      try { owner.restore?.(); } catch (error) { errors.push(error); }
      try { owner.lease.restore(); } catch (error) { errors.push(error); }
      const layer = this.registry.get(id);
      if (layer) {
        layer.transform = owner.base;
        const lost = owner.lease.presentation.restore();
        if (lost.size) this.relinquishedDeclarations.set(id, lost);
      }
    }
    this.ownership.clear();
    this.invalidatePolicy();
    this.resources.animationOwners = 0;
    for (const id of this.motions.keys()) if (!this.registry.has(id)) this.cancelNativeMotion(id);
    if (errors.length) throw new AggregateError(errors, "Animation ownership restoration failed");
  }
  private cancelNativeMotion(id: string) {
    const motion = this.motions.get(id);
    if (!motion) return;
    motion.source.cancel();
    this.motions.delete(id);
    this.invalidatePolicy();
    this.resources.nativeMotions--;
  }
  createMotion(id: string, descriptor: MotionDescriptor): MotionHandle {
    this.assertLive();
    const state = this.renderer().state();
    if (state.mode !== "dom" || state.initializing || state.transitioning || state.resources.pendingEngines
      || state.resources.pendingCleanups || state.resources.probeReadbacks) throw new Error("Create typed motion in idle ordinary DOM");
    const layer = this.registry.get(id);
    if (!layer || this.motions.has(id) || this.ownership.has(id) || this.transitions.has(id) || layer.element.getAnimations({ subtree: true }).length) {
      throw new Error("Typed motion requires one enrolled layer without overlapping sources");
    }
    const compiled = compileMotion(descriptor);
    const nativeFrames = compiled.frames.map(frame => ({
      offset: frame.offset, easing: frame.easing ?? "linear", transform: frame.transform, opacity: frame.opacity,
    }));
    const source = new Animation(new KeyframeEffect(layer.element, nativeFrames, compiled.timing), document.timeline);
    source.pause();
    source.currentTime = 0;
    const assertLive = () => {
      this.assertLive();
      if (this.motions.get(id)?.source !== source) throw new Error("Typed motion is disposed or unenrolled");
    };
    const owned = () => {
      const lease = this.ownership.get(id)?.lease;
      return lease?.source === source ? lease.playback : undefined;
    };
    const handle: MotionHandle = {
      nativeAnimation: source,
      own: () => { assertLive(); return owned() ?? this.ownAnimation(id, source); },
      play: () => { assertLive(); const playback = owned(); if (playback) playback.play(); else source.play(); },
      pause: () => { assertLive(); const playback = owned(); if (playback) playback.pause(); else source.pause(); },
      seek: time => {
        assertLive();
        compiled.timeline.sample(time);
        const playback = owned();
        if (playback) playback.seek(time); else source.currentTime = time;
      },
      release: async () => { await owned()?.release(); },
      dispose: async () => {
        if (this.motions.get(id)?.source !== source) return;
        await owned()?.release();
        if (this.motions.get(id)?.source === source) this.cancelNativeMotion(id);
      },
      state: () => owned()?.state() ?? {
        milliseconds: Number(source.currentTime ?? 0), playing: source.playState === "running", released: true,
        sourceTime: source.currentTime, sourceState: source.playState,
        detached: source.effect instanceof KeyframeEffect && source.effect.target === null,
      },
    };
    this.motions.set(id, { source, handle });
    this.invalidatePolicy();
    this.resources.nativeMotions++;
    return handle;
  }
  private cancelTransitions(reason: string) {
    for (const transition of [...this.transitions.values()]) transition.finish("cancelled", reason);
  }
  private prepareTransition(id: string, descriptor: MotionDescriptor) {
    this.assertLive();
    const state = this.renderer().state();
    const layer = this.registry.get(id);
    if (!layer || state.initializing || state.transitioning || (state.resources.pendingCleanups && state.mode !== "gpu") || state.resources.probeReadbacks
      || this.moving || this.ownership.has(id) || this.motions.has(id) || layer.element.getAnimations({ subtree: true }).length) {
      throw new Error("Declarative motion requires an idle enrolled boundary without competing animation owners");
    }
    const prior = this.transitions.get(id);
    const current = { ...layer.transform };
    compileMotion(descriptor);
    const input = prior ? { ...descriptor, keyframes: [{ ...current, offset: 0 }, ...descriptor.keyframes.slice(1)] } : descriptor;
    const compiled = compileMotion(input);
    if (compiled.timeline.iterations !== 1 || compiled.timeline.direction !== "normal" || compiled.timeline.end > 60000) {
      throw new Error("Declarative transitions require one normal iteration and at most 60000ms including delay");
    }
    for (const frame of input.keyframes) affine(frame, this.origin(layer));
    if (state.mode === "dom") {
      rejectImportantPresentation(layer.element, true);
      const style = getComputedStyle(layer.element);
      if (style.translate !== "none" || style.rotate !== "none" || style.scale !== "none") {
        throw new Error("Declarative motion cannot compete with individual CSS transforms");
      }
    }
    this.gpuDeclarations.get(id)?.check();
    prior?.lease.check();
    return { layer, prior, compiled, base: current };
  }
  transition(id: string, descriptor: MotionDescriptor): TransitionHandle {
    return this.startTransitions([{ id, prepared: this.prepareTransition(id, descriptor) }])[0]!;
  }
  transitionGroup(items: readonly CoordinatedMotion[], stagger = 0): TransitionHandle[] {
    if (!Number.isFinite(stagger) || stagger < 0 || stagger > 1000 || items.length < 1 || items.length > 8
      || new Set(items.map(item => item.id)).size !== items.length) throw new Error("Coordinated motion requires 1..8 distinct ids and stagger in [0,1000]ms");
    const prepared = items.map((item, index) => this.prepareTransition(item.id, {
      ...item.motion, timing: { ...item.motion.timing, delay: (item.motion.timing.delay ?? 0) + index * stagger },
    }));
    return this.startTransitions(items.map((item, index) => ({ id: item.id, prepared: prepared[index]! })));
  }
  private startTransitions(items: { id: string; prepared: ReturnType<CanvasRuntime["prepareTransition"]> }[]): TransitionHandle[] {
    const start = performance.now();
    const staged = items.map(({ id, prepared }) => this.stageTransition(id, prepared, start));
    try {
      for (const transition of staged) transition.prepare();
      for (const transition of staged) transition.validate();
    } catch (error) {
      for (const transition of staged) transition.rollback();
      throw error;
    }
    return staged.map(transition => transition.commit());
  }
  private stageTransition(id: string, { layer, prior, compiled, base }: ReturnType<CanvasRuntime["prepareTransition"]>, start: number) {
    const lease = new DeclarationOwnership(layer.element, prior?.lease);
    let frame = 0, done = false;
    let resolve!: (result: TransitionResult) => void;
    const finished = new Promise<TransitionResult>(complete => { resolve = complete; });
    const validate = (transform: Transform) => {
      lease.check();
      if (this.core?.phase() === "dom") {
        const style = getComputedStyle(layer.element);
        const expected = affine(transform);
        const actual = new DOMMatrix(style.transform === "none" ? undefined : style.transform);
        if (style.transformOrigin !== "0px 0px" || style.translate !== "none" || style.rotate !== "none" || style.scale !== "none"
          || ![actual.a, actual.b, actual.c, actual.d, actual.e, actual.f].every((value, index) =>
            Math.abs(value - expected[index]!) <= 1e-4 * Math.max(1, Math.abs(value)))
          || Math.abs(Number(style.opacity) - transform.opacity!) > 1e-4) {
          throw new Error("Declarative DOM presentation was overridden by authored CSS");
        }
      }
    };
    const sample = (time: number) => {
      lease.check();
      const transform = compiled.timeline.sample(time);
      if (this.core?.phase() === "dom") {
        lease.write("transform-origin", "0 0");
        lease.write("transform", cssMatrix(affine(transform)));
        lease.write("opacity", String(transform.opacity));
      }
      validate(transform);
      return transform;
    };
    const apply = (time: number) => { layer.transform = sample(time); this.requestDraw(); };
    const settleTransform = () => {
      // A transform React supplied during the motion becomes the resting state.
      const deferred = this.deferredTransforms.get(id);
      if (!deferred) return;
      this.deferredTransforms.delete(id);
      layer.transform = deferred;
      if (this.core?.phase() === "dom" && !layer.preserveStyles) this.presentation("dom");
    };
    const finish = (status: TransitionResult["status"], reason: string, transferred = false) => {
      if (done) return;
      if (status === "completed") apply(compiled.timeline.end);
      done = true;
      if (frame) { cancelAnimationFrame(frame); frame = 0; this.resources.controllerFrames--; }
      this.transitions.delete(id);
      this.invalidatePolicy();
      this.resources.declarativeMotions--;
      if (!transferred && (status === "cancelled" || layer.preserveStyles || this.core?.phase() !== "dom")) lease.restore();
      if (status === "cancelled" && !transferred) layer.transform = base;
      if (!transferred) settleTransform();
      this.requestDraw();
      resolve({ status, reason });
    };
    let pausedAt: number | undefined;
    const pause = () => {
      if (done || pausedAt !== undefined) return;
      pausedAt = performance.now();
      if (frame) { cancelAnimationFrame(frame); frame = 0; this.resources.controllerFrames--; }
    };
    const resume = () => {
      if (done || pausedAt === undefined) return;
      start += performance.now() - pausedAt;
      pausedAt = undefined;
      const entry = this.transitions.get(id);
      if (entry) entry.start = start;
      if (!frame) schedule();
    };
    const tick = () => {
      frame = 0; this.resources.controllerFrames--;
      try {
        if (!this.environment.visible) { pause(); return; }
        const elapsed = performance.now() - start;
        apply(Math.min(elapsed, compiled.timeline.end));
        const policy = this.policy();
        if (policy) { finish("cancelled", policy); this.recover(policy); return; }
        if (elapsed >= compiled.timeline.end) finish("completed", "Finished");
        else schedule();
      } catch (error) {
        finish("cancelled", String(error));
        this.recover(`Declarative motion failed: ${String(error)}`);
      }
    };
    const schedule = () => { this.resources.controllerFrames++; frame = requestAnimationFrame(tick); };
    let initial: Transform;
    const reduced = this.reduced.matches;
    return {
      prepare: () => { initial = sample(reduced ? compiled.timeline.end : 0); },
      validate: () => { validate(initial); },
      rollback: () => { lease.rollback(); },
      commit: (): TransitionHandle => {
        prior?.finish("cancelled", "Replaced", true);
        layer.transform = initial;
        this.transitions.set(id, { finish, pause, resume, lease, start, end: compiled.timeline.end });
        this.invalidatePolicy();
        this.resources.declarativeMotions++;
        if (reduced) {
          done = true;
          this.transitions.delete(id);
          this.resources.declarativeMotions--;
          if (layer.preserveStyles || this.core?.phase() !== "dom") lease.restore();
          settleTransform();
          resolve({ status: "completed", reason: "Reduced motion" });
        } else if (this.environment.visible) schedule();
        else pausedAt = performance.now();
        this.requestDraw();
        return { finished, cancel: () => finish("cancelled", "Cancelled") };
      },
    };
  }
  ownAnimation(id: string, source: Animation): AnimationPlayback {
    if (source instanceof CSSAnimation) throw new Error("CSS animation requires explicit source-rule provenance");
    return this.acquireAnimation(id, source);
  }
  ownCSSAnimation(id: string, provenance: CSSAnimationSource): AnimationPlayback {
    const layer = this.registry.get(id);
    if (!layer) throw new Error(`Unknown Surface: ${id}`);
    const css = validateCSSSource(layer.element, provenance);
    return this.acquireAnimation(id, css.source, css.check, css.restore, css.resources);
  }
  ownCompiledAnimation(id: string, animationId: string): AnimationPlayback {
    const layer = this.registry.get(id);
    const compiled = this.options.compiled?.animations.find(animation => animation.id === animationId);
    if (!layer || !compiled) throw new Error("Unknown compiled animation or enrolled layer");
    const sources = layer.element.getAnimations().filter(animation => animation instanceof CSSAnimation && animation.animationName === compiled.name);
    if (sources.length !== 1) throw new Error("Compiled ownership requires exactly one active matching CSS animation");
    const source = sources[0]!;
    verifyCompiledAnimation(layer.element, source, compiled);
    return this.acquireAnimation(id, source, undefined, undefined, undefined, compiled);
  }
  private acquireAnimation(id: string, source: Animation, check?: () => void, restore?: () => void, resources?: () => number, compiled?: CompiledAnimation): AnimationPlayback {
    this.assertLive();
    const state = this.renderer().state();
    if (state.mode !== "dom" || state.initializing || state.transitioning || state.resources.pendingEngines
      || state.resources.pendingCleanups || state.resources.probeReadbacks) {
      throw new Error("Prepare ownership in idle ordinary DOM before fresh GPU admission");
    }
    const layer = this.registry.get(id);
    if (!layer || this.ownership.has(id) || this.transitions.has(id)) throw new Error("Unknown or already animation-owned layer");
    if (JSON.stringify(affine(layer.transform)) !== JSON.stringify(affine()) || (layer.transform.opacity ?? 1) !== 1) throw new Error("Animation requires neutral controller transform/opacity");
    const base = { ...layer.transform };
    const lease = prepareAnimation(layer.element, source, {
      validate: transform => { affine(transform, this.origin(layer)); },
      apply: transform => {
        check?.();
        layer.transform = transform;
        if (this.core?.phase() === "dom") {
          lease.presentation.write("transform", cssMatrix(affine(transform)));
          lease.presentation.write("opacity", String(transform.opacity));
        }
      },
      changed: () => { this.stopClock(); this.requestDraw(); this.startClock(); },
      release: () => this.disable(),
    }, compiled);
    lease.acquire();
    this.ownership.set(id, { lease, base, check, restore, resources, compiled });
    this.invalidatePolicy();
    this.resources.animationOwners++;
    return lease.playback;
  }
  private stopClock() {
    if (this.clockFrame) { cancelAnimationFrame(this.clockFrame); this.clockFrame = 0; this.resources.controllerFrames--; }
    this.clockTime = undefined;
  }
  private startClock() {
    if (this.stopped || this.clockFrame || this.moving || !this.environment.visible || this.reduced.matches || this.core?.phase() !== "gpu"
      || ![...this.ownership.values()].some(owner => owner.lease.playback.state().playing)
        && ![...this.effects.values()].some(effect => effect.values.some(value => value.time.playing))) return;
    this.resources.controllerFrames++;
    this.clockFrame = requestAnimationFrame(time => {
      this.clockFrame = 0;
      this.resources.controllerFrames--;
      const delta = this.clockTime === undefined ? 0 : Math.min(100, time - this.clockTime);
      this.clockTime = time;
      try {
        for (const owner of this.ownership.values()) { owner.check?.(); owner.lease.tick(delta); }
        this.tickRipples(delta);
        const policy = this.policy();
        if (policy) this.recover(policy); else this.renderer().draw();
      } catch (error) { this.recover(`Animation ownership failure: ${String(error)}`); }
      this.startClock();
    });
  }
  setRipple(id: string, value: Ripple | null) {
    if (value) {
      const ripple = validateRipple(value);
      this.setEffects(id, [{ kind: "ripple", parameters: { amplitude: ripple.amplitude }, time: { seconds: ripple.seconds, playing: ripple.playing },
        bounds: "layer", interaction: "decorative", media: "identity", fallback: "static" }]);
    } else {
      this.assertLive();
      if (!this.registry.has(id)) throw new Error(`Unknown Surface: ${id}`);
      this.effects.get(id)?.finish({ status: "cancelled", reason: "setRipple cleared effect ownership" });
    }
  }
  setEffects(id: string, descriptors: readonly EffectDescriptor[]): EffectHandle {
    this.assertLive();
    const layer = this.registry.get(id);
    if (!layer) throw new Error(`Unknown Surface: ${id}`);
    const values = validateEffects(descriptors);
    if (!layer.decorative || !decorative(layer.element)) throw new Error("Effects require explicit decorative, inert, aria-hidden noninteractive enrollment");
    const state = this.renderer().state();
    if (state.initializing || state.transitioning || state.resources.pendingEngines || (state.resources.pendingCleanups && state.mode !== "gpu") || state.resources.probeReadbacks) throw new Error("Effects require idle DOM or admitted GPU without pending lifecycle work");
    for (const value of values) if (value.kind === "custom") {
      if (!navigator.gpu) throw new Error("Application effect requires WebGPU; original DOM remains usable");
      if (state.mode === "gpu" && !this.renderer().acceptsCustom(id, value.definition)) throw new Error("New custom definitions require idle DOM and explicit fresh GPU admission");
    }
    if (this.reduced.matches) for (const value of values) value.time.playing = false;
    let active = true;
    let resolve!: (result: EffectResult) => void;
    const finished = new Promise<EffectResult>(done => { resolve = done; });
    const entry = { values, finish: (result: EffectResult) => {
      if (!active) return;
      active = false;
      if (this.effects.get(id) === entry) { this.effects.delete(id); this.resources.decorativeEffects--; this.invalidatePolicy(); }
      resolve(result);
      this.stopClock(); this.requestDraw(); this.startClock();
    } };
    this.effects.get(id)?.finish({ status: "replaced", reason: "Validated successor acquired ownership" });
    this.effects.set(id, entry);
    this.invalidatePolicy();
    this.resources.decorativeEffects++;
    this.stopClock();
    this.requestDraw();
    this.startClock();
    const change = (operation: () => void) => {
      this.assertLive();
      if (!active || this.effects.get(id) !== entry) throw new Error("Effect handle is no longer active");
      operation(); this.stopClock(); this.requestDraw(); this.startClock();
    };
    return {
      finished, state: () => ({ active, effects: validateEffects(values) }),
      seek: seconds => { effectNumber(seconds, 0, 1e6, "Effect seconds"); change(() => { for (const value of values) value.time.seconds = seconds; }); },
      play: () => change(() => { if (this.reduced.matches) throw new Error("Effect playback is disabled by reduced motion"); for (const value of values) value.time.playing = true; }),
      pause: () => change(() => { for (const value of values) value.time.playing = false; }),
      cancel: () => entry.finish({ status: "cancelled", reason: "Effect cancelled" }),
      dispose: () => entry.finish({ status: "disposed", reason: "Effect disposed" }),
    };
  }
  private tickRipples(milliseconds: number, force = false) {
    for (const effect of this.effects.values()) for (const value of effect.values) if (value.time.playing || force) value.time.seconds = (value.time.seconds + milliseconds / 1000) % 1000;
  }
  async advance(frames = 300, milliseconds = 1000 / 60) {
    this.assertLive();
    if (!Number.isInteger(frames) || frames < 1 || frames > 10000 || !Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 1000) throw new Error("Invalid bounded timeline advance");
    if (this.moving || this.renderer().phase() !== "gpu" || this.reduced.matches) throw new Error("Timeline advance requires idle GPU without reduced motion");
    this.stopClock();
    await this.settle();
    const before = this.state(), generation = this.renderer().version();
    this.moving = true;
    try {
      for (let index = 0; index < frames; index++) {
        if (!this.environment.visible) await new Promise<void>((resolve, reject) => {
          this.visibilityWaiters.add({ resolve, reject }); this.resources.visibilityWaiters++;
        });
        await new Promise<void>((resolve, reject) => {
          this.resources.controllerFrames++;
          const id = requestAnimationFrame(() => { this.motionFrame = undefined; this.resources.controllerFrames--; resolve(); });
          this.motionFrame = { id, reject };
        });
        if (!this.environment.visible) { index--; continue; }
        if (this.renderer().phase() !== "gpu" || generation !== this.renderer().version()) throw new Error("Timeline interrupted by renderer generation");
        for (const owner of this.ownership.values()) { owner.check?.(); owner.lease.tick(milliseconds, true); }
        this.tickRipples(milliseconds, true);
        const policy = this.policy();
        if (policy) { await this.disable(); throw new Error(policy); }
        this.renderer().draw();
      }
    } finally { this.moving = false; this.startClock(); }
    return { before, after: this.state() };
  }
  state() {
    return { ...this.renderer().state(), environment: { ...this.environment }, registryRevision: this.revision,
      admission: { policy: this.options.admissionPolicy ?? "explicit", intent: this.admissionIntent,
        pending: this.readmissionPending, attempts: this.automaticAttempts, reason: this.admissionReason },
      layers: this.ordered().map(layer => ({ id: layer.id, width: layer.element.offsetWidth, height: layer.element.offsetHeight,
        matrix: affine(layer.transform, this.origin(layer)), transform: { ...layer.transform } })),
      runtimeResources: { ...this.resources, presentationOverrides: this.relinquishedDeclarations.size,
        cssReplacementSources: [...this.ownership.values()].reduce((sum, owner) => sum + (owner.resources?.() ?? 0), 0) }, moving: this.moving,
      animationOwnership: [...this.ownership].map(([id, owner]) => ({ id, ...owner.lease.playback.state() })),
      declarativeMotion: [...this.transitions].map(([id, motion]) => ({ id, start: motion.start, end: motion.end })),
      decorativeEffects: [...this.effects].map(([id, effect]) => {
        const ripple = effect.values.find(value => value.kind === "ripple");
        return { id, amplitude: ripple?.parameters.amplitude ?? 0, seconds: ripple?.time.seconds ?? effect.values[0]!.time.seconds, playing: ripple?.time.playing ?? false,
          effects: effect.values.map(value => ({ kind: value.kind, parameters: { ...value.parameters }, time: { ...value.time } })) };
      }),
      effectBudget: { passes: 1, operationsPerLayer: 3, extraTextures: 0, uniformBytesPerLayer: 160, gpuTimestampMs: null },
    };
  }
  async dispose() {
    if (this.stopped) return this.state();
    this.admissionEpoch++;
    this.admissionIntent = "disabled";
    this.readmissionPending = false;
    this.cancelReadmissionFrame();
    this.cancelTransitions("Disposed");
    this.cancelMotion();
    this.disposalRequested = true;
    try { await this.renderer().dispose(); }
    finally { this.disposalRequested = false; }
    for (const id of this.motions.keys()) this.cancelNativeMotion(id);
    this.relinquishedDeclarations.clear();
    this.stopped = true;
    this.mutation.disconnect();
    this.resize.disconnect();
    this.viewportAncestors.clear();
    this.externalAncestors.clear();
    this.viewportGeometry = new WeakMap();
    this.resources.mutationObservers = this.resources.resizeObservers = 0;
    for (const remove of this.removers.splice(0)) remove();
    return this.state();
  }
}
