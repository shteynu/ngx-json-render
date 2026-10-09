---
name: ngx-json-render
description: Angular renderer for json-render. Use when rendering AI-generated JSON specs as Angular components, working with ngx-json-render, defining Angular catalogs and component registries, streaming specs with injectUIStream or injectChatUI, checking generated specs, or testing catalog components with ngx-json-render/testing.
---

# ngx-json-render

Angular renderer for [json-render](https://github.com/vercel-labs/json-render): a model emits a JSON spec constrained to a catalog of your components, and `<json-render>` renders it as real Angular components. An adapter over `@json-render/core` (the same spec grammar, expressions, state store, actions and SpecStream patches as the React, Vue, Svelte and Solid renderers), so catalogs and specs are portable. Standalone components, signals, `OnPush`, zoneless. No `innerHTML`, no `eval`.

## Installation

```bash
npm install ngx-json-render @json-render/core zod
```

In an Angular CLI workspace, `ng add ngx-json-render` does the same.

Peer dependencies: `@angular/core` and `@angular/common` `>=19` (the Material catalog needs `>=20`), `@json-render/core` 0.20 or 0.21, `zod ^4`. `ngx-json-render-material` adds a ready 29-component Angular Material catalog (`materialRegistry`, `materialCatalog.prompt()`); see its skill.

## Quick Start

### 1. Define a catalog

```ts
// catalog.ts
import { schema } from 'ngx-json-render/schema'; // no Angular: a server can import this file
import { z } from 'zod';

export const catalog = schema.createCatalog({
  components: {
    Card: {
      props: z.object({ title: z.string().optional() }),
      slots: ['default', 'actions'],
      description: 'A card with a body and an "actions" footer',
    },
    Button: {
      props: z.object({ label: z.string() }),
      slots: [],
      description: "A button that emits a 'press' event",
    },
    Input: {
      props: z.object({ value: z.string().optional() }),
      slots: [],
      description: 'Text input; bind `value` with $bindState',
    },
  },
  actions: {
    refresh: { params: z.object({}), description: 'Reload the data' },
  },
});
```

`defineCatalog(schema, { ... })` from `@json-render/core` is the same call. `catalog.prompt()` is the system prompt (`prompt({ customRules })` appends rules), `catalog.jsonSchema({ strict: true })` a JSON Schema for structured output, `catalog.validate(spec)` core's check.

### 2. Implement catalog components

A catalog component is a plain standalone component with no inputs; it injects the render context. `<jr-children />` renders the element's children in place, `<jr-children slot="actions" />` a named slot.

```ts
import { Component, type ElementRef, effect, viewChild } from '@angular/core';
import {
  type InferComponentProps,
  JrChildren,
  injectRenderContext,
} from 'ngx-json-render';

@Component({
  selector: 'app-card',
  imports: [JrChildren],
  template: `
    <section class="card">
      @if (ctx.props().title) {
        <h3>{{ ctx.props().title }}</h3>
      }
      <jr-children />
      <footer><jr-children slot="actions" /></footer>
    </section>
  `,
})
export class CardComponent {
  readonly ctx =
    injectRenderContext<InferComponentProps<typeof catalog, 'Card'>>();
}

@Component({
  selector: 'app-button',
  template: `<button (click)="ctx.emit('press')">{{ ctx.props().label }}</button>`,
})
export class ButtonComponent {
  readonly ctx =
    injectRenderContext<InferComponentProps<typeof catalog, 'Button'>>();
}

// Two-way binding: write through setBound and sync the DOM imperatively. A
// [value] binding skips the write when state returns to a value the DOM
// already had while the user typed.
@Component({
  selector: 'app-input',
  template: `<input #el (input)="onInput($event)" (keydown.enter)="ctx.emit('submit')" />`,
})
export class InputComponent {
  readonly ctx =
    injectRenderContext<InferComponentProps<typeof catalog, 'Input'>>();
  private readonly el = viewChild.required<ElementRef<HTMLInputElement>>('el');
  constructor() {
    effect(() => {
      const value = String(this.ctx.props().value ?? '');
      if (this.el().nativeElement.value !== value) this.el().nativeElement.value = value;
    });
  }
  onInput(event: Event): void {
    this.ctx.setBound('value', (event.target as HTMLInputElement).value);
  }
}
```

`InferComponentProps<typeof catalog, 'Card'>` types the props from the catalog's Zod schema (or pass a hand-written type). A `.default()` field comes out required, but the renderer applies no Zod defaults, so keep such fields optional.

`RenderContext<P>` from `injectRenderContext<P>()`: `props()` and `element()` (resolved; read these in templates, they are what a state write refreshes), `emit(event)`, `on(event)` → `{ emit, bound, shouldPreventDefault }`, `bindings()` (prop → state path for `$bindState` / `$bindItem`), `setBound(prop, value)`, `loading()`.

Other helpers: `injectStateStore()` (`get`, `set`, `update`, `state()`), `injectStateValue<T>(path)`, `injectStateBinding<T>(path)` and `injectBoundProp<T>(propValue, bindingPath)` (`{ value, set }`), `injectActions()` / `injectAction(binding)` (`{ execute, isLoading }`; `isActionCancelled(error)` tells a dismissed `confirm` from a failure), `injectFieldValidation(path, config)` (`{ state, errors, validate, touch, clear }`), `injectRepeatScope()`, `injectElementKey()`.

### 3. Build the registry and render

```ts
import { Component, signal } from '@angular/core';
import { type ActionHandler, JsonRenderer, type Spec, defineRegistry } from 'ngx-json-render';
import { catalog } from './catalog';

export const { registry } = defineRegistry(catalog, {
  components: { Card: CardComponent, Button: ButtonComponent, Input: InputComponent },
  actions: { refresh: async () => {} },
});

@Component({
  selector: 'app-page',
  imports: [JsonRenderer],
  template: `<json-render [spec]="spec()" [registry]="registry" [handlers]="handlers" />`,
})
export class Page {
  readonly registry = registry;
  readonly spec = signal<Spec>({
    root: 'root',
    state: { name: '' },
    elements: {
      root: { type: 'Card', props: { title: 'Hello' }, children: ['name'], slots: { actions: ['btn'] } },
      name: { type: 'Input', props: { value: { $bindState: '/name' } }, children: [] },
      btn: {
        type: 'Button',
        props: { label: { $template: 'Hello, ${/name}' } },
        on: { press: { action: 'refresh' } },
        visible: { $state: '/name', neq: '' },
        children: [],
      },
    },
  });
  readonly handlers: Record<string, ActionHandler> = { refresh: async () => {} };
}
```

`defineRegistry` is typed against the catalog: an unknown component key is a compile error, and when the catalog declares actions the `actions` map is required (`(params, setState, state) => Promise<void>` each). The renderer runs the handlers passed to `[handlers]`; `defineRegistry` also returns `handlers(getSetState, getState)` to adapt its typed map and `executeAction(name, params, setState)` for imperative use.

## Spec structure

- Flat: `elements` is a map keyed by element key, `children` lists keys, `root` names the top. Every element has a `children` array, `[]` for leaves.
- `visible`, `on`, `repeat`, `slots` and `watch` sit on the element, never inside `props`.
- `state` on the spec seeds the store unless the renderer is given `state` or `store`.
- Named slots: `"slots": { "actions": ["btn"] }` on the element, `slots: ['default', 'actions']` in the catalog, `<jr-children slot="actions" />` in the component. Default content stays in `children`.

## Renderer inputs

| Input                 | Type                                 | Purpose                                                              |
| --------------------- | ------------------------------------ | -------------------------------------------------------------------- |
| `spec`                | `Spec \| null`                       | The spec; may be partial while streaming                             |
| `registry`            | `ComponentRegistry`                  | Catalog type → Angular component                                     |
| `loading`             | `boolean`                            | Suppress missing-element warnings while streaming                    |
| `fallback`            | `Type<unknown>`                      | Component for unknown types                                          |
| `validate`            | `'off' \| 'warn' \| 'strict'`        | Check the settled spec's structure (default `'off'`)                 |
| `catalog`             | `Catalog`                            | Also check element types and props against the catalog               |
| `renderLimits`        | `RenderLimits`                       | Cap `maxElements`, `maxDepth`, `maxRepeatItems` (default none)       |
| `state`               | `StateModel`                         | Initial state (uncontrolled; defaults to `spec.state`)               |
| `store`               | `StateStore`                         | External store (controlled mode)                                     |
| `handlers`            | `Record<string, ActionHandler>`      | Action handlers by name                                              |
| `onAction`            | `(name, params) => unknown`          | Catch-all: every action name reaches it, switch on the expected ones |
| `navigate`            | `(path) => void`                     | Called by `onSuccess: { navigate }`; treat the path as untrusted     |
| `validationFunctions` | `Record<string, ValidationFunction>` | Custom validation checks                                             |
| `functions`           | `Record<string, ComputedFunction>`   | Functions for `$computed`                                            |
| `directives`          | `DirectiveDefinition[]`              | Custom `$`-prefixed expressions                                      |

Output: `(stateChange)` emits batched `StateChange[]` (`{ path, value }`) in uncontrolled mode.

## Dynamic props

- `{ "$state": "/user/name" }` reads state (JSON Pointer); `{ "$bindState": "/form/email" }` binds two-way; `{ "$bindItem": "done" }` binds a field of the current `repeat` item; `{ "$item": "title" }` and `{ "$index": true }` read the item.
- `{ "$template": "Hello, ${/user/name}" }`; `{ "$cond": { "$state": "/ok" }, "$then": "Yes", "$else": "No" }`.
- `{ "$computed": "fmtDate", "args": { "value": { "$state": "/date" } } }` calls a function from the `functions` input. Keep it pure over `args`: it re-runs only when a path in `args` changes.
- Directives are custom `$`-keys passed through `[directives]`. `@json-render/directives` (`standardDirectives`: `$format`, `$math`, `$concat`, `$count`, `$truncate`, `$pluralize`, `$join`, `$t`) works as is, e.g. `{ "$format": "currency", "value": { "$state": "/price" }, "currency": "USD" }`.

## Visibility conditions

```json
{ "$state": "/status", "eq": "active" }
{ "$state": "/count", "gte": 5 }
{ "$state": "/maintenance", "not": true }
{ "$item": "done", "eq": false }
{ "$and": [{ "$state": "/a" }, { "$or": [{ "$state": "/b" }, { "$state": "/c" }] }] }
```

Operators: `eq`, `neq`, `gt`, `gte`, `lt`, `lte` (a number or `{ "$state": "/path" }`), `not: true`. A bare array is an implicit AND; `$item` / `$index` conditions work inside a `repeat`.

## Events, actions, repeat, watch

```json
"on": {
  "press": {
    "action": "saveUser",
    "params": { "email": { "$state": "/email" } },
    "confirm": { "title": "Save?", "message": "This overwrites the profile.", "variant": "danger" },
    "onSuccess": { "navigate": "/thanks" },
    "onError": { "set": { "/error": true } }
  }
}
```

- `params` values may be `{ "$state": "/path" }`. `confirm` (`title`, `message`, `confirmLabel?`, `cancelLabel?`, `variant?: 'default' | 'danger'`) opens the built-in dialog first; it is a UX affordance, not authorization. `onSuccess` is `{ navigate }`, `{ set: { "/path": value } }` or `{ action, params }`; `onError` is `{ set }` or `{ action, params }`. Several bindings: `"press": [b1, b2]`.
- Built-ins handled by the renderer: `setState` (`{ statePath, value }`), `pushState` (`{ statePath, value, clearStatePath? }`; `"$id"` in `value` auto-generates an id), `removeState` (`{ statePath, index }`), `push` / `pop` (`/currentScreen`, `/navStack`), `validateForm` (`{ statePath? }`, writes `{ valid, errors }` to `/formValidation`), `submitForm` (`{ action, params?, statePath? }`: validate every bound field, dispatch `action` only if all pass). Any other name is looked up in `handlers`; an unknown one warns and does nothing.
- `"repeat": { "statePath": "/todos", "key": "id" }` on a container renders its children once per item; a nested list uses `"statePath": { "$item": "comments" }`.
- `"watch": { "/country": { "action": "loadCities" } }` dispatches when a state path changes.

## State

Each `<json-render>` owns a JSON-Pointer store. Seeding order: `store` input (controlled) → `state` input → `spec.state`. Share one store across renderers, or drive it from your own state management, with a core `StateStore` (`createStateStore()`, or an adapter such as `@json-render/redux`) on `store`; `createStoreSetState(store)` adapts a whole-state updater to path writes. Uncontrolled mode reports writes through `(stateChange)`. A spec chooses its own state paths and `navigate` targets: scope the store to the generated view and match `navigate` paths against known routes.

## Streaming

Specs stream as JSONL patch lines (RFC 6902); `injectUIStream` applies them to a signal as they arrive, so the UI assembles while the model is still generating.

```ts
import { Component } from '@angular/core';
import { JsonRenderer, injectUIStream } from 'ngx-json-render';

@Component({
  selector: 'app-generate',
  imports: [JsonRenderer],
  template: `
    <json-render
      [spec]="ui.spec()"
      [registry]="registry"
      [loading]="ui.isStreaming()"
      [catalog]="catalog"
      validate="warn"
      [renderLimits]="{ maxElements: 500, maxDepth: 16, maxRepeatItems: 200 }"
    />
    <button (click)="ui.send('A dashboard for weekly sales')">Generate</button>
    @if (ui.isStreaming()) {
      <button (click)="ui.stop()">Stop</button>
    }
  `,
})
export class GeneratePage {
  readonly registry = registry;
  readonly catalog = catalog;
  readonly ui = injectUIStream({ api: '/api/generate', validate: 'strict', catalog });
}
```

`injectUIStream({ api, onComplete?, onError?, validate?, catalog?, renderLimits?, fetch? })` returns signals `spec`, `isStreaming`, `error`, `usage`, `rawLines`, `issues`, plus `send(prompt, { context?, previousSpec? })` (`previousSpec` refines the current UI instead of starting over), `stop()` (keeps what rendered) and `clear()`. It POSTs `{ prompt, context, currentSpec }` and expects SpecStream JSONL back; `fetch` swaps the transport (auth headers, a recorded replay).

`injectChatUI({ api, ... })` is the same for a chat whose replies mix prose with ` ```spec ` fenced JSONL: the endpoint receives `{ messages }`, and `messages()` holds `{ id, role, text, spec }` per turn (render `m.spec` with `<json-render>` when set), plus `isStreaming`, `error`, `issues`, `send(text)`, `stop()`, `clear()`. For AI SDK `UIMessage.parts`, `jsonRenderMessage(() => parts)` gives `text()`, `spec()`, `hasSpec()`; never give patch data parts an `id`. With `@ai-sdk/angular`, pass the message being streamed down as a copy (`{ ...m, parts: m.parts.map((p) => ({ ...p })) }`): its `Chat` writes every chunk into one object and hands back the same reference, so a signal input holding it never changes and the message renders empty. `applyPatch(spec, patch)` applies one RFC 6902 patch immutably.

### Server side

Any server that streams text works; `catalog.prompt()` teaches the model the vocabulary and the patch protocol.

```ts fragment
// Express route; injectUIStream sends { prompt, context, currentSpec }
app.post('/api/generate', async (req, res) => {
  const result = streamText({
    model: anthropic('claude-sonnet-5'),
    system: catalog.prompt(),
    prompt: req.body.prompt,
  });
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  for await (const chunk of result.textStream) res.write(chunk);
  res.end();
});
```

Import `schema` in `catalog.ts` from `ngx-json-render/schema`, which loads no Angular, so any server can import the catalog. Imported from `ngx-json-render`, it loads Angular, and a plain Node server then needs `import '@angular/compiler';` as its first import. In an Angular SSR app the route goes into `server.ts` (on Angular 20 and 21 first add `"prebundle": { "exclude": ["zod"] }` to the `serve` options in `angular.json`, or the dev server answers every request with a 500). For structured output use `catalog.jsonSchema({ strict: true })` with `streamObject` or a tool call and render the finished spec.

## Checking what the model produced

- `validate="warn"` reports structural problems in the settled spec and renders anyway; `"strict"` refuses a spec with errors and, in the hooks, fails the generation instead of calling `onComplete`. Both first apply core's lossless `autoFixSpec` fixes (`visible`, `on`, `repeat` misplaced inside `props` move back onto the element).
- Pass `[catalog]` too and unknown element types and props their component schema rejects are reported; props written as expressions are not checked.
- `renderLimits` (`maxElements`, `maxDepth`, `maxRepeatItems`) is enforced in every mode and while streaming; there are no defaults, so set all three for specs you did not generate. By hand: `checkSpec(spec, 'strict', { catalog, limits })` and `formatSpecCheckIssues(issues)`.

The renderer never executes code from a spec, only dispatches actions you registered, and breaks render cycles.

## Confirmation dialogs

`confirm` on a binding opens the packaged accessible modal. Customize its words with the `JR_CONFIRM_LABELS` token (`{ confirm, cancel }`), its colours with the `--jr-confirm-*` CSS variables on `json-render`, or replace it with `JR_CONFIRM_DIALOG` (a component that calls `injectConfirmContext()` for `config`, `confirm()`, `cancel()`).

## MCP Apps (`ngx-json-render/mcp`)

Render a tool's spec inline in an MCP Apps host (Claude, ChatGPT, VS Code). Optional peers: `npm install @modelcontextprotocol/ext-apps @modelcontextprotocol/sdk`.

```ts fragment
import { injectJsonRenderApp } from 'ngx-json-render/mcp';

readonly mcp = injectJsonRenderApp({ name: 'my-app', version: '1.0.0' }); // in an injection context
// <json-render [spec]="mcp.spec()" [loading]="mcp.loading()" [registry]="registry" />
await this.mcp.sendMessage('Approve release 2.4.0', { version: '2.4.0' }); // posts a user message to the chat
```

`spec`, `loading`, `connected`, `connecting` and `error` are signals. The spec streams in from `toolinputpartial` while the model writes the call (`streamPartialInput: false` to wait for the result), and `callServerTool(name, args)` replaces it with another tool's result. The server side is `@json-render/mcp`; a full example lives in `projects/mcp-app` of the repository.

## Testing (`ngx-json-render/testing`)

```ts fragment
import { recordedTransport, renderComponent, renderSpec, specStream, usageLine } from 'ngx-json-render/testing';

const ui = await renderSpec(spec, { registry: { Button: MyButton } }); // options mirror the renderer's inputs, plus providers
ui.text('button'); await ui.click('button'); ui.dispatched; // [{ name, params }]
ui.read('/path'); await ui.write('/path', value); await ui.setSpec(next);

const button = await renderComponent(MyButton, { props: { label: 'Save' }, bindings: { value: '/name' } });
await button.click('button'); button.emitted; // ['press']
await button.patchProps({ disabled: true }); button.writes; // setBound calls

const stream = injectUIStream({
  api: '/api/generate',
  fetch: recordedTransport([...specStream(expectedSpec), usageLine({ totalTokens: 15 })]),
});
```

`renderSpec` mounts a spec against a registry with no host component or TestBed module; `renderComponent` mounts one catalog component with `props`, `bindings` (two-way-bound props) and `on` (events the spec would bind); `recordedTransport` is a `fetch` that replays recorded JSONL (`Record<prompt, lines>` for per-prompt answers; options `delayMs`, `fail`, `promptOf`), and `specStream(spec)` writes the patch lines a model would emit.

## Key Exports

| Export                                                                                                        | Purpose                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `JsonRenderer` (`<json-render>`), `JrChildren` (`<jr-children [slot]>`)                                       | Render a spec; render an element's children or a named slot                                                                                                                       |
| `schema`, `defineRegistry`, `createStoreSetState`                                                             | Angular schema (`schema.createCatalog`), typed registry, store adapter                                                                                                            |
| `injectRenderContext`                                                                                         | Props, element, `emit`, `on`, `bindings`, `setBound`, `loading`                                                                                                                   |
| `injectStateStore`, `injectStateValue`, `injectStateBinding`, `injectBoundProp`                               | State access inside components                                                                                                                                                    |
| `injectActions`, `injectAction`, `isActionCancelled`, `injectValidation`, `injectFieldValidation`             | Actions and field validation inside components                                                                                                                                    |
| `injectUIStream`, `injectChatUI`, `jsonRenderMessage`, `buildSpecFromParts`, `getTextFromParts`, `applyPatch` | Streaming                                                                                                                                                                         |
| `checkSpec`, `formatSpecCheckIssues`                                                                          | Spec checks by hand; types `RenderLimits`, `SpecCheck`, `SpecCheckIssue`                                                                                                          |
| `JR_CONFIRM_DIALOG`, `JR_CONFIRM_LABELS`, `injectConfirmContext`, `JrConfirmDialog`                           | Confirmation dialog                                                                                                                                                               |
| `injectRepeatScope`, `injectElementKey`, `injectDevtoolsActive`                                               | Repeat scope, element key, devtools                                                                                                                                               |
| Re-exported from core                                                                                         | `Spec`, `UIElement`, `ActionBinding`, `ActionHandler`, `StateStore`, `VisibilityCondition`, `createStateStore`, `validateSpec`, `autoFixSpec`, `nestedToFlat`, `formatSpecIssues` |
