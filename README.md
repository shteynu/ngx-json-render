# ngx-json-render (workspace)

[![npm](https://img.shields.io/npm/v/ngx-json-render)](https://www.npmjs.com/package/ngx-json-render) [![CI](https://github.com/shteynu/ngx-json-render/actions/workflows/ci.yml/badge.svg)](https://github.com/shteynu/ngx-json-render/actions/workflows/ci.yml) [![license](https://img.shields.io/npm/l/ngx-json-render)](LICENSE)

Angular renderer for [json-render](https://github.com/vercel-labs/json-render): stream AI-generated JSON specs into real Angular components — signals, standalone components, zoneless-friendly.

**→ Package documentation: [`projects/ngx-json-render/README.md`](projects/ngx-json-render/README.md)**

**→ Live demo: <https://shteynu.github.io/ngx-json-render/>** — interactive spec (bindings, repeat, confirm, watch) and a replayable SpecStream showing progressive rendering — or [![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/shteynu/ngx-json-render)

![A SpecStream of RFC 6902 patches rendering progressively into an Angular dashboard](docs/streaming.gif)

## Workspace layout

- [`projects/ngx-json-render`](projects/ngx-json-render) — the renderer (published as `ngx-json-render`).
- [`projects/ngx-json-render-material`](projects/ngx-json-render-material) — a ready-made Angular Material catalog of 28 components (published as `ngx-json-render-material`), so a spec can be generated and rendered without writing a catalog first.
- [`projects/demo`](projects/demo) — demo app: an interactive spec (state bindings, repeat, confirm, watch) and a replayable SpecStream showing progressive rendering.

## Develop

```bash
npm ci
npm start            # build the library, then serve the demo at http://localhost:4200
npm test             # vitest: renderer + Material catalog + demo
npm run build        # build renderer + Material catalog + demo
```

The demo consumes the _built_ package (`dist/ngx-json-render`) via a `tsconfig` path mapping — `npm start` builds it first; keep `npm run watch:lib` running alongside if you're editing the library itself. This also makes the repo boot unmodified on StackBlitz, which always runs `npm install && npm start`.

## Releasing

Releases are automated via [npm trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC — no tokens, provenance included). The two packages version independently, each on its own tag prefix.

The renderer, in [`release.yml`](.github/workflows/release.yml) — bump `version` in [`projects/ngx-json-render/package.json`](projects/ngx-json-render/package.json), commit, then

```bash
git tag v0.x.y && git push origin main v0.x.y
```

The Material catalog, in [`release-material.yml`](.github/workflows/release-material.yml) — bump `version` in [`projects/ngx-json-render-material/package.json`](projects/ngx-json-render-material/package.json), commit, then

```bash
git tag material-v0.x.y && git push origin main material-v0.x.y
```

Each workflow verifies the tag matches the package version, builds, runs that
project's tests, publishes to npm, and creates the GitHub release.

One-time setup on npmjs.com, **per package** — configuring one does not cover the
other, and a package with no connection gets no credentials at all in Actions and
fails with `ENEEDAUTH`. Under package **Settings → Trusted Publisher → GitHub
Actions**:

| Field                | Value                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Organization or user | `shteynu`                                                                                                                      |
| Repository           | `ngx-json-render`                                                                                                              |
| Workflow filename    | `release.yml` for the renderer, `release-material.yml` for the catalog — filename only, no path                                |
| Environment name     | leave empty — neither workflow declares an `environment:`, and a name here would have to match one                             |
| Allowed actions      | tick `Allow npm publish`; the form will not save without at least one, and `npm stage publish` is not what these workflows run |

Manual fallback (requires 2FA OTP). It publishes without the provenance
attestation the workflows attach, so reach for it only when Actions is
unavailable. Pass `--registry` explicitly: npm reads project config from the
current directory only, so the `registry` line in this repo's `.npmrc` does
**not** apply once you `cd` into `dist/`, and the publish silently targets
whatever your global `~/.npmrc` points at.

```bash
npm run build:lib && cp LICENSE dist/ngx-json-render/ && cd dist/ngx-json-render && npm publish --registry https://registry.npmjs.org/
```

Same for the Material catalog:

```bash
npm run build:material && cp LICENSE dist/ngx-json-render-material/ && cd dist/ngx-json-render-material && npm publish --registry https://registry.npmjs.org/
```

The demo is deployed to GitHub Pages by [`ci.yml`](.github/workflows/ci.yml) on every push to `main`.

## Status & upstream

There is no first-party Angular renderer in the json-render monorepo, and none on npm: 28 other `@json-render/*` packages sit at 0.20.0, but no `@json-render/angular` (checked 2026-08-29). Community PR [#244](https://github.com/vercel-labs/json-render/pull/244) has been open since March 2026 without a maintainer decision; [#310](https://github.com/vercel-labs/json-render/pull/310) came later and was closed by its own author on 2026-08-03. This library mirrors the baseline renderer contract (React = Vue = Solid = Svelte) and is structured so its `src/lib` can be adapted into a `packages/angular` PR upstream.

## License

Apache-2.0 — matching the upstream json-render project.
