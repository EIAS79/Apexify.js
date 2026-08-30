# Phase 3 migration completion

The centralized media-source migration includes canvas custom patterns, gradient blend sources and masks, raster mask sources, stitching, and collage inputs. These callers now resolve through `lib-next/media/source.ts` instead of passing caller-controlled remote/local sources directly to canvas loaders or synchronous filesystem bypasses.
