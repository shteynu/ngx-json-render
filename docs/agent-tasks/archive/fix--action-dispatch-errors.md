# Fix the action-dispatch error paths

## Metadata

- Branch: `fix/action-dispatch-errors`
- Base branch: `main`
- Base commit: 15b4d02
- Current HEAD: one commit on top of the base (`git log --oneline main..`); worktree clean
- Status: implemented, verified, committed on this branch (not pushed)
- Last updated: 2026-08-29
- Last agent/tool: Claude Code (Opus 5)

## Objective

Repair three defects in the action dispatch path of `ngx-json-render`, all
reproduced with throwaway probe specs before any edit:

1. An action gated behind `confirm` reports `{ok: true, durationMs: 0}` to the
   core action observers the moment the dialog opens, and never reports the
   real outcome. Cause: `execute()` returns the confirmation promise from
   inside its own `try/finally`, so `finally` — and with it
   `notifyActionSettle` — runs before the user has answered.
2. Cancelling that dialog rejects with `Error: Action cancelled`, which escapes
   as an unhandled rejection because `RenderContext.emit` is fire-and-forget
   (`void this.emitEvent(event)`).
3. An action handler that rejects escapes the same way, while the `watch` path
   in the same component catches with `.catch(console.error)` — one code path,
   two error policies.

## User-visible outcome

Cancelling a confirmation dialog no longer logs an uncaught error; a failing
action handler is logged once instead of surfacing as an unhandled rejection;
devtools and any `registerActionObserver` consumer see the true settle time and
outcome of confirm-gated actions.

## Context

Found during a code review of the workspace; baseline before the change was
green (`npm run build` and `npm test`, 29 + 1 tests).

## Scope

- `projects/ngx-json-render/src/lib/actions.service.ts`
- `projects/ngx-json-render/src/lib/element.component.ts`
- `projects/ngx-json-render/src/lib/renderer.spec.ts`

## Non-goals

- The `isStreaming` race in `streaming.ts` (separate finding, separate task).
- Validation wiring in the Material catalog (separate finding).
- The Material test-runner hang.

## Acceptance criteria

- Cancelling a confirm dialog: handler not run, no unhandled rejection, no
  `console.error`.
- A rejecting handler: logged once via `console.error`, no unhandled rejection.
- No settle event while a confirmation is pending; exactly one settle after the
  answer, carrying the real outcome.
- `npm run build:lib` + `npx ng test ngx-json-render` green.

## Relevant repository instructions

`AGENTS.md`: the builds are the typecheck. Library change →
`npm run build:lib` then `npx ng test ngx-json-render`; the public API is
unchanged here, so the Material/demo builds are not required (run anyway if
cheap). `main` is deployed state — work happens on this branch.

## Decisions made

- Keep `execute()` rejecting on cancellation (unchanged contract); give the
  rejection a stable `name` of `ActionCancelledError` so callers and the
  renderer can tell a cancellation from a real failure. The class is exported
  from the module for internal use but deliberately **not** added to
  `public-api.ts`, so the published surface is unchanged and no README update
  is owed.
- Cancellation is reported to observers as `ok: false` with the cancellation
  error: the action genuinely did not complete, and `ActionSettleInfo` has no
  third state.

## Assumptions

- Consumers matching on the old message string keep working: the message stays
  exactly `Action cancelled`.

## Completed

- `execute()` now awaits the confirmation promise instead of returning it, so
  `notifyActionSettle` fires after the handler has really settled.
- Cancellation rejects with `ActionCancelledError` (message unchanged:
  `Action cancelled`; `name` is the new stable discriminator).
- Both fire-and-forget emit paths (`RenderContext.emit` and the handle returned
  by `on()`) route through `fireEvent()`, which catches via
  `reportActionError()`: cancellations stay silent, real failures are logged
  once. The `watch` path now shares that same reporter.
- Three regression tests added to `renderer.spec.ts`, plus an
  `unhandledRejections()` helper and a shared `CONFIRM_SPEC` (the existing
  confirm test was re-pointed at it).

## In progress

Nothing.

## Remaining

Nothing in scope.

## Changed files

- `projects/ngx-json-render/src/lib/actions.service.ts`
- `projects/ngx-json-render/src/lib/element.component.ts`
- `projects/ngx-json-render/src/lib/renderer.spec.ts`
- `docs/agent-tasks/active/fix--action-dispatch-errors.md` (untracked, new)

## Verification evidence

### Passed

- `npm run build` (library, Material catalog, demo) — exit 0. The builds are
  this workspace's typecheck.
- `npx ng test ngx-json-render` — 32/32 (29 pre-existing + 3 new).
- `npx ng test demo` — 1/1.
- Regression proof: with `actions.service.ts` and `element.component.ts`
  restored to their HEAD versions and the new tests kept, all three fail with
  exactly the targeted symptoms — `[Error: Action cancelled]` leaked,
  `[Error: handler blew up]` leaked, and a settle event present while the
  dialog was still open. Restored afterwards; the fix makes them pass.

### Failed

None.

### Blocked or not run

- `npm run test:material` — not run: the catalog is untouched by this change,
  and its runner does not exit (documented in the catalog README).
- `npx prettier --check` on the touched files fails — but it also fails on the
  same three files at HEAD. `.prettierrc` sets `printWidth: 100` while the
  whole codebase is written at 80, so a `--write` would reformat unrelated
  code. Left alone deliberately; the added lines follow the surrounding style.

### Environment

Local macOS, Node from the workspace toolchain, Angular 21 workspace.

### Residual risk

- Observers now see `ok: false` with an `ActionCancelledError` when a user
  cancels. Any devtools consumer that counts failed settles as errors will
  count cancellations too. This is judged correct — the action did not run —
  but it is a visible behaviour change.

## Failed approaches

## Known risks

- A confirmation that is never answered leaves `execute()` pending forever
  (pre-existing behaviour, unchanged by this task).

## Approval gates

None.

## Questions requiring an owner decision

None.

## Next concrete step

Nothing on this branch. The branch is local only — it becomes visible
elsewhere once pushed. The `isStreaming` race is done on the sibling branch
`fix/streaming-supersede-race`; the next open finding is the missing
validation wiring in the Material catalog.
