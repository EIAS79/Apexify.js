# @apexify/web

Browser-native Apexify runtime source package.

This package owns the direct browser Canvas2D Studio renderer and browser capability/font management. It has no runtime npm dependencies and must not import Node-only Apexify code.

The initial Studio-facing entry points are:

- `createApexifyWebRuntime()`
- `renderApexifyWebPreview()`
- `registerApexifyWebFonts()`
- `getApexifyWebCapabilities()`

The wider retained-mode renderer, animation, interaction, worker, React, and Next integration roadmap remains governed by Apexify.js Phases 20–25. Studio consumes this package instead of maintaining a second browser renderer inside the documentation repository.
