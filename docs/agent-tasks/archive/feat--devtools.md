# Angular adapter for json-render devtools

## Metadata

- Branch: feat/devtools
- Base branch: main
- Base commit: 956206e
- Status: done; committed 20e7aac, 3ba7e08, a0e08d0, shipped in
  ngx-json-render 0.8.1
- Last updated: 2026-10-09
- Last agent/tool: Claude Code

## Objective

`ngx-json-render/devtools`: the Angular counterpart of
`@json-render/devtools-{react,vue,svelte,solid}`, so upstream's "React, Vue,
Svelte, Solid" list can gain Angular, which also gives the promotion push a
natural "…now Angular too" post.

## Done

- Secondary entry point `projects/ngx-json-render/devtools`:
  `<json-render-devtools [renderer]="r" [catalog]="catalog" [chat]="chat" />`,
  inputs `spec`, `initialOpen`, `position`, `hotkey`, `bufferSize`,
  `reserveSpace`, `allowDockToggle`, output `event`. Wired into `tsconfig.json`
  paths, `tsconfig.lib/spec.json`, and `angular.json` test `include` and
  `coverageInclude`.
- Stream tab: `ɵregisterStreamObserver` (`src/lib/streaming/observer.ts`),
  called by `injectUIStream` and `injectChatUI` (start, patch, text, usage,
  end with ok). An observer that throws is logged, never fails the stream.
- Optional peer `@json-render/devtools >=0.20.0 <0.22.0` in
  `projects/ngx-json-render/package.json`; workspace devDependency `^0.21.0`.
  `ci.yml` core-compat and `core-canary.yml` install devtools alongside core.
- Production: `isDevMode()` gate, plus an `ngDevMode` guard around the
  `import()`, so a production build drops the call. esbuild still writes the
  orphan chunk to `dist/`, but nothing references it.
- Demo: the Streaming tab mounts `<json-render-devtools>` (dev server only).
- Docs: package README "Devtools" section and API surface line, skill
  section with a compiled snippet and a description mention, AGENTS.md
  entry-point paragraph and devtools in the core-compat and canary steps.

## Decisions

- Renderer passed by template reference: state is per `<json-render>` with no
  provider above it.
- `registerActionObserver` and `markDevtoolsActive` come from the app's core,
  never through devtools, which pins core exactly and may nest a copy.
- `stateStore` wrapper's `subscribe` is a no-op; state writes become
  `state-set` events through `subscribeChanges`, which redraws the State tab.

## Known risks

- `ViewEncapsulation.ShadowDom` catalog components hide nested `data-jr-key`s
  from the picker.
- Every core minor needs a devtools bump and peer widening (in AGENTS.md).

## Verification (2026-10-09, before commit)

- `npm ci`, `npm run build`, `npm test`: library 398/398, demo 70/70,
  scripts 17/17.
- `npx ng test ngx-json-render --coverage`: 96.05/90.88/94.77/97.44, over the
  thresholds.
- `test:material` 78/78, `test:schematics`, `test:scripts`, `check:peers`,
  `check:zoneless`, `check:skills` (9 modules) all pass.
- Core floor: core/directives/devtools 0.20 give library 398/398 and
  Material 78/78; `npm ci` restored.
- `angular-compat` steps in throwaway clones with the diff applied: 19
  build, 20 and 22 build + 398 tests + Material build.
- `consumer-smoke` 19 and 22 pass.
- Browser, dev server: the panel mounts, the Stream tab shows the dashboard
  generation (32 patches, done, tokens), the picker outlines and selects
  `Metric #k-revenue`, no console errors.
- Prettier: branch files clean. Repo-wide `format:check` fails on
  untracked `.local` benches, the user's `.claude/launch.json` and
  `.impeccable` caches, none of them from this branch.

## Next concrete step

None: archived. Follow-ups (an "Angular" entry in upstream's devtools list,
the promotion post) live outside this task.
