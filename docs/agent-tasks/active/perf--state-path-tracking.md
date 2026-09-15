# A state write re-resolves only the elements that read it

## Metadata

- Branch: `perf/state-path-tracking`
- Base branch: `main`
- Base commit: `175f312`
- Current HEAD: `175f312` (no commits on the branch yet)
- Status: implemented and verified, uncommitted; awaiting the user's review
- Last updated: 2026-09-15
- Last agent/tool: Claude Code (Opus 5)

## Objective

After 0.5.1 a state write re-runs only the templates whose props changed, but
every element still re-resolves its props on every write: `resolutionCtx`
reads `state.state()`, whose `equal` is `() => false`. This task makes an
element depend only on the state paths its expressions can read, so a write
to `/user/name` does not make the todo list resolve anything.

## User-visible outcome

A write to one path runs prop resolution (and `$computed` functions) only in
elements whose expressions read that path. Rendered output is unchanged.

## Scope

- A static reader of the spec: the state paths an element's `props` and
  `visible` can read, or "unknown" when the analysis can't be sure.
- `JrElement`: a per-element cell per path, and the resolution context reads
  those cells instead of the whole state.
- Tests: unit tests for the reader, a soundness test (changing any state
  outside the reported paths does not change the resolved props), and render
  tests counting `$computed` calls.
- README: the "What a state write re-renders" section.

## Non-goals

- Proxy-based read tracking. It was rejected after a prototype threw on frozen
  state, `Date` and `Map` values.
- Path-aware notification from the store. Every write still marks every cell,
  and each cell checks its own path.
- A shared cross-element cell cache. Cells live and die with their element, so
  no refcounting is needed.
- Directives: any element whose props match a registered directive keeps
  depending on the whole state. A directive's `resolve` receives the whole
  context and may read anything.

## Decisions made

- **When in doubt, depend on the whole state.** This covers: an unknown
  `$`-prefixed key, a registered directive, `$bindState`/`$bindItem` (the
  0.5.1 input exemption), a `$state` of `''`/`'/'`, and a malformed condition.
  In each case the element behaves exactly like 0.5.1.
- **`$item` reads are mapped to state paths through the repeat base path.**
  The item signal alone would miss an external store mutating an item in place.
- **`$cond` is read on both branches, plus its condition.** This is a superset,
  never a guess about which branch is taken.
- **Template placeholders without a leading `/`** read both the item path and
  `/<name>`, mirroring core's fallback order.
- **Cell equality follows the 0.5.1 rule.** Primitives compare by value;
  objects compare by reference with the internal store and never compare equal
  with an external `store`.

## What changed

- `projects/ngx-json-render/src/lib/state-reads.ts` (new):
  `collectStateReads(element, directives, repeatBasePath)`.
- `element.component.ts`: `stateReads` → `stateCells` (one `computed` per
  path, rebuilt only when the paths change) → `readableState`, which
  `resolutionCtx` now reads instead of `state.state()`.
- `state-reads.spec.ts` (new) has two parts:
  - unit tests for each expression kind and each "give up" case;
  - a superset check: changing any state outside the reported paths leaves
    the resolved props and visibility identical. It includes a negative
    control that removes a path and must catch it.
- `render-precision.spec.ts` gains a "what a data change resolves" block that
  counts `$computed` calls.
- README, "What a state write re-renders": resolution is now per path, and
  `$computed` functions should be pure.

## Verification evidence

### Passed

- New render tests before the change: 4 of 7 failed with the expected extra
  calls (e.g. `{ '0': 1 }` for an unrelated write). The three behaviour guards
  passed before and after. After the change: 15/15.
- `npm run build:lib`; `npx ng test ngx-json-render --coverage`: 314 passed,
  thresholds met (95.6 / 89.57 / 95.26 / 97.06); `state-reads.ts` at 96.47 /
  95.55.
- `npm run build:material`; `npm run test:material`: 67/67.
- `npx ng test demo --coverage`: 58 passed. `npx ng build demo`: built.
- `npm run check:zoneless`: passed. `git diff --check`: clean. Prettier is
  clean on every changed file.
- Browser (`ng serve demo`), no console errors:
  - Playground: the name input updates the greeting.
  - Interactive: the name updates the template; the counter +1; a
    `$bindItem` checkbox; Add clears the input; Remove shifts the indexes.
  - Streaming: the "Onboarding checklist" checkbox toggles. The progress bar
    is a literal 33 in that spec, so it isn't expected to move.

### Failed

- `npm run format:check` flags only gitignored `docs/*.local/` folders:
  `devto-article-5-bench.local` (now formatted) and
  `render-bench-angular-vs-react.local`, which is not from this task. CI does
  not see either.

### Blocked or not run

- `angular-compat` (Angular 20/22) not run. The change uses `computed`
  `equal`, `Set` and `String.prototype.matchAll` only.

### Residual risk

- A read the static walk doesn't model, but core does, would leave an element
  stale. That would come from a core upgrade changing an existing expression's
  semantics; a new `$` key falls back safely. The superset check is the guard
  and has to be extended with any new expression kind.
- A `$computed` function with hidden inputs (clock, globals) stops being
  re-run by unrelated writes. This is documented in the README.

## Approval gates

- Commit, push and release are the user's.
- This is a runtime behaviour change for every consumer, so it belongs in a
  renderer minor release note (0.6.0). The catalog peer range must move in the
  same commit as the version bump (see AGENTS.md, `check:peers`).

## Next concrete step

The user reviews the diff. Optional follow-up, a separate step: a dev-mode
check that re-resolves skipped elements on a write and warns when the result
differs, catching an unmodelled read before production.
