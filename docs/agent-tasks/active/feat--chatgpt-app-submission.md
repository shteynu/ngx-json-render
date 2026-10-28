# Submit the MCP App to ChatGPT

## Metadata

- Branch: `main` (this repo commits straight to main)
- Committed and pushed: `c5e0e9d` (token for the Worker origin), `256bca6`, `a9afc1f`, `b9c4557` (CI green, deployed), `8653590` (challenge token), `29f3323` (review video), `091e3b0` + `8a643f3` (1.0.1 fix and test cases, deployed), `693afc2` (`ngx-json-render-material` 0.3.17)
- Status: **new app on the Cloudflare URL, 1.0.2 submitted 2026-10-28, in review** (the Vercel-bound app was deleted)
- Last updated: 2026-10-28
- Last agent/tool: Claude Code (Opus 5.5)

## Objective

Publish `https://ngx-json-render.angular-generative-ui-chat.workers.dev/mcp`
(tool `render-ui`; on `https://ngx-json-render.vercel.app/mcp` until
2026-10-28) in the
ChatGPT plugin directory, the same server already in review in the Claude
Connectors Directory (slug `ngx-json-render-ui`, submitted 2026-10-06).

## What OpenAI requires now (docs read 2026-10-07)

OpenAI renamed apps to **plugins**; ChatGPT and Codex share one directory.
Sources: developers.openai.com/plugins/deploy/submission,
/plugins/deploy/submission-errors, /plugins/plugin-guidelines,
/plugins/reference.

- Submission is a **ZIP package** uploaded at platform.openai.com/plugins:
  root `plugin.json` (with `extensions.com.openai.interface`) plus
  `mcp.json`; the portal then connects to and scans the MCP server.
- **Developer identity verification** (individual or business) on
  platform.openai.com; the directory shows that name. User's step.
- **Domain verification**: the token as plain text at
  `https://<MCP host>/.well-known/openai-apps-challenge`, root only. Whether
  `*.vercel.app` passes is unverified; a custom domain is the safe choice.
  The MCP origin cannot change between versions.
- Required URLs: website, support, privacy policy, **terms of service**
  (we have no terms page yet). Privacy must list data categories, purposes,
  recipients, retention and user controls.
- `_meta.ui.domain` is required for a plugin with UI and must be unique.
  We do not set it.
- All three annotations `readOnlyHint`, `destructiveHint`, `openWorldHint`
  explicit on every tool: already true (`server/app.ts`).
- Exactly 5 positive and 3 negative test cases, a **demo video URL**,
  release notes, countries. Screenshots optional, 706 px wide exactly.
- Limits: name ≤ 30, subtitle ≤ 30, description ≤ 4000, ≤ 3 starter
  prompts ≤ 128 each. No "MCP"/"Plugin" in the name.
- Categories: no Design. Planned: Developer Tools + Productivity.

## Test results, 2026-10-07

ChatGPT web, Free plan, user's account. Developer mode and "Enforce CSP in
developer mode" switched on by the user (Settings → Security and login).
Plugin added via chatgpt.com/plugins → + → Add custom MCP server → Create
MCP App: name "ngx-json-render UI", No Auth. The tool shows as READ with an
"Output schema recommended" note.

| Case                                      | Result                                           |
| ----------------------------------------- | ------------------------------------------------ |
| 1 dashboard (with and without CSP)        | pass: tiles, regional table, callout             |
| 2 sign-up form                            | pass: email and password-length messages on blur |
| 3 release status                          | pass: progress bar, callout, checklist           |
| 4 hosting plans                           | pass: three cards                                |
| 5 Alice/Bob/Chen table                    | pass                                             |
| Negatives 1–3, no @ mention               | pass: plain text                                 |
| sendMessage (Approve on an approval card) | posts; see below                                 |

Findings:

- Prompts must select the plugin with `@ngx-json-render UI`. Without it,
  ChatGPT answered a data-bearing dashboard prompt with its own native chart,
  and refused to invent data for a data-less one. With the mention it calls
  the tool even for "Write a haiku" — so negatives run without the mention,
  positives with it, and the test-case text should say so.
- **sendMessage**: a real mouse click posts the text straight into the
  chat (not the composer), the view shows "Message passed to the chat.",
  but ChatGPT did not answer it within 25 s. No `data` JSON was attached
  because the model passed `{"$state":"/release"}`, a string, and the view
  attaches only objects — not a ChatGPT issue. Agent (extension) clicks on Approve did nothing and
  showed no notice, while agent typing into form fields worked.
- Text drops line breaks: a haiku rendered on one line.
- A table card once kept ~50 px of empty space at its bottom.

## Done 2026-10-07 (committed and pushed)

- Domain decision: stay on `ngx-json-render.vercel.app` (user, 2026-10-07).
- `server/app.ts`: the view resource carries
  `_meta["openai/widgetDomain"] = VIEW_DOMAIN` (`https://ngx-json-render.vercel.app`).
  Not `_meta.ui.domain`: its format is per host, and Claude expects
  `{hash}.claudemcpcontent.com` there.
- `scripts/build-mcp-app.mjs --vercel`: if
  `projects/mcp-app/server/openai-apps-challenge.txt` exists, serves it at
  `/.well-known/openai-apps-challenge` as `text/plain`. Checked with a dummy
  token: route and file land in `.vercel/output`, no trailing newline.
- `projects/demo/public/mcp/terms.html` (new); `privacy.html` gains "Your
  choices" and ChatGPT's sendMessage behaviour, effective 7 October; links
  from the docs page, privacy page and landing page. ChatGPT connect steps
  on the docs page rewritten for the Plugins UI.
- `projects/mcp-app/chatgpt-plugin/plugin.json` + `mcp.json`;
  `npm run pack:chatgpt-plugin` checks OpenAI's limits and writes
  `dist/chatgpt-plugin.zip` (icon from `projects/demo/public/mcp/icon-512.png`).
  Category Productivity; `countries: []`; no demo URL yet.
- README "Not done yet" and `docs/mcp-app-directory-listing.md` updated.

Checks run: `npx ng test mcp-app` 31/31; `npm run build:mcp-app -- --vercel`;
stdio `resources/read` shows `openai/widgetDomain`; `npx ng build demo`;
`npm run pack:chatgpt-plugin`; prettier on changed files.

## Former blocker (resolved 2026-10-10)

Organization verification needed a default payment method, which parked the
submission from 2026-10-07 until the user added a card and passed Individual
verification on 2026-10-10. Still open from that list, optional: an MCP
Inspector run.

## Done 2026-10-10 (while parked)

- `render-ui` declares an `outputSchema` (`specOutputSchema` in
  `server/tool.ts`): only the spec's outline, 746 characters, since the
  catalog already makes the input schema about 39 000. A valid call returns
  `structuredContent: { spec }` beside the unchanged text block (the bare
  spec, which the view reads); an error returns no structured content.
- `src/app/server.spec.ts` drives the server through an SDK client over an
  in-memory transport (`tsconfig.spec.json` gains `node` types for it).
- Checked: `npx ng test mcp-app` 20/20 (the new tests fail on the old
  `app.ts`); `tsc -p tsconfig.server.json`; the Vercel build; the built `dist/mcp-app/server.mjs` called over stdio with an
  SDK client lists the schema and returns structured content.

## Approval gates

- Payment method, account verification, domain verification, the demo
  video, Submit and Publish are the user's.
- Security settings in the user's ChatGPT account are switched by the user.
- Ask before changing the Claude listing while it is in review.

## Done 2026-10-10 (unparked)

- User added a card in Billing. OpenAI took a one-off $5 credit purchase;
  auto-reload is off. Then the user passed Individual verification (Persona).
- `dist/chatgpt-plugin.zip` uploaded at platform.openai.com/plugins under
  identity "Individual — <the user's verified name, in Hebrew script>". Draft
  1.0.0, plugin id `plugin_asdk_app_6aca519d14948191a5e3f0d46fa7fd02`. The
  upload dialog creates its file input only after "Upload new or existing
  plugin" is clicked; the agent then filled it with the extension's
  file upload.
- Challenge token committed as
  `projects/mcp-app/server/openai-apps-challenge.txt` (`8653590`, pushed by
  the user). It is live on Vercel as `text/plain`, and **Domain verified**
  passed: `*.vercel.app` is accepted.
- Connect → "Tools scanned successfully"; MCP configuration "Configured";
  `render-ui` found; "No findings in the latest MCP scan".
- Review information: countries ("All supported countries"), the 5 + 3 test
  cases and the release notes are read from the ZIP, read-only in the portal.
  The only blocking finding is "No video walkthrough URL provided". The URL
  must go into `extensions.com.openai.review.demo_recording_url` in
  `plugin.json`, followed by a ZIP re-upload ("Upload new version"); it cannot
  be typed in the portal. Reviewers only see the video; it is not shared.

## Submitted 2026-10-10

- The walkthrough video was recorded by the agent in the user's ChatGPT
  (sidebar collapsed, then cropped so no chats or avatar show). It holds title
  cards plus screenshots of the 5 positive cases (all rendered the view) and
  the 3 negatives (plain text), and was assembled with ffmpeg. Committed as
  `projects/demo/public/mcp/chatgpt-review.mp4` (69 s, 0.5 MB) and served from
  GitHub Pages. `plugin.json` got `review.demo_recording_url`.
- New ZIP uploaded on the plugin page ("Upload plugin to make changes"). Review
  information → Save details cleared "Incomplete review information"; the
  portal then showed no findings.
- Submit for review asks for six attestations (terms and guidelines, laws, no
  money transfers, rights to content, suitable under 18, not aimed at under
  13). The user ticked them and pressed Submit. Status: Review "In review",
  Publication "Not published", version "1.0.0 · In review".

## Rejected, fixed and resubmitted 2026-10-27

- Email: "one or more of your test cases gave an incorrect result"; rerun them
  and match the documented expectations, consistently on web and mobile. The
  only reviewer trace is in the Vercel logs: `openai-mcp (Codex)/1.0.0` made
  five `tools/call render-ui` on 2026-10-22 17:35–17:40 UTC, one per positive
  case. Arguments are not logged.
- Found while rerunning: a form field with two failing checks (required and
  minLength) stacked both messages in Material's one-line subscript, so the
  second ran over the next field. Fixed in `091e3b0`: every catalog
  `mat-form-field` uses `subscriptSizing="dynamic"`, and all failing checks
  are still shown. Live on `/mcp` (Vercel builds the view from source) and on
  npm as `ngx-json-render-material` 0.3.17.
- `8a643f3`: plugin 1.0.1 puts the data in the dashboard, status and
  comparison prompts, and the expectations name only what that data must
  produce. Before, a progress bar or a badge came and went between runs.
- Rerun on ChatGPT web after the deploy and a "Refresh tools" on the plugin:
  cases 1, 3, 4 and 5 passed. Case 2 was checked by the user's own clicks:
  the messages sit under each field, nothing overlaps. Agent clicks do not
  focus fields inside the view, and its typing lands in the ChatGPT composer.
  Not checked: the ChatGPT mobile app.
- Portal: "Create draft from ZIP" made a 1.0.1 draft (metadata: no findings).
  After the rejection the MCP tab had dropped to "Endpoint unavailable /
  Configuration incomplete". MCPs → Reconnect → Connect → Continue (URL, No
  Auth and the domain verification were all kept) brought it back to
  "Configured", with `render-ui` found and a clean scan. Submit for review now
  goes straight to the six attestations, plus an optional "Additional
  Submission Context" box. The user ticked the attestations and submitted.
  The portal shows "Version 1.0.1 · In review".
- The review video still shows the 1.0.0 prompts.

- 2026-10-28, the move to Cloudflare: Vercel Hobby disabled the deployment
  (`402 DEPLOYMENT_DISABLED`), so the server moved to a Cloudflare Worker.
  On the user's word the 1.0.1 review was cancelled, but the 1.0.2 ZIP with
  the new URL was refused: "MCP URL must match the existing app. Changing
  the MCP URL of an existing app is not supported", and the URL field under
  MCPs → Reconnect is read-only. The portal matches a ZIP to an app by
  `plugin.json` `name`, so the user deleted the old app
  (`plugin_asdk_app_6aca519d…`; deleting is permanent and was their click)
  and the same ZIP made a new one, `plugin_asdk_app_6ae1f8904c848191a46984a0470a66c2`.
  The new origin got a new challenge token (`c5e0e9d`, Worker redeployed),
  Verify Domain passed, Connect found `render-ui`, the MCP scan and the
  metadata both came back clean, and the user ticked the attestations and
  submitted: "1.0.2 · In review".

## Next concrete step

Wait for the review result (email to the account owner). If it is a
rejection again, open the MCPs tab first and reconnect if it shows
"Endpoint unavailable", then rerun the cases it names (mobile too). After
approval, the user presses Publish. Then check how the developer name shows
(the verified identity's name is in Hebrew script) and update
`docs/mcp-app-directory-listing.md`.
