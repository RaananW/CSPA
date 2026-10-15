# Underglass documentation

## Guide

Start here if you are using Underglass or writing components for it.

1. [Getting started](guide/getting-started.md): requirements, install, your first layer, enabling GPU.
2. [Concepts](guide/concepts.md): the two modes, layers, admission, what the GPU adds over CSS.
3. [Motion](guide/motion.md): transitions, groups, `Presence`, animation ownership.
4. [Effects](guide/effects.md): built-in effects and your own WGSL.
5. [Building components](guide/components.md): the standard for components that work in Underglass.
6. [Troubleshooting](guide/troubleshooting.md): every fallback reason and its fix.
7. [Other frameworks and plain DOM](guide/frameworks.md): the core runtime without React, and writing an adapter.

## Reference

- [API reference](api.md): every export, option and contract.
- [Effects contract](effects.md): effect validation, time and fallback rules in detail.
- [Worker compositor](worker.md): the experimental worker path.
- [Distribution](distribution.md): packing and installing the library.
- [Showcase](showcase.md): the example gallery and its deployment.

## Contributing

- [Architecture](architecture.md) and the GPU-first contract.
- [Open issues](open-issues.md): known limits and unperformed validation.
- [Change notes](changes/README.md): one file per pull request.
- [GPU browser tests in CI](ci-gpu-runner.md): the self-hosted GPU runner.
- [3D UI library plan](ui-library/plan.md): proposal for a component library with its own 3D design language.
- [Archive](archive/): the phase-by-phase engineering history, measurements and verification records.
