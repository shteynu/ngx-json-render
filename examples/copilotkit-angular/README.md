# CopilotKit chat

A `CopilotChat` from `@copilotkit/angular` where each answer can carry UI. An
AG-UI agent behind the CopilotKit runtime writes a sentence of prose and a
spec. The spec reaches the browser as a json-render activity, and
`ngx-json-render` draws it inside the chat with the Material components from
`ngx-json-render-material`.

```bash
npm install
npm start
```

Open http://localhost:4200. Without a key the agent replays one scripted
answer, so the example runs without an account. To talk to a real model, copy
`.env.example` to `.env` and set `AI_GATEWAY_API_KEY`
([Vercel AI Gateway](https://vercel.com/docs/ai-gateway)). `MODEL` picks the
model, `anthropic/claude-sonnet-5.5` by default. To use a provider package
instead of the gateway, pass its model to `JsonRenderAgent` in
`server/index.ts`.

## How it fits together

1. **`server/index.ts`** runs the CopilotKit runtime on port 3000, with one
   agent, `default`: a `JsonRenderAgent` whose system prompt is the Material
   catalog's, `materialCatalog.prompt({ mode: 'inline' })`. The prompt asks
   the model for prose followed by a ` ```spec ` fence of JSONL patches. The
   catalog is imported from `ngx-json-render-material/catalog`, the entry
   point without Angular, so plain Node can load it.
2. **`server/json-render-agent.ts`** is the AG-UI agent. It streams the
   model's text through `createMixedStreamParser` from `@json-render/core`.
   Prose goes out as a text message. The first patch opens an activity of type
   `json-render-spec` with an `ACTIVITY_SNAPSHOT` of an empty spec, and every
   patch after it goes out as an `ACTIVITY_DELTA`.
3. **`src/main.ts`** registers `jsonRenderActivityRenderer()` from
   `ngx-json-render/ag-ui` with `provideCopilotKit`, so CopilotKit draws every
   `json-render-spec` activity with it. `provideJsonRender` gives that
   renderer the Material registry and catalog. `ng serve` proxies
   `/api/copilotkit` to the runtime.
4. **`src/app/app.ts`** is only `<copilot-chat />`. The chat, the transcript
   and the activity messages are CopilotKit's.

While the run is still streaming an activity, its renderer is loading: the
spec is checked once, when the run ends, and the catalog holds back elements
whose props have not arrived yet. Set `validate: 'strict'` in `src/main.ts`
and the UI still draws as it streams; only a spec that is still broken when
its run ends renders nothing. This needs `ngx-json-render` 0.9.10 or later.

## Notes

- The scripted model is `MockLanguageModelV4` from `ai/test`. It streams the
  shape the prompt asks a real model for, so the rest of the path runs
  unchanged. `server/scripted-model.ts` has the answer.
- The model sees the conversation as prose only. The specs it drew are
  activity messages, which `toModelMessages` leaves out.
- `ng serve` shows CopilotKit's inspector in the corner.
  `provideCopilotKit({ enableInspector: false })` turns it off. Production
  builds keep it switched off, though its code is still in the bundle.
- The browser bundle is about 5.8 MB raw (about 1.7 MB compressed). Almost all
  of it is CopilotKit's Angular package and what it brings for the chat:
  markdown, code highlighting, KaTeX, A2UI and the inspector. The json-render
  packages are about 150 kB of it.
- The runtime sends CopilotKit anonymous telemetry unless
  `COPILOTKIT_TELEMETRY_DISABLED=true`; `.env.example` sets it.
- This folder is a standalone npm project that installs the published
  packages. It is not part of the repository's workspace.
