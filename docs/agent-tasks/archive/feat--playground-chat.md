# Chat tab: prose and generated UI in one conversation

## Metadata

- Branch: `feat/playground-chat`
- Base branch: `main`
- Base commit: 8109b81
- Current HEAD: `8bf7df3` on `main` — the branch was merged and deleted
- Status: implemented, verified
- Last updated: 2026-08-30
- Last agent/tool: Claude Opus 5 / Claude Code

## Objective

Step 4 of the playground plan: a Chat tab on `injectChatUI`, the second of the
two agent APIs, so the demo covers the case where a model answers in prose
_and_ renders a UI in the same turn.

## User-visible outcome

A conversation: you pick a message, the assistant replies with text while a UI
assembles underneath it, and earlier turns keep their own rendered UI.

## Context

`injectChatUI` is the last part of the shipped API with nothing to show for it
on the live demo. Steps 1–3 are merged (2c87d2c, a5e290d, 8482411) and left
the pieces this step reuses: `recordedTransport`, the `RECORDINGS` shape and
the shared `SpecCheck` component.

Step 5, bring-your-own-key, is what remains after this.

## Scope

- A Chat tab driven by `injectChatUI`, with a recorded transport.
- Two or three canned exchanges, each mixing prose with patch lines.
- Per-message rendering: each assistant message shows its own spec.

## Non-goals

- No live model and no API key — that is step 5, and it should be able to
  swap the transport under both tabs rather than adding a third code path.
- No changes to `injectChatUI` beyond what the tab genuinely needs.

## Acceptance criteria

- The tab renders a multi-turn conversation where at least two assistant
  messages carry their own spec, and both still render after the second
  arrives.
- Prose and UI from the same message are distinguishable on screen.
- A test asserts a second turn does not overwrite the first turn's spec.
- `npm run build:lib` and `npm run build:material`, then `npx ng test demo` and
  `npx ng build demo`; `npm run format:check` clean.

## Relevant repository instructions

AGENTS.md verification matrix, `projects/demo` row — both library builds, then
demo test and build.

## Relevant architecture and contracts

- `injectChatUI({ api, fetch? })` POSTs `{ messages: [{ role, content }] }` —
  note the field is `content`, while `injectUIStream` sends `prompt`. The
  recorded transport picks its reply from the _last_ user message.
- The reply is one stream carrying both kinds of line. `createMixedStreamParser`
  from `@json-render/core` classifies each line: anything `parseSpecStreamLine`
  accepts is a patch, everything else is text appended to the message.
- `ChatMessage` is `{ id, role, text, spec }` — `spec` is null until a patch
  arrives, and each assistant message accumulates its own.
- `usage` is not part of `ChatUIReturn`; do not promise token counts here.

## Decisions made

- **The fence question settled, and my guess was wrong.** A probe against
  `createMixedStreamParser` showed it consumes the ` ```spec ` markers itself:
  feeding it the fenced sample yields text lines `["Here is your UI:","Done!"]`
  and two patches. So the recordings use fences and the tab needs no stripping.
  A test asserts the text never contains a backtick fence.
- `SpecCheck` left out. The recordings here are sound, so the panel would say
  "no issues" forever; the bad-generation case already lives in the Streaming
  tab, and repeating it per message would be noise.
- The transport grew a `promptOf` hook rather than a second copy: the two
  clients word the request differently (`{ prompt }` versus
  `{ messages: [{ role, content }] }`), and everything else about replaying a
  recording is the same.
- Suggestion buttons are disabled while a reply streams. `injectChatUI` would
  abort and supersede, which is right for a generator and wrong for a
  transcript — it would leave a half-written turn in the history.

## Completed

- `ChatTab` on `injectChatUI` with a recorded transport, added as a fourth tab.
- `specs/chat.ts` with two exchanges, each mixing prose and fenced JSONL.
- Per-message rendering, a failure toggle, and a clear-conversation control.

## Verification evidence

### Passed

- `npx ng test demo` — 24 passed (3 new): prose and UI in one turn with the
  global `fetch` untouched, a second turn that does not overwrite the first
  turn's spec, and a failed reply that recovers on the next one.
- `npx ng build demo` and `npm run format:check` — clean.
- Browser check at localhost:4200: both turns render their own UI at once, the
  prose carries no fence markers, and no console errors.

### Failed

- (none)

### Blocked or not run

- Library and Material suites — untouched by this task.

## Known risks

- Recorded conversations age badly if they read as a scripted sales demo. Keep
  the prose short and let the rendered UI do the talking.

## Next concrete step

Nothing on this branch. Step 5, bring-your-own-key, is the last one in the
plan: both tabs now take their transport the same way, so it should swap the
transport rather than add a third code path.
