# Catalog check: make `validate` + `catalog` actually check props

## Metadata

- Branch: `claude/peaceful-margulis-7fc02a` (worktree)
- Base branch: `main`
- Base commit: `4389662`
- Landed as: `f29ba41` on `main` — the branch was fast-forwarded
- Status: done, verified, merged into `main`
- Last updated: 2026-09-17
- Last agent/tool: Claude Code (Opus 5)

## Objective

The renderer's `catalog` input, both hooks' `catalog` option and the README
promised that `validate` with a catalog rejects props the catalog's schema
rejects. It did not, for any catalog with more than one component.

## Context

- `catalogIssues` (`render-limits.ts`) checked `type` names, then relied
  entirely on `catalog.validate(spec)`.
- `@json-render/core` 0.20.0 (`buildZodType`, `case "propsOf"`) gives an
  element's props the component's schema only when the catalog has exactly
  one component; otherwise `z.record(z.string(), z.unknown())`. Upstream
  `main` is unchanged and calls the leniency deliberate; 0.20.0 was the latest
  release; no upstream issue mentioned it.
- The old catalog tests used `SpecCatalog` stubs with a fixed `validate`, so
  they never exercised core.

## Decisions made

- **The owner chose a props pass in `catalogIssues`** over docs-only or an
  upstream change, and **nothing was filed upstream**.
- **`SpecCatalog` gains `readonly data?: unknown`**, read structurally at
  runtime (`data.components[type].props` with a callable `safeParse`). A typed
  `data` would break core's default `Catalog`, whose `data` is `unknown`.
- **Expressions are not judged.** A props issue located at, inside, or on a
  value holding an object with a `$`-prefixed key is dropped: core resolves
  those before the component sees them, and directives are `$`-prefixed too.
  A naive `safeParse(element.props)` reported 19 false `invalid_props` across
  the demo's valid specs, including README's first example.
- **Core's own issues under `elements.<key>.props` are dropped** for every
  element the pass checks — duplicates with one component, and expression
  false positives there. Its other issues (missing `children`, `root`) stay.
- **A schema that throws is a rejection, not a crash** — for both the spec
  schema and props schemas. `ValidationConfigSchema.enabled` overflows the
  stack ~1000 `$and`s deep.
- **Unknown `type` still short-circuits** the schema passes, as before.
- **The 20-issue cap spans both passes**; props parsing stops once it is hit.

## Completed

- `render-limits.ts` — the props pass (`propsSchemaOf`, `propsIssues`,
  `reachesExpression`, iterative `holdsExpression`), try/catch around both
  schema calls, null-safe issue reading, docs for `SpecCatalog.data`,
  `catalogIssues` and `invalid_props`.
- Doc comments: `renderer.component.ts` `catalog`, `spec-validation.ts`
  `SpecCheckOptions.catalog`, `ui-stream.ts` / `chat-ui.ts` `catalog`.
- README: the structured-output paragraph points at
  `checkSpec(spec, 'strict', { catalog })` instead of `catalog.validate(spec)`;
  "Checking what the model produced" explains expressions, the `children`
  grammar rule and core's one-component limit; Security says expression-bound
  props are not checked.
- Tests: 14 in `render-limits.spec.ts` (real catalogs from
  `schema.createCatalog` plus defensive stubs), 1 in the Material
  `material.spec.ts` against the real 28-component catalog, `validation`
  included.

## Changed files

All in `f29ba41`:

- `projects/ngx-json-render/src/lib/render-limits.ts`
- `projects/ngx-json-render/src/lib/render-limits.spec.ts`
- `projects/ngx-json-render/src/lib/renderer.component.ts`
- `projects/ngx-json-render/src/lib/spec-validation.ts`
- `projects/ngx-json-render/src/lib/streaming/ui-stream.ts`
- `projects/ngx-json-render/src/lib/streaming/chat-ui.ts`
- `projects/ngx-json-render/README.md`
- `projects/ngx-json-render-material/src/lib/material.spec.ts`

## Verification evidence

### Passed

- Before the fix: the several-components test failed
  (`expected [] to deeply equal [ …(2) ]`), the one-component control passed.
- `rm -rf dist && npm run build` — exit 0 (renderer, testing entry, Material,
  demo), on the tree committed as `f29ba41`.
- `npm test` — exit 0: `ngx-json-render` 332/332 at 95.77 / 90.51 / 95.49 /
  97.18 (thresholds 94 / 88 / 92 / 96); demo 58/58; Material 68/68 at 98.9%
  statements, 96.78% branches. `render-limits.ts` 97.88% statements, only
  pre-existing `childKeysOf` lines 164–165 uncovered.
- `npm run format:check`, `npm run check:zoneless`, `git diff --check` — exit 0.
- Mutation checks, each restored byte-identical (`cmp`): no expression skip,
  no dedupe, recursive walk, no catch, `holdsExpression` always false, drop
  all core issues for checked elements — each failed its intended test(s).
- Real `checkSpec` (source, via Node type stripping from a scratch script)
  under `strict` on the demo corpus: 0 props issues on the Material starter,
  README's first example, the demo starter, dashboard, both chat exchanges and
  all stream recordings; a 5000-deep `validation.enabled` gives one
  `invalid_props`.
- README sections read after editing; no other props-check claims in any
  README or `docs/`.

### Failed

None on the committed tree.

### Blocked or not run

- `angular-compat` (Angular 20/22) — not run: no Angular version, dev
  dependency or `test.options` change. The code uses `Object.hasOwn`
  (ES2022); `scripts/angular-compat.mjs` leaves the ES2022 `target` alone.
- `check:peers`, `test:scripts` — manifests and scripts unchanged.

### Environment

local

### Residual risk

- The expression rule is conservative: a malformed value inside a `$`-keyed
  object (e.g. a broken condition in `validation.enabled`) is not reported,
  and a container-level issue on a value holding an expression is skipped.
- Behaviour change for apps already using `validate` + `catalog`: literal
  props that fail their schema are now errors, so `strict` refuses specs it
  used to render. The next renderer release should say so.
- The demo's `dashboard` spec has 14 elements without `children`; with
  `strict` + catalog it would be refused. Pre-existing, not changed.

## Out of scope, found on the way (offered as separate tasks)

- Core `validateSpec` throws `RangeError` on a `visible` nested ~1000 `$and`s
  deep (`evaluateVisibility` at ~3000), reachable through `checkSpec`.
- Material `field.ts`: `config()?.checks?.some(...)` throws `TypeError` for
  `validation: { checks: "required" }` when validation is off.

## Next concrete step

None for this task. The next renderer release notes should call out the
behaviour change above.
