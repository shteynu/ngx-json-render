# Cover the renderer services with unit tests

## Metadata

- Branch: `test/renderer-service-coverage`
- Base branch: `main`
- Base commit: `15b4d02`
- Current HEAD: `779a6d9` on `main` — the branch was merged and deleted
- Status: complete
- Last updated: 2026-08-29
- Last agent/tool: Claude Opus 5 / Claude Code

## Objective

Close the test gaps the code audit found: the built-in actions, the whole
validation service and the controlled mode of the state service had no
coverage at all, which is exactly where the defects fixed on the four
preceding branches lived.

## User-visible outcome

None — this branch adds tests only. No library source changes, so the
published surface and behaviour are untouched.

## Scope

- `projects/ngx-json-render/src/lib/actions.spec.ts` (new)
- `projects/ngx-json-render/src/lib/validation.spec.ts` (new)
- `projects/ngx-json-render/src/lib/state.spec.ts` (new)

## Non-goals

- Catalog (Material) coverage — a separate branch owns that.
- Any change to library source. This branch must stay test-only.

## Acceptance criteria

- The three new specs pass, and the existing suites stay green.
- Each new spec pins behaviour that a plausible mutation of the source
  would break (see `Verification evidence`).

## Decisions made

- The specs provide `JsonRenderRootContext` and the subtree services
  directly instead of rendering `<json-render>`. The root context is the
  documented internal bridge between the component's inputs and the
  services, so assigning its signals reproduces the real wiring without
  dragging a component, a registry and a spec into every test.
- `TestBed.tick()` drives the effects. `flushEffects()` is deprecated in
  favour of it in Angular 21.
- `root.store` is set up as a writable signal so the controlled/uncontrolled
  mode-switch warning can be triggered after construction.

## Completed

Built-in actions (`actions.spec.ts`, 13 tests): `pushState` resolving
`$state` refs, `$id` and `clearStatePath`, distinct ids per append, a
missing array treated as empty; `removeState`; `push`/`pop` through the nav
stack including a pop on an empty stack; `validateForm` at the default
`/formValidation` and at a custom `statePath`. Dispatch: the no-handler
warning, `registerHandler`, runtime-over-host precedence, and
`loadingActions` during, after and on rejection.

Validation (`validation.spec.ts`, 16 tests): `validate` against nested and
missing paths and its recorded field state, `validateAll` over registered
fields, `touch` preserving an earlier result, `clear`, the `enabled`
short-circuit, a custom validation function from the renderer input, and a
check argument resolved from state. For `injectFieldValidation`:
registration, the exposed signals, a path that changes, and the no-config
case registering nothing.

State (`state.spec.ts`, 15 tests): uncontrolled seeding, `set`/`update`
batching and change notification, `subscribeChanges` unsubscribe, an
unchanged write notifying nobody, and the streaming case where `spec.state`
grows without clobbering a user edit. Controlled: read/write through the
external store, no `stateChange` output, propagation of a direct external
write, the initial state being ignored, and the one-shot mode-switch
warning. Plus `injectStateValue`, `injectStateBinding` and
`injectBoundProp`.

## Remaining

Nothing on this branch.

## Verification evidence

### Passed

- `npm run build` — all three projects build (the builds are the typecheck).
- `npm test` — `ngx-json-render` 73/73 (was 29), `demo` 1/1.
- Mutation check, since a test-only branch has no "revert the fix" step.
  Four independent mutations of the source, each caught by exactly the
  intended test and then reverted:
  - `state.service.ts`, dropping the changed-leaf guard in the initial-state
    diff → *applies leaves added to the initial state while streaming* fails
    with `expected 'Draft' to be 'Edited by the user'`.
  - `state.service.ts`, dropping the `!root.store()` guard before
    `emitStateChange` → *does not emit stateChange* fails.
  - `validation.service.ts`, `touch` forcing `validated: true` → *touch marks
    a field without validating it* fails.
  - `validation.service.ts`, `isValid` defaulting to `false` → *exposes the
    field state as signals* fails.

### Blocked or not run

- `prettier --check` still fails on files this branch never touched:
  `.prettierrc` sets `printWidth: 100` while the codebase is written at 80.
  Pre-existing, not enforced in CI, deliberately not "fixed" here.

### Environment

macOS, Node via npm 10.9.8, Angular 21.2, Vitest 4.1.

### Residual risk

The specs bypass `<json-render>` and wire the services directly, so a
regression in how the component itself assigns the root-context signals
would not be caught here. `renderer.spec.ts` covers that path.

## Next concrete step

None — the branch is finished and committed. Merge order note: the Material
README's test count differs between `fix/material-test-runner-exit` (8/8)
and `feat/material-validation` (12/12); after both land the correct number
is 12.
