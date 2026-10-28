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
- Glama connector `glama.ai/mcp/connectors/io.github.shteynu/ngx-json-render-ui`
  synced from the registry: Worker URL, no Vercel URL (curl, evening of
  2026-10-28).
- `docs/devto-article-8.local.md` (unpublished draft): config snippet
  switched to the Worker URL, 2026-10-28.
- PulseMCP: no listing for ngx-json-render (search, 2026-10-28); new
  submissions there are paused, so nothing points at Vercel.

## Remaining

Checked 2026-10-28. Recheck each one:

| Where | State on 2026-10-28 | What to do |
| --- | --- | --- |
| mcpservers.org `servers/shteynu/ngx-json-render` | Still the Vercel URL in Chrome on the evening of 2026-10-28 (the hosted-server line and the README copy, which is the pre-move README); "Request update" clicked a second time, no visible confirmation | Recheck in a browser. If it still shows Vercel, look for an edit or resubmit path on mcpservers.org. |
| punkpeye/awesome-remote-mcp-servers PR #3200 | open; labels `endpoint-ok`, `missing-connector`, `invalid-format` (the check reads only added lines, explained in a comment); README on main still has the Vercel URL | Wait for the merge. `missing-connector` may clear once Glama's connector shows the Worker URL. |
| mcprush.com `shteynu/ngx-json-render-ui-mcp` | Vercel URL, unclaimed; the page answers 404 since the evening of 2026-10-28 | Claiming costs $4.99 and the user declined it. If it reappears, see whether it took the registry's Worker URL; otherwise leave it. |
| Smithery `smithery.ai/servers/shteynum/ngx-json-render-ui` | page still names Vercel; gateway `ngx-json-render-ui--shteynum.run.tools/mcp` answers 404 | Smithery shuts its proxy and accounts on 2026-10-31. After that, see whether a registry entry survives; no action before. |
| Vercel project | 402; `vercel.json` is a 308 redirect to the Worker, unverified | If Vercel serves again, check the redirect. Deleting the project is the user's click. |

## Approval gates

- Edits in Glama, Smithery and mcprush go through the user's logins.
- No paid claims or upgrades (the user wants everything free).

## Next concrete step

Around 2026-11-04, recheck the table above (curl each page for
`ngx-json-render.vercel.app`; mcpservers.org needs a browser) and close the
rows that show the Worker URL.
