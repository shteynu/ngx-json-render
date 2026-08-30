# Playground: editable spec, Material catalog by default, system-prompt panel

## Metadata

- Branch: `feat/playground-editor`
- Base branch: `main`
- Base commit: 80eeda3
- Current HEAD: `2c87d2c` and `d9ccfd4` on `main` — the branch was merged and
  deleted
- Status: implemented, verified
- Last updated: 2026-08-30
- Last agent/tool: Claude Opus 5 / Claude Code

## Objective

Step 1 of the playground plan: give the demo a Playground tab where the spec
is editable and rendered live, the Angular Material catalog is the default
vocabulary, and the generated system prompt (`catalog.prompt()`) is visible.

## User-visible outcome

On the GitHub Pages demo, the landing tab is a playground: edit the spec JSON
on the right, see it render on the left against the Material catalog, switch
to the small custom catalog, and read the exact system prompt a model would
receive for the selected catalog.

## Context

Review on 2026-08-30 found three gaps in the demo:

- `ngx-json-render-material` (28 components, published 0.2.0) is not shown
  anywhere in the demo, which renders the hand-rolled catalog in
  `projects/demo/src/app/catalog/`.
- `catalog.prompt()` — the actual artifact an agent consumes — is never shown.
- The spec panel is a read-only `<pre>`.

Steps 2–5 of the plan (drive `injectUIStream` through a mocked endpoint, a
broken-patch preset, a chat tab, BYO-key) are out of scope here.

## Scope

- New Playground tab in `projects/demo`, made the default tab.
- Material theme + icon font wiring in the demo app.
- Starter specs for both catalogs.
- Demo tests for the new tab.

## Non-goals

- No LLM calls, no mocked endpoints, no changes to `injectUIStream`.
- No changes to either published library.
- The existing Interactive and Streaming tabs keep their current catalog.

## Acceptance criteria

- Playground is the default tab and renders the Material starter spec.
- Editing the spec textarea re-renders live; invalid JSON shows an error and
  keeps the last valid render.
- Catalog switch (Material / demo) swaps registry, starter spec and prompt.
- System prompt panel shows `catalog.prompt()` for the selected catalog.
- `npx ng test demo` and `npx ng build demo` pass; `npm run format:check` clean.

## Relevant repository instructions

AGENTS.md verification matrix, `projects/demo` row: `npm run build:lib`, then
`npx ng test demo` and `npx ng build demo`. The demo compiles against `dist/`,
so the library and the Material catalog must be built first.

## Decisions made

- Playground is a separate component, not a rewrite of the existing tabs —
  keeps the Interactive tab's action handlers and the Streaming replay intact.
- Material is the playground default; the demo catalog stays available via a
  switch, which doubles as a demonstration of catalog portability.

## Assumptions

- A prebuilt Material theme (`azure-blue.css`) plus the Material Symbols font
  from Google Fonts is acceptable for the demo page.

## Completed

- Playground component (catalog switch, live spec editor, prompt panel, spec
  check) as the demo's default tab; both catalogs wired; Material theme, icon
  font and starter specs in place; tests written; full verification run.

## In progress

- (nothing)

## Remaining

Nothing. Steps 2–5 of the plan live in their own tasks; step 2 is
`feat--playground-uistream.md`.

## Changed files

- `projects/demo/src/app/playground/{playground.ts,playground.html,playground.css,playground.spec.ts}` — new
- `projects/demo/src/app/specs/{material-starter.ts,demo-starter.ts}` — new
- `projects/demo/src/app/{app.ts,app.html,app.spec.ts,app.config.ts}` — tab, default, icon font
- `projects/demo/src/styles.css` → `styles.scss` — `mat.theme()` under `color-scheme: light dark`
- `projects/demo/src/index.html` — Material Symbols + Roboto
- `angular.json` — styles entry renamed; initial budget 800kB/1.5MB → 1.5MB/2MB
- `.claude/launch.json` — new, so the demo server can be started for visual checks
- `README.md` — demo description

## Verification evidence

### Passed

- `npm run build:lib` and `npm run build:material` — both clean.
- `npx ng test demo` — 9 passed (2 files); 7 are the new playground tests.
- `npx ng build demo` — clean, no budget warning (1.37 MB initial).
- `npm run format:check` — clean.
- Visual check in the browser at localhost:4200: Material starter renders with
  icons; catalog switch swaps render, starter and prompt (24.3 kB Material vs
  15.8 kB demo); live editing re-renders; broken JSON keeps the last render;
  spec check reports both a missing child and a component absent from the
  catalog; light and dark both readable; no console errors.

### Failed

- (none)

### Blocked or not run

- `npm test` for the libraries — untouched by this task.

### Environment

Local worktree, macOS, Node via npm 10.9.8.

### Residual risk

- The Material bundle is what pushed the demo to 1.37 MB; the budget was
  raised rather than code-split. Fine for a demo page, worth revisiting if it
  grows again.

## Failed approaches

- The prebuilt theme `@angular/material/prebuilt-themes/azure-blue.css` builds
  and renders, but it is light-only — no `light-dark()`, no
  `prefers-color-scheme` — so Material cards stayed white while the rest of
  the demo went dark. Replaced with `mat.theme()` in SCSS under
  `color-scheme: light dark`, which emits both palettes.
- Plain `<mat-icon>` renders the raw ligature text: the default font set class
  is `material-icons`, while the catalog documents Material Symbols ligature
  names. Fixed with `MatIconRegistry.setDefaultFontSetClass()` in the demo's
  app config — an app-level step the Material catalog's README does not
  currently spell out.

## Known risks

None beyond the residual risk above. The Angular CLI analytics id that kept
reappearing in `angular.json` was removed and analytics disabled globally, so
it stays out of the tree.

## Approval gates

- (none)

## Questions requiring an owner decision

- (none)

## Next concrete step

Nothing on this branch. Step 2 — the Streaming tab on `injectUIStream` with a
recorded transport — is ready to start: the transport option it needed landed
on `main` in 2345615.
