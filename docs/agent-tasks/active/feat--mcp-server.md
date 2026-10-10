# MCP App server as a library entry point

## Metadata

- Branch: feat/mcp-server (worktree `.claude/worktrees/mcp-server`; the main
  checkout is busy with the AG-UI work in another session)
- Base branch: main
- Base commit: f999a02 (chore: release 0.9.5)
- Current HEAD: f999a02; step 2 (builder) uncommitted in this worktree
- Status: step 1 released as 0.9.5, upstream issue vercel-labs/json-render#393 posted; step 2 (builder) done and verified, uncommitted
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

- Angular builder for the single-file view, `ng generate` schematic.
- Moving the `sendMessage` action definition or its view handler into the
  library (a catalog importing the server entry would pull the MCP server SDK
  into the browser bundle; it needs its own Angular-free home, decided with
  the schematic).

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

## Next concrete step

User decides: commit step 2 and fast-forward `main`, release as a patch
(0.9.6). Then step 3: `sendMessage` in the library and the `mcp-app`
schematic.
