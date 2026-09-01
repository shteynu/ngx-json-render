# Lifecycle under mutating specs: validation fields and the tab registry

## Metadata

- Branch: `fix/mutating-spec-lifecycle`
- Base branch: `main`
- Base commit: `9f2ea0d`
- Current HEAD: `bfc0f28` on `main` — the branch was merged
- Status: done, verified, merged into `main`
- Last updated: 2026-09-01
- Last agent/tool: Claude Code (Opus 5)

## Objective

Close the two remaining high findings of the 30.08 architecture audit. Both
are the same defect in two places: a registry that only ever accumulates,
never releases, in a library whose headline scenario is a spec that keeps
changing under the renderer.

1. `JsonRenderValidationService._fieldConfigs` grew forever. There was no
   `unregisterField`, and `injectFieldValidation` had no cleanup, so a
   required field from a screen that had been navigated away from (or hidden
   through `visible`) blocked `validateForm` on the next screen, with errors
   that rendered nowhere.
2. `JrmTabRegistry` was append-only. `JrmTab` registered once in
   `afterNextRender` with a label snapshot, so a removed `Tab` left a ghost
   header over a destroyed view, a reordered one drifted to the end, and a
   label refined later in the stream never updated.

## User-visible outcome

`validateForm` validates the form on screen, not every field the session has
ever mounted. A `Tabs` group tracks its `Tab` children as the spec changes:
removals disappear, reorderings follow the spec's `children` order, and a
label patched mid-stream updates in place.

## Context

Findings 2 and 5 of the "Рентген ngx-json-render" audit (2026-08-30, HIGH,
both verified by an adversarial reviewer). Findings 1, 3 and 4 of the same
audit were closed on `main` before this branch.

## Decisions made

- **Field registrations are owner-scoped.** `registerField` /
  `unregisterField` take an optional opaque owner; the config and state are
  dropped only when the last owner releases the path. Two components bound to
  one path was the trap the audit called out, and refcounting is what keeps
  the survivor validating.
- **The element key reaches catalog components through a new `ELEMENT_KEY`
  token** (`injectElementKey()`), not through a new field on `RenderContext`.
  Additive, so no consumer that builds a `RenderContext` can break. The token
  carries `Signal<string>`, matching the rest of the context API.
- **The tab registry is a projection, not a log.** Order is computed from the
  `Tabs` element's own `children` array (the registry injects the render
  context of its host), with registration order only breaking ties — repeated
  keys under a `repeat`, or a tab whose key the group does not list.
- **Registration moved from `afterNextRender` to an `effect`.** It satisfies
  the same two constraints (write outside change detection, view created
  before `body()` resolves) and is not excluded from the server.

## Completed

- `validation.service.ts`: owner-scoped `registerField`, new
  `unregisterField`, and an `injectFieldValidation` that moves its
  registration when the path changes and releases it on `DestroyRef`.
- `tokens.ts` / `element.component.ts` / `public-api.ts`: `ELEMENT_KEY` and
  `injectElementKey()`, provided by `JrElement` next to `RENDER_CONTEXT`.
- `layout.components.ts`: `JrmTabRegistry` rewritten as a live projection
  (`RegisteredTab` entries with signal `key` and `label`, `register` /
  `unregister`, spec-ordered `tabs`); `JrmTab` registers from an effect and
  unregisters on destroy.
- Tests: three new validation tests (destroy releases the field, a shared
  path survives until the last holder, `unregisterField` clears config and
  state) and two new catalog tests (removal + reorder, streamed relabel).
- `projects/ngx-json-render/README.md`: `injectElementKey` in the API list.

## Changed files

`projects/ngx-json-render/src/lib/{validation.service.ts,tokens.ts,element.component.ts}`,
`projects/ngx-json-render/src/lib/validation.spec.ts`,
`projects/ngx-json-render/src/public-api.ts`,
`projects/ngx-json-render/README.md`,
`projects/ngx-json-render-material/src/lib/{layout.components.ts,material.spec.ts}`,
`projects/ngx-json-render-material/src/public-api.ts`.

## Verification evidence

### Passed

- `npm run build` — all three projects; the builds are this workspace's
  typecheck, and the public API changed.
- `npm test` — `ngx-json-render` 176/176, `demo` 58/58, catalog 63/63 with
  coverage collected (catalog 98.9% statements, 96.78% branches); thresholds
  held.
- `npm run format:check`, `npm run check:peers`.
- **The two new catalog tests were run against the pre-change
  `layout.components.ts`** (restored from `main` for one run): both failed —
  `['A','B','C']` instead of `['C','A']`, and `['Ov']` instead of
  `['Overview']`. The ghost tab and the stale label are the audit's finding,
  reproduced.

### Changed expectation

`validation.spec.ts > follows a path that changes` asserted that a field left
behind by a moving path keeps its state (`['/a','/b']`). That expectation
encoded the leak; it now asserts the release (`['/b']`, and `validateAll()`
true).

### Blocked or not run

- SSR. Registration no longer runs through `afterNextRender`, which is what
  structurally excluded it, but this workspace has no SSR harness — the claim
  is "no longer excluded by construction", not "verified".

### Residual risk

- `JrmTabRegistry` now requires a render context, so providing it by hand
  outside a `<json-render>` subtree throws. Nothing in the workspace does.
- `RegisteredTab.label` / `key` are signals: a consumer reading
  `registry.tabs()[0].label` as a string breaks. It is a 0.2.x internal-ish
  export, reachable but undocumented.

## Known risks

None outstanding beyond the two above.

## Next concrete step

None. The branch is merged into `main`. The audit one-liners it asked about
went onto their own branch (`chore/audit-one-liners`, a2883d0), which is
merged too.
