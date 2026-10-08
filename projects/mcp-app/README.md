# MCP App example (prototype)

The Angular Material catalog served as an [MCP App](https://modelcontextprotocol.io/docs/extensions/apps):
a model calls one tool with a json-render spec, and Claude, ChatGPT, VS Code,
Cursor or any other MCP Apps host renders it inline in the chat as real
Angular Material components.

It is built on upstream's [`@json-render/mcp`](https://www.npmjs.com/package/@json-render/mcp),
not beside it. That package ships the server side (the `render-ui` tool and
the `ui://` resource) and a React hook, `useJsonRenderApp`, for the view in
the iframe. This project adds the missing Angular piece:

| Piece                          | React (upstream)               | Angular (here)                                      |
| ------------------------------ | ------------------------------ | --------------------------------------------------- |
| MCP server, tool, `ui://` view | `@json-render/mcp`             | the same, see [`server/app.ts`](server/app.ts)      |
| View: connect to the host      | `useJsonRenderApp()`           | `injectJsonRenderApp()`, signals                    |
| View: render the spec          | `<Renderer>` + shadcn registry | `<json-render>` + `materialRegistry`                |
| Render while the model writes  | no, waits for the tool result  | yes, from `toolinputpartial` (`streamPartialInput`) |
| Host theme                     | not handled                    | follows `theme` from the host context               |
| UI actions reach the model     | no default                     | `sendMessage` action, posted as a chat message      |

## Run it

```bash
npm run build:lib && npm run build:material   # the view renders the built packages
npm run build:mcp-app                         # dist/mcp-app/view.html + server.mjs

node dist/mcp-app/server.mjs                  # stdio
node dist/mcp-app/server.mjs --http           # Streamable HTTP on http://localhost:3001/mcp
```

Claude Desktop or Cursor (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "ngx-json-render": {
      "command": "node",
      "args": ["/absolute/path/to/ngx-json-render/dist/mcp-app/server.mjs"]
    }
  }
}
```

VS Code reads `.vscode/mcp.json`, whose top-level key is `servers`, not
`mcpServers`:

```json
{
  "servers": {
    "ngx-json-render": {
      "command": "node",
      "args": ["/absolute/path/to/ngx-json-render/dist/mcp-app/server.mjs"]
    }
  }
}
```

The server resolves its dependencies from this workspace's `node_modules`, so
run it from a checkout, not a copied `dist/`. Then ask for UI: "show me a
dashboard of my last three releases".

To try it without building, point the host at the hosted endpoint instead,
for example in VS Code
`{ "servers": { "ngx-json-render-ui": { "type": "http", "url": "https://ngx-json-render.vercel.app/mcp" } } }`.
Checked in VS Code 1.141 with GitHub Copilot Chat in Agent mode: the
`render-ui` call renders inline in the chat.

## How it fits together

- `injectJsonRenderApp()` from `ngx-json-render/mcp`. It has the same
  fields as upstream's `UseJsonRenderAppReturn` (`spec`, `loading`,
  `connected`, `connecting`, `error`, `app`, `callServerTool`), as signals,
  and reads a tool result the same way (`parseSpecFromToolResult`).
  Everything specific to this project is an option: `streamPartialInput`,
  `autoResize` and `transport`.
- `src/app/app.ts`: the view, `<json-render>` with the Material registry.
- `scripts/build-mcp-app.mjs`: hosts load a `ui://` resource as one HTML
  document, so the script folds Angular's chunks into one inline module and
  inlines the styles. It then type-checks and bundles the server.
- `server/app.ts`: registers the tool the way `createMcpApp` does, with the
  description and input schema from `server/tool.ts` (below), a read-only
  annotation, and a CSP that allows only Google Fonts instead of any `https:`
  origin. It serves Streamable HTTP statelessly.
- `server/tool.ts`: what the model sees of the tool. A short description, and
  an input schema with each component's props and each action's params,
  which the SDK also enforces. A spec whose children or root are missing is
  sent back to the model as an error.
- `server/catalog.ts`: the catalog the tool describes to the model, the
  Material catalog plus a `sendMessage` action (below). The published catalog
  stays host-neutral; the action needs the view's handler.
- `server/server.ts`: stdio and a local HTTP server. `server/vercel.ts`: the
  hosted endpoint. `npm run build:mcp-app -- --vercel` bundles it, with every
  dependency and the view inlined, into `.vercel/output`, and `vercel.json`
  builds it that way on every push to `main`.

The server imports the Material catalog from
`ngx-json-render-material/catalog`, which holds the catalog without the
components, on top of `ngx-json-render/schema`. Neither loads Angular, so the
server runs in plain Node. Upstream splits its packages the same way, with
`@json-render/shadcn/catalog` and `@json-render/react/schema`. The build
bundles both entry points from `dist/`, so the server runs the same code an
app's server gets from npm.

## Upstream issues in `createMcpApp`

### It drops `state`, `on` and `watch`

`createMcpApp` in `@json-render/mcp` 0.21.0 passes `catalog.zodSchema()` as
the tool's input schema. That schema describes `root` and `elements` (`type`,
`props`, `children`, `visible`, `repeat`) and nothing else. The MCP SDK parses
tool arguments with it, so a spec's top-level `state` and each element's `on`
and `watch` are stripped before the tool handler runs, and `catalog.validate`
strips them again in the handler. The catalog prompt tells the model to
_always_ send `state` for data-backed UI, so tables and lists arrive empty,
and no button does anything. The React schema has the same shape, so this is
not specific to Angular.

`specInputSchema()` in `server/tool.ts` replaces it with a schema built from
the catalog: `state`, `on`, `watch`, `visible` and `repeat` are declared, each
component's props are its own schema (a value may also be a dynamic
expression such as `{ "$state": "/path" }`; an unknown prop is rejected), and
each binding's `action` must be a built-in or a catalog action, with the
catalog action's params checked. Shared parts are JSON Schema definitions, so
the whole schema is about 39 000 characters.

### Claude cuts the description off

`createMcpApp` uses `catalog.prompt()` as the tool description: about 26 000
characters, written as a system prompt for a model that streams JSON Patch.
Claude shows a tool description to the model cut off after roughly 2 000
characters, which that prompt spends on its patch-streaming instructions.
Asked to quote where the description ended, Claude quoted the middle of the
state-streaming example: it had seen no component, prop or action, and
guessed (`"variant": "primary"` on a Button, which the view then could not
draw). `TOOL_DESCRIPTION` in `server/tool.ts` is about 1 600 characters,
covers what a schema cannot say (state, bindings, repeat, events,
`sendMessage`), and leaves the vocabulary to the input schema.

Once upstream fixes both, the server can go back to a plain
`createMcpApp({ name, version, catalog, html })`.

## Actions that reach the model

Built-in actions (`setState`, `submitForm`, …) only change the view. For a
button that should continue the conversation ("Approve", "Show more", a
submitted form), the tool description offers one more action:

```json
{
  "on": {
    "press": {
      "action": "submitForm",
      "params": {
        "action": "sendMessage",
        "params": { "text": "Sign me up", "data": { "$state": "/form" } }
      }
    }
  }
}
```

The view's handler calls `mcp.sendMessage(text, data)`, which posts a
`ui/message` to the host as a user message: the text, then `data` as a JSON
block. Claude does not send it on its own: it puts the message in the message
box, under a warning to review it, and the user sends it. The model then
answers it like anything the user typed, and can call `render-ui` again with
the next screen. The handler rejects, so a binding's `onError` runs, when the
host does not declare the `message` capability or declines the message. Either
way the view says what happened under the UI: "Message passed to the chat."
or the reason it could not send.

`data` has to be a single `{ "$state": "/path" }`: core resolves `$state` only
at the top level of a custom action's params. Through `submitForm` the inner
params are resolved deeply, but the description asks for the single reference
either way so the model has one rule.

## Not done yet

- Only `sendMessage` is wired. `mcp.callServerTool()` (replace the spec with a
  server tool's result) and `app.updateModelContext()` (hand the model context
  without a visible message) are there for an app that needs them.
- Tried in Claude (the message lands in the message box, as above) and in
  ChatGPT, which posts it to the chat at once; there the model did not answer
  the posted message. Whether Claude passes the whole input schema to the model, or
  cuts it off like the description, is checked only by asking it.
- The view is about 1.4 MB uncompressed, because it bundles Angular Material,
  zod and the MCP SDK. That works for an inline resource, but it has not been
  optimized.
