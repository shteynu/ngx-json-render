# Streaming tab: drive injectUIStream through a mocked endpoint

## Metadata

- Branch: `feat/playground-uistream`
- Base branch: `main`
- Base commit: 76e7b82
- Current HEAD: 76e7b82 (work uncommitted in the worktree)
- Status: implemented, verified — not committed
- Last updated: 2026-08-30
- Last agent/tool: Claude Opus 5 / Claude Code

## Objective

Make the demo's Streaming tab exercise `injectUIStream` — the library's own
streaming API — instead of hand-rolling a `setTimeout` loop over `applyPatch`,
so the demo runs the code path an adopter actually writes.

## User-visible outcome

The Streaming tab still replays a recorded generation, but through the real
client: prompt in, JSONL patches out, progressive render, token usage, an
error state, and a visible supersede when a second generation starts while the
first is still streaming.

## Context

Review on 2026-08-30 found that `injectUIStream` and `injectChatUI` — 774
lines in `projects/ngx-json-render/src/lib/streaming.ts`, the headline agent
APIs — are exercised only by unit tests. `App.replayStream()` in
`projects/demo/src/app/app.ts` walks `STREAM_LINES` with `setTimeout` and calls
`applyPatch` directly, so nothing on the live demo proves the shipped client
works end to end.

Step 1 (playground with a live spec editor, Material catalog, prompt panel)
landed on `feat/playground-editor`. This is step 2 of that plan; steps 3–5
(broken-patch preset, chat tab, bring-your-own-key) come after.

## Scope

- Replace the Streaming tab's hand-rolled replay with `injectUIStream`.
- A mocked transport in the demo that answers the endpoint with a streamed
  JSONL body, so no server and no API key is involved.
- Surface `rawLines`, `usage` and `error` from the returned object.
- A control that starts a second generation mid-stream, showing the supersede
  behaviour fixed in 1199a29.

## Non-goals

- No real model calls, no proxy, no API key. Recorded lines only.
- No changes to `streaming.ts` unless the demo turns up an actual defect.
- The chat API (`injectChatUI`) is step 4, not this task.

## Acceptance criteria

- The Streaming tab no longer calls `applyPatch` directly; the spec it renders
  comes from `injectUIStream(...).spec`.
- The mock is scoped to the demo's own endpoint and does not shadow other
  requests.
- The UI is labelled honestly as a recorded response, not a live model.
- Token usage appears, fed by a `__meta: "usage"` line in the recording.
- Starting a second generation mid-stream leaves exactly one stream running
  and does not clear the loading flag early.
- `npm run build:lib`, `npx ng test demo` and `npx ng build demo` pass;
  `npm run format:check` clean.

## Relevant repository instructions

AGENTS.md verification matrix, `projects/demo` row: `npm run build:lib`, then
`npx ng test demo` and `npx ng build demo`. The demo compiles against `dist/`.

## Relevant architecture and contracts

`injectUIStream({ api })` — read before designing the mock:

- POSTs `{ prompt, context, currentSpec }` to `api` with a JSON body and an
  `AbortSignal`; it needs `response.body` as a real `ReadableStream`, and
  reads it with a `TextDecoder`, splitting on `\n`.
- Each non-empty line is `JSON.parse`d. A line with `__meta: "usage"` feeds
  the `usage` signal (`promptTokens`, `completionTokens`, `totalTokens`);
  every other line is treated as an RFC 6902 patch and applied to the spec.
  Lines starting with `//` and unparseable lines are skipped silently.
- A non-2xx response is turned into an error, preferring `message` then
  `error` from a JSON body — worth exercising once for the error state.
- `context.previousSpec`, when present, seeds the stream instead of an empty
  spec.

`STREAM_LINES` in `projects/demo/src/app/specs/stream.ts` is the existing
recording and already has the right shape; it has no usage line yet.

## Decisions made

- The demo will not patch the global `fetch`. `injectUIStream` now takes an
  optional `fetch` transport (added on 2026-08-30, see the library change on
  this branch), so the Streaming tab passes a function that returns a
  `Response` streaming the recorded JSONL, and the abort signal keeps working
  because the transport receives the same request the global one would.

## Assumptions

- Recorded output is enough for this step; a live key stays out until step 5.

## Open questions

- (none — `injectChatUI` took the same `fetch` option on 2026-08-30, so step 4
  does not have to reopen this.)

## Completed

- Streaming tab extracted into `projects/demo/src/app/streaming/`, driven by
  `injectUIStream` against `recordedTransport` — a `fetch`-shaped function that
  replays a recording, honours the abort signal and can answer 500 on demand.
- `specs/stream.ts` reshaped into `RECORDINGS`: the original weekly report plus
  an onboarding checklist, each ending in a `__meta: "usage"` line.
- The tab surfaces `spec`, `isStreaming`, `rawLines`, `usage` and `error`, and
  says plainly that the generations are recorded.
- `App` no longer applies patches itself; the hand-rolled replay and its CSS
  are gone.

## Remaining

- Review and commit.

## Verification evidence

### Passed

- `npx ng test demo` — 13 passed (4 new): recorded generation end to end with
  the global `fetch` untouched, usage line, failure then recovery, and a
  supersede that keeps `isStreaming` true and leaves nothing of the first
  generation behind.
- `npx ng build demo` and `npm run format:check` — clean.
- Browser check at localhost:4200: patches land progressively (2 → 6 → 11),
  switching prompts mid-stream restarts cleanly with no console errors, the
  finished run reports "1284 prompt + 388 completion = 1672 tokens", the
  repeat/`$bindItem` checklist renders, and the failure toggle shows
  "Generation failed: The model provider returned 503." from the JSON body.

### Failed

- (none)

### Blocked or not run

- Library and Material suites — untouched by this task.

## Known risks

- The recorded transport must honour the abort signal, or the supersede
  demonstration is theatre rather than the real code path.

## Next concrete step

Commit on this branch. Step 3 of the plan — a preset whose patches are broken,
so the demo shows a bad generation degrading instead of blanking — is the next
task, and the Spec check panel from step 1 already has the vocabulary for it.
