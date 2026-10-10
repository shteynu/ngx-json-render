# JsonRenderActivity: pass `loading` while its own run streams

## Metadata

- Branch: fix/activity-loading
- Base branch: main
- Base commit: 4330734
- Status: in progress

## Objective

`JsonRenderActivity` (`ngx-json-render/ag-ui`) never set `loading` on its
`<json-render>`, so inside CopilotKit every intermediate spec was checked as a
finished one. Found in an end-to-end run against `@copilotkit/angular` 0.5.3
and `@copilotkit/runtime` 1.78.0 (Angular 22.2, packed 0.9.8), replaying the
order models stream in (a parent lists its children before they arrive):

| `validate` | While streaming      | Console per reply |
| ---------- | -------------------- | ----------------- |
| `off`      | progressive          | 1 warning         |
| `warn`     | progressive          | 9 warnings        |
| `strict`   | empty until run ends | 9 errors          |

## Acceptance criteria

- No `agent` input: behaviour unchanged (`loading` stays false).
- A run that streams into this activity (snapshot or delta for its message
  id): `loading` true until that run finalizes.
- An activity already on screen when a run starts stays checked unless that
  run sends events to its message id — no flash of a strict-rejected spec.
- Mounted mid-run (CopilotKit mounts on the snapshot): streaming if the
  message comes after the thread's last user message.
- Unsubscribes on destroy and when the agent input changes.
- No runtime dependency on `@ag-ui/*`; the agent is matched structurally.
- No public API change; patch release.

## Decisions made

- Streaming is per message, from `onEvent` on the agent, not "agent is
  running": the latter would re-open validation on every finished activity
  during each later run.
- The end of the run that created the activity is read by polling
  `agent.isRunning` (250 ms, only while streaming). `@ag-ui/client` fixes a
  run's subscribers when it starts and CopilotKit mounts the activity at its
  first snapshot, so that run's `onRunFinalized` never reaches it — seen in
  the stand: `loading` stuck until the next run began.
- `spec` is a computed with JSON equality: CopilotKit hands every activity a
  fresh copy of its content on each event of any run, which re-ran the check
  and re-logged its issues (13 warnings over two turns in the stand).

## Completed

- `projects/ngx-json-render/ag-ui/src/json-render-activity.ts`: `loading`
  from the agent's runs; JSON-equal content keeps the spec.
- `ag-ui.spec.ts`: five tests; the fake agent snapshots subscribers at run
  start like `@ag-ui/client`. Mutation check: dropping the poll or the
  equality fails one test each.
- README "From an AG-UI agent" and `skills/ngx-json-render/SKILL.md` describe
  the behaviour; plugin copy synced.

## Verification evidence

### Passed

- `npm run build:lib`; `npx ng test ngx-json-render --coverage` (497 tests,
  thresholds enforced); `npm run build:material`; `npm run check:skills`;
  `npm run sync:plugin` + `check:plugin`; prettier over `git ls-files`;
  `git diff --check`.
- CopilotKit stand (scratchpad, not in the repo): Angular 22.2,
  `@copilotkit/angular` 0.5.3, `@copilotkit/runtime` 1.78.0, packed build of
  this branch, scripted agent, headless Chromium. Valid stream: progressive
  render and zero console output in `off`/`warn`/`strict`, over two turns.
  Stream ending broken: one report per broken spec, at its run's end; in
  `strict` the first surface stays hidden through the second run.

### Not run

- A live model; SSR; `npx ng build demo` (public API unchanged).

## Next concrete step

Owner decision: commit and push this branch, then release 0.9.9 and add the
stand as `examples/copilotkit-angular` before filing the CopilotKit issue.
