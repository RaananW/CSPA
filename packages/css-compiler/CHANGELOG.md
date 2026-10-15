# @underglass/css-compiler

## 0.1.0

Baseline development version. Never published; recorded here so the first published release has a
starting point. Earlier development used version 0.0.0; the package now shares one version with the
other Underglass packages.

- Opt-in build-time compiler for selected CSS animations listed in `underglass.config.json`,
  producing literal WGSL and matching native-geometry samplers in `virtual:underglass/compiled`.
- Vite (`./vite`) and webpack (`./webpack`) integrations that reuse the application's own CSS, Sass,
  PostCSS and CSS Modules pipeline.
