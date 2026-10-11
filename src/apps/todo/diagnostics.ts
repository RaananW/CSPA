export function rendererDiagnostic(mode: string, reason: string): string {
  const category = mode === "gpu" ? "active"
    : /^(?:explicit disable\b|disabled\b|runtime disposed\b|disposed root\b|ordinary DOM (?:startup\b|by default\b))/i.test(reason) ? "lifecycle"
    : /unproven|offscreen|occlud|visible|hit.*probe/i.test(reason) ? "admission"
    : /missing|requires.*requestPaint|canvas.content|navigator.gpu|unavailable/i.test(reason) ? "capability"
    : /unsupported|requires explicit adapter|explicit (?:NativeOverlay boundary|animation ownership)/i.test(reason) ? "authored/framework-boundary"
    : /error|failure|lost|device/i.test(reason) ? "gpu-error"
    : "authored/framework-boundary";
  return `${category} · ${mode}: ${reason}`;
}
