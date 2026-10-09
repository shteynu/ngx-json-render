# Demo first screen as a landing page

## Metadata

- Branch: feat/demo-landing
- Base branch: main
- Base commit: 2ef2628
- Current HEAD: 44b9850
- Status: done — committed as 44b9850, merged into main
- Last updated: 2026-10-09
- Last agent/tool: Claude Code

## Objective

Make the first screen of the live demo do what json-render.dev's home page
does: say in one line what the package is, show it working without a click,
and give the install command — so a link posted anywhere lands on the
product, not on a tab bar.

## User-visible outcome

- A hero above the tabs: one-line pitch, the catalog → model → Angular flow,
  `ng add ngx-json-render-material` with a copy button, links to GitHub, npm,
  docs and StackBlitz.
- The demo opens on the Streaming tab and replays the first recording on its
  own (recorded mode only; a live key never spends tokens unasked).
- Each tab has a URL hash (`#playground`, `#interactive`, `#streaming`,
  `#chat`) so a post can link straight to one.

## Context

Part of the promotion push modelled on how json-render's React renderer was
promoted (landing with a live demo got the HN front page; author-posted
GitHub links did not). Sibling items: showcase example, Angular devtools
adapter, skills.sh listing.

## Scope

`projects/demo/src/app/app.{ts,html,css}`, the streaming tab's autoplay, the
demo specs.

## Non-goals

No new library API. No router (hash read/written by hand, GitHub Pages has
no SPA fallback). No change to the og image.

## Acceptance criteria

- Hero renders at 375px without horizontal scroll, light and dark.
- `/#playground` opens the playground; switching tabs updates the hash.
- Default (no hash) opens Streaming and the first recording starts once.
- `npx ng test demo --coverage` and `npx ng build demo` pass.

## Decisions made

- Default tab changes from Playground to Streaming (user approved "open the
  demo straight on the stream", 2026-10-09).

## Completed

- Hero (`app.html`/`app.css`): eyebrow, headline "Your model writes JSON.
  Angular renders it.", lede, 3-step flow, `ng add ngx-json-render-material`
  with Copy, links GitHub / npm / Docs / StackBlitz.
- Tabs are `<a href="#id">`, order Streaming → Playground → Interactive →
  Chat; `select()` writes the hash with `replaceState`, `hashchange` reads it,
  an unknown hash is ignored.
- Default tab Streaming; `StreamTab` got `autoplay` input + `autoplayed`
  output, replays `RECORDINGS[0]` on first visit in recorded mode only.
- Key panel moved below the tab content: above it, it pushed the streamed UI
  below the fold at 1440x900.

## Remaining

- Push `main` (user's), which deploys Pages.

## Changed files

`projects/demo/src/app/app.{ts,html,css,spec.ts}`,
`projects/demo/src/app/streaming/streaming.ts`.

## Verification evidence

### Passed

- `npm run build:lib`, `npm run build:material`, `npx ng test demo --coverage`
  (7 files, 61 tests, thresholds held), `npx ng build demo` — 2026-10-09.
- Prettier on every changed tracked file.
- Browser (dev server): 1440x900 light — streamed report visible above the
  fold; 375x812 dark — no horizontal overflow, tabs on one row, install line
  fits; `/#chat` opens Chat; clicking Playground sets `#playground` without a
  new history entry; no console errors.

### Failed

### Blocked or not run

- `npm run format:check` repo-wide reports 101 files, all local untracked
  caches (`.impeccable/`, `*.local*`) plus the user's own `.claude/launch.json`
  edit — none from this change.
- Copy button not clicked in the browser (clipboard permission); covered by a
  unit test with a stubbed clipboard.

## Approval gates

- Commit, push (push deploys Pages) — user's.

## Next concrete step

None — archived. After the push, check the live demo opens on Streaming.
