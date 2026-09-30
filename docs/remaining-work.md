# Apexify.js — remaining engineering work

This is the active internal work tracker for the package repository.

Completed Phase 0–14 / Phase 14-P evidence and one-off benchmark workflows are intentionally kept in Git history rather than the active tree. Items stay here only while they still require engineering work on current `main`.

## High priority — runtime and security hardening

### Cross-origin redirect header isolation

`lib-next/media/remote-fetch.ts` validates redirect targets, but caller-provided headers are still preserved when a redirect changes origin.

Work remaining:

- detect origin changes across redirects;
- strip sensitive headers on cross-origin hops, including `Authorization`, `Proxy-Authorization`, `Cookie`, `Cookie2`, and `X-Api-Key`;
- retain body/header rewrite semantics for 301/302/303/307/308;
- add local-server regressions proving credentials are not forwarded cross-origin.

### Bound the remote-fetch wait queue

Active requests are bounded, but `remoteWaiters` is still an unbounded in-memory queue.

Work remaining:

- add an explicit runtime limit such as `maxQueuedRemoteFetches`;
- reject excess waiters with a structured `ApexifyResourceLimitError`;
- cover abort, handoff, queue saturation, and recovery behavior.

### Harden chain method resolution

`lib-next/batch/batch-operations.ts` still walks arbitrary dot-separated method paths through object properties.

Work remaining:

- reject unsafe path segments such as `__proto__`, `prototype`, and `constructor`;
- avoid inherited-property traversal;
- preferably move supported chain methods to an explicit registry without breaking the public API.

## Browser / Web runtime hardening

### Prototype-safe preview objects

`packages/web/src/safe-preview-expression.ts` still creates ordinary objects and assigns parsed keys directly.

Work remaining:

- use null-prototype records or an equivalent safe representation;
- reject prototype-mutating keys;
- cover object spread and object-literal parsing with regressions.

### Execution/resource budgets for the safe preview interpreter

The browser interpreter has a depth limit, but does not yet have a complete operation/iteration/string/regex budget.

Work remaining:

- cap total interpreter operations and collection growth;
- cap string/source expansion;
- constrain user-created regular expressions and expensive matching paths;
- fail safely rather than blocking the browser main thread.

### Bring `packages/web` into top-level quality gates

The root `tsconfig.json` currently includes only `lib-next/**/*.ts`. The Web package has its own config, but root maintenance/security audits do not provide equivalent coverage.

Work remaining:

- add an explicit root Web typecheck/audit command or broaden the root quality-gate architecture;
- ensure browser-only code is checked without importing Node-only runtime modules.

## Maintainability

### Split oversized renderer modules without changing behavior

Current hotspots include:

- `packages/web/src/studio-preview.ts` — very large browser renderer/interpreter integration surface;
- `lib-next/chart/impl/linechart.ts`;
- `lib-next/chart/impl/barchart.ts`;
- `lib-next/chart/impl/horizontalbarchart.ts`;
- `lib-next/chart/impl/combochart.ts`.

Decomposition should preserve current golden/regression behavior and avoid creating duplicate rendering policy.

## Performance debt to re-measure

Historical Phase 14-P measurements left optional strong-target gaps for Canvas, Chart, and GIF workloads, plus higher text peak RSS caused by a bounded raw snapshot.

Those old benchmark harnesses have been removed from the active tree because the phase is complete. Before doing new optimization work:

1. establish a fresh benchmark baseline on current `main`;
2. measure representative end-to-end workloads;
3. optimize only reproducible bottlenecks;
4. keep correctness/golden output invariant.

## Maintenance rule

When an item above is completed, remove it from this file in the same commit that closes the work. Do not add historical completion reports back to the active source tree; Git history and `CHANGELOG.md` are the archive.
