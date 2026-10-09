# Hold back elements whose props have not finished streaming

## Metadata

- Branch: `main` (this repo commits straight to main)
- Base commit: `cba4ec0`
- Status: **released** in ngx-json-render 0.9.0 (with ngx-json-render-material 0.3.12), 2026-10-09
- Last updated: 2026-10-09
- Last agent/tool: Claude Code (Opus 5.5)

## Objective

While `loading` is true, do not mount an element's component until its props
validate against that component's catalog schema. Until then, render a
per-component placeholder instead.

## What shipped

- `RegistryEntry.fallback?: Type<unknown>` (`lib/types.ts`). `Components<C>`
  (what `defineRegistry` takes) now accepts `{ component, fallback }` as well
  as a bare component; `defineRegistry` carries it into the entry next to the
  catalog's slots (`lib/registry.ts`).
- `propsArrived(element, catalog)` in `lib/render-limits.ts`: `safeParse` of
  the raw props, ignoring issues that reach an expression (same rule as
  `catalogIssues`). Not exported from the public API.
- `JsonRenderRootContext.catalog`, wired from the renderer's `catalog` input.
- `JrElement.held` (`lib/element.component.ts`): held while loading, catalog
  given and props not arrived; latches to "mounted" once the real component
  shows (visible, not refused), after which it reads no signals.
  `component()` returns the entry fallback while held.
- Docs: README "Placeholders while props stream" under Streaming, `catalog`
  row in the inputs table and the `catalog` input doc comment; agent skill
  paragraph under Streaming and its inputs row.
- Tests: `lib/streaming-gate.spec.ts`, 14 cases (fallback then component,
  no fallback, no catalog, loading ends, not loading, expression prop,
  latch, fallback with `<jr-children>`, type without schema, `propsArrived`
  edge cases, `defineRegistry` with fallback).

## Decisions made

- Check the raw spec props, not resolved ones. A stream leaves out spec, not
  state; an expression present has arrived. Also keeps state writes from
  re-running schemas. Matches how `validate` treats expressions.
- The gate is on whenever `catalog` is bound and `loading` is true,
  independent of `validate`. No separate opt-in input.
- A schema that throws, or fails without issues, counts as not arrived; the
  element mounts when loading ends.
- No latch reset if an element's `type` changes mid-stream (rare; the entry
  changes and the outlet remounts anyway).

## Behaviour change to call out in the release notes

An app that already binds `[catalog]` while streaming now sees elements with
incomplete props appear only once complete (or as their fallback), instead
of half-filled. In this repo nothing does: the demo binds `catalog` only on
`<json-render-devtools>`.

## Verification (2026-10-09, before commit)

- `npm run build` — pass.
- `npm test` — pass: ngx-json-render 416/416 with coverage thresholds,
  demo 73/73, mcp-app 17/17, Material 78/78, schematics.
- `npm run check:skills` — all 9 snippet modules compile.
- `git diff --check`, prettier on changed files — clean.
- Note: coverage dropped below threshold until `npm run build:lib` was
  rerun; the `testing` entry point runs the built renderer, and stale `dist/`
  source maps land on the edited `src` files.
- Browser: not run; no app in the repo binds `catalog` on `<json-render>`.

## Possible follow-ups (not started)

- Material catalog skeleton fallbacks (`ngx-json-render-material`).
- Bind `[catalog]` in the demo streaming page so the replay shows the gate.

## Next concrete step

None. Archived after the 0.9.0 release; the follow-ups above are not queued.
