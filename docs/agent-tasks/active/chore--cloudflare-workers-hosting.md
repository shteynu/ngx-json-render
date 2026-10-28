# Move the hosted MCP endpoint from Vercel to Cloudflare Workers

## Metadata

- Branch: chore/cloudflare-workers-hosting (local)
- Base branch: main
- Base commit: 1d655d4
- Current HEAD: see the branch; stage 1–2 committed there, main untouched
- Status: stage 1–2 done locally; waiting on the owner's decisions and a Cloudflare account
- Last updated: 2026-10-11
- Last agent/tool: Claude Code

## Objective

Serve `render-ui` (the `/mcp` endpoint, the landing page and OpenAI's domain
token) from Cloudflare Workers instead of Vercel, without breaking the live
Vercel endpoint while the move is under way.

## User-visible outcome

The same MCP server at a new URL, on a host whose free tier fails a day's
overage instead of pausing the whole deployment (Vercel Hobby went
`402 DEPLOYMENT_DISABLED` on 2026-10-11).

## Context

- Vercel today: `/mcp` is a Node function (`server/vercel.ts`), `/` the
  landing page, `/.well-known/openai-apps-challenge` the ChatGPT domain token;
  built by `scripts/build-mcp-app.mjs --vercel`, configured by `vercel.json`.
- `/mcp` already answers JSON (gzipped on Node) since f2f9d79.

## Scope

Stage 1 code, stage 2 local checks, then (with the owner) deploy, switch the
URL everywhere it is registered, and wind Vercel down.

## Non-goals

Changing the server's behaviour, the view, or the npm packages.

## Acceptance criteria

- `/mcp` on the Worker answers `initialize`, `tools/list`, `resources/read`
  (compressed) and `tools/call` within the plan's CPU limit.
- Landing page and challenge token served, the token as `text/plain`.
- Every place that carries the old URL points at the new one, and the old URL
  keeps working (redirect) until they do.

## Relevant repository instructions

AGENTS.md matrix for `projects/mcp-app`: `npm run build:mcp-app`,
`npx ng test mcp-app --coverage`; prettier over tracked files before handing
over commits.

## Relevant architecture and contracts

- `server/app.ts`: Node-free; `createServerInstance`, `handleMcpFetch`
  (web standard `Request` → `Response`, CORS, stateless, JSON replies).
- `server/node.ts`: `handleMcpRequest` adapts it to `node:http` and gzips JSON.
  Used by `server.ts` (local) and `vercel.ts`.
- `server/worker.ts`: the Worker; `/mcp` only, everything else 404 (static
  assets are served before it runs). No own compression: Cloudflare compresses.
- `scripts/build-mcp-app.mjs --cloudflare` → `.cloudflare/worker.mjs` and
  `.cloudflare/static` (`index.html`, the token, `_headers` for its type).
- `wrangler.jsonc`: `no_bundle`, `nodejs_compat`, assets dir, observability.

## Decisions made

- 2026-10-11: build stage 1–2 alongside Vercel, change nothing live (owner).
- The Node path keeps its own gzip; the Worker relies on Cloudflare's.

## Assumptions

- Cloudflare's edge compresses `application/json` from a Worker on
  `workers.dev` and custom domains, as `wrangler dev` does. Verify after deploy.

## Completed

- Stage 1: the split above, the Worker, the `--cloudflare` build, wrangler
  config, `.gitignore`/`.dockerignore` entries.
- Stage 2: local `workerd` via `npx wrangler@4.141.0 dev` (launch config
  `mcp-app-worker`; `ext-apps-basic-host-worker` points basic-host at it).

## In progress

Nothing; waiting on the owner.

## Remaining

1. Owner decisions (below).
2. Deploy: Cloudflare account (owner), then Workers Builds (Git integration)
   with build command `npm ci && npm run build:lib && npm run build:material
&& npm run build:mcp-app -- --cloudflare` and deploy `npx wrangler deploy`,
   or a GitHub Action with `CLOUDFLARE_API_TOKEN`.
3. Check the deployed Worker: the probes below, compression on the edge, CPU
   time per request in Workers observability (free plan: 10 ms).
4. Switch the URL. Repo: `VIEW_DOMAIN` in `server/app.ts`,
   `projects/mcp-app/server.json` (bump to 0.1.1), `chatgpt-plugin/mcp.json`,
   `projects/mcp-app/README.md`, `projects/demo/public/mcp/{index,privacy,terms}.html`,
   `docs/mcp-app-directory-listing.md`, `feat--chatgpt-app-submission.md`.
   Outside: ChatGPT plugin (new domain token, `widgetDomain`, probably a
   resubmission), Anthropic MCP directory form, official MCP Registry
   (`mcp-publisher publish`; Glama follows it), Smithery
   `shteynum/ngx-json-render-ui`, mcpservers.org, the awesome-remote-mcp-servers
   PR, the owner's claude.ai connector and `~/.claude.json`.
5. Vercel: replace the function with a static `308` from `/mcp` to the new URL
   for a few weeks, then drop `vercel.json`, `server/vercel.ts` and `--vercel`.

## Changed files

`projects/mcp-app/server/{app,node,worker,server,vercel,view.d}.ts`,
`projects/mcp-app/tsconfig.server.json`, `scripts/build-mcp-app.mjs`,
`wrangler.jsonc`, `.gitignore`, `.dockerignore`, this file.

## Verification evidence

### Passed

- `npm run build:mcp-app -- --cloudflare`: tsc clean; `worker.mjs` 2.2 MB,
  525 kB gzipped (limit 3 MB).
- Local Worker (`wrangler dev`): `/` 200 html; challenge 200
  `text/plain`; unknown path 404; OPTIONS 204 with CORS; `resources/read`
  200 JSON, gzip, 337 004 bytes on the wire; SDK client lists `render-ui`,
  reads the view (1 390 998 chars), calls the tool; a broken spec comes back
  as `isError` with the validator's messages.
- basic-host against the Worker: initialize, tools/list, resources/read and
  tools/call all 200, sandbox loaded (pane hidden, so no screenshot).
- Node path after the refactor: Vercel bundle 200 JSON gzip 337 004;
  local `--http` server with the SDK client; GET still opens the stream;
  `ng test mcp-app --coverage` 20/20; prettier clean.

### Failed

None.

### Blocked or not run

- Real CPU time per request (only measurable on a deployed Worker).
- Edge compression on `workers.dev` (local `wrangler dev` compresses; not
  proven for production).

### Environment

macOS, Node 22.23.1, wrangler 4.141.0 via npx (not a dependency).

### Residual risk

- The bundle carries ajv (from the MCP SDK) with a `new Function`; Workers
  forbid it. Nothing called it in any probe; it would only run if the SDK
  validated a JSON schema with ajv. Fix if it shows up: the SDK's
  `@cfworker/json-schema` validator.

## Failed approaches

None.

## Known risks

- Free-plan CPU limit (10 ms): creating the server per request may exceed it.
  Options: keep one server per isolate, or the $5 Workers Paid plan.
- ChatGPT ties the view's sandbox origin to `widgetDomain`; changing it while
  the plugin is in review may restart the review.

## Approval gates

Cloudflare account and deploy credentials, every outside listing change, the
push of these commits: owner.

## Questions requiring an owner decision

1. URL: free `*.workers.dev` or an own domain (~$10/year via Cloudflare
   Registrar; recommended, so the next move keeps the URL).
2. Plan: Workers Free first, Paid ($5/month) if CPU time demands it.
3. Timing: switch now, or after the ChatGPT and Anthropic directory reviews.

## Next concrete step

Owner answers the three questions and creates the Cloudflare account; then
deploy and run the stage 3 checks.
