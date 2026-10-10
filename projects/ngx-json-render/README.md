# ngx-json-render

[![npm](https://img.shields.io/npm/v/ngx-json-render)](https://www.npmjs.com/package/ngx-json-render) [![CI](https://github.com/shteynu/ngx-json-render/actions/workflows/ci.yml/badge.svg)](https://github.com/shteynu/ngx-json-render/actions/workflows/ci.yml) [![license](https://img.shields.io/npm/l/ngx-json-render)](https://github.com/shteynu/ngx-json-render/blob/main/LICENSE)

Generative UI for Angular: a renderer for [json-render](https://github.com/vercel-labs/json-render). Give an LLM a catalog of your components, stream back a JSON spec, and render it as real Angular components. No `innerHTML`, no `eval`, no framework lock-in on the wire format.

Built on `@json-render/core` (the same spec format, expressions, state store, actions, and streaming compiler used by the React, Vue, Solid, and Svelte renderers) and idiomatic modern Angular: standalone components, signals, `OnPush` everywhere, and zoneless — no `NgZone`, no Zone.js.

This is an Angular **adapter over the official core**, not a second implementation of it — `@json-render/core` is a peer dependency, and the spec your model emits is the same one the React, Vue, Solid and Svelte renderers consume. A catalog and a spec written here move to another framework unchanged.

**[Live demo](https://shteynu.github.io/ngx-json-render/)** — opens on a sales dashboard streaming in patch by patch, which you can stop mid-generation; plus a playground, an interactive spec (bindings, repeat, confirm, watch), and a chat where prose and UI patches arrive in one reply. Both streaming tabs replay a recording, or call a real model on your own key ([source](https://github.com/shteynu/ngx-json-render/tree/main/projects/demo)) — or [![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/shteynu/ngx-json-render)

![A SpecStream of RFC 6902 patches rendering progressively into an Angular dashboard](https://raw.githubusercontent.com/shteynu/ngx-json-render/main/docs/streaming.gif)

## Install

```bash
ng add ngx-json-render
```

`ng add` installs the package and adds its peers, `@json-render/core` and
`zod`, at the ranges it admits. By hand, that is

```bash
npm install ngx-json-render @json-render/core zod
```

Requires Angular ≥ 19. CI proves both ends of that range on every push: the
library builds on Angular 19 (the floor), and its suite passes on 20 and on
22 (the current release) as well as on the 21 the workspace itself pins —
Angular 19's CLI has no unit-test builder to run it with. What npm serves is
checked too: the package built on 21 is installed into a fresh app on 19, 20
and 22, built with strict templates and driven in Chrome. On Angular 19 the
`ngx-json-render/testing` harness uses 19's
`provideExperimentalZonelessChangeDetection` by itself. The Material catalog,
[`ngx-json-render-material`](../ngx-json-render-material/README.md), needs
Angular ≥ 20.
The same goes for `@json-render/core`: 0.20 and 0.21 are both admitted
(`>=0.20.0 <0.22.0`), the workspace pins the newest and CI tests the floor.

**Zoneless, and checked as such.** Zone.js appears in no manifest here, `NgZone`
in no source file, and neither in the published bundles; every suite runs under
`provideZonelessChangeDetection()`. CI asserts all four on each commit
(`npm run check:zoneless`), so this is a tested property rather than a
statement of intent — which matters because zoneless is the default for new
applications from Angular 21 on.

## Agent skill

Using an AI coding agent (Claude Code, Cursor, Codex, …)? Install the skill
that teaches it this package's API, so the catalogs, components and streaming
code it writes compile against what actually ships:

```bash
npx skills add shteynu/ngx-json-render --skill ngx-json-render
```

The source is [`skills/ngx-json-render/SKILL.md`](https://github.com/shteynu/ngx-json-render/blob/main/skills/ngx-json-render/SKILL.md);
the Material catalog has one too (`--skill ngx-json-render-material`).
An agent that reads [llms.txt](https://llmstxt.org) instead can start from
<https://shteynu.github.io/ngx-json-render/llms.txt>.

## The shortest path: a ready-made catalog

Writing a catalog is the honest first step, but you do not have to take it to
see a spec render. [`ngx-json-render-material`](https://www.npmjs.com/package/ngx-json-render-material)
ships 33 Angular Material components already registered, so a generated spec
renders with nothing else wired up:

```bash
ng add ngx-json-render-material
```

Those are real Material components, so the app needs a Material theme and the
icon font; `ng add` sets both up through Material's own `ng add` when the
workspace has no Material yet (see the
[catalog's README](https://github.com/shteynu/ngx-json-render/tree/main/projects/ngx-json-render-material#install)
for installing by hand).

```ts
import { Component, signal } from '@angular/core';
import { JsonRenderer, type Spec } from 'ngx-json-render';
import { materialRegistry } from 'ngx-json-render-material';

@Component({
  selector: 'app-root',
  imports: [JsonRenderer],
  template: `<json-render [spec]="spec()" [registry]="registry" />`,
})
export class App {
  readonly registry = materialRegistry;
  readonly spec = signal<Spec>({
    root: 'card',
    state: { name: '' },
    elements: {
      card: { type: 'Card', props: { title: 'Profile' }, children: ['name', 'hi'] },
      name: { type: 'Input', props: { label: 'Name', value: { $bindState: '/name' } } },
      hi: {
        type: 'Text',
        props: { content: { $template: 'Hello, ${/name}!' } },
        visible: { $state: '/name', neq: '' },
      },
    },
  });
}
```

`materialCatalog.prompt()` is the system prompt that teaches a model that
vocabulary. Everything below is the other path — your own components, which is
what the catalog API is for.

## Quick start

**1. Define a catalog** — the vocabulary the model (or your server) is allowed to use:

```ts
// catalog.ts
import { schema } from 'ngx-json-render/schema';
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
import {
  type InferComponentProps,
  JrChildren,
  injectRenderContext,
} from 'ngx-json-render';
import type { catalog } from './catalog';

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
```

`InferComponentProps` reads a component's props type off its Zod schema in the catalog, so the component and the catalog cannot drift apart; a hand-written type such as `injectRenderContext<{ label: string }>()` works too. One mismatch to know: a `.default()` field comes out required, but the renderer passes props as the spec wrote them and applies no Zod defaults, so keep such a field optional or fall back in the template.

`<jr-children />` renders the element's children where you place it — like a `router-outlet` for the spec tree. Use `<jr-children slot="header" />` for named slots.

**3. Build the registry and render:**

```ts
import { Component, signal } from '@angular/core';
import {
  type ActionHandler,
  JsonRenderer,
  type Spec,
  type StateChange,
  defineRegistry,
} from 'ngx-json-render';
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
  readonly handlers: Record<string, ActionHandler> = {
    refresh: async () => { /* ... */ },
  };
  onStateChange(changes: StateChange[]) { console.log(changes); }
}
```

### Defaults for the whole app

A chat renders a spec in every message, and binding the same registry and handlers on each one gets old. `provideJsonRender` sets them once:

```ts
bootstrapApplication(App, {
  providers: [
    provideJsonRender(() => {
      const orders = inject(OrderService); // the function form runs in an injection context
      return {
        registry,
        catalog,
        handlers: { cancelOrder: (params) => orders.cancel(params['id']) },
      };
    }),
  ],
});
```

```html
<json-render [spec]="m.spec" />
```

Every option input can be provided: `registry`, `fallback`, `validate`, `renderLimits`, `catalog`, `handlers`, `onAction`, `navigate`, `validationFunctions`, `functions` and `directives`. Per-instance inputs (`spec`, `loading`, `state`, `store`) cannot. The rules:

- An input bound on the element wins over the provided value. One left `null` or `undefined` falls through to it.
- `handlers`, `functions`, `validationFunctions` and `directives` merge by name instead, the element's entry winning a name both define. A chat can provide app-wide handlers and still add one for a single message.
- Everything else replaces. A `registry` belongs to its catalog, so two are never mixed behind your back; to combine them, spread them yourself (`{ ...registry, ...extraRegistry }`).
- It works in application, route and component `providers`. A provider below another extends it by the same rules.

With no registry bound and none provided, the renderer throws, naming both ways to supply one.

## Streaming a UI from an LLM

Specs stream as JSONL patch lines (RFC 6902). Render partial specs as they arrive — the renderer tolerates missing elements while `loading` is true:

```ts
import { injectUIStream } from 'ngx-json-render';

@Component({
  template: `
    <json-render [spec]="ui.spec()" [registry]="registry" [loading]="ui.isStreaming()" />
    <button (click)="ui.send('A dashboard for weekly sales')">Generate</button>
    @if (ui.isStreaming()) {
      <button (click)="ui.stop()">Stop</button>
    }
  `,
  imports: [JsonRenderer],
})
export class GeneratePage {
  readonly ui = injectUIStream({ api: '/api/generate' });
  readonly registry = registry;
}
```

### Placeholders while props stream

An element can arrive before its props do: a Card with no `title` yet, a Text
with no `content`. By default the component mounts anyway and renders what it
has. Pass the `catalog` and the renderer waits instead: while `loading` is
true, an element whose props do not pass its component's schema shows its
registry entry's `fallback`, or nothing, and the component mounts once they
do.

```ts
export const { registry } = defineRegistry(catalog, {
  components: {
    Card: { component: CardComponent, fallback: CardSkeleton },
    Text: TextComponent, // nothing on screen until `content` arrives
  },
});
```

```html
<json-render [spec]="ui.spec()" [registry]="registry" [catalog]="catalog" [loading]="ui.isStreaming()" />
```

- The fallback gets the same render context as the component: it can read
  the props that have arrived, and a `<jr-children />` in it lays out the
  children that have.
- Props are checked as the spec writes them. `{ "$state": "/title" }` counts
  as arrived, whatever it resolves to.
- Once an element's component has mounted it stays, even if a later patch
  takes a prop away again.
- When `loading` turns false every element mounts, valid or not; reporting
  what is wrong with the finished spec is `validate`'s job.
- Without a `catalog`, or for a type the catalog has no props schema for,
  nothing is held back.

### The server side

`injectUIStream` POSTs `{ prompt, context, currentSpec }` to your endpoint and expects the response body to be SpecStream JSONL — one RFC 6902 patch per line. Any server that can stream text works; with the [AI SDK](https://ai-sdk.dev) it's a few lines — `catalog.prompt()` teaches the model your component vocabulary and the patch protocol:

```ts
// server.ts — Express shown (plain Node needs one extra import, see below)
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

`catalog.ts` imports `schema` from `ngx-json-render/schema`, an entry point that needs nothing but `@json-render/core`, so any server can load the catalog without Angular: plain Node, `tsx`, an edge function. (`ngx-json-render` exports the same `schema`, but that entry point also loads Angular and the renderer's partially compiled components. A Node server the Angular CLI doesn't build then fails with `'@angular/compiler' is not available`.) In an Angular SSR app (`ng new --ssr`) the route goes into its `server.ts`. On Angular 20 and 21, add `"prebundle": { "exclude": ["zod"] }` to the `serve` options in `angular.json` first: their Vite 7 dev server can't transform zod for the server (`Cannot split a chunk that has already been edited`) and answers every page and API route with a 500.

The patches apply to the `spec` signal as each line arrives, so the UI assembles on screen while the model is still generating — exactly what the [demo's Streaming tab](https://shteynu.github.io/ngx-json-render/) replays. Prefer structured output? `catalog.jsonSchema()` exports a JSON Schema for `streamObject`/tool calls, and `checkSpec(spec, 'strict', { catalog })` checks a finished spec against the catalog, props included — see [Checking what the model produced](#checking-what-the-model-produced) for why that and not `catalog.validate(spec)` alone.

### With Genkit

On Firebase, or anywhere else [Genkit](https://genkit.dev) already runs, the route has the same shape. `ai.generateStream` streams the model's text, and that text is the JSONL the system prompt asked for, so it goes to the browser unchanged:

```ts
// server.ts — Express with Genkit and its Google AI plugin
import express from 'express';
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { buildUserPrompt } from '@json-render/core';
import { catalog } from './catalog';

const ai = genkit({ plugins: [googleAI()] }); // reads GEMINI_API_KEY

const app = express();
app.use(express.json());

app.post('/api/generate', async (req, res) => {
  const { prompt, currentSpec } = req.body; // and `context`, yours to use

  const { stream } = ai.generateStream({
    model: googleAI.model('gemini-3.5-flash'),
    system: catalog.prompt(),
    prompt: buildUserPrompt({ prompt, currentSpec }), // currentSpec: refine, not restart
  });

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  for await (const chunk of stream) res.write(chunk.text);
  res.end();
});
```

`buildUserPrompt` comes from `@json-render/core`. Given a `currentSpec`, it asks the model for patches to that spec, so `ui.send(prompt, { previousSpec })` refines the UI instead of regenerating it; without one, it adds a reminder of the order to stream in. Another model is another plugin and `model` line, such as `vertexAI` from the same package. Serve the text from a plain route like this one rather than through `expressHandler` from `@genkit-ai/express`: that wraps every chunk in its own server-sent event (`data: {"message": …}`), which `injectUIStream` does not read.

### Chat + GenUI

When the model answers in prose _and_ renders a UI in the same turn, reach for
`injectChatUI` instead. Its endpoint takes `{ messages }` and streams prose
mixed with ` ```spec ` fenced JSONL. Each assistant message carries `text`
and/or its own `spec`, so earlier turns keep the UI they generated:

```ts
import { Component } from '@angular/core';
import { JsonRenderer, injectChatUI } from 'ngx-json-render';

@Component({
  imports: [JsonRenderer],
  template: `
    @for (m of chat.messages(); track m.id) {
      <p>{{ m.text }}</p>
      @if (m.spec) {
        <json-render [spec]="m.spec" />
      }
    }
    <button (click)="chat.send('show me revenue for the quarter')">Ask</button>
  `,
})
export class ChatPage {
  // The registry comes from provideJsonRender({ registry }) in the app's
  // providers: see "Defaults for the whole app".
  readonly chat = injectChatUI({ api: '/api/chat' });
}
```

### Reading an AI SDK message

If the UI arrives as AI SDK data parts rather than through these hooks,
`buildSpecFromParts` / `getTextFromParts` / `jsonRenderMessage` read a
`UIMessage.parts` array directly — pass it as it is, no cast:

```ts
readonly msg = jsonRenderMessage(() => this.message().parts);
// template: {{ msg.text() }} @if (msg.hasSpec()) { <json-render [spec]="msg.spec()" ... /> }
```

With `@ai-sdk/angular`, hand that component a copy of the message being
streamed. The SDK's `Chat` writes every chunk into one message object and
passes that same object back each time, so a signal input holding it never
changes, and the message renders empty even after the stream ends.
[`examples/ai-sdk-chat`](https://github.com/shteynu/ngx-json-render/tree/main/examples/ai-sdk-chat)
is the whole path, server to rendered message, and makes the copy in
`app.ts`.

Two things about the parts themselves, both the SDK's semantics rather than
this package's, and both silent when you get them wrong:

- **Do not give patch parts an `id`.** A data part written with one is
  _replaced_ by the next part carrying the same id, so a spec streamed as
  patches under one id arrives as its last patch alone. An id is for a part
  that is a snapshot of itself — a `flat` or `nested` whole-spec part.
- **A transient part never reaches `message.parts`.** It goes to `onData` and
  nowhere else, so a spec written transiently cannot be rebuilt from the
  message.

`projects/ngx-json-render/src/lib/ai-sdk-parts.spec.ts` runs the real SDK —
writes the chunks a server route would, reads the message a client would —
and asserts both of these, so this section cannot quietly go stale.

### From an AG-UI agent

[AG-UI](https://docs.ag-ui.com) is the event protocol CopilotKit, LangGraph and
others speak between an agent and its frontend. A json-render spec travels on
it as an **activity** with `activityType: "json-render-spec"`
(`JSON_RENDER_ACTIVITY_TYPE`): `ACTIVITY_SNAPSHOT` carries a whole spec in
`content`, and `ACTIVITY_DELTA` carries RFC 6902 patches against it in `patch`
— the same patches a JSONL stream is made of. `ngx-json-render/ag-ui` reads
that, and needs nothing from `@ag-ui/*` at runtime: it accepts any agent and
event of the right shape.

With an `@ag-ui/client` agent, `injectAgentUI` gives the signals `injectUIStream`
gives. The app keeps running the agent; the hook only listens, so it sees every
run whoever starts it, and checks each spec when the run ends:

```ts
import { Component } from '@angular/core';
import { HttpAgent } from '@ag-ui/client';
import { JsonRenderer } from 'ngx-json-render';
import { injectAgentUI } from 'ngx-json-render/ag-ui';
import { catalog } from './catalog';

@Component({
  imports: [JsonRenderer],
  template: `
    <json-render [spec]="ui.spec()" [loading]="ui.isStreaming()" />
    <button (click)="ask('show me revenue for the quarter')">Ask</button>
  `,
})
export class AgentPage {
  readonly agent = new HttpAgent({ url: '/api/agent' });
  readonly ui = injectAgentUI({ agent: this.agent, catalog, validate: 'warn' });

  ask(text: string) {
    this.agent.addMessage({ id: crypto.randomUUID(), role: 'user', content: text });
    this.agent.runAgent();
  }
}
```

`ui.surfaces()` lists every spec the agent has built, keyed by the activity's
`messageId`, for a run that opens more than one; `ui.spec()` is the latest.
Elements a delta does not touch keep their identity, so the renderer skips
them. Without the hook, `applyAgUiEvent(surfaces, event)` is the same fold as a
pure function.

**In a CopilotKit Angular app**, register the ready-made activity renderer.
It draws the spec with the registry and catalog from `provideJsonRender`:

```ts
import { provideJsonRender } from 'ngx-json-render';
import { jsonRenderActivityRenderer } from 'ngx-json-render/ag-ui';

providers: [
  provideJsonRender({ registry }),
  provideCopilotKit({
    runtimeUrl: '/api/copilotkit',
    renderActivityMessages: [jsonRenderActivityRenderer()],
  }),
];
```

**On the server**, the model's output — prose with ` ```spec ` fenced JSONL,
as `catalog.prompt({ mode: 'inline' })` asks for — splits into text-message
events and activity deltas with `createMixedStreamParser` from
`@json-render/core`, and `EventEncoder` from `@ag-ui/encoder` writes the
server-sent events:

```ts
// server.ts — an AG-UI endpoint (Express)
import { EventType, type BaseEvent, type RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { createMixedStreamParser } from '@json-render/core';

app.post('/api/agent', async (req, res) => {
  const { threadId, runId, messages } = req.body as RunAgentInput;
  const encoder = new EventEncoder({ accept: req.headers.accept });
  const send = (event: BaseEvent) => res.write(encoder.encode(event));
  res.setHeader('Content-Type', encoder.getContentType());

  const textId = crypto.randomUUID();
  const uiId = crypto.randomUUID();
  send({ type: EventType.RUN_STARTED, threadId, runId } as BaseEvent);
  send({ type: EventType.TEXT_MESSAGE_START, messageId: textId, role: 'assistant' } as BaseEvent);
  send({ type: EventType.ACTIVITY_SNAPSHOT, messageId: uiId, activityType: 'json-render-spec',
         content: { root: '', elements: {} } } as BaseEvent);

  const parser = createMixedStreamParser({
    onText: (line) => send({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: textId,
                             delta: line + '\n' } as BaseEvent),
    onPatch: (patch) => send({ type: EventType.ACTIVITY_DELTA, messageId: uiId,
                               activityType: 'json-render-spec', patch: [patch] } as BaseEvent),
  });
  const result = streamText({
    model: anthropic('claude-sonnet-5'),
    system: catalog.prompt({ mode: 'inline' }),
    messages: toModelMessages(messages), // AG-UI user/assistant messages → your model's format
  });
  for await (const chunk of result.textStream) parser.push(chunk);
  parser.flush();

  send({ type: EventType.TEXT_MESSAGE_END, messageId: textId } as BaseEvent);
  send({ type: EventType.RUN_FINISHED, threadId, runId } as BaseEvent);
  res.end();
});
```

`projects/ngx-json-render/ag-ui/src/ag-ui.spec.ts` runs a real `HttpAgent`
against a replayed server-sent stream, through AG-UI's own decoder and event
checks, and renders the result.

### Supplying the transport

By default the request goes through the global `fetch`. Pass your own to add
auth headers, route through your app's HTTP layer, or replay a recorded
generation in a test — it is called with the endpoint and a request carrying
the JSON body and the abort signal, and must resolve to a `Response` whose
`body` streams the JSONL:

```ts
readonly ui = injectUIStream({
  api: '/api/generate',
  fetch: (url, init) =>
    fetch(url, { ...init, headers: { ...init?.headers, Authorization: token } }),
});
```

`injectChatUI` takes the same option.

### Stopping, clearing and refining

`stop()` ends the generation in flight and keeps what has already rendered —
the user changed their mind, so it is not an error and `error` stays null.
`clear()` stops it too and then resets `spec`, `error`, `usage` and `rawLines`;
without the stop the request still running would put its spec back on its very
next patch. Both are no-ops when nothing is streaming, and `injectChatUI` has
the same pair.

To refine a generated UI instead of starting over, hand `send` the spec to
build on. It is sent to the endpoint as `currentSpec` and the streamed patches
apply on top of it:

```ts
ui.send('make the chart a bar chart', { previousSpec: ui.spec()! });
```

The second argument also carries `context`, forwarded to the endpoint as-is:
`ui.send(prompt, { context: { locale }, previousSpec })`.

Also available:

- `applyPatch(spec, patch)` — immutably apply one RFC 6902 patch to a spec, sharing every subtree the patch did not touch. Both hooks and `buildSpecFromParts` apply through it, so the same stream produces the same spec whichever one you reach for. One deliberate deviation from the RFC: a failing `test` op is a no-op rather than an abort, because these patches come off a model's output and dropping a bad line beats killing the generation.
- `buildSpecFromParts` / `getTextFromParts` / `jsonRenderMessage` — derive specs from AI SDK `message.parts`.
- `catalog.prompt()` / `buildUserPrompt` (from `@json-render/core`) — generate the system/user prompts for your catalog.

### Checking what the model produced

A generation can end malformed — a child that never arrived, a `visible` the
model wrote inside `props` where nothing reads it. Opt into a structural check
with `validate`, on the renderer or on either hook:

```html
<json-render [spec]="ui.spec()" [registry]="registry" [loading]="ui.isStreaming()" validate="warn" />
```

```ts
readonly ui = injectUIStream({ api: '/api/generate', validate: 'strict' });
// ui.issues() — what was wrong with the finished spec
```

- `'off'` (the default) — render whatever arrives, as before.
- `'warn'` — report what is wrong and render anyway.
- `'strict'` — a spec with errors does not render, and a generation that ends
  with one fails instead of completing, so it never reaches the `onComplete`
  where apps persist it.

Both modes first apply the lossless fixes `autoFixSpec` provides: `visible`,
`on` and `repeat` misplaced inside `props` move back onto the element, where
they take effect instead of being ignored. Content is never pruned — the lossy
fixes are left out on purpose, because re-prompting beats a renderer that
silently deletes elements.

The check waits for the spec to settle. While `loading` is true a missing child
is a patch that has not arrived yet, not a defect, so nothing is reported and
`strict` keeps rendering; the hooks check once, when the generation completes.

Pass the catalog too, and the same check covers what structure alone cannot
see — every `type` is one the catalog defines, and each element's props match
its component's schema:

```html
<json-render [spec]="spec()" [registry]="registry" [catalog]="catalog" validate="strict" />
```

A prop written as an expression — `{"$state": …}`, `{"$bindState": …}`,
`{"$template": …}`, a directive — is not checked: it has no value until render
time. The catalog's spec schema also holds every element to the grammar, which
wants a `children` array even on a leaf.

The props check is this package's own. Core's `catalog.validate(spec)` gives an
element's props its component's schema only when the catalog has exactly one
component; with more, it checks element shapes and `type` names but not a
single prop.

### Capping what a spec may cost

`validate` describes a spec. `renderLimits` constrains it:

```html
<json-render
  [spec]="spec()"
  [registry]="registry"
  [renderLimits]="{ maxElements: 500, maxDepth: 16, maxRepeatItems: 200 }"
/>
```

```ts
readonly ui = injectUIStream({
  api: '/api/generate',
  renderLimits: { maxElements: 500, maxDepth: 16 },
});
```

| Limit            | What it caps                    | When it is passed                                               |
| ---------------- | ------------------------------- | --------------------------------------------------------------- |
| `maxElements`    | Elements in the spec            | Nothing renders — there is no useful part of an oversized graph |
| `maxDepth`       | Nesting, counting the root as 1 | Elements below the cap do not render; what fits still does      |
| `maxRepeatItems` | Items one `repeat` expands      | The surplus items do not render                                 |

Every limit is opt-in and unset means unlimited; there are no defaults, so
upgrading changes nothing about what your app renders today.

An element a cap refuses does not act either. `watch` is the one thing an
element does without being on screen, and it stays unwired while the element is
capped — otherwise a spec could keep dispatching actions from behind a limit
that was supposed to have stopped it. The same holds for the element that
closes a cycle.

Two things follow from limits being a control rather than a report. They are
enforced in **every** mode, `validate="off"` included — the app already made
the decision by setting a number. And they apply while `loading`: a partial
spec is a subset of the finished one, so a cap can only ever fire early, never
falsely. Under `strict`, a spec over `maxDepth` is refused outright rather than
truncated, which is how an app says it would rather draw nothing than draw the
first sixteen levels of something hostile.

In the hooks, a limit fails the generation instead of calling `onComplete`, in
any mode — the same reasoning as `strict`: `onComplete` is where apps persist a
spec, and this is one the app has already refused.

One order is deliberate rather than incidental. The cheap caps run before the
structural check, because core's `validateSpec` walks the tree by recursion:
the specs that most need a limit are exactly the ones that would overflow the
stack proving they exceed it. If you accept specs you did not generate, set
`maxDepth` — with no cap there is nothing to stop the check from recursing as
deep as the spec asks.

## Inside an MCP App host

An [MCP App](https://modelcontextprotocol.io/docs/extensions/apps) is a tool whose result a host (Claude, ChatGPT, VS Code) renders as an inline view. `ngx-json-render/mcp` is the Angular side of that view: `injectJsonRenderApp()` connects to the host and keeps the spec the model passed to the tool in a signal. It is the counterpart of `useJsonRenderApp` from `@json-render/mcp/app`. It needs two optional peers:

```bash
npm install @modelcontextprotocol/ext-apps @modelcontextprotocol/sdk
```

```ts
import { Component } from '@angular/core';
import { JsonRenderer } from 'ngx-json-render';
import { injectJsonRenderApp } from 'ngx-json-render/mcp';
import { materialRegistry } from 'ngx-json-render-material';

@Component({
  selector: 'app-root',
  imports: [JsonRenderer],
  template: `<json-render [spec]="mcp.spec()" [loading]="mcp.loading()" [registry]="registry" />`,
})
export class App {
  readonly mcp = injectJsonRenderApp({ name: 'my-app', version: '1.0.0' });
  readonly registry = materialRegistry;
}
```

The spec renders while the model is still writing the tool call, from the host's `toolinputpartial` notifications; pass `streamPartialInput: false` to wait for the result. `mcp.sendMessage(text, data)` posts a user message to the chat, so a button can continue the conversation, and `mcp.callServerTool(name, args)` replaces the spec with another tool's result. The connection closes with the injector that created it.

### The server

`ngx-json-render/mcp/server` is the other half: an MCP server with one `render-ui` tool for your catalog, and the view as its `ui://` resource. It needs no Angular, so it runs in plain Node or on an edge function, and it takes the same two optional peers.

```ts
import { readFileSync } from 'node:fs';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createRenderUiServer } from 'ngx-json-render/mcp/server';
import { catalog } from './catalog'; // defineCatalog(schema, …) from ngx-json-render/schema

const server = createRenderUiServer({
  catalog,
  html: readFileSync(new URL('./view.html', import.meta.url), 'utf8'), // the view above, built into one page
  name: 'my-app',
  version: '1.0.0',
});
await server.connect(new StdioServerTransport());
```

Over HTTP, `handleRenderUiRequest(options, request)` takes a web `Request` and returns a `Response`. It serves each request statelessly with a fresh server, as a serverless or edge function needs, and answers CORS for browser-based clients such as MCP Inspector.

What it does on top of upstream's `createMcpApp` from `@json-render/mcp`, whose tool and resource it registers the same way:

- **A description Claude reads whole.** `createMcpApp` describes the tool with `catalog.prompt()`, about 26 000 characters, and Claude cuts a tool description off after roughly 2 000, before the first component. `renderUiDescription(catalog)` stays under that limit (`DESCRIPTION_LIMIT`) and leaves the components to the input schema.
- **An input schema that keeps the spec whole.** `catalog.zodSchema()` has no `state`, `on` or `watch`, so the MCP SDK strips them from the arguments before the tool sees them, and it types no props. `specInputSchema(catalog)` declares them and gives each component its own props, with dynamic values allowed and unknown props rejected, and checks each action's params.
- **Errors the model can fix.** A spec with a missing child or root, or a `$template` that reads a repeat item as `${$item/field}`, goes back as a tool error that says what to write instead (`specProblems`).
- **The structured result ChatGPT asks for:** the spec as `structuredContent`, with an output schema (`specOutputSchema`).

Options: `name`, `version`, `toolName` (default `render-ui`), `title`, `description`, `csp` (the origins the view may load from and connect to; left out, the host allows none) and `widgetDomain` (the view's origin for ChatGPT's plugin directory). If your catalog has a `sendMessage` action, the description tells the model how to use it; the view's handler for it calls `mcp.sendMessage()`.

### Building it

A host loads the view as one HTML document with nowhere to fetch chunks from, so the Angular build has to be folded into a single page. The `ngx-json-render:mcp-app` builder does that, and bundles the server next to it. Give the view its own application project (`ng generate application mcp-view`), then add a target to it in `angular.json`:

```json
"mcp": {
  "builder": "ngx-json-render:mcp-app",
  "options": {
    "buildTarget": "mcp-view:build:production",
    "outputPath": "dist/mcp-app",
    "server": "projects/mcp-view/server.ts"
  }
}
```

`ng run mcp-view:mcp` runs the application build, then writes `dist/mcp-app/view.html` with every script and stylesheet inlined, and the fonts and images the stylesheets use as data URLs, and `dist/mcp-app/server.mjs` with its dependencies bundled in, so `node dist/mcp-app/server.mjs` runs anywhere without `node_modules`. Files the page cannot reach, such as an image referenced only from a template, are listed as a warning: point at them from a stylesheet or from an `https:` origin in `csp`. The server bundle is not type-checked; run `tsc --noEmit` on it first if you want that. Options: `server` (leave it out to build the view only), `tsConfig` for the server, and `externalPackages: true` to keep `node_modules` packages out of `server.mjs`.

[`projects/mcp-app`](https://github.com/shteynu/ngx-json-render/tree/main/projects/mcp-app) is a complete example with the Material catalog: the view, built with this builder, and this server, the one behind `https://ngx-json-render.vercel.app/mcp`.

## Devtools

`ngx-json-render/devtools` is the Angular counterpart of `@json-render/devtools-react` (and its Vue, Svelte and Solid siblings): a floating panel with the spec tree, the live state, every action dispatched, every stream patch with its token usage, and the catalog, plus a picker that finds the element under the pointer. The panel itself is upstream's `@json-render/devtools`, an optional peer. It pins `@json-render/core` exactly, so install the version that matches your core:

```bash
npm install -D @json-render/devtools@0.21
```

```html
<json-render #renderer [spec]="ui.spec()" [registry]="registry" />
<json-render-devtools [renderer]="renderer" [catalog]="catalog" />
```

Angular has no provider above `<json-render>` for the panel to read, so the renderer is passed in by template reference. Streams need no wiring: every `injectUIStream` and `injectChatUI` generation in the app shows up in the Stream tab. Pass `[chat]="chat"` and each assistant reply with a spec becomes a generation you can switch between. `Cmd/Ctrl+Shift+J` toggles the panel (`hotkey`), and `(event)` hands every recorded event to your own logging.

It renders nothing outside dev mode, and loads the panel with a dynamic `import()` that a production build removes, so you can leave the tag in your template.

## Testing

`ngx-json-render/testing` is a separate entry point, so nothing in it can reach
an application bundle by accident.

### Rendering a spec

`renderSpec` mounts a spec against a registry and hands back the few things a
test does to one — no host component, no TestBed module, no settling by hand:

```ts
import { renderSpec } from 'ngx-json-render/testing';

it('dispatches the action its spec asked for', async () => {
  const ui = await renderSpec(
    {
      root: 'save',
      elements: {
        save: {
          type: 'Button',
          props: { label: 'Save' },
          on: { press: { action: 'save' } },
        },
      },
    },
    { registry: { Button: MyButton } },
  );

  expect(ui.text('button')).toBe('Save');
  await ui.click('button');
  expect(ui.dispatched).toEqual([{ name: 'save', params: {} }]);
});
```

`dispatched` records every action the spec fired, handled or not. The rest of
the harness: `text` / `texts` / `find` / `findAll` for the DOM, `click` /
`fill` for input, `read` / `write` / `state` / `changes` for state, `setSpec` /
`setLoading` / `settle` for later frames, and `fixture` / `element` /
`renderer` / `store` / `validation` for everything the harness does not cover.
Options mirror the renderer's inputs, plus `providers` for anything the
components under test inject.

### Mounting one component

`renderComponent` mounts a catalog component with no renderer and no spec. You
give it props and read back what it emitted and what it wrote to bound props.
It tests the component as a presentational one — what it draws, and what it
says when used — and leaves what the spec does with that to `renderSpec`:

```ts
import { renderComponent } from 'ngx-json-render/testing';

it('emits press, and stays quiet once disabled', async () => {
  const button = await renderComponent(MyButton, { props: { label: 'Save' } });

  expect(button.text('button')).toBe('Save');
  await button.click('button');
  expect(button.emitted).toEqual(['press']);

  await button.patchProps({ disabled: true });
  expect(button.find<HTMLButtonElement>('button').disabled).toBe(true);
});
```

`bindings` says which props are two-way bound (`{ checked: '/dark' }`): a
`setBound` on one of them is recorded in `writes` and lands back in the props,
and on any other prop it is the same no-op it is under the renderer. `on` lists
the events the spec would bind, for components that read `ctx.on(event).bound`;
`key`, `type` and `loading` fill in the rest of the context, and `setProps` /
`patchProps` / `setLoading` change it between frames. The DOM helpers are the
same as `renderSpec`'s.

A component that renders `<jr-children>`, registers field validation or
dispatches actions itself needs the renderer's own services, and there is no
honest fake for a subtree — it fails with a message pointing at `renderSpec`.

### Replaying a generation

`recordedTransport` is a `fetch` that answers from a recording, so a test runs
the real client — request body, streamed lines, usage metadata, abort on
supersede — with no server and no API key:

```ts
import { recordedTransport, specStream, usageLine } from 'ngx-json-render/testing';

const ui = injectUIStream({
  api: '/api/generate',
  fetch: recordedTransport([...specStream(expectedSpec), usageLine({ totalTokens: 15 })]),
});
```

`specStream(spec)` writes the JSONL patch lines a model would emit to build
that spec, so a test says what it renders rather than how the wire spells it.
Pass a `Record<prompt, lines>` to answer each prompt differently (anything
else gets a 404 the hook surfaces as an error), or a function for more. The
options are `delayMs` for a visible pace, `fail` for an error response — as a
function, so it can be switched on and off between sends — and `promptOf` for
a request body neither hook sends. The default reads `injectUIStream`'s
`prompt` and `injectChatUI`'s last message.

## Spec features supported

Full parity with the baseline json-render contract:

| Feature               | Example                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| Dynamic props         | `{ "$state": "/user/name" }`                                                                                  |
| Two-way binding       | `{ "$bindState": "/form/email" }`, `{ "$bindItem": "done" }`                                                  |
| Conditionals          | `{ "$cond": {...}, "$then": ..., "$else": ... }`                                                              |
| Templates             | `{ "$template": "Hello, ${/user/name}" }`                                                                     |
| Computed / directives | `{ "$computed": "fmtDate", "args": {...} }`, custom `$`-directives                                            |
| Visibility            | `"visible": { "$state": "/count", "gte": 5 }` (incl. `$and`/`$or`, `$item`, `$index`)                         |
| Events → actions      | `"on": { "press": { "action": "...", "params": {...}, "confirm": {...}, "onSuccess": ..., "onError": ... } }` |
| Built-in actions      | `setState`, `pushState` (with `$id`), `removeState`, `push`/`pop`, `validateForm`, `submitForm`               |
| Repeat                | `"repeat": { "statePath": "/todos", "key": "id" }`, nested via `{ "$item": "..." }`                           |
| Watch                 | `"watch": { "/country": { "action": "loadCities" } }`                                                         |
| Slots                 | `"slots": { "header": ["title-el"] }` + `<jr-children slot="header" />`                                       |
| Validation            | field checks via `ValidationConfig`, `validateForm` / `submitForm`, `injectFieldValidation`                   |
| Confirm dialogs       | built-in `<jr-confirm-dialog>` (auto-rendered)                                                                |
| Devtools hooks        | action observer + `data-jr-key` picker attributes                                                             |

### Ready-made directives

`@json-render/directives` is written against the core, not against any one
renderer, so its `$format`, `$math`, `$concat`, `$count`, `$truncate`,
`$pluralize`, `$join` and `$t` work here as they are:

```ts
import { createI18nDirective, standardDirectives } from '@json-render/directives';

readonly directives = [
  ...standardDirectives,
  createI18nDirective({ locale, messages }),
];
```

```html
<json-render [spec]="spec()" [registry]="registry" [directives]="directives" />
```

```json
{ "content": { "$format": "currency", "value": { "$state": "/price" }, "currency": "USD" } }
```

A directive reads state through the same resolution as any other prop, so a
value it derives updates when that state does.
`projects/ngx-json-render/src/lib/directives.spec.ts` renders every one of
them through the renderer, which is what keeps this paragraph honest.

### Switching language

Where a spec's text comes from decides how it follows a language switch.

**Keys, translated on the client.** A spec that says
`{ "$t": "greeting", "params": { "name": { "$state": "/name" } } }` instead of
the words themselves switches in place. Derive `directives` from your locale
signal, and every prop re-resolves when it changes, with no new spec and
nothing remounted:

```ts
readonly locale = signal('en');
readonly directives = computed(() => [
  ...standardDirectives,
  createI18nDirective({ locale: this.locale(), messages }),
]);
```

`$format` takes a `locale` the same way, for numbers, currency and dates.

**Words, written by the model.** Most generated UIs are this kind: the model
writes "Save" or "Сохранить" straight into the props. Tell it the language
through `context` (`ui.send(prompt, { context: { locale } })`) and say what to
do with it in your server's prompt. Text already on screen stays in the
language it was written in; switching means asking again, and
`previousSpec` keeps the layout while the model rewrites the words.

Text inside your catalog components is your app's own i18n, as it would be
anywhere else. The confirm dialog's two default words are `JR_CONFIRM_LABELS`
(see [Confirmation dialogs](#confirmation-dialogs)).

## State

Each `<json-render>` owns a state store (JSON Pointer addressed). Seeding order: `store` input (controlled) → `state` input → `spec.state`.

Inside catalog components:

```ts
const store = injectStateStore();     // get/set/update/state()
const name = injectStateValue<string>('/user/name');
const bound = injectBoundProp<string>(() => ctx.props().value, () => ctx.bindings()?.['value']);
```

Share one store across renderers (or drive it from your own state management) by passing a core `StateStore` — `createStateStore()`, or `createStoreAdapter()` over Redux/NgRx/etc. — via the `store` input. `createStoreSetState(store)` adapts a whole-state updater to fine-grained path writes.

`watch` also fires for writes made on that store from outside the renderer: on
every store notification the renderer compares the new snapshot with the last
one, branch by branch by reference, and reports each changed path. A store
that mutates its snapshot in place therefore re-renders but triggers no
`watch`; replace objects rather than editing them.

### What a state write re-renders

A write reaches only the components whose resolved props actually changed. Writing `/user/name` re-runs the template of the text that shows it, not the rest of the tree. So `ctx.props()` and `ctx.element()` are the signals to read: a template that reads anything else, such as a mutable object or `Date.now()`, is no longer refreshed by unrelated writes.

"Changed" is decided per prop value:

- Primitives compare by value.
- Objects and arrays compare by reference with the built-in store, which copies every path it writes.
- With an external `store`, objects and arrays always count as changed, because such a store may write into its snapshot in place.

Elements with a `$bindState` or `$bindItem` prop also re-run on every write that touches their bound path — the path itself, a container above it, or a path inside it — even when the value comes back to what it was. Their DOM can hold the user's input before state does, and the note below depends on them getting the chance to put it right. Writes anywhere else reach them like any other element.

Before any of that, a write only makes the elements that can read its path resolve their props at all. The renderer works the paths out from each element's spec — `$state`, `$item`, `$template` placeholders, both branches of a `$cond`, `$computed` arguments, `visible` conditions, and the paths `$bindState` and `$bindItem` write back to — so a write to `/user/name` leaves the todo list alone, and its `$computed` functions don't run. A `$computed` function should therefore depend only on its arguments: one that also reads the clock or a variable outside the spec is no longer called again by unrelated writes.

Some elements keep resolving on every write, because their reads can't be known from the spec: those using a directive (its `resolve` gets the whole state) and any prop with a `$`-key the renderer doesn't recognise.

In dev mode each element that skipped a write resolves anyway, against the whole state, and the console warns once if that gives anything other than what it shows. The warning means a `$computed` function reads more than its arguments, or the renderer missed a read, which is a bug worth reporting. The element itself is left as production would leave it. The check calls the element's `$computed` functions again, so in dev mode they still run on every write.

### What a new spec re-renders

A spec element is compared by content, not by identity. A streamed patch shares every element it did not touch, but a spec can also arrive as all-new objects — a whole-spec part, a host that fetches the spec again, `buildSpecFromParts` replaying a message — and then only the elements whose content changed resolve and re-render. The same goes for `spec.state` in uncontrolled mode: only leaves whose content changed are written to the store, so handing over the same spec again keeps what the user has changed since, including edits inside an array.

### A note on inputs

If a catalog component renders `<input [value]="ctx.props().value">`, remember that one-way bindings do not re-assert the DOM when the bound value returns to its previously applied value while the user typed in between (e.g. `pushState` + `clearStatePath`). Sync imperatively instead — see `InputComponent` in the demo app for the pattern.

## Confirmation dialogs

An action binding with a `confirm` field routes through a dialog before its
handler runs. The packaged one is a real modal — `role="dialog"` with
`aria-modal`, labelled by its title and described by its message, focus moved
onto _Cancel_ on open and returned to the trigger on close, Tab kept inside and
Escape cancelling.

Three levels of control, in the order you are likely to need them:

```ts
// 1. Its two words, when the spec does not supply confirmLabel / cancelLabel.
{ provide: JR_CONFIRM_LABELS, useValue: { confirm: 'Подтвердить', cancel: 'Отмена' } }
```

```css
/* 2. Its colours. Light and dark defaults ship; these override both. */
json-render { --jr-confirm-surface: #101418; --jr-confirm-accent: #4f9cf9; }
```

Also `--jr-confirm-ink`, `--jr-confirm-muted`, `--jr-confirm-border`,
`--jr-confirm-scrim`, `--jr-confirm-danger`, `--jr-confirm-on-accent` and
`--jr-confirm-radius`.

```ts
// 3. The whole dialog. Your component injects the context instead of taking
//    inputs, the same way catalog components do.
@Component({
  template: `<my-modal [title]="ctx.config.title" (ok)="ctx.confirm()" (dismiss)="ctx.cancel()" />`,
})
export class AppConfirm {
  readonly ctx = injectConfirmContext();
}
// providers: [{ provide: JR_CONFIRM_DIALOG, useValue: AppConfirm }]
```

## Submitting a form

`validateForm` validates every bound field at once and writes
`{ valid, errors }` to `/formValidation` (or the `statePath` you pass). What it
cannot do is act on the answer: a model writing a submit button had to emit one
binding for the validation and hope the app's own handler re-checked the form.

`submitForm` is both halves in one binding — validate everything, and dispatch
the submit only if it all passes:

```json
{
  "type": "Button",
  "props": { "label": "Save" },
  "on": {
    "press": {
      "action": "submitForm",
      "params": {
        "action": "saveUser",
        "params": { "email": { "$state": "/email" } }
      },
      "onSuccess": { "navigate": "/thanks" }
    }
  },
  "children": []
}
```

An invalid form stops there, with the errors written to state and every field
marked validated so its message is on screen. A valid one dispatches
`saveUser` as an ordinary action: the same handler lookup, the same `confirm`
(asked after validation — there is no point asking about a form that cannot be
submitted), the same `onSuccess` / `onError`, the same loading state. `params`
resolves `{ "$state": "/path" }` one level down, the way `pushState`'s `value`
does.

## Security

Specs are attacker-shaped input: whatever produced one — a model, a prompt, a
user's text inside that prompt — is not something you control. The renderer is
built so that a hostile spec cannot execute code, but it can still act within
the authority you hand it. What follows is what the renderer guarantees and
what stays your responsibility.

**A spec cannot execute code.** There is no `eval`, no `Function` constructor,
and no `innerHTML`/`bypassSecurityTrust` anywhere in this package or in
`@json-render/core`. Expressions (`$state`, `$item`, `$index`, `$bindState`)
are interpreted against the state model, not evaluated as JavaScript, and all
text reaches the DOM through Angular interpolation. Script injection through a
spec is not a thing you have to defend against.

**A spec can only name actions you registered.** Built-ins (`setState`,
`pushState`, `removeState`, `push`, `pop`, `validateForm`, `submitForm`) are
handled inside the renderer; every other action name is looked up in the
`handlers` you pass. An unrecognised name logs a warning and does nothing.
`submitForm` is no exception to this: the action it is told to submit goes
through the same lookup, so it gates a handler you registered rather than
reaching one you did not.

The exception is `onAction`, which is a deliberate catch-all: when you pass it,
**every** action name in the spec reaches it, including ones you never put in
your catalog. If you use it, switch on the names you expect and ignore the
rest.

**A spec chooses its own state paths.** `setState`, `pushState`, `removeState`
and `onSuccess.set` all take a `statePath` straight from the spec, so a
generated UI can write anywhere in the state model it is rendered against —
and `push`/`pop` write `/currentScreen` and `/navStack`. In controlled mode
this is _your_ store. Give the renderer a store scoped to the generated view
rather than the one holding session, entitlement or billing state.

**A spec chooses the navigation target.** `onSuccess: { navigate }` passes its
string to the `navigate` callback you provide, verbatim. Treat it as untrusted:
match it against known routes, and never hand it to `window.location` or
`router.navigateByUrl` unchecked. `ngx-json-render/router` does the checking
for an app on the Angular `Router`:

```ts
import { injectRouterNavigate } from 'ngx-json-render/router';

provideJsonRender(() => ({
  registry,
  navigate: injectRouterNavigate({ allow: ['/thanks', /^\/orders\/\d+$/] }),
}));
```

It passes a path to `router.navigateByUrl` only when `allow` lets it through
(strings match the path exactly, before any `?` or `#`; a `RegExp` is tested
against it; a function decides). `allow` is required, because only the app
knows which of its routes a generated UI may open. Whatever `allow` says, a
path that does not start with a single `/` is refused: no other origin, no
`javascript:` or other scheme, no relative path, no backslash or control
character. A refused path, or a navigation the router rejects, is reported
with `console.warn` and goes nowhere.

**A spec cannot render forever.** Two elements naming each other as children,
or one naming itself, would recurse until the tab died. The renderer refuses to
draw an element that is rendering itself again _without reading any deeper into
state_, so the cycle is broken where it closes and everything above it still
renders. This holds in every mode, including `validate="off"` and mid-stream:
it is a crash guard, not an opinion about spec quality. Core's `validateSpec`
does not report cycles, so nothing else in the stack catches this for you.

Recursion that goes somewhere is untouched. A tree — a comment thread, a file
browser, a nested menu — is an element repeating over a path relative to the
item it is already inside (`{"$item": "children"}`) and rendering itself for
each one, so every pass reads one level further in and the drawing ends where
the data does. What the guard stops is the pass that reads the same array
again: `repeat` over a fixed `/items` inside itself never runs out, however
much data there is.

**A spec sizes its own render tree, up to the caps you set.** `repeat` iterates
a state array the spec may itself have supplied, and nesting costs a component
per level, so specs are a denial-of-service surface against the browser tab.
`renderLimits` is the cap: `maxElements`, `maxDepth` and `maxRepeatItems`,
enforced in every mode. They are unset by default — a renderer cannot guess
what your catalog considers a reasonable page — so an app taking specs it did
not generate should set all three. See
[Capping what a spec may cost](#capping-what-a-spec-may-cost).

**A spec can name components you never built.** `validate` with a `catalog`
reports every `type` the catalog does not define and every prop its component's
schema rejects; `strict` refuses such a spec outright. A prop bound to an
expression (`$state`, `$bindState`, `$template`, …) is not among them — its value
only exists at render time — so a component should not count on such a prop
having the type its schema declares. Without a catalog the renderer only warns
and draws nothing in that element's place, which degrades well but tells you
nothing until you read the console.

**`confirm` is a UX affordance, not a security control.** It routes an action
through the confirmation dialog before the handler runs, but it is set on the
action binding _inside the spec_ (`on.press.confirm`) — so the same party that
chose the action also chose whether to ask. Real authorization belongs in the
handler, on the server.

## API surface

Components: `JsonRenderer` (`<json-render>`), `JrChildren`, `JrConfirmDialog`, `JrElement`, `JrRepeatScope`.

Injectables/helpers: `injectRenderContext`, `injectElementKey`, `injectRepeatScope`, `injectStateStore`, `injectStateValue`, `injectStateBinding`, `injectBoundProp`, `injectActions`, `injectAction`, `injectValidation`, `injectFieldValidation`, `injectUIStream`, `injectChatUI`, `injectDevtoolsActive`, `injectConfirmContext`, `jsonRenderMessage`, `isActionCancelled`, `checkSpec`.

App-wide defaults: `provideJsonRender`, the `JSON_RENDER_CONFIG` token it fills, and the type `JsonRenderConfig`.

Tokens: `JR_CONFIRM_DIALOG` (replace the confirmation dialog), `JR_CONFIRM_LABELS` (its two words), `CONFIRM_CONTEXT`, `RENDER_CONTEXT`, `REPEAT_SCOPE`.

Spec checking: `checkSpec`, `formatSpecCheckIssues`, and the types
`RenderLimits`, `SpecCheck`, `SpecCheckIssue`, `SpecCheckIssueCode`,
`SpecCheckOptions`, `SpecCatalog`, `SpecValidationMode`.

`injectActions().execute()` rejects when the user dismisses a `confirm`
dialog, which is a normal gesture rather than a failure — `isActionCancelled(error)`
is how you tell the two apart. One dialog is open at a time: an action with a
`confirm` dispatched while another is waiting cancels the waiting one, so its
`execute()` rejects the same way.

Registry & schema: `defineRegistry`, `createStoreSetState`, `schema`, and the catalog types `InferComponentProps`, `InferCatalogComponents`, `InferActionParams` (re-exported from core).

Schema alone (`ngx-json-render/schema`): `schema`, `AngularSchema`, `AngularSpec`, with no Angular behind them, for a server that defines a catalog.

MCP Apps (`ngx-json-render/mcp`): `injectJsonRenderApp`, `parseSpecFromToolResult`, `messageText`, and the types `JsonRenderApp`, `JsonRenderAppOptions`. Needs the optional peers `@modelcontextprotocol/ext-apps` and `@modelcontextprotocol/sdk`.

MCP App server (`ngx-json-render/mcp/server`): `createRenderUiServer`, `handleRenderUiRequest`, `renderUiDescription`, `specInputSchema`, `specOutputSchema`, `specProblems`, `DESCRIPTION_LIMIT`, and the types `RenderUiServerOptions`, `RenderUiDescriptionOptions`. No Angular; the same optional peers.

MCP App builder (`ngx-json-render:mcp-app`): the view's application build as one `view.html`, and the server bundled into `server.mjs`.

Router (`ngx-json-render/router`): `injectRouterNavigate`, and the type `RouterNavigateOptions`. Needs the optional peer `@angular/router`, which an Angular app on the router already has.

AG-UI (`ngx-json-render/ag-ui`): `injectAgentUI`, `applyAgUiEvent`, `surfacesFromMessages`, `isJsonRenderSpec`, `JsonRenderActivity` (`<json-render-activity>`), `jsonRenderActivityRenderer`, `JSON_RENDER_ACTIVITY_TYPE`, and the types `AgUiAgent`, `AgUiEvent`, `AgUiMessage`, `AgUiSubscriber`, `AgUiSurface`, `AgentUIOptions`, `AgentUIReturn`, `JsonRenderActivityRendererConfig`, `JsonRenderActivityRendererOptions`. No peer: any agent and event of the right shape will do.

Devtools (`ngx-json-render/devtools`): `JsonRenderDevtools` (`<json-render-devtools>`), and the types `DevtoolsEvent`, `PanelPosition`. Needs the optional peer `@json-render/devtools`.

Testing (`ngx-json-render/testing`): `renderSpec`, `renderComponent`, `recordedTransport`, `specStream`, `usageLine`.

Everything from `@json-render/core` (types, `createStateStore`, `nestedToFlat`, prompt builders, spec validators, SpecStream compiler) composes with this package; the most common symbols are re-exported.

## Renderer inputs

| Input                 | Type                                 | Purpose                                                 |
| --------------------- | ------------------------------------ | ------------------------------------------------------- |
| `spec`                | `Spec \| null`                       | The UI spec (may be partial while streaming)            |
| `registry`            | `ComponentRegistry`                  | Catalog type → component; required unless provided      |
| `loading`             | `boolean`                            | Suppress missing-element warnings while streaming       |
| `fallback`            | `Type<unknown>`                      | Component for unknown types                             |
| `validate`            | `'off' \| 'warn' \| 'strict'`        | Check the settled spec's structure (default `'off'`)    |
| `renderLimits`        | `RenderLimits`                       | Cap elements, depth and repeat expansion (default none) |
| `catalog`             | `Catalog`                            | Check types and props; hold back half-streamed props    |
| `state`               | `StateModel`                         | Initial state (uncontrolled; defaults to `spec.state`)  |
| `store`               | `StateStore`                         | External store (controlled mode)                        |
| `handlers`            | `Record<string, ActionHandler>`      | Action handlers                                         |
| `onAction`            | `(name, params) => unknown`          | Catch-all action handler                                |
| `navigate`            | `(path) => void`                     | Used by `onSuccess: { navigate }`                       |
| `validationFunctions` | `Record<string, ValidationFunction>` | Custom validation                                       |
| `functions`           | `Record<string, ComputedFunction>`   | `$computed` functions                                   |
| `directives`          | `DirectiveDefinition[]`              | Custom `$`-prefixed expressions                         |

Output: `(stateChange)` — batched `{ path, value }[]` in uncontrolled mode.

Every input but `spec`, `loading`, `state` and `store` can come from `provideJsonRender` instead; see [Defaults for the whole app](#defaults-for-the-whole-app).

## License

Apache-2.0
