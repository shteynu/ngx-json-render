# AI SDK chat

A chat built on the AI SDK's own Angular client, `Chat` from
`@ai-sdk/angular`, where each answer can carry UI: the model writes a sentence
of prose and a spec, and `ngx-json-render` draws the spec with the Material
components from `ngx-json-render-material`.

```bash
npm install
npm start
```

Open http://localhost:4200. Without a key the server replays one scripted
answer, so the example runs without an account. To talk to a real model, copy
`.env.example` to `.env` and set `AI_GATEWAY_API_KEY`
([Vercel AI Gateway](https://vercel.com/docs/ai-gateway)). `MODEL` picks the
model, `anthropic/claude-sonnet-5.5` by default. To use a provider package
instead of the gateway, pass its model to `streamText` in `server/index.ts`.

## How it fits together

1. **`server/index.ts`** gives `streamText` the Material catalog's prompt,
   `materialCatalog.prompt({ mode: 'inline' })`. The prompt asks the model for
   prose followed by a ` ```spec ` fence of JSONL patches, using only the
   catalog's components.
2. **`pipeJsonRender`** from `@json-render/core` rewrites the UI message
   stream on its way out. Prose stays as text parts. Each patch line inside
   the fence becomes a `data-spec` part. The catalog is imported from
   `ngx-json-render-material/catalog`, the entry point without Angular, so
   plain Node can load it.
3. **`src/app/app.ts`** holds a `Chat` with a `DefaultChatTransport` pointed
   at `/api/chat`. `ng serve` proxies that path to the server on port 3000.
4. **`src/app/chat-message.ts`** renders one message.
   `jsonRenderMessage(() => this.message().parts)` gives it the text and the
   spec rebuilt from the `data-spec` parts, and `<json-render>` draws the spec
   with `materialRegistry`.

`Chat` writes every chunk into one message object and passes that same object
back each time. A signal input holding it would never change, so
`ChatMessage` would stay empty. `App.messages` copies the message being
written, which gives each chunk a new value to pass down.

## Notes

- The scripted model is `MockLanguageModelV4` from `ai/test`. It streams the
  shape the prompt asks a real model for, so the rest of the path runs
  unchanged. `server/scripted-model.ts` has the answer.
- The browser bundle is about 1.5 MB raw (about 290 kB compressed). Most of
  it is the full Material registry and zod v4, which the AI SDK and
  `@json-render/core` both use. Its locale tables cannot be tree-shaken.
- This folder is a standalone npm project that installs the published
  packages. It is not part of the repository's workspace.
