# ngx-json-render

[![npm](https://img.shields.io/npm/v/ngx-json-render)](https://www.npmjs.com/package/ngx-json-render) [![CI](https://github.com/shteynu/ngx-json-render/actions/workflows/ci.yml/badge.svg)](https://github.com/shteynu/ngx-json-render/actions/workflows/ci.yml) [![license](https://img.shields.io/npm/l/ngx-json-render)](https://github.com/shteynu/ngx-json-render/blob/main/LICENSE)

Angular renderer for [json-render](https://github.com/vercel-labs/json-render) — give an LLM a catalog of your components, stream back a JSON spec, and render it as real Angular components. No `innerHTML`, no `eval`, no framework lock-in on the wire format.

Built on `@json-render/core` (the same spec format, expressions, state store, actions, and streaming compiler used by the React, Vue, Solid, and Svelte renderers) and idiomatic modern Angular: standalone components, signals, zoneless-friendly, `OnPush` everywhere.

**[Live demo](https://shteynu.github.io/ngx-json-render/)** — interactive spec (bindings, repeat, confirm, watch) and a replayable SpecStream showing progressive rendering ([source](https://github.com/shteynu/ngx-json-render/tree/main/projects/demo)) — or [![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/shteynu/ngx-json-render)

![A SpecStream of RFC 6902 patches rendering progressively into an Angular dashboard](https://raw.githubusercontent.com/shteynu/ngx-json-render/main/docs/streaming.gif)

## Install

```bash
npm install ngx-json-render @json-render/core zod
```

Requires Angular ≥ 21.

## Quick start

**1. Define a catalog** — the vocabulary the model (or your server) is allowed to use:

```ts
// catalog.ts
import { schema } from 'ngx-json-render';
import { z } from 'zod';

export const catalog = schema.createCatalog({
  components: {
    Card: {
      props: z.object({ title: z.string().optional() }),
      slots: ['default'],
      description: 'A card container',
    },
    Button: {
      props: z.object({ label: z.string() }),
      slots: [],
      description: "A button that emits a 'press' event",
    },
  },
  actions: {
    refresh: { params: z.object({}), description: 'Reload the data' },
  },
});
```

**2. Implement catalog components** — plain Angular components that read the render context:

```ts
import { Component } from '@angular/core';
import { JrChildren, injectRenderContext } from 'ngx-json-render';

@Component({
  selector: 'app-card',
  imports: [JrChildren],
  template: `
    <section class="card">
      @if (ctx.props().title) { <h3>{{ ctx.props().title }}</h3> }
      <jr-children />
    </section>
  `,
})
export class CardComponent {
  readonly ctx = injectRenderContext<{ title?: string }>();
}

@Component({
  selector: 'app-button',
  template: `<button (click)="ctx.emit('press')">{{ ctx.props().label }}</button>`,
})
export class ButtonComponent {
  readonly ctx = injectRenderContext<{ label: string }>();
}
```

`<jr-children />` renders the element's children where you place it — like a `router-outlet` for the spec tree. Use `<jr-children slot="header" />` for named slots.

**3. Build the registry and render:**

```ts
import { Component, signal } from '@angular/core';
import { JsonRenderer, type Spec, defineRegistry } from 'ngx-json-render';
import { catalog } from './catalog';

const { registry } = defineRegistry(catalog, {
  components: { Card: CardComponent, Button: ButtonComponent },
  actions: { refresh: async () => {} },
});

@Component({
  selector: 'app-page',
  imports: [JsonRenderer],
  template: `
    <json-render
      [spec]="spec()"
      [registry]="registry"
      [handlers]="handlers"
      (stateChange)="onStateChange($event)"
    />
  `,
})
export class Page {
  readonly registry = registry;
  readonly spec = signal<Spec>({
    root: 'root',
    state: { count: 0 },
    elements: {
      root: { type: 'Card', props: { title: 'Hello' }, children: ['btn'] },
      btn: {
        type: 'Button',
        props: { label: 'Tap me' },
        on: {
          press: { action: 'setState', params: { statePath: '/count', value: 1 } },
        },
      },
    },
  });
  handlers = { refresh: async () => { /* ... */ } };
  onStateChange(changes: unknown) { console.log(changes); }
}
```

## Streaming a UI from an LLM

Specs stream as JSONL patch lines (RFC 6902). Render partial specs as they arrive — the renderer tolerates missing elements while `loading` is true:

```ts
import { injectUIStream } from 'ngx-json-render';

@Component({
  template: `
    <json-render [spec]="ui.spec()" [registry]="registry" [loading]="ui.isStreaming()" />
    <button (click)="ui.send('A dashboard for weekly sales')">Generate</button>
  `,
  imports: [JsonRenderer],
})
export class GeneratePage {
  readonly ui = injectUIStream({ api: '/api/generate' });
  readonly registry = registry;
}
```

### The server side

`injectUIStream` POSTs `{ prompt, context, currentSpec }` to your endpoint and expects the response body to be SpecStream JSONL — one RFC 6902 patch per line. Any server that can stream text works; with the [AI SDK](https://ai-sdk.dev) it's a few lines — `catalog.prompt()` teaches the model your component vocabulary and the patch protocol:

```ts
// server.ts — Express shown; any Node server works the same way
import express from 'express';
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { catalog } from './catalog';

const app = express();
app.use(express.json());

app.post('/api/generate', async (req, res) => {
  const { prompt } = req.body; // injectUIStream sends { prompt, context, currentSpec }

  const result = streamText({
    model: anthropic('claude-sonnet-5'),
    system: catalog.prompt(),
    prompt,
  });

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  for await (const chunk of result.textStream) res.write(chunk);
  res.end();
});
```

The patches apply to the `spec` signal as each line arrives, so the UI assembles on screen while the model is still generating — exactly what the [demo's Streaming tab](https://shteynu.github.io/ngx-json-render/) replays. Prefer structured output? `catalog.jsonSchema()` exports a JSON Schema for `streamObject`/tool calls, and `catalog.validate(spec)` checks a finished spec against the catalog.

Also available:

- `injectChatUI({ api })` — chat + GenUI: the endpoint takes `{ messages }` and streams prose mixed with ` ```spec ` fenced JSONL; each assistant message carries `text` and/or a `spec`.
- `applyPatch(spec, patch)` — immutably apply one RFC 6902 patch to a spec.
- `buildSpecFromParts` / `getTextFromParts` / `jsonRenderMessage` — derive specs from AI SDK `message.parts`.
- `catalog.prompt()` / `buildUserPrompt` (from `@json-render/core`) — generate the system/user prompts for your catalog.

## Spec features supported

Full parity with the baseline json-render contract:

| Feature | Example |
| --- | --- |
| Dynamic props | `{ "$state": "/user/name" }` |
| Two-way binding | `{ "$bindState": "/form/email" }`, `{ "$bindItem": "done" }` |
| Conditionals | `{ "$cond": {...}, "$then": ..., "$else": ... }` |
| Templates | `{ "$template": "Hello, ${/user/name}" }` |
| Computed / directives | `{ "$computed": "fmtDate", "args": {...} }`, custom `$`-directives |
| Visibility | `"visible": { "$state": "/count", "gte": 5 }` (incl. `$and`/`$or`, `$item`, `$index`) |
| Events → actions | `"on": { "press": { "action": "...", "params": {...}, "confirm": {...}, "onSuccess": ..., "onError": ... } }` |
| Built-in actions | `setState`, `pushState` (with `$id`), `removeState`, `push`/`pop`, `validateForm` |
| Repeat | `"repeat": { "statePath": "/todos", "key": "id" }`, nested via `{ "$item": "..." }` |
| Watch | `"watch": { "/country": { "action": "loadCities" } }` |
| Slots | `"slots": { "header": ["title-el"] }` + `<jr-children slot="header" />` |
| Validation | field checks via `ValidationConfig`, `validateForm`, `injectFieldValidation` |
| Confirm dialogs | built-in `<jr-confirm-dialog>` (auto-rendered) |
| Devtools hooks | action observer + `data-jr-key` picker attributes |

## State

Each `<json-render>` owns a state store (JSON Pointer addressed). Seeding order: `store` input (controlled) → `state` input → `spec.state`.

Inside catalog components:

```ts
const store = injectStateStore();     // get/set/update/state()
const name = injectStateValue<string>('/user/name');
const bound = injectBoundProp<string>(() => ctx.props().value, () => ctx.bindings()?.['value']);
```

Share one store across renderers (or drive it from your own state management) by passing a core `StateStore` — `createStateStore()`, or `createStoreAdapter()` over Redux/NgRx/etc. — via the `store` input. `createStoreSetState(store)` adapts a whole-state updater to fine-grained path writes.

### A note on inputs

If a catalog component renders `<input [value]="ctx.props().value">`, remember that one-way bindings do not re-assert the DOM when the bound value returns to its previously applied value while the user typed in between (e.g. `pushState` + `clearStatePath`). Sync imperatively instead — see `InputComponent` in the demo app for the pattern.

## API surface

Components: `JsonRenderer` (`<json-render>`), `JrChildren`, `JrConfirmDialog`, `JrElement`, `JrRepeatScope`.

Injectables/helpers: `injectRenderContext`, `injectRepeatScope`, `injectStateStore`, `injectStateValue`, `injectStateBinding`, `injectBoundProp`, `injectActions`, `injectAction`, `injectValidation`, `injectFieldValidation`, `injectUIStream`, `injectChatUI`, `injectDevtoolsActive`, `jsonRenderMessage`.

Registry & schema: `defineRegistry`, `createStoreSetState`, `schema`.

Everything from `@json-render/core` (types, `createStateStore`, `nestedToFlat`, prompt builders, spec validators, SpecStream compiler) composes with this package; the most common symbols are re-exported.

## Renderer inputs

| Input | Type | Purpose |
| --- | --- | --- |
| `spec` | `Spec \| null` | The UI spec (may be partial while streaming) |
| `registry` | `ComponentRegistry` | Catalog type → Angular component |
| `loading` | `boolean` | Suppress missing-element warnings while streaming |
| `fallback` | `Type<unknown>` | Component for unknown types |
| `state` | `StateModel` | Initial state (uncontrolled; defaults to `spec.state`) |
| `store` | `StateStore` | External store (controlled mode) |
| `handlers` | `Record<string, ActionHandler>` | Action handlers |
| `onAction` | `(name, params) => unknown` | Catch-all action handler |
| `navigate` | `(path) => void` | Used by `onSuccess: { navigate }` |
| `validationFunctions` | `Record<string, ValidationFunction>` | Custom validation |
| `functions` | `Record<string, ComputedFunction>` | `$computed` functions |
| `directives` | `DirectiveDefinition[]` | Custom `$`-prefixed expressions |

Output: `(stateChange)` — batched `{ path, value }[]` in uncontrolled mode.

## License

Apache-2.0
