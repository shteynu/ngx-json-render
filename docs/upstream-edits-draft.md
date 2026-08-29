# Draft: corrections to the upstream artifacts already posted

Three things are already public under `shteynu` in `vercel-labs/json-render`,
all from 2026-08-28/29, and each carries at least one claim that is now wrong.
Fix these **before** opening the issue in `upstream-issue-draft.md` — otherwise
the issue contradicts our own words on the same repo.

Facts these texts must match (verified 2026-08-29): Angular floor is **≥ 20**
for both packages (`peerDependencies: @angular/core >=20.0.0`); the Material
catalog registers exactly **28** components; #244 is **open**, not rejected.

---

## 1. PR #331 — the diff itself

The README row added by the PR says `Angular ≥21`. The body is not the only
thing to fix; the line being merged is wrong too.

Branch: `shteynu/json-render` → `docs-community-angular-renderer` (1 commit,
`0db53d2`). Replace the added row with:

```
| [`ngx-json-render`](https://github.com/shteynu/ngx-json-render) | Community Angular renderer built on `@json-render/core` (signals-based, Angular ≥20) |
```

Amend or add a commit on that branch and push; the PR updates itself.

---

## 2. PR #331 — body

Replaces the current body wholesale. Fixes `≥ 21` → `≥ 20`, drops the
"#244 and #310 never landed" phrasing (#244 is open), adds the Material
catalog, and drops the generated-with trailer.

---

Adds one row to the Packages table pointing to
[ngx-json-render](https://github.com/shteynu/ngx-json-render) — a community
Angular renderer built on `@json-render/core` ^0.20.

It implements the baseline renderer contract at parity with the official
renderers (prop expressions incl. `$bindState`/`$cond`/`$template`/custom
directives, visibility, repeat scopes, slots, actions with confirm flows,
watch, validation, SpecStream patch streaming), built on Angular signals —
zoneless-friendly, Angular ≥ 20. There is a companion catalog,
[`ngx-json-render-material`](https://www.npmjs.com/package/ngx-json-render-material),
with 28 Angular Material components, in the spirit of `@json-render/shadcn`.
Live demo: https://shteynu.github.io/ngx-json-render/

Context: #244 has been open since March and #310 was closed by its author, so
this ships as a standalone package for now. Happy to adapt it into
`packages/angular` here if you'd take Angular support upstream — the code is
structured for exactly that.

---

## 3. Comment on #244 (id `5458411712`)

Fixes `Angular ≥21` → `≥ 20`, adds the catalog, and softens "waiting for
maintainer feedback since March" — the point lands without the edge.

---

For anyone landing here looking for Angular support: since this PR is still
open, I've shipped a standalone Angular renderer in the meantime:

- Repo: https://github.com/shteynu/ngx-json-render
- npm: [`ngx-json-render`](https://www.npmjs.com/package/ngx-json-render)

It targets the same renderer contract as the React/Vue/Solid/Svelte packages on
top of `@json-render/core` 0.20 — flat specs, prop expressions (`$state`,
`$cond`, `$template`, two-way bindings), visibility, repeat scopes, slots,
actions with confirm flows, and SpecStream patch streaming — implemented with
Angular signals, zoneless-friendly, Angular ≥ 20. A companion catalog,
[`ngx-json-render-material`](https://www.npmjs.com/package/ngx-json-render-material),
ships 28 Angular Material components so there's no catalog to write first.

@marcushohlbein — not trying to compete with your PR; if the maintainers pick
this up I'd be glad to help land Angular support upstream (or adapt my package
into `packages/angular`) rather than fragment the effort.

---

## 4. Comment on #310 (id `5458437480`)

Same fixes; keeps it shorter, since this thread is closed.

---

For anyone finding this closed PR while looking for Angular support: a
standalone Angular renderer is now available —

- Repo: https://github.com/shteynu/ngx-json-render
- npm: [`ngx-json-render`](https://www.npmjs.com/package/ngx-json-render)

Same renderer contract as the official React/Vue/Solid/Svelte packages on top
of `@json-render/core` 0.20 (flat specs, `$state`/`$cond`/`$template`
expressions, two-way bindings, visibility, repeat scopes, slots, actions with
confirm flows, SpecStream patch streaming), built on Angular signals,
zoneless-friendly, Angular ≥ 20. There's also
[`ngx-json-render-material`](https://www.npmjs.com/package/ngx-json-render-material),
a 28-component Angular Material catalog. Also mentioned in #244.

@tomzohar — if you're still interested in json-render + Angular, feedback and
contributions are very welcome.
