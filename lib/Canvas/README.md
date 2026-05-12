# Canvas module (`lib/Canvas`)

Server-side drawing stack for Apexify.js (`@napi-rs/canvas`, charts, GIF, video helpers).

## Layout

| Path | Contents |
| --- | --- |
| `ApexPainter.ts` | Main class: `createCanvas`, `createImage`, `createText`, charts, GIF, video, paths, batch/chain, etc. |
| `services/` | **Creators** used by `ApexPainter` (canvas, image, text, chart, GIF, video, Path2D, hit detection, pixels, text metrics). |
| `utils/canvasUtils.ts` | Large barrel: re-exports helpers for the `CanvasUtils` npm namespace. |
| `utils/types/` | Shared types (`ImageProperties`, `TextProperties`, GIF types, …). |
| `utils/foundation/` | Core helpers: errors, path commands, Path2D utilities. |
| `utils/chart/` | All chart implementations and chart layout. |
| `utils/text/` | Text metrics, curved layout, enhanced renderer. |
| `utils/image/` | Image properties pipeline, filters, masking, effects. |
| `utils/shape/` | Shape drawing helpers. |
| `utils/background/` | Background color, gradient, layers, noise. |
| `utils/drawing/` | Custom / advanced lines. |
| `utils/pattern/` | Pattern renderer. |
| `utils/video/` | Video helper class used by `ApexPainter`. |
| `utils/ops/` | Batch/chain ops, conversion, stitching, compression, general image helpers. |

## Scene / Surface roadmap

See the repo root `apexify_scene_surface_architecture.md` for the planned **Scene / Layer / Surface** API (single compositing session, less PNG churn).
