# `submitForm`: validate and submit in one binding

## Metadata

- Branch: `feat/submit-form`
- Base branch: `main`
- Base commit: `9f2ea0d`
- Current HEAD: `a2a78d5` on `main` — the branch was merged
- Status: done, verified, merged into `main`
- Last updated: 2026-09-01
- Last agent/tool: Claude Code (Opus 5)

## Objective

The audit's composite-action item. A spec could validate a form
(`validateForm`) or dispatch a submit, but not both: nothing in the spec
language could say "submit only if it is valid". So a generated submit button
either skipped validation or produced a validation result nobody acted on, and
the re-check landed in every application's own handler.

## User-visible outcome

One binding on the submit button. An invalid form stops there with its errors
on screen; a valid one dispatches the app's action.

## Decisions made

- **`submitForm` dispatches, rather than calling the handler itself.** The
  submitted action goes back through `execute`, so it gets the same handler
  lookup, `confirm`, loading state, devtools dispatch/settle events and
  `onSuccess` / `onError` as any other action. `submitForm` gates an action;
  it does not become one.
- **Validate first, ask second.** When the binding carries a `confirm`, the
  form is checked before the dialog appears — there is no point asking about
  a form that cannot be submitted anyway.
- **One `checkForm` for both actions.** `validateForm` and `submitForm` must
  report the same thing about the same form; sharing the implementation is
  how that stays true.
- **Nested `params` get `pushState`'s deep resolution.** Core's
  `resolveAction` only resolves the top level of a params object, so
  `{ "$state": "/email" }` one level down would otherwise reach the handler
  unresolved.
- **No new capability.** The submitted action name is looked up in the host's
  registered `handlers` like any other, so a spec cannot reach a handler it
  could not already dispatch directly. Stated in the README's security
  section, where the "a spec can only name actions you registered" claim
  lives.

## Non-goals

- Passing the form's state to the handler implicitly. The spec asks for what
  it wants with `$state` refs; a handler that silently receives the whole
  state model would be a much larger contract.
- A `submitForm` that reports failure through `onError`. Failing validation
  is not an error the app has to handle; the result is in state.

## Verification

Ran from a clean `dist/` on 2026-08-31, all green: `npm run build`,
`ng test ngx-json-render --coverage` (178 passed, statements 95.00%),
`ng test demo --coverage` (58 passed), `npm run test:material` (61/61,
statements 99.01%), `npm run format:check`.

Five of the 178 library tests are new, in `actions.spec.ts`: the happy path
with `$state` refs resolved one level down, the invalid form that submits
nothing and says why, the confirm asked after validation and cancelled, the
forwarded `onSuccess`, and the warning when the binding says what to validate
but not what to submit.

## Next concrete step

None. The branch is merged into `main`.
