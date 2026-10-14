## 2026-10-14 — Showcase: Fluent release board

- New showcase example `#/fluent` built from stock Fluent UI v9 components
  (`@fluentui/react-components` 9.74.9, `@fluentui/react-icons` 2.0.344, exact pins,
  showcase workspace only; the library has no new dependency).
- Shows the Fluent integration pattern: a `FluentProvider` inside each layer and
  `PortalMountNodeProvider` pointing every Fluent portal at the overlay host. The
  showcase's base control styles no longer apply inside Fluent subtrees.
- Uses transition effects on live components (archive burn, add materialise, editor
  growing out of its card, landing shockwave, release warp) and JavaScript springs that
  keep a throw's velocity. `test:showcase` drives it in DOM and GPU lanes: GPU stays on,
  pixels change, native hits follow moved cards, content is inert only during effects,
  and menus and the dialog render in the overlay host.
