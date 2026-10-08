# Make the MCP App reusable from npm

## Metadata

- Branch: `feat/mcp-entry-points` (local, not pushed)
- Base branch: `main`
- Base commit: `ffce1aa`
- Status: **implemented, verified, uncommitted** (2026-10-08)
- Last updated: 2026-10-08
- Last agent/tool: Claude Code (Opus 5.5)

## Objective

Today the Angular side of the MCP App lives only in the example (`projects/mcp-app`). An app author can't build their own Angular MCP App from npm. Ship the two pieces that make that possible.

## Scope

1. **`ngx-json-render/mcp` secondary entry point.** Move `injectJsonRenderApp()` from `projects/mcp-app/src/app/json-render-app.ts` into it.
   - `@modelcontextprotocol/ext-apps` becomes an optional peer dependency.
   - The main entry point must not import it.
   - The example then imports from the package.
2. **`ngx-json-render-material/catalog` secondary entry point.** It exports the catalog only, with no components. A Node server can then import it without pulling in Angular and the JIT compiler.
   - This mirrors upstream's `@json-render/shadcn/catalog`.
   - `projects/mcp-app/server/catalog.ts` then imports it instead of the source path.
3. **Docs.**
   - A README section for each package.
   - The relevant skills (`ngx-json-render`, and the material skill).
   - Trim "Not done yet" in `projects/mcp-app/README.md` and drop its paragraph about a future catalog entry point.

## Non-goals

- Fixing upstream `createMcpApp`: the description cut-off and the dropped `state`/`on`/`watch`. The server keeps its own `server/tool.ts`.
- Shrinking the ~1.4 MB view bundle.

## Acceptance criteria

- The library builds, and `dist/` contains both new entry points.
- A Node script can `import` from `ngx-json-render-material/catalog` with no Angular in its module graph.
- The existing checks pass:
  - core tests;
  - material tests;
  - `npm run build:mcp-app`, both the default build and the `-- --vercel` build.
- The hosted endpoint still renders in Claude after deploy.

## Approval gates

- Commit, push, tags and npm publish only on the user's outright ask.
- The two packages release in lockstep. Publish from `dist/` with the public registry set explicitly (memory: the Artifactory trap).
- The catalog entry point is also listed as a candidate good first issue (`docs/publishing-tasks.local.md`, section 5). Decide which route before starting it.

## Decisions

- **A third entry point, `ngx-json-render/schema`.** The material catalog imported `schema` from `ngx-json-render`, whose bundle loads Angular, so a catalog-only entry was not enough on its own. `schema.ts` moved to `projects/ngx-json-render/schema/src`; the primary entry re-exports it from `'ngx-json-render/schema'` (ng-packagr builds it first). Mirrors upstream's `@json-render/react/schema`.
- `catalog.ts` moved to `projects/ngx-json-render-material/catalog/src`; the material primary entry and its components import `'ngx-json-render-material/catalog'`.
- `json-render-app.ts` and its spec moved to `projects/ngx-json-render/mcp/src`; the spec runs in the renderer's suite (`include` and `coverageInclude` in `angular.json`, `tsconfig.spec.json`).
- Optional peers on the renderer: `@modelcontextprotocol/ext-apps ^1.7.5` (the version verified) and `@modelcontextprotocol/sdk ^1.29.0` (ext-apps' own peer; the public `.d.ts` names its `Transport`). `ng add` lists peers by name, so it does not install them.
- `build-mcp-app.mjs` aliases both Angular-free entries to their `dist/` FESM bundles, so the server bundles what npm ships.
- Docs now recommend `import { schema } from 'ngx-json-render/schema'` in `catalog.ts` (README quick start, skill), and the `import '@angular/compiler'` workaround is described only for the old import.

## Verification (2026-10-08, uncommitted tree)

- `npm run build` (lib, material, demo): passed. `dist/` has `./schema`, `./mcp`, `./testing` and `./catalog` exports; `defineSchema` only in the schema bundle; the catalog bundle imports only `@json-render/core`, `ngx-json-render/schema`, `zod`.
- `npm test`: passed. Renderer 382 tests (mcp/src 98% statements), demo, mcp-app 58, material 71/71, schematics 8/8; thresholds held.
- `npm run build:mcp-app` and `-- --vercel`: passed; `server.mjs` contains no `@angular`.
- `check:peers`, `check:zoneless`, `check:skills`, `test:scripts`: passed. Prettier clean on tracked and new files (`format:check` fails only on pre-existing gitignored `docs/*.local` folders).
- Acceptance: tarballs from `npm pack` installed with `--legacy-peer-deps` into a scratch dir with no `@angular` at all; `import { materialCatalog } from 'ngx-json-render-material/catalog'` loaded 28 components, `validate` passed, and its schema is the same object as `ngx-json-render/schema`'s.
- Not run: the `angular-compat` job; deploy check in Claude (needs push).

## Next concrete step

Ask the user to commit (and whether to merge into `main`). A release then needs both packages in lockstep: the renderer gains entry points (minor, 0.8.0), so the catalog's peer range moves to `^0.8.0` in the same commit and the catalog gets its own release.
