# Search discoverability: npm metadata, structured data, Search Console

## Metadata

- Branch: `chore/discoverability` (fast-forwarded into `main`)
- Base branch: `main`
- Base commit: `4330734`
- Current HEAD: `d114902` (`main` and `chore/discoverability`), plus the commit adding this file
- Status: done — code, releases and Search Console steps complete; archived
- Last updated: 2026-10-11
- Last agent/tool: Claude Code (local session, Claude in Chrome)

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

- Search Console, 2026-10-11, in the owner's Chrome (property
  `https://shteynu.github.io/ngx-json-render/` present and verified; no
  settings changed):
  1. Sitemaps: `sitemap.xml` resubmitted ("Файл Sitemap отправлен"). The row
     now reads submitted 11 Oct 2026, type unknown, status "Не получено"
     (couldn't fetch), 0 pages, the same status the 9 Oct submission had. The
     file itself is fine: `curl` gets 200, `application/xml`, both URLs listed.
  2. URL Inspection, home page: already "URL есть в индексе Google". Found via
     the dev.to article (the sitemap source shows "Временная ошибка при
     обработке"), last crawled 9 Oct 2026 12:37 by Googlebot smartphone,
     canonical is the user-declared one. Indexing requested ("Отправлен запрос
     на индексирование") so Google recrawls with the JSON-LD.
  3. URL Inspection, `/mcp/`: "URL нет в индексе Google — URL неизвестен
     Google", no sitemap or referring page known, never crawled. Indexing
     requested ("Отправлен запрос на индексирование").
  4. Rich Results Test on the home page: "Ничего не обнаружено". That is
     expected: `SoftwareSourceCode` is not a Google rich-result type, so the
     tool never lists it. The crawled HTML it shows (fetched 11 Oct 2026
     01:34) contains the `application/ld+json` block. The Schema Markup
     Validator (validator.schema.org) on the same URL detects
     `SoftwareSourceCode` with 0 errors and 0 warnings, all fields read
     (name, description, url, codeRepository, programmingLanguage,
     runtimePlatform, license, keywords, both npm `sameAs`).

## Remaining

None in this task. To watch later: the sitemap's "Не получено" status
(normal for a few days on a new property; if it persists past a week,
re-check from the Sitemaps report), and `/mcp/` showing up under
`site:shteynu.github.io`.

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

- Nothing left blocked. (The cloud session could not fetch
  `shteynu.github.io` or sign in to Search Console; the local session on
  2026-10-11 did both. Results are under Completed.)

## Approval gates

- Search Console actions run under the owner's Google account, in their own
  Chrome.

## Next concrete step

None, the task is archived. Optionally check in about a week whether the
sitemap status has left "Не получено" and whether `/mcp/` is indexed.
