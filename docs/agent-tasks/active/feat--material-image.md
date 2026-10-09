# Material catalog: Image component (issue #1)

## Metadata

- Branch: feat/material-image
- Base branch: main
- Base commit: 11efc05
- Current HEAD: 11efc05 (nothing committed on the branch yet)
- Status: implemented and verified; uncommitted, awaiting the user's go to commit
- Last updated: 2026-10-09
- Last agent/tool: Claude Code

## Objective

Close https://github.com/shteynu/ngx-json-render/issues/1: an `Image` element
in `ngx-json-render-material`, rendering only absolute `https:` URLs.

## User-visible outcome

A model can put an image in a generated UI (`Image` with `src`, `alt`,
`width`, `height`, `fit`). Any other src renders nothing.

## Scope

- Catalog entry, `JrmImage`, registry, public export, tests.
- Docs: Material README table and notes, the Material skill, and the
  component count (28 → 29) everywhere it is stated.
- MCP App: `Image` left out of `mcpCatalog`.

## Non-goals

- Images in the MCP App (needs a CSP decision, see Questions).
- A loading or error placeholder.

## Decisions made

- `src` is `z.string().startsWith('https://')` rather than the issue's plain
  `z.string()`, so `checkSpec` reports a non-https src. Core's prompt
  formatter drops string checks, so the description states the rule too.
- The component re-checks the resolved src with `new URL()` (protocol must be
  `https:`), because a src bound to `$state` skips the schema.
- `referrerpolicy="no-referrer"`, `loading="lazy"`, `decoding="async"`.
- `fit` defaults to `cover` (the issue left it unset); `max-width: 100%`
  would otherwise stretch an image with both dimensions set.
- `alt: ""` is accepted, for decorative images.
- The demo's `material-starter.ts` "Components: 28" metric is sample data
  and stays.

## Changed files

- `projects/ngx-json-render-material/catalog/src/catalog.ts`
- `projects/ngx-json-render-material/src/lib/content.components.ts`
- `projects/ngx-json-render-material/src/lib/registry.ts`
- `projects/ngx-json-render-material/src/public-api.ts`
- `projects/ngx-json-render-material/src/lib/material.spec.ts`
- `projects/ngx-json-render-material/README.md`
- `projects/mcp-app/server/catalog.ts`, `projects/mcp-app/src/app/tool.spec.ts`
- Counts: `README.md`, `projects/ngx-json-render/README.md`,
  `projects/ngx-json-render/schematics/ng-add/index.cts`,
  `skills/ngx-json-render{,-material}/SKILL.md`,
  `projects/demo/src/app/playground/playground.ts`, `projects/demo/src/index.html`

`.claude/launch.json` carries the user's own uncommitted edits from before
this task; it is not part of this change.

## Verification evidence

### Passed

- `npm run build:lib`, `npm run build:material`, `npm run test:material`:
  78/78, coverage 98.94% statements / 97% branches.
- Mutation check: with the https guard removed, the two refusal tests fail
  (76/78); guard restored.

- Full `npm run build`: exit 0. Full `npm test`: exit 0 — core 382, demo 58,
  mcp-app 15 (incl. the new "offers no Image" test), Material 78/78,
  schematics fail 0. `npm run check:skills`: all 8 snippet modules compile.
- Demo playground (`preview_start demo`, Material catalog): an https Image
  loads (naturalWidth 400) at 240×120, `object-fit: cover`,
  `referrerpolicy=no-referrer`; `javascript:` and `http:` srcs render no
  `<img>`; no console errors.

### Blocked or not run

- The playground's own spec check reports no prop issues for the bad srcs:
  it checks structure and types only, not props. Not changed here.

## Known risks

- The core package's README and `ng add` message now say 29; they reach npm
  only with the next `ngx-json-render` release (release lockstep).

## Questions requiring an owner decision

- MCP App images: keep `Image` out, or widen `VIEW_CSP` `resourceDomains`
  (an allowlist, or any `https:`)?

## Next concrete step

Commit on the user's go (message proposed in chat), then push and open a PR
that closes #1.
