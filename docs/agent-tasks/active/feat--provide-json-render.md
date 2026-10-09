# App-wide renderer defaults with provideJsonRender()

## Metadata

- Branch: `main` (this repo commits straight to main)
- Base commit: `169578e` (Release ngx-json-render 0.8.2)
- Status: **not started**: recorded 2026-10-09 as a future task
- Last updated: 2026-10-09
- Last agent/tool: Claude Code (Opus 5.5)

## Objective

Add `provideJsonRender({...})` so an app can set renderer defaults once in
its providers, instead of binding them on every `<json-render>`.

## User-visible outcome

In a chat that renders a spec in every message, the template shrinks to
`<json-render [spec]="m.spec" />`. Registry, handlers and the rest come from
DI. An input set on the element still wins over the provided default.

## Context

Both other Angular json-render renderers have this:

- `@threadplane/render` has `provideRender({ registry, store, functions, handlers })`.
- `@ng-json-render/core` has `provideJsonRender`.

They were compared on 2026-10-09.

ngx-json-render has no `provide*` function in its public API. Every option is
an input on `JsonRenderer` (`projects/ngx-json-render/src/lib/renderer.component.ts:93-174`):
`registry` (required), `fallback`, `validate`, `renderLimits`, `catalog`,
`handlers`, `onAction`, `navigate`, `validationFunctions`, `functions`,
`directives`. Confirm-dialog labels and component already go through DI
(`JR_CONFIRM_LABELS`, `JR_CONFIRM_DIALOG`).

## Scope

- Add an `InjectionToken` plus `provideJsonRender(options)` that returns
  `EnvironmentProviders`, covering the options above that make sense
  app-wide.
- `registry` becomes optional on the element when a provider supplies one.
  With neither, give a clear error. Keep the type ergonomic.
- Precedence: element input, then nearest provider, then built-in default.
  Decide whether objects such as `handlers` and `functions` merge or
  replace, and document the choice.
- Update the README quick start and the chat example, the agent skill
  (`skills/ngx-json-render/SKILL.md`, `npm run check:skills`), and the
  `ng add` schematic if it writes a registry binding.

## Non-goals

- Per-instance state (`state`, `store`, `spec`, `loading`). These stay
  inputs.
- Registry composition helpers (`withViews`, `mergeRegistries`). The
  registry is a plain object, so spreading already works; at most add a
  README line.

## Acceptance criteria

- An app with `provideJsonRender({ registry })` renders
  `<json-render [spec]>` with no registry input.
- An element input overrides the provided value, tested for `registry`,
  `handlers` and `fallback`.
- A nested provider (route or component level) overrides the root one.
- Existing apps with no provider behave exactly as before.
- The full project matrix from `AGENTS.md` passes.

## Decisions made

None yet. Open question: merge or replace for `handlers` and `functions`.

## Next concrete step

Read `renderer.component.ts` (inputs, and the wiring into `root` around
line 200) and `root-context.ts`. Then write the token and the precedence
test.
