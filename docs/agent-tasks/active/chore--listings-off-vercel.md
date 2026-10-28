# Move the outside MCP listings off the Vercel URL

## Metadata

- Branch: `main` (this repo commits straight to main)
- Base commit: `9f9bb24`
- Status: **waiting on outside syncs and reviews**; nothing to change in the repo
- Last updated: 2026-10-28
- Last agent/tool: Claude Code (Opus 5.5)

## Objective

The MCP App moved from `https://ngx-json-render.vercel.app/mcp` (Vercel answers
402) to `https://ngx-json-render.angular-generative-ui-chat.workers.dev/mcp`.
Every outside listing should point at the Worker URL. The move itself is done
and archived in
`docs/agent-tasks/archive/chore--cloudflare-workers-hosting.md`.

## Completed

- Repo, demo /mcp pages, llms.txt, READMEs: Worker URL (`d7130be`).
- CI deploys the Worker on every push to main: secret `CLOUDFLARE_API_TOKEN`
  added 2026-10-28; the job's re-run deployed version `e71235fb`.
- Official MCP Registry: `io.github.shteynu/ngx-json-render-ui` 0.1.1
  (Worker URL) is the latest.
- Claude Connectors Directory: Server URL and Claude API snippet edited during
  review, saved.
- ChatGPT: the old app was deleted; the new app is 1.0.2 on the Worker URL, in
  review (`feat--chatgpt-app-submission.md`).
- The user's own `~/.claude.json` connector now uses the Worker URL.
- dev.to: none of the six published articles has the Vercel URL (API check
  2026-10-28).

## Remaining

Checked 2026-10-28. Recheck each one:

| Where | State on 2026-10-28 | What to do |
| --- | --- | --- |
| Glama connector `glama.ai/mcp/connectors/io.github.shteynu/ngx-json-render-ui` | still the Vercel URL | It syncs from the registry. If it still shows the Vercel URL after a few days, look for a refresh or edit in Glama (needs the user's login). |
| mcpservers.org `servers/shteynu/ngx-json-render` | "Request update" clicked; the URL is not in the static HTML | Open it in a browser and confirm the Worker URL. |
| punkpeye/awesome-remote-mcp-servers PR #3200 | open; labels `endpoint-ok`, `missing-connector`, `invalid-format` (the check reads only added lines, explained in a comment); README on main still has the Vercel URL | Wait for the merge. `missing-connector` may clear once Glama's connector shows the Worker URL. |
| mcprush.com `shteynu/ngx-json-render-ui-mcp` | Vercel URL, listing unclaimed | Claiming costs $4.99 and the user declined it. See whether it picks up the registry change by itself; otherwise leave it. |
| Smithery `smithery.ai/servers/shteynum/ngx-json-render-ui` | page still names Vercel; gateway `ngx-json-render-ui--shteynum.run.tools/mcp` answers 404 | Smithery shuts its proxy and accounts on 2026-10-31. After that, see whether a registry entry survives; no action before. |
| PulseMCP | not found on a site search | It pulls from the official registry; look up `io.github.shteynu/ngx-json-render-ui` there. |
| `docs/devto-article-8.local.md` (unpublished draft) | Vercel URL in the config snippet, line 27 | Switch the URL before publishing. |
| Vercel project | 402; `vercel.json` is a 308 redirect to the Worker, unverified | If Vercel serves again, check the redirect. Deleting the project is the user's click. |

## Approval gates

- Edits in Glama, Smithery and mcprush go through the user's logins.
- No paid claims or upgrades (the user wants everything free).

## Next concrete step

Around 2026-11-04, recheck the table above (curl each page for
`ngx-json-render.vercel.app`; mcpservers.org needs a browser) and close the
rows that show the Worker URL.
