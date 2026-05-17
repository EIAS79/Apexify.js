# Space shooter video demo

~48-second cinematic vertical shooter rendered with **Apexify.js (lib-next) only** — no direct `@napi-rs/canvas` imports in the test (`animate` → buffers → `createVideo` / FFmpeg).

Includes parallax stars, nebula, engine trails, triple-shot, enemy tiers + boss, combos, floating loot text, explosions, screen flash, vignette, and scanlines.

## Audio

Procedural SFX via **`painter.createAudio.sequence`** / **`createVideo({ mixAudio })`**:

- Events (shots, hits, kills, pickups, waves, boss, death, game over) are logged during simulation.
- One composed WAV (no continuous drone — avoids background buzz).
- **`createVideo({ mixAudio })`** muxes onto the silent render.

Stem: `output/space-shooter-sfx.wav`.

## Requirements

- Node.js 16+
- **FFmpeg** on `PATH` ([install guide](https://ffmpeg.org/download.html))
- Network on first run (Kenney sprites + Press Start 2P font; procedural fallbacks if CDN fails)

## Run

```bash
npm run test:space-shooter
```

Runs **directly from `lib-next/` TypeScript** (no `dist` build required). Imports use relative paths like `../../lib-next/index`.

**No sound?** Open `output/space-shooter-sfx.wav` first. If the WAV plays but the MP4 is silent, re-run — WAV buffers must be muxed as `.wav` (fixed in lib `mixAudio`). The script fails if the final MP4 has no audio track.

Output: `tests/space-shooter-video/output/space-shooter-48s.mp4`

### Split into 3 clips (20s + 20s + 8s, each ≤20 MB)

```bash
npm run split:space-shooter
```

| File | Length |
|------|--------|
| `space-shooter-part1-20s.mp4` | 0:00–0:20 |
| `space-shooter-part2-20s.mp4` | 0:20–0:40 |
| `space-shooter-part3-8s.mp4` | 0:40–0:48 |

Cached assets: `tests/space-shooter-video/assets/`
