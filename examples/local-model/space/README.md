---
title: Angular UI from a local model
emoji: 🧩
colorFrom: indigo
colorTo: pink
sdk: static
pinned: false
license: apache-2.0
short_description: In-browser model streams JSON into Angular Material UI
tags:
  - angular
  - webgpu
  - webllm
  - generative-ui
  - json-render
  - structured-output
models:
  - Qwen/Qwen2.5-1.5B-Instruct
  - Qwen/Qwen2.5-3B-Instruct
---

# A model in your browser draws Angular UI

Ask for a dashboard, a form or a status card. A small open model,
Qwen2.5 1.5B or 3B, runs on your GPU through
[WebLLM](https://github.com/mlc-ai/web-llm) and answers in JSON.
[ngx-json-render](https://github.com/shteynu/ngx-json-render) turns that JSON
into Angular Material components while the answer streams in.

There is no server and no API key. The weights download once from Hugging Face
and stay in your browser's cache, and nothing you type leaves the page.

- **Constrained output.** The JSON Schema of the answer is generated from the
  Material catalog's component schemas. WebLLM compiles it into a grammar, so a
  1.5B model can only write component names and props that exist.
- **Streaming render.** The page parses the half-written JSON after every
  token and renders the finished part of the tree, so the UI fills in as the
  model writes it.
- **No WebGPU?** The suggested prompts replay recorded answers through the
  same parser and renderer.

Runs live in desktop Chrome or Edge, and in other browsers with WebGPU turned on.

Source: [examples/local-model](https://github.com/shteynu/ngx-json-render/tree/main/examples/local-model)
· Library: `npm i ngx-json-render ngx-json-render-material`
