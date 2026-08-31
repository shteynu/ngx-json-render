# Validated streaming: check the spec the model produced before trusting it

## Metadata

- Branch: `feat/validated-streaming`
- Base branch: `main`
- Base commit: `9f2ea0d`
- Current HEAD: the tip of `feat/validated-streaming`, one commit on top of
  `9f2ea0d`; worktree clean, nothing pushed
- Status: implemented and verified
- Last updated: 2026-08-31
- Last agent/tool: Claude Code (Opus 5)

## Objective

`@json-render/core` ships `validateSpec`, `autoFixSpec` and `formatSpecIssues`,
and this package's own README calls specs "attacker-shaped input" — but there
is no way to ask the renderer to check one. The demo had to hand-roll
`SpecCheck` to show the question being answered, which is the proof the need is
real. Bring it into the library: an opt-in `[validate]` input on the renderer
and the same check on the completed spec in both streaming hooks.

Roadmap framing: no json-render renderer, React included, has a client-side
validated-streaming story. The mechanics are already in the peer dependency;
what is missing is the seam.

## User-visible outcome

`<json-render [validate]="'warn'">` reports a malformed spec instead of
rendering half of it silently, and quietly relocates the fields a model most
often misplaces (`visible` / `on` / `repeat` inside `props`) so they take
effect. `'strict'` refuses to render a spec with errors at all. The hooks
expose `issues()` for the completed generation, and in `'strict'` mode a
generation with errors fails instead of handing the app a broken UI to persist.

## Scope

- New `projects/ngx-json-render/src/lib/spec-validation.ts` — one `checkSpec`
  helper wrapping the core calls, used by the renderer and both hooks.
- `renderer.component.ts` — `[validate]` input.
- `streaming/ui-stream.ts`, `streaming/chat-ui.ts` — `validate` option and an
  `issues` signal.
- `public-api.ts` — the mode type, plus the core types the new signatures
  expose (`SpecIssue`) and the validation entry points themselves.
- Tests and a README section.

## Non-goals

- Catalog-level validation (does the component type exist, do the props match
  the Zod schema). `validateSpec` is structural only; the catalog half is a
  separate finding.
- Error/fallback UX — a `(specError)` output, per-element error boundaries.
  That is a later roadmap item and would fix this feature's shape prematurely.
- Lossy auto-fixes (pruning content). Core's own guidance is to re-prompt
  instead, and a renderer silently deleting elements is the wrong default.

## Decisions made

- **Validation is suppressed while `loading` is true.** A half-streamed spec is
  supposed to have missing children; validating it would report noise on every
  patch. The renderer already suppresses missing-child warnings the same way.
- **Lossless auto-fixes are applied when validation is on**, and reported. They
  only relocate misplaced fields, so nothing is discarded and the spec renders
  the way the model meant.
- **`'off'` is the default**, so no existing app changes behaviour.

## Completed

- `spec-validation.ts` — `checkSpec` (lossless auto-fix, then `validateSpec`)
  and `reportSpecCheck` (fixes as info; issues at the severity the mode gives
  them), shared by the renderer and both hooks.
- `renderer.component.ts` — `[validate]`; the root context now receives the
  checked spec, so a relocated `visible` is the one the tree renders, and
  `rootKey` returns null under `strict` when errors survive.
- `ui-stream.ts` / `chat-ui.ts` — `validate` option, `issues` signal, the
  fixed spec published back, and under `strict` an error instead of
  `onComplete`. A chat reply that produced no spec is not judged.
- `public-api.ts` — `checkSpec`, `SpecCheck`, `SpecValidationMode`, plus the
  core symbols the new signatures expose (`SpecIssue`, `validateSpec`,
  `autoFixSpec`, `formatSpecIssues`).
- 11 tests (5 renderer, 6 streaming) and a README section, an inputs-table row
  and an API-list entry.

## Decisions made (added during implementation)

- **The demo keeps its own `SpecCheck`.** It renders issues in the page and
  also checks component types against the chosen catalog, which `validateSpec`
  does not do. The library feature is the structural half, reported to the
  console; replacing the demo panel with it would lose both.

## Verification evidence

### Passed

- `npm run build` from an emptied `dist/` — all three projects; the builds are
  this workspace's typecheck and the public API changed.
- `npx ng test ngx-json-render --coverage` 184/184 (11 new), `npx ng test demo
  --coverage` 58/58, `npm run test:material` 61/61 at 99.01% statements.
- `npm run format:check` (after one `prettier --write` on the spec).

### What the new tests actually prove

Two are behavioural rather than about reporting: a `visible` misplaced inside
`props` hides its element after the fix and renders without it, and `strict`
leaves the DOM empty for a spec whose root child never arrived while `warn`
renders the same spec. The streaming pair proves `onComplete` does not fire
under `strict`, which is the contract an app persisting specs there depends
on.

### Blocked or not run

- No test drives a real model; the streaming suites replay canned JSONL, as
  the existing ones do.

## Next concrete step

Decide whether the demo should expose the new mode anywhere, or keep its own
`SpecCheck` panel as the only visible surface (current decision: keep it).
