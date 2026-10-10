# ngx-json-render plugin

Two skills that teach Claude to build generative UI in Angular with
[ngx-json-render](https://github.com/shteynu/ngx-json-render), the Angular renderer for Vercel's
[json-render](https://github.com/vercel-labs/json-render). A model writes a JSON spec constrained to a
catalog of your components, and `<json-render>` renders it as real Angular components.

- **ngx-json-render**: when you render model-generated specs in an Angular app, Claude defines the
  catalog and its components, builds the registry, renders with `<json-render>`, and streams a spec
  while the model writes with `injectUIStream` or `injectChatUI`. It also covers dynamic props,
  visibility, actions and state, checking what the model produced, serving a spec as an MCP App
  (`ngx-json-render/mcp`), the devtools panel, and testing catalog components with
  `ngx-json-render/testing`.
- **ngx-json-render-material**: when you use the ready 30-component Angular Material catalog,
  Claude renders specs with `materialRegistry`, feeds `materialCatalog.prompt()` to the model, wires
  events and two-way binding, writes form validation into a spec, and overrides or extends a
  component.

The skills follow the library's current API: every TypeScript snippet in them is compiled against
the built packages in this repository's CI.

## Install

In Claude Code:

```bash
claude plugin marketplace add shteynu/ngx-json-render
claude plugin install ngx-json-render@ngx-json-render
```

## What it runs and sends

The plugin has no hooks, MCP servers or background processes. It runs nothing on its own.

- **ngx-json-render** may ask Claude to add `ngx-json-render`, `@json-render/core` and `zod` to your
  project with your package manager, or to run `ng add ngx-json-render` in an Angular CLI workspace.
- **ngx-json-render-material** may ask Claude to run `ng add ngx-json-render-material`, which adds
  the renderer, `@json-render/core`, `zod` and, when the workspace has none, Angular Material, then
  runs Material's own `ng add` (theme, typography, icon font).

The package manager downloads those packages from the registry your project uses. Every command goes
through Claude's normal tool permissions. The plugin collects no data; see [PRIVACY.md](PRIVACY.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
