# A testing entry point: `ngx-json-render/testing`

## Metadata

- Branch: `feat/testing-entry-point`
- Base branch: `main`
- Base commit: `9f2ea0d`
- Current HEAD: `d4015a5` on `main` — the branch was merged
- Status: done, verified, merged into `main`
- Last updated: 2026-09-01
- Last agent/tool: Claude Code (Opus 5)

## Objective

The audit's last "ближайшие недели" item. Every project adopting this package
rewrites the same test scaffolding: a host component, a TestBed module, a
zoneless provider, two settle passes, `querySelector`, and — for anything that
streams — a hand-rolled fake `fetch` with a `ReadableStream` and an abort
listener. This workspace has written it three times over (the library specs,
the catalog specs, the demo's recorded transport), which is the definition of
something the package should ship.

## User-visible outcome

`renderSpec(spec, { registry })` mounts a spec and hands back the handful of
things a test does to one, including a record of every action the spec
dispatched. `recordedTransport(lines)` answers the streaming hooks from a
recording, and `specStream(spec)` writes those lines from a spec, so a
streaming test says what it renders instead of how the wire spells it.

## Decisions made

- **A secondary entry point, not the main one.** Test utilities pull in
  `@angular/core/testing`; shipping them from the main entry means an app
  bundle can reach them by accident.
- **The testing entry imports the primary by package name.** A relative
  import would inline a second copy of the renderer — a second set of DI
  tokens, and a harness whose `injectRenderContext` does not match the
  component under test's.
- **No `@angular/platform-browser`.** `By.directive` was the only thing that
  wanted it; a predicate on `componentInstance instanceof JsonRenderer` is
  the same line without a new peer dependency.
- **`dispatched` wraps handlers too**, not just `onAction` — otherwise it
  would silently omit exactly the actions a test bothered to wire up.
- **`renderSpec` tolerates an already-configured TestBed** (a test that used
  `runInInjectionContext` first, or a second `renderSpec` in one test) and
  fails only when it was given `providers` it cannot apply.
- **`find` throws with the rendered HTML** rather than returning null: the
  failure names the mismatch instead of leaving the reader to print it.

## Non-goals

- Replacing the existing suites' own helpers. `material.spec.ts` keeps its
  scaffolding; churning 61 passing tests to prove a point is not a fix.
- A DOM assertion library. `fixture` and `element` are exposed so the harness
  is a shortcut, not a wall.

## Verification

Ran from a clean `dist/` on 2026-08-31, all green: `npm run build`,
`ng test ngx-json-render --coverage` (189 passed, statements 95.57% — up from
94.71%), `ng test demo --coverage` (58 passed), `npm run test:material`
(63/63, statements 99.01%), `npm run format:check`, `npm run check:peers`.

- New `projects/ngx-json-render/testing/src/testing.spec.ts`: 15 tests over
  the harness and the transport.
- New `projects/ngx-json-render-material/src/lib/harness.spec.ts` uses the
  built entry point the way a consumer would — proving the export map, the
  self-import and the harness against a catalog it knows nothing about. It
  caught the one real bug in this branch: `renderSpec` throwing on an
  already-instantiated TestBed.
- `test.options.include` in `angular.json` is new, so the `angular-compat`
  job's own steps ran in a throwaway checkout (AGENTS.md). Angular 20's
  `@angular/build:unit-test` schema does declare `include`, so the key does
  not need adding to the list `scripts/angular-compat.mjs` strips.

## Next concrete step

None. The branch is merged into `main`.
