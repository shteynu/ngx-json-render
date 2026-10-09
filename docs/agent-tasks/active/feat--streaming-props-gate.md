# Hold back elements whose props have not finished streaming

## Metadata

- Branch: `main` (this repo commits straight to main)
- Base commit: `169578e` (Release ngx-json-render 0.8.2)
- Status: **not started**: recorded 2026-10-09 as a future task
- Last updated: 2026-10-09
- Last agent/tool: Claude Code (Opus 5.5)

## Objective

While `loading` is true, do not mount an element's component until its props
validate against that component's catalog schema. Until then, render a
per-component placeholder instead.

## User-visible outcome

Components never receive half-streamed props (for example `label: undefined`
where the schema requires a string). Each registry entry can have its own
skeleton. Users no longer hand-write the "only elements with type and props"
filter. The LangChain docs PR (langchain-ai/docs#6576) had to show that
filter for both React and Angular.

## Context

Idea taken from `@threadplane/render` 0.3.2 (cacheplane). It calls this a
"mount-readiness gate": an element's fallback is shown until its props pass
the schema (sync validation only). Compared on 2026-10-09 against unpacked
tarballs.

Today in ngx-json-render:

- `JsonRenderer` has one `fallback` input, and it applies only to unknown
  types. `JsonRenderRootContext.resolveEntry` does
  `registry()[type] ?? fallback()` (`projects/ngx-json-render/src/lib/root-context.ts:58`).
- `RegistryEntry` is `{ component, slots? }` (`lib/types.ts:97`), so an
  entry cannot carry a fallback.
- The renderer already takes a `catalog` input (`renderer.component.ts:139`),
  which holds the Zod props schemas the gate needs.
- An element whose props are partial mounts its component with those
  partial props while streaming.

## Scope

- Add an optional `fallback` to `RegistryEntry`. Let `defineRegistry` accept
  it.
- In the element, when `loading()` is true and a catalog is present, run
  `safeParse` on the element's resolved props against its schema. If it
  fails, render the entry's fallback (or nothing). Once it passes, or once
  `loading` turns false, mount the real component.
- Make the check cheap: run it only while `loading` is true, and only for
  elements that are not mounted yet. Once mounted, never unmount back to the
  fallback.
- Document it in the README streaming section and the agent skill
  (`skills/ngx-json-render/SKILL.md`, checked by `npm run check:skills`).

## Non-goals

- Async validators.
- Gating after streaming ends. `validate: 'warn' | 'strict'` already covers
  finished specs.
- Changing what the global `fallback` input means.

## Acceptance criteria

- With a catalog and `loading` true, a component whose required prop has not
  arrived renders its entry fallback, then switches to the real component
  once the prop arrives.
- Without a catalog, behaviour is unchanged.
- After `loading` goes false, every element mounts even if its props are
  invalid. Existing `validate` modes still apply.
- Expressions in props (`$state`, `$template`, …) are resolved before the
  check, or the check skips them. A `{ $state: … }` object must not fail a
  `z.string()`. Decide which, and test it.
- Unit tests in `projects/ngx-json-render` and the full project matrix from
  `AGENTS.md` pass.

## Decisions made

None yet. Open question: check the resolved props or the raw spec props?
Resolved props are more correct but cost more.

## Next concrete step

Read `element.component.ts` around the `resolveEntry` call (line ~416) and
the prop-resolution path. Decide where the gate sits relative to prop
resolution, then write the failing test first.
