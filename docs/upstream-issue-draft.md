# Draft: issue for vercel-labs/json-render

Text only. Facts re-verified 2026-08-29 against the GitHub API and the npm
registry:

- **#244** open since 2026-03-24; no maintainer has ever commented on it — the
  thread is the PR author, bots, and my own comment of 2026-08-28.
- **#310** opened 2026-07-21 _as a draft_, never marked ready, closed by its
  own author (`tomzohar`) on 2026-08-03.
- **#331** (docs: link community Angular renderer) opened by me 2026-08-29,
  still open.
- No `@json-render/angular` on npm; 28 other `@json-render/*` packages at
  0.20.0, published 2026-08-16 — the repo is actively releasing.
- No `packages/angular` in the monorepo (32 package directories).

---

**Title:** Would you accept a first-party Angular renderer? (#244 has been open since March)

---

One question, and a one-line answer is enough: **would you accept a
`packages/angular` in this repo — and if so, on what conditions?**

Up front, so it isn't a discovery: I commented on #244 and #310 yesterday, and
I opened #331 to add a docs link. This issue is the actual ask; those were
signposts for people landing on dead threads. I'd rather put the question in
one place you can answer or close.

I'm asking rather than opening a third PR, because the record suggests the
blocker isn't the code:

- **#244** (`feat: add Angular renderer`) has been open since March 2026 with
  no maintainer comment on the thread at all.
- **#310** (`feat(angular): add @json-render/angular renderer`) came later, was
  never taken out of draft, and its author closed it himself on 2026-08-03.
- There is no `@json-render/angular` on npm today, while 28 other
  `@json-render/*` packages ship at 0.20.0 — including two ready-made catalogs,
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
[`ngx-json-render-material`](https://www.npmjs.com/package/ngx-json-render-material),
a 28-component Angular Material catalog — the same idea as
`@json-render/shadcn` and `@json-render/shadcn-svelte`, for the Angular
ecosystem.

It is laid out so `src/lib` adapts into `packages/angular` directly. I'm
offering to do that work and to maintain it release-to-release with core — not
to hand over a package and disappear.

**If the answer is no**, that's a legitimate call; one more framework is real
maintenance cost and you're the ones who'd carry it. In that case #331 is the
whole of my ask — one row in the Packages table, so Angular users who arrive at
the site find an option instead of leaving. Close it if you'd rather not link
community packages at all; I won't push it further either way.

Not asking for a code review here — yes, no, or "yes, if X" all work.
