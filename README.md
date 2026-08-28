# ngx-json-render (workspace)

Angular renderer for [json-render](https://github.com/vercel-labs/json-render): stream AI-generated JSON specs into real Angular components — signals, standalone components, zoneless-friendly.

**→ Package documentation: [`projects/ngx-json-render/README.md`](projects/ngx-json-render/README.md)**

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

## Publishing

```bash
npm run build:lib
cd dist/ngx-json-render
npm publish
```

## Status & upstream

There is no first-party Angular renderer in the json-render monorepo (checked 2026-08-29; community PRs [#244](https://github.com/vercel-labs/json-render/pull/244) and [#310](https://github.com/vercel-labs/json-render/pull/310) were never merged). This library mirrors the baseline renderer contract (React = Vue = Solid = Svelte) and is structured so its `src/lib` can be adapted into a `packages/angular` PR upstream.

## License

Apache-2.0 — matching the upstream json-render project.
