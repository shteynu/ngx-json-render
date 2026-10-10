# Search discoverability: npm metadata, structured data, Search Console

## Metadata

- Branch: `chore/discoverability` (fast-forwarded into `main`)
- Base branch: `main`
- Base commit: `4330734`
- Current HEAD: `d114902` (`main` and `chore/discoverability`), plus the commit adding this file
- Status: code and releases done; Search Console step open, needs a local session
- Last updated: 2026-10-10
- Last agent/tool: Claude Code (cloud session)

## Objective

Make ngx-json-render easier to find for developers searching npm, GitHub and
Google, through legitimate metadata only (no fake stars, no link spam).

## User-visible outcome

Better npm search matches and a homepage link on npm that points to the demo
site; Google sees schema.org data linking the site, the repository and both
npm packages.

## Context

Measured on 2026-10-10 against the npm search API: `json-render angular` put
`ngx-json-render` at #41; `angular generative ui`, `genui angular`,
`angular llm ui` and `angular json renderer` had neither package in the top 50. `ngx json render` had both in the top 2. A web search for
`angular json-render` did not surface the project; the upstream
vercel-labs/json-render README does not mention Angular at all. The main
competitor for "generative UI Angular" is hashbrown.

## Scope

- Keywords and `homepage` in both package manifests.
- `SoftwareSourceCode` JSON-LD in `projects/demo/src/index.html`.
- Patch releases to get the metadata onto npm.
- Sitemap submission and reindex request in Google Search Console.

## Non-goals

- A PR or issue to vercel-labs/json-render: the owner declined it.

## Decisions made

- No `robots.txt` in `projects/demo/public`: on a GitHub Pages project site it
  would be served at `/ngx-json-render/robots.txt`, which crawlers ignore
  (they only read it at the domain root).
- Metadata-only patch releases: `ngx-json-render` 0.9.9 (plugin version
  follows) and `ngx-json-render-material` 0.3.16, renderer first.

## Completed

- `aeb99b4` chore: improve search discoverability (keywords, homepage, JSON-LD).
- `16e7a9a` chore: release 0.9.9; `d114902` chore(material): release 0.3.16.
- `main` fast-forwarded to `d114902`.
- Release workflows run by `workflow_dispatch` on `main` (tag pushes are
  refused with 403 by the cloud session's git proxy); both created their tags
  (`v0.9.9`, `material-v0.3.16`), published, and made GitHub releases.

## Remaining

- Google Search Console for the property
  `https://shteynu.github.io/ngx-json-render/` (ownership is already verified
  through the `google-site-verification` meta tag in `index.html`):
  1. Sitemaps → submit `sitemap.xml`.
  2. URL Inspection → request indexing for
     `https://shteynu.github.io/ngx-json-render/` and
     `https://shteynu.github.io/ngx-json-render/mcp/`.
- Check the live page in https://search.google.com/test/rich-results to confirm
  Google reads the JSON-LD.

## Changed files

- `projects/ngx-json-render/package.json`
- `projects/ngx-json-render-material/package.json`
- `plugins/ngx-json-render/.claude-plugin/plugin.json`
- `projects/demo/src/index.html`

## Verification evidence

### Passed

- Local: `npm test` (all suites green), `npm run check:peers`,
  `npm run check:plugin`, `npm run check:zoneless`, `npm run check:skills`,
  `npx ng build demo`, tracked-file prettier check; the JSON-LD in the built
  `index.html` parses as JSON.
- GitHub: CI on `main` at `d114902` succeeded; Release run 38090842890 and
  Release Material catalog run 38091038117 succeeded (`tag`, `publish`,
  `github-release`).
- npm registry: `latest` is `0.9.9` and `0.3.16`, both with homepage
  `https://shteynu.github.io/ngx-json-render/`.

### Blocked or not run

- The deployed demo page was not fetched: the cloud session's proxy refuses
  `shteynu.github.io`.
- Search Console: needs the owner's Google sign-in, so it cannot run in a
  cloud session.

## Approval gates

- Search Console actions run under the owner's Google account, in their own
  Chrome.

## Next concrete step

In a local Claude session (Claude Desktop with the Claude in Chrome extension
connected, signed in to Google), open Google Search Console for
`https://shteynu.github.io/ngx-json-render/`, submit `sitemap.xml`, and request
indexing for the home page and `/mcp/`; then archive this task file.
