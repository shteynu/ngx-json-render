# AI SDK chat example

## Metadata

- Branch: `main` (repo convention: commits go straight to `main`)
- Base branch: `main`
- Base commit: `254b786`
- Current HEAD: `254b786`
- Status: done, awaiting the user's commit decision
- Last updated: 2026-10-09
- Last agent/tool: Claude Code (Opus 5.5)

## Objective

A runnable example of the AI SDK's own Angular client (`@ai-sdk/angular`
`Chat`) driving `ngx-json-render`: the server streams prose and a UI spec in
one assistant turn as AI SDK data parts, the client renders each message's
spec with the Material catalog.

## User-visible outcome

`examples/ai-sdk-chat/`: `npm install && npm start` gives a chat at
`localhost:4200`. With an AI Gateway key it talks to a real model; without
one it replays a scripted answer, so the example runs for anyone.

## Context

vercel/ai does not merge outside example PRs (checked 2026-10-09), so the
example lives here. The library already reads AI SDK parts
(`jsonRenderMessage`, `buildSpecFromParts`; audited against the real SDK in
`ai-sdk-parts.spec.ts`), but no runnable code shows the whole path.

## Scope

- Standalone npm project under `examples/`, installing the published
  packages from npm — not part of `angular.json` or the root lockfile.
- Server: Express, `streamText` + `pipeJsonRender` from `@json-render/core`,
  catalog from `ngx-json-render-material/catalog`, `prompt({ mode: 'inline' })`
  (`'chat'` is deprecated).
- Client: `Chat` + `DefaultChatTransport`, one component per message using
  `jsonRenderMessage`.
- Scripted model (`MockLanguageModelV4` from `ai/test`) when no key is set.

## Non-goals

- No change to the published libraries.
- No CI job yet (decide after the example exists).

## Decisions made

- Lives in this repo, not upstream: see Context.
- `@ai-sdk/angular`'s `Chat` mutates the streaming message in place and passes
  the same reference back on every chunk (`snapshot = (thing) => thing`), so a
  child component with a `message` signal input renders empty, even after
  the stream ends (checked in the browser). `App.messages` copies the last
  message. Documented in the renderer README and the skill.
- The Send button is not `[disabled]` on an empty draft. Enter pressed in the
  same frame as the last keystroke hit the still-disabled button, which
  blocks implicit submission. `send()` guards empty input instead.
- `.angular` (unanchored) added to `.prettierignore`: `prettier --write .`
  had reformatted the example's Vite cache.

## Remaining

- Commit (user's call). `.claude/launch.json` holds machine-local configs
  for other repos and stays out of the commit.

## Verification evidence

- `npm run build` in the example: client build clean, with no warnings after
  `allowedCommonJsDependencies: ["@vercel/oidc"]`; the server tsc passes.
- Raw SSE from `/api/chat` in mock mode: text deltas, then seven `data-spec`
  patch parts with no `id`, then `finish`.
- Browser on port 4300 with the server on port 3000:
  - the spec grows while streaming (17, 29, then 40 elements rendered);
  - a second turn renders and the first keeps its UI;
  - Enter submits;
  - icons use Material Symbols;
  - light and dark themes both render;
  - no console errors.
- `prettier --check examples` clean, and `git diff --check` clean.
- `npm run build:lib && npm run build:material && npm run check:skills`:
  all 8 snippet modules compile.
- The lockfile resolves everything from registry.npmjs.org.

## Approval gates

- Committing and pushing are the user's call (see repo memory on git authority).

## Next concrete step

Propose the commit to the user. Optional follow-up: a CI job that builds
the example.
