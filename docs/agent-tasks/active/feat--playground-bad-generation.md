# Show a bad generation degrading instead of blanking

## Metadata

- Branch: `feat/playground-bad-generation`
- Base branch: `main`
- Base commit: 9064475
- Current HEAD: 5625b56 — the second commit is not made yet
- Status: implemented, verified — the broken recording is uncommitted
- Last updated: 2026-08-30
- Last agent/tool: Claude Opus 5 / Claude Code

## Objective

Step 3 of the playground plan: make the demo show what happens when a model
gets the spec wrong — the good parts of the UI still render, the broken parts
are named — instead of leaving the reader to imagine it.

## User-visible outcome

A third prompt in the Streaming tab whose recording contains the mistakes
models actually make. It streams like the others; the UI assembles around the
damage, and a check panel says exactly which elements were dropped and why.

## Context

Two facts make this the most valuable remaining step, and both are already in
the repo:

- The renderer is deliberately tolerant. `JrElement` warns once per unknown
  type and renders nothing for it (`element.component.ts:162`), and
  `JsonRenderer.rootKey` yields null when `root` names an element the spec does
  not contain (`renderer.component.ts:147-148`). Nothing throws — which is a
  selling point no one can currently see.
- Step 1 built the vocabulary for saying what is wrong: the playground's
  `issues` computed pairs `validateSpec()` from `@json-render/core` with a
  check of each element's `type` against `catalog.componentNames`.

Steps 1 and 2 are merged (2c87d2c, a5e290d). Steps 4 (chat tab) and 5
(bring-your-own-key) come after this one.

## Scope

- A third entry in `RECORDINGS` (`projects/demo/src/app/specs/stream.ts`)
  carrying realistic generation failures, not contrived ones.
- Surface the same spec check in the Streaming tab that the playground has.
- Keep the tab honest: this is a recorded bad generation, not a live failure.

## Non-goals

- No changes to the renderer's tolerance. If the recording turns up a case
  where it throws rather than degrades, that is a library bug and its own task.
- No repair loop. Feeding issues back to a model is out of scope here.
- Chat and BYO-key stay in steps 4 and 5.

## Acceptance criteria

- The broken preset streams to completion without a thrown error, and the
  elements that are fine still render.
- The check panel names each problem with the element key.
- A test asserts the partial render survives — not merely that issues were
  counted.
- `npm run build:lib` and `npm run build:material`, then `npx ng test demo` and
  `npx ng build demo`; `npm run format:check` clean.

## Relevant repository instructions

AGENTS.md verification matrix, `projects/demo` row — note it needs **both**
library builds, because the demo compiles against `dist/` and the playground
imports the Material catalog.

## Relevant architecture and contracts

Failure modes worth recording, drawn from the rules `schema.ts` spends its
`defaultRules` on — those rules exist because models break exactly these:

- a `children` entry no element ever defines (`missing_child`)
- `visible` or `on` written inside `props` instead of on the element
  (`visible_in_props`, `on_in_props`)
- a component type that is not in the catalog
- a `repeat` whose container has no children (`repeat_without_children`)
- a malformed JSON line — `parseLine` in `streaming.ts:45` skips silently, so
  the line never reaches `rawLines`. Whether the tab should say a line was
  dropped is a design decision, not a given.

`@json-render/core` also exports `autoFixSpec`, which moves misplaced
`visible`/`on`/`repeat` out of `props` and reports what it changed.

## Decisions made

- `SpecCheck` extracted first, in its own commit (5625b56), and used by both
  tabs. While extracting, an absent spec stopped reading "No structural
  issues" — a claim the streaming tab would have made before its first run.
- The check is held while `isStreaming` is true. A partial spec is _supposed_
  to reference children that have not arrived — that is what `loading` means
  to the renderer — so checking mid-stream reported five gaps that were not
  defects and buried the three that were.
- `autoFixSpec` left out. The step is about showing tolerance and diagnosis;
  a repair button is a different claim and belongs with the chat step, where
  there is something to repair _into_.
- One truncated line is included. `parseLine` skips it silently, which is
  worth showing; rather than build machinery to count dropped lines, the
  recording carries a `note` the tab displays.

## Completed

- `SpecCheck` component shared by the playground and the streaming tab.
- A third recording, `BROKEN_PRICING`, with four realistic failures: a card
  that references a child never emitted, a badge with `visible` inside
  `props`, a component absent from the catalog, and a truncated line.
- The streaming tab shows the recording's note, holds the check until the
  stream ends, and then names the damage.

## Verification evidence

### Passed

- `npx ng test demo` — 21 passed (8 new: 5 for `SpecCheck`, 3 for the bad
  generation). One asserts the partial render survives, not merely that issues
  were counted; one asserts the check stays quiet mid-stream.
- `npx ng build demo` and `npm run format:check` — clean.
- Browser check at localhost:4200: the flawed recording streams to completion,
  all three pricing cards render, "Compare plans" is empty where the unknown
  component was skipped, and the check lists exactly three problems —
  `pro-badge` (`visible` in props), `plan-team` (missing child `team-note`),
  `comparison` (`PricingTable` not in the catalog). 16 of 17 lines applied, the
  truncated one skipped. No console errors; the renderer's `console.warn` for
  the unknown type shows up in the test output, which is the tolerance working.

### Failed

- (none)

### Blocked or not run

- Library and Material suites — untouched by this task.

## Known risks

- A recording that is broken in too many ways reads as a broken library rather
  than a tolerant one. Two or three failures, with most of the UI intact, makes
  the point better than a wreck.

## Next concrete step

Commit the broken recording and the streaming-tab wiring; 5625b56 already has
the extraction. Then step 4, the chat tab on `injectChatUI` — which has had a
transport option since 2345615.
