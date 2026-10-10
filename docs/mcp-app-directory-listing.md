# MCP App directory listing

Copy for the Claude Connectors Directory
([claude.ai/directory/manage](https://claude.ai/directory/manage) → Submit new →
MCP connector) and the ChatGPT app submission. Assets are published with the
demo on GitHub Pages, from `projects/demo/public/mcp/`.

**Status**: submitted to the Claude Connectors Directory on 2026-10-06, in
review. The Claude sections below match the live listing; edit it from
[its manage page](https://claude.ai/directory/manage/ngx-json-render-ui) →
Edit → Open the full editor, and keep this file in step. An edit made during
review changes what the reviewers read. Submitted to the ChatGPT plugin
directory on 2026-10-10 as version 1.0.0, in review. The ChatGPT listing lives
in `projects/mcp-app/chatgpt-plugin/plugin.json`, packed by
`npm run pack:chatgpt-plugin` into `dist/chatgpt-plugin.zip` and uploaded at
platform.openai.com/plugins. Review information is read from the ZIP and is
read-only in the portal, so any change means a new upload.

## Links

| Field           | Value                                                             |
| --------------- | ----------------------------------------------------------------- |
| Server URL      | `https://ngx-json-render.vercel.app/mcp`                          |
| Documentation   | https://shteynu.github.io/ngx-json-render/mcp/                    |
| Privacy policy  | https://shteynu.github.io/ngx-json-render/mcp/privacy.html        |
| Support         | https://github.com/shteynu/ngx-json-render/issues                 |
| Icon (512 px)   | https://shteynu.github.io/ngx-json-render/mcp/icon-512.png        |
| Icon (64 px)    | https://shteynu.github.io/ngx-json-render/mcp/icon-64.png         |
| Screenshots     | `https://shteynu.github.io/ngx-json-render/mcp/screenshots/*.png` |
| Authentication  | None (public, stateless)                                          |
| Reads or writes | Neither: the one tool is read-only and touches no external system |

## Listing

- **Name**: ngx-json-render UI
- **One-liner** (Claude, ≤ 200): Renders interactive dashboards, forms,
  tables and status pages inline in the chat as Angular Material components.
- **Short description** (ChatGPT, ≤ 30): Interactive UI in your chat
- **Categories** (Claude, up to 5): Productivity; Development tools. The
  Claude portal has no Design category.
- **Category** (ChatGPT): Productivity. The manifest takes one category, and
  OpenAI has no Design category.
- **Slug**: `ngx-json-render-ui` (permanent once submitted)
- **Works with** (Claude): Claude (web & mobile), Claude API, Claude Desktop.
  Claude Code was removed on 2026-10-06: the desktop Code tab shows the tool
  result as raw spec JSON, not the interactive view.
- **Author and company** (Claude): ngx-json-render,
  https://github.com/shteynu/ngx-json-render
- **Has an MCP App** (Claude): yes

**Description** (≤ 2,000):

> Ask for a dashboard, a form, a status summary or a comparison, and see it
> as a real interface instead of a wall of text. The assistant describes the
> UI as a json-render spec, and the render-ui tool draws it inline in the chat
> with Angular Material: metric tiles, sortable-looking tables, cards, tabs,
> lists, progress bars, callouts, and forms with inputs, selects, checkboxes
> and validation. Form fields and buttons are live inside the view, so you can
> fill in a form and see validation messages without another round trip.
>
> The tool is read-only. It shows data that is already in the conversation;
> it does not connect to your systems or store anything. A button can put your
> choice or a filled-in form in your message box, and once you send it, the
> assistant continues from what you clicked. No account or sign-in is needed.
>
> Built on json-render, the open generative-UI format from Vercel Labs, and
> ngx-json-render, its open-source Angular renderer (Apache-2.0).

**Permissions summary** (Claude, shown on the listing):

> Accesses nothing on your behalf. The single tool, render-ui, is read-only:
> it draws a UI from data already in the conversation, does not connect to
> your systems, and stores nothing. A button in the UI can put a message in
> your message box, such as an approval or a filled-in form; you review it
> and send it yourself. No account or sign-in.

**Sensitive data types** (Claude): none, left empty on purpose. Each entry is
shown on the listing as data the server accesses.

## Screenshots and prompts

Each PNG is 1200 px wide, cropped to the app's response. In the Claude
listing they are the carousel images, entered as full GitHub Pages URLs, in
this order and paired with these prompts.

| File                          | Prompt                                             |
| ----------------------------- | -------------------------------------------------- |
| `screenshots/1-dashboard.png` | Show me a dashboard of our Q3 sales by region      |
| `screenshots/2-form.png`      | Create a sign-up form for our beta with validation |
| `screenshots/3-status.png`    | Summarize the status of the mobile app release     |
| `screenshots/4-compare.png`   | Compare the three hosting plans side by side       |

## Use cases (Claude portal)

Shown to reviewers only. The portal takes up to three, each with an example
prompt:

| Use case                                                              | Example prompt                                     |
| --------------------------------------------------------------------- | -------------------------------------------------- |
| Turn data from the conversation into a dashboard or a table.          | Show me a dashboard of our Q3 sales by region      |
| Draft a form, with validation, to review how it will look and behave. | Create a sign-up form for our beta with validation |
| Summarize a project or release as a status page.                      | Summarize the status of the mobile app release     |

A fourth, comparing options (plans, vendors, candidates) side by side, did not
fit; screenshot 4 still shows it.

**Prerequisites**:

> None. No account, sign-in or API key is needed: the server has no
> authentication and no user data. Add the connector and send a prompt; the
> assistant calls render-ui and the UI renders inline.

**Read / write**: read only.

## Data handling (Claude portal)

- **API ownership**: we own the API (the server is ours).
- **Personal health data**: no.
- **Sponsored or promoted content**: no.

## Notes for reviewers

No test account is needed: the server has no authentication and no user
data. To test, add the server URL as a custom connector and send a prompt
such as "Show me a dashboard of our Q3 sales by region"; the assistant calls
`render-ui` and the result renders inline. `render-ui` has
`readOnlyHint: true`. The view's CSP allows only `https://fonts.googleapis.com`
and `https://fonts.gstatic.com` (fonts) and no connect domains. The view does
not open external links.

## Integration snippets (Claude portal)

Shown on the listing for Claude API users. Whether the interactive view
renders there has not been checked: the Messages API returns the tool result,
so the caller most likely gets the spec, not the UI.

The Claude Code copy text and external link were cleared on 2026-10-06, with
Claude Code in Works with: a desktop Code-tab session that called
`render-ui` showed the spec as raw JSON and no card.

**Claude API copy text**:

```text
Header: anthropic-beta: mcp-client-2025-11-20

"mcp_servers": [
  { "type": "url", "url": "https://ngx-json-render.vercel.app/mcp", "name": "ngx-json-render-ui" }
],
"tools": [
  { "type": "mcp_toolset", "mcp_server_name": "ngx-json-render-ui" }
]
```

## ChatGPT test cases

The submitted wording is in `plugin.json` (`review.test_cases`). All eight
passed in ChatGPT developer mode on 2026-10-07, CSP enforced. Positive cases
need the plugin picked with `@` in the message box; without it ChatGPT draws
its own chart instead. Negative cases are run without the mention, since with
it ChatGPT calls the tool even for a haiku.

Positive (the app should be used):

1. "Show me a dashboard of our Q3 sales by region" → metric tiles and a
   regional table render.
2. "Create a sign-up form for our beta with validation" → a form renders;
   leaving the email empty and tabbing out shows a validation message.
3. "Summarize the status of the mobile app release" → a status page with a
   callout, progress bars and a list of blockers.
4. "Compare the three hosting plans side by side" → three cards in a grid.
5. "Show these as a table: Alice 34 Berlin, Bob 29 Lisbon, Chen 41 Taipei"
   → a three-row table.

Negative (the app should not be used):

1. "What is the capital of Portugal?" → a plain text answer, no UI.
2. "Write a haiku about autumn" → plain text.
3. "Translate 'good morning' into Spanish" → plain text.

## Before submitting

- [x] The Vercel project is live and `https://ngx-json-render.vercel.app/mcp`
      answers (update this file and the docs page if the URL differs).
- [x] Claude: self-tested and the policy acknowledgements confirmed at
      submission, 2026-10-06.
- [x] Tested in ChatGPT developer mode, 2026-10-07.
- [ ] Tested with MCP Inspector (`npx @modelcontextprotocol/inspector`).
- [x] A verified OpenAI developer identity (individual), 2026-10-10.
- [x] Domain verified, 2026-10-10: the portal's token committed as
      `projects/mcp-app/server/openai-apps-challenge.txt`, deployed, and served
      at `https://ngx-json-render.vercel.app/.well-known/openai-apps-challenge`.
- [x] A demo video URL in `review.demo_recording_url`: the walkthrough at
      `projects/demo/public/mcp/chatgpt-review.mp4`, 2026-10-10.
