# App-wide renderer defaults with provideJsonRender()

## Metadata

- Branch: `main` (this repo commits straight to main)
- Base commit: `2f7d188`
- Status: **released** in ngx-json-render 0.9.1 (2026-10-10); catalog unchanged at 0.3.12
- Last updated: 2026-10-10
- Last agent/tool: Claude Code (Opus 5.5)

## Objective

Add `provideJsonRender({...})` so an app can set renderer defaults once in
its providers, instead of binding them on every `<json-render>`; plus a
router-backed `navigate` that checks spec paths.

## What was built

- `lib/provide.ts`: `JsonRenderConfig`, `JSON_RENDER_CONFIG`,
  `provideJsonRender(config | () => config)` returning `Provider[]`. The
  factory merges with the nearest outer provider (`skipSelf`).
- `lib/renderer.component.ts`: `registry` is no longer `input.required`;
  `validate` defaults to `undefined`. Every option input resolves as
  element ?? provided ?? built-in default. Missing registry throws a named
  error when first read (like a required input).
- `router/` secondary entry point `ngx-json-render/router`:
  `injectRouterNavigate({ allow })`, `RouterNavigateOptions`. Optional peer
  `@angular/router >=19.0.0`. Registered in `angular.json` (coverage +
  test include), `tsconfig.json` paths, `tsconfig.lib.json`,
  `tsconfig.spec.json`.
- Docs: README "Defaults for the whole app" (end of Quick start), chat
  example without `[registry]`, Security navigate paragraph with the router
  helper, inputs table, API surface; skill "App-wide defaults" with a
  compiled `appConfig` block.
- Tests: `lib/provide.spec.ts` (10), `router/src/router-navigate.spec.ts`
  (12).

## Decisions made

- Returns `Provider[]`, not `EnvironmentProviders`, so it also works in
  component `providers` (acceptance asked for component-level nesting).
- Function form runs in an injection context: handlers can `inject()`
  services, and it is how `injectRouterNavigate` gets the `Router`.
- `null`/`undefined` on the element falls through to the provided value.
  So `[fallback]="null"` cannot switch a provided fallback off.
- Merge: `handlers`, `functions`, `validationFunctions`, `directives` merge
  by name, inner/element wins. Everything else, including `registry` and
  `renderLimits`, replaces whole.
- Router helper: `allow` is **required**, and there is no "matches the
  Router config" default. Deviation from the original scope: Angular has
  no public synchronous "does this URL match a route" check, lazy children
  are not loaded, and most apps have a `**` route, so such a default would
  allow everything. Always refused: anything not starting with a single
  `/`, backslashes, control characters. Router rejection is caught and
  warned.
- Name `injectRouterNavigate` (inject-prefixed, needs an injection context).
- Templates lose the compile-time "registry is required" check; it is now
  the runtime error.

## Non-goals

- Per-instance state (`state`, `store`, `spec`, `loading`).
- Syncing `push`/`pop` screens with the URL. Decided 2026-10-09: not until
  someone asks.
- Registry composition helpers; README says to spread.

## Verification

- `npm run build` — pass; dist has `./router`, `@angular/router` only in
  `fesm2022/ngx-json-render-router.mjs`.
- `npm test` — pass: ngx-json-render 438/438 with coverage thresholds,
  demo 73/73, mcp-app 17/17, Material 78/78, schematics.
- `npm run check:skills` — all 10 snippet modules compile.
- `node scripts/consumer-smoke.mjs 19` — pass (build with `skipLibCheck: false`, render, setState, visibility, repeat, pushState).
- After rebasing onto #17 (`dcb8199`): its missing-root warning read the
  now-optional `validate` input and never fired unbound; fixed to read the
  resolved mode (`ba116e0`), with a test shown to fail without the fix.
- First CI on `ba116e0` failed Angular 20/22 compat on test-only issues
  (no zoneless provider in the route-level case; field-based host `spec`
  not re-rendering on 22). Fixed in `ba3ea38`; the `angular-compat` steps
  passed for 20 and 22 in scratchpad clones (442/442 each), then CI was
  green on every job.
- Release run: publish green; post-publish verify red on registry lag
  (300 s). npm served 0.9.1 minutes later; local `check:published`
  resolved 0.9.1 + 0.3.12.

## Next concrete step

None. Archived after the 0.9.1 release.
