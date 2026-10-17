---
---

Fix useStrataGpu (React and Vue) in a component of mountCanvasApp's first render, where the root's container is not ready yet: it now attaches in a microtask. The private @underglass/ui package is not published, so users see no difference.
