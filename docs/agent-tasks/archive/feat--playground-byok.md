# Bring your own key: the same tabs against a real model

## Metadata

- Branch: `feat/playground-byok`
- Base branch: `main`
- Base commit: 37d1d6b
- Current HEAD: `9a3680f` on `main` — the branch was merged and deleted
- Status: implemented, verified, merged
- Last updated: 2026-08-30
- Last agent/tool: Claude Opus 5 / Claude Code

## Objective

Step 5, the last of the playground plan: let a visitor paste their own
Anthropic API key and drive the Streaming and Chat tabs against a live model
instead of a recording — without the demo ever storing, sending or logging
that key anywhere but the browser it was typed into.

## User-visible outcome

A "Use your own key" control. Empty, the tabs behave exactly as they do today
(recorded). Filled, the same two tabs generate a real UI from a real
generation, with real latency, real token usage, and real failure modes.

## Context

Steps 1–4 are merged (2c87d2c, a5e290d, 8482411, 8bf7df3). The demo is a
static site on GitHub Pages: there is no server to hold a key, so it is a
browser-direct call with the visitor's own key or nothing.

Both tabs already take their transport the same way — `injectUIStream` and
`injectChatUI` each accept a `fetch?` option, and both are wired to
`recordedTransport` from `projects/demo/src/app/streaming/recorded-transport.ts`.
That is the seam this step uses.

## Scope

- A key panel: paste, clear, and a visible statement of where the key goes.
- A live transport, `fetch`-shaped, selected in place of `recordedTransport`
  when a key is present — under **both** tabs.
- The system prompt sent to the model is `catalog.prompt()`, the same text the
  Playground tab already shows.
- Real errors (401, 429, CORS, refusal) land in the existing `ui.error()` /
  `chat.error()` banners.

## Non-goals

- No proxy, no serverless function, no key on any server.
- No third code path: if a live call needs something the recorded transport
  cannot express, change the seam, not the tabs.
- No tool use, no attachments, no model picker beyond a small fixed list.

## Acceptance criteria

- With no key, every existing test still passes unchanged and the tabs stay
  recorded — the live path must be inert by default.
- With a key, both tabs stream from the API; the Streaming tab shows real
  token usage and the Chat tab keeps per-message specs.
- The key lives only in the viewer's browser and is never written to a log,
  a URL, an analytics call, or a test fixture.
- A test covers transport selection (key present → live transport called; key
  absent → recorded), using a stub — never a real key, never a real request.
- `npm run build:lib` and `npm run build:material`, then `npx ng test demo` and
  `npx ng build demo`; `npm run format:check` clean.

## Relevant repository instructions

AGENTS.md verification matrix, `projects/demo` row — both library builds, then
demo test and build.

## Relevant architecture and contracts

- `injectUIStream` POSTs `{ prompt, context, currentSpec }` and reads JSONL:
  each line is an RFC 6902 patch, a `{"__meta":"usage",...}` line feeds
  `usage`, and unparseable lines are skipped silently.
- `injectChatUI` POSTs `{ messages: [{ role, content }] }` and runs the reply
  through `createMixedStreamParser`, which splits patch lines from prose and
  consumes ` ```spec ` fences itself.
- **The shape mismatch is the whole engineering problem.** The Messages API
  streams SSE (`content_block_delta` events carrying text), while both clients
  want a body of newline-delimited patches. The live transport has to return a
  `Response` whose `ReadableStream` re-emits the model's generated text as
  those lines, and synthesise the trailing `__meta: "usage"` line from the
  `message_delta` usage.

## Verified API facts (checked 2026-08-30 against the claude-api skill and the

TypeScript SDK source; do not rewrite these from memory)

- Browser-direct calls need the header
  `anthropic-dangerous-direct-browser-access: true`. The official TS SDK sets
  it for you when constructed with `dangerouslyAllowBrowser: true`; a raw
  `fetch` has to send it itself, alongside `x-api-key` and `anthropic-version`.
- Default model `claude-opus-5`. `claude-sonnet-5` and `claude-haiku-4-5` are
  the sane cheaper options if the panel offers a choice. Model IDs carry no
  date suffix.
- Thinking: `{ type: "adaptive" }`. `budget_tokens` is rejected with a 400 on
  Opus 5 and Sonnet 5. Assistant prefill is also rejected on these models.
- Stream anything with a large `max_tokens`; this call streams by nature.

## Decisions made

- **Raw `fetch`, not `@anthropic-ai/sdk`.** Measured both. The SDK costs
  174 kB minified (48 kB gzipped) for one streaming call, against 110 kB of
  headroom under the demo's 1.5 MB warning budget — and it does not build for
  the browser as published: `lib/credentials/*` imports `node:fs` and
  `node:path` with no browser export condition, so `ng build demo` fails on
  seven unresolved imports until they are stubbed. The transport has to hand
  the clients a `Response` with a `ReadableStream` either way, so the SDK's
  event iterator would have been re-wrapped rather than used. The whole live
  path is ~200 lines and added 10 kB raw / 2.4 kB transfer.
- The `anthropic-dangerous-direct-browser-access: true` header is sent by
  hand, exactly as the SDK sends it under `dangerouslyAllowBrowser`. Confirmed
  live: a call with a bogus key reached the API and came back 401, so the
  cross-origin path works.
- **Transport chosen per request, not per tab** (`liveOrRecorded`). Setting a
  key takes effect on the next generation, with no client rebuilt and no
  second `injectUIStream` in the tree.
- `sessionStorage`, not `localStorage` — a key typed into a public demo should
  not outlive the tab. A test asserts it never lands in `localStorage`.
- `effort: "medium"`, below the default `high`. `catalog.prompt()` already
  pins the output contract and the specs are small, so deeper thinking mostly
  buys latency in a tab whose point is watching a UI assemble — and the
  visitor is paying.
- The Streaming tab sends `catalog.prompt()` (patches only) and the Chat tab
  `catalog.prompt({ mode: 'inline' })` (prose then patches) — the library
  already has both modes, so neither prompt is written here.
- The usage line is synthesised only for `injectUIStream`. `injectChatUI` has
  no `usage` signal and the line would surface as prose in the transcript.
- Live mode adds a free-text prompt to both tabs and hides the
  "fail the next request" toggle, which only means something to the recorded
  transport.

## Completed

- `live/api-key.ts` — the key store: `sessionStorage`, model choice, and the
  `isLive` flag both tabs switch on.
- `live/live-transport.ts` — a `fetch`-shaped transport that calls
  `POST https://api.anthropic.com/v1/messages` with the visitor's key and
  re-emits the SSE stream as the newline-delimited body both clients read,
  synthesising the trailing `__meta` usage line out of `message_start` and
  `message_delta`. API errors are flattened to the `{ message }` the clients
  print; an abort stays an abort so supersede still works.
- `live/key-panel.*` — the key input, model select, and the copy stating where
  the key goes. The key is never rendered back after it is accepted.
- Both tabs wired through `liveOrRecorded`, and the panel mounted on the
  Streaming and Chat tabs only.

## Verification evidence

### Passed

- `npx ng test demo` — 35 passed. The 24 that existed are unchanged, which is
  the point: with no key the live path is inert. The 11 new ones cover the
  key store (including that the key never reaches `localStorage`), the
  required headers and that the key appears in none of the URL, body or logs,
  SSE-to-JSONL translation across a split line, the synthesised usage line and
  its absence in chat, error flattening, an abort surviving as an abort,
  per-request transport selection, and both tabs end to end against a stubbed
  API.
- `npm run build:lib`, `npm run build:material`, `npx ng build demo` — clean.
  1.39 MB → 1.40 MB raw, 255.5 kB → 257.9 kB transfer, well inside budget.
- `npm run format:check` — clean.
- Browser check at localhost:4200: the panel switches both tabs to live and
  back, the recorded generations and the recorded chat still run untouched
  with the key cleared, and no console errors beyond the 401 below.
- **The live path was exercised for real, by accident.** A misclick on a stale
  element reference fired a generation while a deliberately bogus key was set.
  The request reached `api.anthropic.com` — so the browser-direct header and
  CORS are right — and came back `401`, which the transport flattened into the
  banner as `authentication_error: API key is invalid.` No real credential was
  involved at any point.

### Failed

- (none)

### Blocked or not run

- A live generation with a valid key. That is the owner's to run, in their own
  browser, with their own key; nothing in this branch needs it to be correct,
  and the failure path is already proven.
- Library and Material suites — untouched by this task.

## Known risks

- A key input on a public demo page invites careless pasting. The panel's copy
  is load-bearing: it says the key goes straight from this browser to
  `api.anthropic.com`, that the site has no server, and that calls are billed
  to the visitor.
- A live model will sometimes emit a spec this catalog cannot render. That is
  not a bug to hide — step 3 built the degradation path for exactly this, and
  the disclosure now points at the check panel.
- `effort` and `max_tokens` are constants in `live-transport.ts`. If live
  generations come back thin or truncated, those are the two dials.

## Next concrete step

Nothing on this branch — the five-step playground plan is done. Merge to
`main` and archive this file.
