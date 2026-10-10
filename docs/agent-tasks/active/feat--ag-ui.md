# AG-UI support

## Metadata

- Branch: main (repo rule: commit straight on `main`, no feature branch)
- Base branch: main
- Base commit: 2a0eb15 (chore: release 0.9.3)
- Current HEAD: 2a0eb15 (prototype uncommitted)
- Status: implementation and verification done, uncommitted; commit split proposed
- Last updated: 2026-10-10
- Last agent/tool: Claude Code

## Objective

Let an Angular app render a json-render spec that an AG-UI agent streams,
without depending on any one agent framework.

## User-visible outcome

- A secondary entry point `ngx-json-render/ag-ui` that turns AG-UI events (or
  an AG-UI agent) into the same `spec` / `isStreaming` / `error` / `issues`
  signals `injectUIStream` gives.
- A documented wire convention: the spec travels as an AG-UI activity with
  `activityType: "json-render-spec"` — `ACTIVITY_SNAPSHOT.content` is a whole spec,
  `ACTIVITY_DELTA.patch` is RFC 6902 patches against it.
- A ready component for CopilotKit Angular's `renderActivityMessages`, so a
  CopilotKit app renders json-render activities with its `provideJsonRender`
  registry.

## Context

- AG-UI 1.0 (`@ag-ui/core` / `@ag-ui/client` 1.0.2) is the protocol CopilotKit,
  Hashbrown v0.7 and threadplane speak. Events: docs.ag-ui.com/concepts/events.
- `ACTIVITY_DELTA.patch` is RFC 6902, the same shape as `JsonPatch` from
  `@json-render/core`, so `applyPatch` (`src/lib/streaming/patch.ts`) applies it
  unchanged.
- Precedent: CopilotKit carries A2UI as `activityType: "a2ui-surface"`; its
  Angular package registers renderers per activity type
  (`~/WebstormProjects/CopilotKit/packages/angular/src/lib/activity-renderer.ts`;
  `ActivityRenderer` has inputs `activityType`, `content`, `message`, `agent`,
  mounted via `NgComponentOutlet` in `components/activity/copilot-activity.ts`).
- Installed `@json-render/*` has no AG-UI support.

## Scope

1. Pure reducer: AG-UI event → per-surface spec list (keyed by activity
   `messageId`), only for the json-render activity type.
2. Angular hook over an AG-UI agent (structural type, no runtime dependency on
   `@ag-ui/*`), mirroring `injectUIStream`'s signals and finished-spec check.
3. CopilotKit activity component (structural inputs, no CopilotKit dependency).
4. Tests against real `@ag-ui/core` types and an `@ag-ui/client` agent.

## Non-goals

- Server package. The server mapping (model output → activity events) is a
  README example, not shipped code.
- `TOOL_CALL_ARGS` structured-output streaming, `STATE_*` sync with `$state`,
  sending actions back to the agent — later phases, on demand.

## Acceptance criteria

- `npm run build` and `npm test` green, coverage thresholds held. ✔
- Real `@ag-ui/core` event objects type-check against the entry point's input. ✔
- A spec streamed as snapshot + deltas through an `@ag-ui/client` agent renders. ✔
- README documents the convention and both integration paths. ✔

## Relevant repository instructions

- AGENTS.md: secondary entry points need `../<entry>/...` patterns in
  `angular.json` test `include` and coverage; imports of the primary entry go
  through the package name.
- Public API change → full build + test + README read; a new dev dependency →
  also `npm ci`, the `angular-compat` steps and consumer smoke 19/22; minor
  release in lockstep with the Material catalog.

## Decisions made

- Structural event types (`{ type: string }` plus runtime guards) instead of a
  peer dependency on `@ag-ui/core`: AG-UI's `EventType` is a TS string enum,
  and it broke its API through every 0.0.x release.
- Activity type `"json-render-spec"` (user's choice, 2026-10-10, over
  `"json-render"`): names the format and the content (a `Spec`, upstream's
  `data-spec` term), kebab-case like `a2ui-surface`; `ngx-json-render` and
  bare `spec` rejected (Angular-only / too generic for a shared namespace).
- `injectAgentUI` folds events itself (`onEvent`) instead of reading
  `agent.messages`: the client deep-clones messages per event, which would
  give every element a new identity on every delta.
- Leniencies match the JSONL path: a delta with no prior snapshot starts from
  an empty spec; malformed patch ops are dropped.

## Assumptions

- Verified on `@ag-ui/client` 1.0.2: `onRunInitialized` fires after an await
  (not synchronously inside `runAgent()`), `onRunFinalized` always fires,
  a `RUN_ERROR` event is followed by the client failing the run.

## Completed

- Entry point `ngx-json-render/ag-ui` (`projects/ngx-json-render/ag-ui/src`):
  - `events.ts`: `JSON_RENDER_ACTIVITY_TYPE`, `AgUiEvent`, `AgUiMessage`,
    `AgUiSurface`, `applyAgUiEvent`, `surfacesFromMessages`, `isJsonRenderSpec`.
  - `agent-ui.ts`: `injectAgentUI` → `surfaces`, `spec`, `isStreaming`,
    `error`, `issues`; seeds from agent history, checks touched surfaces at
    run end, unsubscribes on destroy.
  - `json-render-activity.ts`: `JsonRenderActivity` and
    `jsonRenderActivityRenderer()`.
  - `ag-ui.spec.ts`: 19 tests.
- Wiring: `tsconfig.json` path, `tsconfig.lib.json` / `tsconfig.spec.json`
  include, `angular.json` test include + coverageInclude.
- devDependencies `@ag-ui/client` and `@ag-ui/core` 1.0.2 (exact).
- README: "From an AG-UI agent" section (client hook, CopilotKit, server) and
  the API-surface line.
- Activity type renamed to `"json-render-spec"`.
- Skill: "AG-UI agents" section, description trigger and exports row in
  `skills/ngx-json-render/SKILL.md`; plugin copy synced.

## In progress

- Nothing; waiting for review.

## Remaining

1. Commit (user's call; split proposed in chat).
2. Optional: an example against a real CopilotKit Angular runtime.
3. Follow-up candidates: structural sharing inside `JsonRenderActivity` (on the
   CopilotKit path every delta arrives as a fresh deep clone, so the whole spec
   re-renders); devtools Stream tab for AG-UI runs (`notifyStreamObservers` is
   private to the primary entry); `TOOL_CALL_ARGS`; `STATE_*` ↔ `$state`;
   actions back to the agent.
4. Minor release in lockstep with the Material catalog.

## Changed files

- `projects/ngx-json-render/ag-ui/**` (new)
- `projects/ngx-json-render/README.md`
- `angular.json`, `tsconfig.json`, `projects/ngx-json-render/tsconfig.lib.json`,
  `projects/ngx-json-render/tsconfig.spec.json`
- `package.json`, `package-lock.json`
- `skills/ngx-json-render/SKILL.md`, `plugins/ngx-json-render/skills/ngx-json-render/SKILL.md`
- `docs/agent-tasks/active/feat--ag-ui.md` (new)
- Not this task's: `.claude/launch.json` was already modified before it began.

## Verification evidence

### Passed

- `npm run build` (whole workspace), exit 0, 2026-10-10.
- `npm test`, exit 0: renderer 461/461 (ag-ui spec 19/19), 73/73, 21/21;
  thresholds held; `ag-ui/src` 99.19 stmts / 94.87 branches / 100 funcs /
  100 lines.
- Real `HttpAgent` and `@ag-ui/core` event types compile against the
  structural inputs (in `ag-ui.spec.ts`).
- README server snippet type-checked with `tsc --strict` against
  `@ag-ui/core` / `@ag-ui/encoder` 1.0.2 (stubs for Express and the AI SDK).
- Server shape run end to end in Node: a local SSE server built from
  `createMixedStreamParser` + `EventEncoder`, read by a real `HttpAgent`; the
  client accepted the event sequence and assembled the spec as a `json-render`
  activity message.
- `git diff --check` clean.
- After the rename and skill: `npm ci`, then `npm run build` and `npm test`
  exit 0 (461 / 73 / 21, thresholds held).
- `npm run check:skills` (7 of 11 blocks compiled incl. the new
  `injectAgentUI` block, 4 fragments), `sync:plugin`, `check:plugin` in step.
- `angular-compat` steps in copied trees (not a clone: the work is
  uncommitted): 19 builds the renderer incl. `ag-ui`; 20 and 22 build, test
  461/461 and build Material.
- `consumer-smoke.mjs` 19 (19.2.25) and 22 (22.2.2) passed. It does not touch
  `ag-ui`, so additionally: the shipped `dist` typings of `ngx-json-render/ag-ui`
  compiled with `tsc --strict --skipLibCheck false` against Angular 19.2.25
  and `@ag-ui/client` 1.0.2.

### Failed

- None open (see Failed approaches).

### Blocked or not run

- No run inside a real CopilotKit Angular app; the activity component was
  mounted through `NgComponentOutlet` with CopilotKit's input names.
- README client snippet not compiled on its own (its API is covered by the spec).

### Environment

- macOS, Angular 21 workspace, vitest 4.1.11.

### Residual risk

- The CopilotKit contract is matched structurally from its source; a rename
  there breaks the adapter without a compile error on our side.

## Failed approaches

- Subclassing `AbstractAgent` in tests: `@ag-ui/client` pins `rxjs` 7.8.1, a
  nested copy, so the workspace `Observable` is a different type. Tests use
  `HttpAgent` with a stubbed `fetch` serving SSE instead, which also covers
  AG-UI's transport and event checks.

## Known risks

- `activityType: "json-render-spec"` is a convention we define; it cannot change
  later without breaking agents that emit it.

## Approval gates

- Commit / push / release are the user's call.

## Questions requiring an owner decision

- None open. (Optional: propose the name upstream before release — public, only on the user's word.)

## Next concrete step

On the user's go, make the four proposed commits on `main` (no AI
attribution), then hand over `git push origin main`.
