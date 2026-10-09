# Streamed sales dashboard with charts in the demo

## Metadata

- Branch: feat/demo-dashboard
- Base branch: main
- Base commit: 1070bfe
- Current HEAD: 1070bfe
- Status: done — committed and merged into main
- Last updated: 2026-10-09
- Last agent/tool: Claude Code

## Objective

One eye-catching example for posts (the promotion push: "one striking
example — one post"): a dashboard with charts that a model streams from one
prompt, shown on the demo's first screen and in `docs/streaming.gif`.

## Decisions made

- Lives in the demo, not a new `examples/` app: the landing's autoplay shows
  it with no click, the README GIF is captured from it, nothing new to
  maintain. User picked "дашборд" on 2026-10-09.
- Charts are plain SVG in the demo catalog (no chart library), streaming-safe:
  every prop may be missing; the line's x axis is fixed by `labels`, so
  `add /series/0/values/-` patches grow it left to right.
- Colours: dataviz reference palette slots 1–4, validated light and dark
  (blue/orange ΔE 24.7/26.8 CVD). Legend for ≥2 series, crosshair + tooltip,
  hidden data table for screen readers, bars animate `transform`, not width.
- Recording is hand-authored like the existing ones (no API key here).

## Completed

- `catalog/charts.ts` + `charts.css`: `Grid`, `LineChart`, `BarChart`,
  `Sparkline`; `Metric` gained `trend`. Catalog and registry entries.
- `specs/stream.ts`: `SALES_DASHBOARD` (32 lines) is now `RECORDINGS[0]`, so
  the landing autoplays it.
- `streaming.spec.ts` finds recordings by label; new dashboard test.
  `charts.spec.ts` covers helpers, half-streamed props, axis stability,
  legend/table, tooltip, bars, sparkline. Playground test now uses `Toolbar`
  as the type the demo catalog lacks (it has `Grid` now).
- `scripts/capture-streaming-gif.mjs`: broken by the landing commit (looked
  for a `button` "Streaming"); now opens `#playground`, hides `.hero` and
  `app-key-panel`, clicks the tab link so autoplay starts, 24 frames, height
  1060. `docs/streaming.gif` reshot with the dashboard.

## Verification evidence

### Passed

- `npm run build:lib`, `npx ng test demo --coverage` (8 files, 70 tests,
  thresholds held), `npx ng build demo` with no warnings, `npm run
  check:zoneless`, Prettier on every changed file — 2026-10-09.
- Browser: 1440x900 light mid-stream (line growing) and finished; tooltip at
  W7 shows both series; 375x812 dark: no overflow, 2x2 KPI tiles, charts
  stacked, chart width follows the card (301px).
- `npm run capture:gif` ran end to end; last frame checked by eye.

### Blocked or not run

- Material catalog and library untouched, so their suites were not run.

## Known risks

- The y axis rescales once mid-stream (top $100K → $120K) when this year's
  line passes 100K; visible in the GIF as one jump.

## Approval gates

- Commit and push (push deploys Pages and updates the npm README's GIF via
  its raw `main` URL) — user's.

## Next concrete step

None — archived. After the push, check the live demo and the npm README GIF.
