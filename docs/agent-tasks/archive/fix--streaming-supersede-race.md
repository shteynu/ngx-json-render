# Stop a superseded stream from clearing isStreaming

## Metadata

- Branch: `fix/streaming-supersede-race`
- Base branch: `main`
- Base commit: 15b4d02
- Current HEAD: one commit on top of the base (`git log --oneline main..`); worktree clean
- Status: implemented, verified
- Last updated: 2026-08-29
- Last agent/tool: Claude Code (Opus 5)

## Objective

`injectUIStream.send()` and `injectChatUI.send()` abort any in-flight request
before starting a new one, but the aborted request still runs its own
`finally { isStreaming.set(false) }`. Because the abort rejection arrives a
turn later, the superseded request clears the flag while its replacement is
still streaming.

## User-visible outcome

Sending a second prompt while the first is still streaming no longer kills the
loading state: the spinner and `<json-render [loading]>` stay on until the
request that is actually running finishes.

## Context

Found in the same code review as the action-dispatch defects. Reproduced with
a probe before the edit: with two overlapping `send()` calls, `isStreaming()`
read `false` while the second stream was still open.

Sibling task: `fix--action-dispatch-errors.md` (separate branch off the same
base; the two do not touch the same files).

## Scope

- `projects/ngx-json-render/src/lib/streaming.ts`
- `projects/ngx-json-render/src/lib/streaming.spec.ts`

## Non-goals

- Queueing or cancelling semantics beyond "last send wins" — unchanged.
- The partial assistant message an aborted chat request leaves behind —
  pre-existing behaviour, deliberately untouched.

## Acceptance criteria

- A superseded request does not clear `isStreaming`, set `error`, or invoke
  `onError`.
- The surviving request still clears the flag when it finishes.
- `npm run build` and `npx ng test ngx-json-render` green.

## Relevant repository instructions

`AGENTS.md`: the builds are the typecheck; library change → `npm run build:lib`
then `npx ng test ngx-json-render`. Public API unchanged, so no README update
is owed.

## Decisions made

- Each `send()` captures its own `AbortController` in a local and compares it
  against the shared one (`isCurrent()`) before touching shared signals. This
  keeps "last send wins" without adding a request-id or a queue.
- The `catch` also bails out when `!isCurrent()`, so a superseded request that
  fails for a non-abort reason (connection reset) cannot overwrite the live
  request's `error` or fire `onError`.

## Assumptions

- Only the newest request may write shared state; older ones unwind silently.

## Completed

- `injectUIStream.send()` and `injectChatUI.send()` both guard `isStreaming`,
  `error` and the `onError` callback behind `isCurrent()`, and pass their own
  `controller.signal` to `fetch` rather than reading the shared field.
- Three regression tests in `streaming.spec.ts`, plus an `openStream()` helper
  (a body the test holds open, can push to, close, abort as fetch would, or
  fail with an arbitrary error) and a `tick()` helper.

## In progress

Nothing.

## Remaining

Nothing in scope.

## Changed files

- `projects/ngx-json-render/src/lib/streaming.ts`
- `projects/ngx-json-render/src/lib/streaming.spec.ts`

## Verification evidence

### Passed

- `npm run build` (library, Material catalog, demo) — exit 0.
- `npx ng test ngx-json-render` — 32/32 (29 pre-existing + 3 new).
- `npx ng test demo` — 1/1.
- Regression proof: with `streaming.ts` restored to its HEAD version and the
  new tests kept, all three fail — twice `expected false to be true` on
  `isStreaming` mid-stream, and `expected Error: connection reset to be null`
  for the superseded failure. Restored afterwards; the fix makes them pass.

### Failed

None.

### Blocked or not run

- `npm run test:material` — not run: the catalog is untouched, and its runner
  does not exit (documented in the catalog README).
- `npx prettier --check` — not run as a gate: `.prettierrc` sets
  `printWidth: 100` while the codebase is written at 80, so it fails on
  untouched files too. Added lines follow the surrounding style.

### Environment

Local macOS, Node from the workspace toolchain, Angular 21 workspace.

### Residual risk

- The guard is identity-based on the controller. If a future change reassigns
  `abortController` for any reason other than a new `send()`, the in-flight
  request would go silent. There is no such path today.

## Failed approaches

None.

## Known risks

None beyond the residual risk above.

## Approval gates

None.

## Questions requiring an owner decision

None.

## Next concrete step

Nothing on this branch. The next finding from the review is the missing
validation wiring in the Material catalog (`ngx-json-render-material` form
components never register a field, so `validateForm` always reports valid).
