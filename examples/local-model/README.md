# Local model

A small open model runs in the browser and writes the UI: Qwen2.5 1.5B or 3B
on the GPU through [WebLLM](https://github.com/mlc-ai/web-llm) and WebGPU,
answering in JSON that `ngx-json-render` draws with the Material components of
`ngx-json-render-material` as it streams. No server and no API key; the
weights download once from Hugging Face and stay in the browser's cache.

```bash
npm install
npm start
```

Open http://localhost:4200 in a browser with WebGPU (desktop Chrome or Edge),
choose a model and load it. Without WebGPU, or before the model is loaded, the
suggested prompts replay recorded answers through the same path.

## How it fits together

1. **`src/app/ui-schema.ts`** takes eighteen components of the Material
   catalog, imported from `ngx-json-render-material/catalog` (the entry point
   without Angular), and builds two things from their zod prop schemas: a
   system prompt that lists them with their props, and the JSON Schema of the
   answer, `{ "say": string, "ui": node }`, where a node is
   `{ type, props, children? }` and each `type` brings its own `props` schema.
2. **`src/app/local-model.ts`** loads the model with
   `CreateWebWorkerMLCEngine`, in **`src/app/llm.worker.ts`**, and asks it with
   `response_format: { type: 'json_object', schema }`. WebLLM compiles the
   schema into a grammar, so every token the model samples keeps the answer
   valid: no prose around the JSON, no component the catalog lacks, no
   misspelt prop. A 1.5B model needs that; left to itself it drifts out of
   the format within a few nodes.
3. **`src/app/partial-json.ts`** parses the text after every token, closing
   whatever is still open, and **`treeToSpec`** turns the nested tree into
   json-render's flat spec. A node whose props do not yet pass the catalog's
   schema (a `Metric` whose `value` has not arrived) is left out with its
   children, so the renderer always gets a valid spec of the finished part.
4. **`src/app/app.ts`** passes that spec to `<json-render>` with
   `materialRegistry`, and the UI fills in while the model writes.

The model writes a nested tree rather than json-render's JSONL patches (what
`catalog.prompt()` asks a large model for): a tree has one shape a grammar can
pin down, and a small model keeps track of nesting better than of element ids.

## Notes

- `npm test` runs the parser and schema tests under Node.
- WebLLM is about 6 MB (1.5 MB compressed), loaded only when a model is, once
  for the page and once for the worker. The page itself is about 300 kB
  compressed.
- Which model ids WebLLM can run is in its `prebuiltAppConfig`; `MODELS` in
  `local-model.ts` picks the `q4f16_1` build when the GPU supports
  `shader-f16`, and `q4f32_1` otherwise.
- `npm run space` builds and lays out a Hugging Face static Space in
  `dist/space` (the page plus the card in `space/README.md`). The demo runs at
  https://huggingface.co/spaces/shteynu/angular-ui-local-model.
- This folder is a standalone npm project that installs the published
  packages. It is not part of the repository's workspace.
