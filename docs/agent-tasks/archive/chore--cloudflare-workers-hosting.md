# Move the hosted MCP endpoint from Vercel to Cloudflare Workers

## Metadata

- Branch: chore/cloudflare-workers-hosting (pushed to origin, no PR)
- Base branch: main
- Base commit: 1d655d4
- Current HEAD: see the branch; stage 1–2 committed there, main untouched
- Status: resumed and deployed 2026-10-28 (Vercel Hobby went
  `402 DEPLOYMENT_DISABLED` again); the Worker serves the endpoint at
  `https://ngx-json-render.angular-generative-ui-chat.workers.dev/mcp`
- Last updated: 2026-10-28
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
- 2026-10-11, later: deferred (owner). The 402 came from idle `GET /mcp`
  streams, not from real traffic (see "Findings after stage 2"), and d0144e6
  on main fixed that; Vercel Hobby should now cover the endpoint. Resume on
  one of the triggers under "When to resume".

## Findings after stage 2 (2026-10-11)

- What burned Vercel Hobby: every Claude Code session with the user-scope
  `ngx-json-render-ui` connector held a `GET /mcp` event stream open; Vercel
  cut it at 30 s and the client reopened it every ~31 s. 4.9K invocations in
  12 h, 36% of them timeouts, 57.65 GB-hrs of Fluid Provisioned Memory in a
  few hours (Hobby includes 360 GB-hrs a month).
- Fix on main, d0144e6: `handleMcpRequest` answers GET with 405, with an
  `Allow` header and the SDK's JSON-RPC error body. Allowed by the spec; SDK
  clients skip the stream. The hour after: 64 invocations, 0% timeouts,
  P75 20 ms.
- On a Worker the idle stream would have cost little (wall-clock time is
  free, CPU time is not), but it still holds a request open; carry the 405
  over anyway.
- Other callers seen in the logs: mcp.market uptime checks, leashkit and
  Golemreach indexers, a `Python aiohttp` script that gets 406 (no `Accept`).

## When to resume

- Vercel Hobby returns `402 DEPLOYMENT_DISABLED` again, or Usage heads past
  half of a Hobby limit.
- The ChatGPT plugin and Anthropic directory reviews are done and the owner
  wants an own domain (the URL change is cheapest then).
- Vercel changes Hobby terms in a way that rules the project out.

## Before resuming

1. Rebase onto main. Expect a conflict in `server/app.ts`: main's d0144e6
   added the GET 405 to `handleMcpRequest`, which this branch moved to
   `server/node.ts` on top of `handleMcpFetch`.
2. Put the 405 in `handleMcpFetch` (so both the Worker and Node get it), drop
   `GET` from `Access-Control-Allow-Methods`, and recheck: GET 405 with
   `Allow`, POST flows unchanged, `resources/read` 337 004 bytes gzipped.
3. Re-run the stage 2 checks; wrangler may have moved on from 4.141.0.

## Assumptions

- Cloudflare's edge compresses `application/json` from a Worker on
  `workers.dev` and custom domains, as `wrangler dev` does. Verify after deploy.

## Completed

- Stage 1: the split above, the Worker, the `--cloudflare` build, wrangler
  config, `.gitignore`/`.dockerignore` entries.
- Stage 2: local `workerd` via `npx wrangler@4.141.0 dev` (launch config
  `mcp-app-worker`; `ext-apps-basic-host-worker` points basic-host at it).

## In progress

2026-10-28, resumed on Vercel's second 402:

- Owner answers: everything free, so no own domain and no Paid plan; the URL
  is the account's workers.dev one (its subdomain is named after the
  angular-generative-ui-chat template, and renaming it would move that demo).
- Rebased onto main c4ac9e8; the GET 405 and the request log line moved into
  `handleMcpFetch`, so the Worker and Node share them; CORS no longer lists
  GET.
- Deployed with `npx wrangler@4.154.0 deploy` from the owner's wrangler login.
  Live: `/` and the challenge token, OPTIONS 204, GET 405, `tools/list`,
  `resources/read` gzipped by the edge (335 kB), `tools/call`, version 0.1.1
  and `openai/widgetDomain` on the new origin.
- CPU per request from `wrangler tail`: 3–29 ms (`tools/list` 20–29,
  `resources/read` 16, `tools/call` 11), every outcome `ok` on Free. If
  error 1102 shows up: cache the `tools/list` reply per isolate.
- URL switched in the repo (stage 4 list); ChatGPT plugin 1.0.2, server.json
  0.1.1. `vercel.json` now only 308-redirects every path to the Worker; not
  verifiable until Vercel serves again.
- No CI deploy yet: server changes need a manual `wrangler deploy`.

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

Owner: push the branch, merge it to main (Pages publishes the new URL on the
`/mcp` pages), then edit the outside listings from stage 4.
