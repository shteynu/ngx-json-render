# Draft: announcement posts

Short-form copy for announcing the renderer and the Material catalog. The long
form is the dev.to article. Text only.

---

## r/Angular

**Title:** Generative UI in Angular without `innerHTML`: the model emits a JSON spec, you render your own components

**Body:**

There are two ways to let an LLM build UI. Ask it for HTML and inject the
string — which gives you no design system, no typed events, and a permanent
XSS surface with the model on the wrong side of it. Or give it a *vocabulary*:
a catalog of components you already ship, with schemas for their props, and let
it describe the UI in constrained JSON that your renderer maps onto real
components. The model never emits markup and cannot name anything outside the
catalog.

Vercel Labs' [json-render](https://github.com/vercel-labs/json-render) is a
good implementation of the second idea. It has official renderers for React,
Vue, Solid and Svelte, and none for Angular — an Angular PR has been open
upstream since March without a decision.

So I built one: [ngx-json-render](https://github.com/shteynu/ngx-json-render).
It's an adapter over the official `@json-render/core` rather than a second
protocol, so the spec is byte-identical to what the React and Vue renderers
consume — a catalog and spec written for Angular port over unchanged. Signals
throughout, standalone, `OnPush`, zoneless-friendly, Angular ≥ 20.

The part I'd actually like feedback on is streaming. A spec arrives as a series
of RFC 6902 patches, so the UI materialises progressively instead of appearing
at the end. A `computed` graph over a flat element map means a patch only
recomputes the elements it touches — the [live demo](https://shteynu.github.io/ngx-json-render/)
has a replayable stream on the Streaming tab.

There's also a ready-made Angular Material catalog (28 components) so you can
render a generated spec without writing a catalog first.

Happy to be told I've got the change-detection story wrong.

---

## X / Bluesky

**1/**
json-render has official renderers for React, Vue, Solid and Svelte.
It doesn't have one for Angular. The upstream PR has been open since March.

So: ngx-json-render. 🧵

**2/**
The idea: don't let a model emit HTML. Give it a catalog of components you
already ship, with Zod schemas for the props. It replies with constrained JSON.
You render your own components.

No `innerHTML`. No `eval`. The model literally can't name anything outside the
catalog.

**3/**
It's an adapter over the official `@json-render/core`, not a second protocol —
so a spec generated for Angular renders unchanged in the React, Vue, Solid and
Svelte renderers. Parity was the whole point.

**4/**
Specs arrive as RFC 6902 patches, so the UI builds up progressively while the
model is still talking. Signals make that cheap: a patch only recomputes the
elements it touched.

[attach docs/streaming.gif]

**5/**
And because "write a catalog first" is a real barrier:
`ngx-json-render-material` — 28 Angular Material components, ready to render
against on day one.

Angular ≥ 20, Apache-2.0.
github.com/shteynu/ngx-json-render

---

## Angular Discord / Slack (#showcase or equivalent)

> Built an Angular renderer for Vercel Labs' json-render — the "LLM emits a
> constrained JSON spec, you render your own components" approach, rather than
> generating markup. It's an adapter over the official `@json-render/core`, so
> specs stay portable across the React/Vue/Solid/Svelte renderers.
> Signals + standalone + zoneless, Angular ≥ 20, and a ready-made Angular
> Material catalog if you don't want to write one first.
> Demo (the Streaming tab is the interesting one):
> https://shteynu.github.io/ngx-json-render/
> Repo: https://github.com/shteynu/ngx-json-render
