# ngx-json-render (workspace)

[![npm](https://img.shields.io/npm/v/ngx-json-render)](https://www.npmjs.com/package/ngx-json-render) [![CI](https://github.com/shteynu/ngx-json-render/actions/workflows/ci.yml/badge.svg)](https://github.com/shteynu/ngx-json-render/actions/workflows/ci.yml) [![license](https://img.shields.io/npm/l/ngx-json-render)](LICENSE)

Angular renderer for [json-render](https://github.com/vercel-labs/json-render): stream AI-generated JSON specs into real Angular components — signals, standalone components, zoneless-friendly.

**→ Package documentation: [`projects/ngx-json-render/README.md`](projects/ngx-json-render/README.md)**

**→ Live demo: <https://shteynu.github.io/ngx-json-render/>** — interactive spec (bindings, repeat, confirm, watch) and a replayable SpecStream showing progressive rendering — or [![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/shteynu/ngx-json-render)

![A SpecStream of RFC 6902 patches rendering progressively into an Angular dashboard](docs/streaming.gif)

## Workspace layout

- [`projects/ngx-json-render`](projects/ngx-json-render) — the library (published as `ngx-json-render`).
- [`projects/demo`](projects/demo) — demo app: an interactive spec (state bindings, repeat, confirm, watch) and a replayable SpecStream showing progressive rendering.

## Develop

```bash
npm ci
npm run build:lib    # build the library into dist/ngx-json-render
npm start            # serve the demo at http://localhost:4200 (uses dist)
npm test             # vitest: library + demo
npm run build        # build library + demo
```

The demo consumes the *built* package via a `tsconfig` path mapping, so run `npm run build:lib` (or `npm run watch:lib`) before/while serving.

## Releasing

Releases are automated in [`release.yml`](.github/workflows/release.yml) via [npm trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC — no tokens, provenance included). To cut a release: bump `version` in [`projects/ngx-json-render/package.json`](projects/ngx-json-render/package.json), commit, then

```bash
git tag v0.x.y && git push origin main v0.x.y
```

The workflow verifies the tag matches the package version, builds, runs the library tests, publishes to npm, and creates the GitHub release. One-time setup on npmjs.com: package **Settings → Trusted publisher → GitHub Actions**, repository `shteynu/ngx-json-render`, workflow `release.yml`.

Manual fallback (requires 2FA OTP):

```bash
npm run build:lib && cp LICENSE dist/ngx-json-render/ && cd dist/ngx-json-render && npm publish
```

The demo is deployed to GitHub Pages by [`ci.yml`](.github/workflows/ci.yml) on every push to `main`.

## Status & upstream

There is no first-party Angular renderer in the json-render monorepo (checked 2026-08-29; community PRs [#244](https://github.com/vercel-labs/json-render/pull/244) and [#310](https://github.com/vercel-labs/json-render/pull/310) were never merged). This library mirrors the baseline renderer contract (React = Vue = Solid = Svelte) and is structured so its `src/lib` can be adapted into a `packages/angular` PR upstream.

## License

Apache-2.0 — matching the upstream json-render project.
