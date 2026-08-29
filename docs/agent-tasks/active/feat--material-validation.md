# Wire the Material catalog to the validation service

## Metadata

- Branch: `feat/material-validation`
- Base branch: `main`
- Base commit: 15b4d02
- Current HEAD: one commit on top of the base (`git log --oneline main..`); worktree clean
- Status: implemented, verified
- Last updated: 2026-08-29
- Last agent/tool: Claude Code (Opus 5)

## Objective

The renderer ships `injectFieldValidation`, a `JsonRenderValidationService` and
a built-in `validateForm` action, but no component in the Material catalog ever
registered a field. A spec built from that catalog could not express a
validated form at all: `validateForm` always reported `{valid: true,
errors: {}}`, and `required` on `Input` drew an asterisk that enforced nothing.

## User-visible outcome

A spec can declare per-field checks on the Material inputs and get real
behaviour: messages in the form field's subscript, the field in its Material
error state, and a truthful `validateForm` result in state.

## Context

Fifth finding from the code review. The first four are fixed on
`fix/action-dispatch-errors` and `fix/streaming-supersede-race`.

## Scope

- `projects/ngx-json-render-material/src/lib/field.ts` (new)
- `projects/ngx-json-render-material/src/lib/form.components.ts`
- `projects/ngx-json-render-material/src/lib/catalog.ts`
- `projects/ngx-json-render-material/src/lib/material.spec.ts`
- `projects/ngx-json-render-material/README.md`

## Non-goals

- `Slider` and `SlideToggle`: both always hold a valid value, so a check would
  have nothing to reject.
- New validation check types — the catalog exposes what core already ships.
- The demo app's own catalog, which is separate from the Material one.

## Acceptance criteria

- A bound field with checks shows its messages and puts the control into the
  Material error state.
- `validateForm` reports every bound field's errors and an accurate `valid`.
- A validation config on an unbound field is inert rather than throwing.
- `npm run build` green; Material suite green.

## Relevant repository instructions

`AGENTS.md`: catalog change → `npm run build:lib`, `npm run build:material`
(the build type-checks every catalog template) and `npm run test:material`
locally, run with a timeout because the runner does not exit. The catalog is a
public contract, so the package README had to change with it.

## Decisions made

- **Validation is a prop, not an element field.** Core's `UIElement` has no
  `validation` slot (only `visible`, `on`, `repeat`, `watch`), so the config
  travels as a component prop typed with core's own `ValidationConfigSchema` —
  which also puts it in the JSON schema the model generates against.
- **The field's state path is its binding.** No separate path prop: the checks
  run against whatever `$bindState` / `$bindItem` the value prop resolves to.
  An unbound field registers nothing, because `registerField` keys on a path
  and `validateForm` reports per path.
- **`required` stays presentational.** Enforcement comes only from a `required`
  check, so there is one source of truth. The asterisk is now drawn by either
  spelling, so `required: true` is never silently ignored on screen.
- **Two `validateOn` defaults.** `blur` for `Input`/`Textarea`, `change` for
  `Select`/`Checkbox`/`RadioGroup`. Validating typed text on every keystroke is
  noisy; a discrete choice is deliberate. The spec can always override.
- **Error state is written into the Material control.** `MatInput`/`MatSelect`
  normally derive `errorState` from an `NgControl`, which a spec-driven field
  does not have. Both expose a settable `errorState`, and their `ngDoCheck`
  only recomputes it when an `NgControl` is present, so the written value
  sticks; `stateChanges.next()` is what makes the OnPush form field re-render.
  Verified against `@angular/material` 21.2.14 sources.
- `Checkbox` and `RadioGroup` render their own error line: they are not inside
  a `mat-form-field`, so there is no subscript to host `<mat-error>`.

## Assumptions

- The helper stays internal: it is not exported from `public-api.ts`, since a
  custom replacement component would use the library's public
  `injectFieldValidation` directly.

## Completed

- `field.ts`: `injectJrmField(ctx, prop, defaultValidateOn)` returning
  `errors`, `invalid`, `required`, `set` and `blur`.
- Five components wired; `syncErrorState()` shared by the three that live in a
  `mat-form-field`.
- `validation` added to those five catalog entries, with a description that
  lists the check types and states the binding requirement.
- README: a `Validation` section, plus the two traps below.
- Four tests in `material.spec.ts`.

## In progress

Nothing.

## Remaining

Nothing in scope.

## Changed files

See `Scope`; all five, one of them new.

## Verification evidence

### Passed

- `npm run build` (library, Material catalog, demo) — exit 0. The catalog build
  type-checks every component template.
- `npx ng test ngx-json-render-material` — 12/12 (8 pre-existing + 4 new).
- `npx ng test ngx-json-render` — 29/29; `npx ng test demo` — 1/1.
- Regression proof: with `form.components.ts` and `catalog.ts` restored to
  their HEAD versions, three of the four new tests fail, including the headline
  one — `expected { valid: true, errors: {} } to deeply equal { valid: false,
  errors: { …(2) } }`. Restored afterwards; all pass with the change.

### Failed

None.

### Blocked or not run

- `npx prettier --check` — not run as a gate: `.prettierrc` sets
  `printWidth: 100` while the codebase is written at 80, so it fails on
  untouched files too.
- The Material runner still does not exit (pre-existing, documented in the
  package README). Runs were backgrounded, read from the log, then killed.
  There is no `timeout(1)` on this macOS host.

### Environment

Local macOS, Angular 21 workspace, `@angular/material` 21.2.14.

### Residual risk

- `syncErrorState` depends on `MatInput`/`MatSelect` keeping a settable
  `errorState` and on `ngDoCheck` not recomputing it without an `NgControl`.
  Both are load-bearing across a Material major upgrade; the error-display
  tests would catch a change.
- `required` does not reject `false`, so a must-be-ticked checkbox needs
  `equalTo` with `args: {other: true}`. That is core's behaviour, documented in
  the README rather than worked around here.

## Failed approaches

None.

## Known risks

None beyond the residual risk above.

## Approval gates

None.

## Questions requiring an owner decision

- Whether `Slider` and `SlideToggle` should also accept `validation` for
  symmetry, even though neither can hold an invalid value.

## Next concrete step

Nothing on this branch. Remaining findings from the review: the Material tests
still do not run in CI (the runner hang), and the untested areas of the
renderer — `actions.service` built-ins, `validation.service`, controlled-mode
`state.service`.
