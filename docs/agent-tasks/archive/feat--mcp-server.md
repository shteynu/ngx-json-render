# MCP App server as a library entry point

## Metadata

- Branch: feat/mcp-server (worktree `.claude/worktrees/mcp-server`; the main
  checkout is busy with the AG-UI work in another session)
- Base branch: main
- Base commit: 8b640d8 (chore: release 0.9.6)
- Current HEAD: release 0.9.7 bump on top of abc027d, 5fa73b3, 65d5a1e
- Status: step 1 released as 0.9.5, upstream issue vercel-labs/json-render#393 posted; step 2 (builder) released as 0.9.6; step 3 committed, released as 0.9.7
- Last updated: 2026-10-10
- Last agent/tool: Claude Code

## Objective

Let an app author serve their own json-render catalog as an MCP App from npm.
Today the server half (the `render-ui` tool, its typed input schema, the spec
checks, the `ui://` view resource) lives only in `projects/mcp-app/server`,
hard-wired to the Material catalog. Step one toward "an MCP App from your
catalog in one command" (builder and schematic come later).

## User-visible outcome

- `ngx-json-render/mcp/server`, Angular-free:
  `createRenderUiServer({ catalog, html, ... })` returns an `McpServer` to
  connect to any transport; `handleRenderUiRequest(options, request)` serves
  it statelessly over Streamable HTTP with web `Request`/`Response`;
  `specInputSchema`, `specOutputSchema`, `specProblems`,
  `renderUiDescription` exported for custom servers.
- `projects/mcp-app` uses it, and its deployed tool stays byte-identical
  (description, schema, resource meta).

## Scope

1. Generic code from `projects/mcp-app/server/{tool,app}.ts` into
   `projects/ngx-json-render/mcp/server/src`.
2. Parameterise what was Material- or deployment-specific: tool description
   subject, `sendMessage` paragraph only when the catalog has that action,
   CSP, ChatGPT widget domain, server name/version.
3. Library tests with a small fixture catalog; Material-specific tests stay in
   the example.
4. README section; example rewired.
5. Then: the upstream issue on `createMcpApp` (drops `state`/`on`/`watch`;
   description cut off by Claude).

## Non-goals

- (Step 1 only) builder and schematic: done as steps 2 and 3 below.

## Decisions made

- Node `IncomingMessage`/`ServerResponse` stay out of the library: the
  renderer's tsconfigs carry no node types. The HTTP helper uses the SDK's
  `WebStandardStreamableHTTPServerTransport` (present at the `^1.29.0` peer
  floor, checked on unpkg). The example keeps its own Node handler, so the
  deployed endpoint's transport does not change while it is in directory
  review.
- CSP: passed through when given; omitted means the host's default, which the
  MCP Apps spec defines as no external origins.

## Completed

- `projects/ngx-json-render/mcp/server/src`: `tool.ts` (moved with `git mv`
  from `projects/mcp-app/server/tool.ts`; `TOOL_DESCRIPTION` became
  `renderUiDescription(catalog, { ui })`), `server.ts`
  (`createRenderUiServer`, `handleRenderUiRequest`), `public-api.ts`,
  specs with a fixture catalog (25 tests). Entry wired in `ng-package.json`,
  `tsconfig.json` paths, the renderer's `tsconfig.lib/spec.json`,
  `angular.json` test include and coverage.
- Example: `server/app.ts` is now `createRenderUiServer` plus its own Node
  HTTP handler; `tool.spec.ts` imports from the library;
  `scripts/build-mcp-app.mjs` aliases the new entry to `dist/`.
- Docs: renderer README "The server" subsection and API surface line, root
  README, example README, skill (+ plugin sync), `llms.txt`.
- Upstream issue draft: `docs/upstream-mcp-issue.local.md` in the **main
  checkout** (gitignored). Claims re-checked on `@json-render/mcp` 0.21.0 and
  upstream `main` (no newer release; no existing issue covers it; #195 "MCP App
  just shows json" is a different report).

## Verification evidence

### Passed

- `npm test` (all suites incl. material and schematics), `npx ng build demo`,
  `npm run check:zoneless`, `check:peers`, `check:skills`, `check:plugin`,
  `format:check`, `git diff --check`.
- Library specs 25/25; `mcp/server/src` coverage 99.1 / 86.7 / 100 / 100.
- Deployed tool unchanged: `tools/list`, `resources/list` and the view's
  `_meta` from `dist/mcp-app/server.mjs` dumped before and after the move are
  byte-identical (scratchpad `mcp/before.json`, `after.json`).
- `--vercel` bundle built; its handler answered `tools/list` with `render-ui`.
- Re-run after rebasing onto 4a2d424 (`npm ci` first): `npm test`, demo
  build, `build:mcp-app` + byte-identical dump, `check:skills`,
  `check:plugin`, `check:zoneless`, `check:peers`, and prettier over
  `git ls-files` as CI sees it.
- Packed `ngx-json-render-0.9.3.tgz` in a clean Node project with
  `@modelcontextprotocol/sdk@1.29.0` (peer floor): README stdio snippet and
  `handleRenderUiRequest` both work.

### Blocked or not run

- angular-compat (19/20/22) and consumer-smoke: no Angular code changed and
  no new dependency; the entry is plain TS. Not run.

## Known risks

- Release: new public entry point → renderer minor (0.10.0), catalog peer
  range in lockstep.

## Approval gates

- Commit/merge: user's call. Posting the upstream issue: user's yes on the
  final text, and only after the code is on `main` (the issue links to it).

## Step 2: the `ngx-json-render:mcp-app` builder

- `projects/ngx-json-render/schematics/builders.json`,
  `schematics/mcp-app-builder/{index,inline}.cts`, `schema.json`,
  `inline.test.mjs`; `"builders"` in the package manifest; node types in the
  schematics tsconfig. Runs the application build, inlines every module
  script (esbuild from `@angular/build`), local stylesheet and stylesheet
  `url()` file (data URLs), drops local icon links, warns about files the
  page cannot reach, bundles `server` into a self-contained `server.mjs`
  (`externalPackages` opts out).
- Example: `angular.json` target `mcp-app:mcp` names the builder by path
  (`./dist/ngx-json-render:mcp-app`); `scripts/build-mcp-app.mjs` now
  type-checks, runs it, and keeps only the Vercel packaging.
- Docs: README "Building it" + API surface line, example README, skill,
  AGENTS.md note on where the builder lives.
- Verified: `npm test` (schematics 14/14), demo build, `build:mcp-app
--vercel`; example `view.html` byte-identical to the old script's,
  `tools/list` identical to the 0.9.5 baseline, standalone `server.mjs` runs
  with no `node_modules`; clean `ng new` (Angular 21.2) app with the packed
  tarball: builder by name, hashed files, stylesheet font inlined, server
  from an empty folder over stdio and over HTTP (`handleRenderUiRequest`),
  rendered in ext-apps `basic-host` (card + two styled badges).
- Not done: zod locale trimming (the application build owns the bundle).
  npm 10.9 fails `ng new` installs on jsdom's optional `canvas` peer
  (`edgesOut`); `--legacy-peer-deps` works around it, unrelated to us.

## Step 3: `sendMessage` in the library, `ng generate ngx-json-render:mcp-app`

- Server (`mcp/server/src/actions.ts`): `sendMessageAction` (text as the
  example had it) and `withSendMessage(catalog)` (memoised per catalog);
  `createRenderUiServer({ sendMessage: true })` describes the extended
  catalog. The catalog itself stays host-neutral, so no browser bundle pulls
  the server SDK.
- View (`mcp/src/json-render-app.ts`): `handlers.sendMessage` (validates text,
  drops non-object data, rethrows for `onError`) and the `lastMessage` signal
  (`MessageOutcome`). Example switched to both and to `withSendMessage`; its
  handler test moved into the library spec.
- Schematic `schematics/mcp-app/{index.cts,schema.json,index.test.mjs}`:
  `--name` (default `mcp-app`), `--catalog`/`--registry` as `file#export`
  (together, export checked, warns when the catalog imports Angular), else
  Material when `ngx-json-render-material` is declared (scss theme, fonts,
  icon font set, fonts CSP), else a starter catalog + registry. Runs
  `@schematics/angular:application`, replaces `src/app`, `main.ts`,
  `index.html`, styles; writes `server.ts` (stdio, `--http` on 3001/PORT);
  drops zone.js polyfills and `public/favicon.ico`; raises the initial budget
  to 3 MB/5 MB (Material view is 1.6 MB, error at 1 MB otherwise); adds the
  `mcp` target and missing peers at the manifest's ranges.
- Docs: README "In one command" + "Building it" intro + API surface lines,
  example README, skill (+ plugin sync), AGENTS.md end-to-end recipe.
- Verified: `npm test` (library specs incl. new `actions.spec.ts`, handler and
  server-option tests; schematics), `build:mcp-app` + `--vercel`, example
  `tools/list`/resources/meta byte-identical to the 0.9.6 dump
  (`mcp/after-builder.json` vs `after-step3.json`), `check:skills`,
  `check:plugin`, `check:zoneless`, prettier. End to end in the scratchpad
  Angular 21.2 app with packed tarballs: starter, own catalog and Material
  modes generate and build with no warnings; each `server.mjs` lists
  `render-ui` with `sendMessage` and answers a call; starter and Material
  views render in basic-host, and Approve reaches the handler (basic-host
  declares no `message` capability, so the view shows that error; posting
  itself is covered by the AppBridge spec).

## Next concrete step

After the 0.9.7 release (`check:published`, release notes): archive this
task file; the goal "MCP App from your catalog in one command" is met.
