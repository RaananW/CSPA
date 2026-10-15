## 2026-10-15 — `packages/underglass` is now `packages/react`

- The React adapter's directory is renamed to match its package name and its siblings
  (`packages/core`, `packages/vue`). The package name `@underglass/react`, its exports and the
  root script names are unchanged.
- Update local paths that pointed into `packages/underglass` (for example a `file:` dependency or
  a deep source import). History in `docs/archive`, `evidence/` and earlier change notes keeps the
  old path.
