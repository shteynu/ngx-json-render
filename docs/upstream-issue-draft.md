# Draft: issue for vercel-labs/json-render

Text only. Facts verified 2026-08-29.

---

**Title:** Would you accept a first-party Angular renderer? (#244 has been open since March)

---

One question, and a one-line answer is enough: **would you accept a
`packages/angular` in this repo — and if so, on what conditions?**

I'm asking rather than opening a third PR, because the record suggests the
blocker isn't the code:

- **#244** (`feat: add Angular renderer`) has been open since March 2026
  without a maintainer decision.
- **#310** (`feat(angular): add @json-render/angular renderer`) came later and
  was closed by its own author on 2026-08-03.
- There is no `@json-render/angular` on npm today, while 28 other
  `@json-render/*` packages sit at 0.20.0 — including two ready-made catalogs,
  `@json-render/shadcn` and `@json-render/shadcn-svelte`.

A third PR wouldn't change any of that, and I'd rather not spend your review
time or mine on one before knowing the answer isn't simply "no".

**What already exists, if the answer is yes.** I maintain
[`ngx-json-render`](https://www.npmjs.com/package/ngx-json-render), an Angular
renderer built on `@json-render/core` as a peer dependency — the same spec
grammar, expressions, state store, action dispatcher and stream compiler, with
no dialect of my own. It mirrors the baseline renderer contract
(React = Vue = Solid = Svelte), is standalone/signals/zoneless throughout,
supports Angular ≥ 20, and has a test suite. There is also
[`ngx-json-render-material`](https://github.com/shteynu/ngx-json-render/tree/main/projects/ngx-json-render-material),
a 28-component Angular Material catalog — the same idea as
`@json-render/shadcn` and `@json-render/shadcn-svelte`, for the Angular
ecosystem.

It is laid out so `src/lib` adapts into `packages/angular` directly. I'm
offering to do that work and to maintain it release-to-release with core — not
to hand over a package and disappear.

**If the answer is no**, that's a legitimate call; one more framework is real
maintenance cost and you're the ones who'd carry it. In that case, would you
consider listing community renderers in the docs? Angular users currently
arrive at the site, find no Angular option and leave. A link costs you nothing
and saves them the search.

Not asking for a code review here — yes, no, or "yes, if X" all work.
