# A state write re-resolves only the elements that read it

## Metadata

- Branch: `perf/state-path-tracking`
- Base branch: `main`
- Base commit: `175f312`
- Commits: `7c9ff40` path tracking, `31c2a33` task-file update, then "Warn in
  dev mode when an element skipped a write it needed". Not pushed.
- Working tree: clean after that commit.
- Status: path tracking and the dev-mode check are committed and verified;
  awaiting the user's review.
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

## Dev-mode check on skipped writes

- **What it does.** When an element skips a state write, it resolves again
  against the whole state. If props or visibility come out different, it warns
  once per element key.
- **How a skipped write is detected.** `readableState` counts the snapshots it
  takes. An effect on `state.state()` compares that count between writes.
- **What it leaves alone.** It reports only and never corrects the element, so
  dev mode renders what production renders. It skips elements whose reads are
  `null`, since they resolve on every write anyway.
- **How results are compared.** `sameContent` compares plain objects, arrays
  and `Date` values by content. Functions, `Map`s and class instances count as
  equal, so the check never warns about an element that is correct.
- **How it is switched on.** It is gated by `CHECK_SKIPPED_WRITES` (internal,
  not exported), which defaults to `isDevMode()`. `render-precision.spec` turns
  it off except in its own block, because the check calls `$computed` again
  and `calls` counts those calls.
- **Tests:**
  - it stays quiet across the resolve spec's writes: `$cond`, `visible`,
    repeat, template and array replace;
  - it stays quiet with an external store that writes in place;
  - it stays quiet for a pure `$computed` that returns new objects;
  - it warns exactly once, leaving the text as it was, for a `$computed` that
    reads a module variable.
- **False-positive probe.** The warning was temporarily made to throw, and the
  lib, Material and demo suites were run. Only the intentional test failed;
  every other test passed, including all the default dev-mode runs. The probe
  was reverted, and `grep PROBE` found nothing afterwards.
- **Verification:**
  - `build:lib`;
  - lib tests with coverage: 318 passed, 95.62 / 89.74 / 95.36 / 97.08;
  - `build:material` and `test:material` 67/67;
  - demo tests 58 and `ng build demo`;
  - `check:zoneless`, `git diff --check` and prettier;
  - `angular-compat` steps on a copy of the working tree, Angular 20.3.31 and
    22.1.6: builds, and 317/317, which is before the content-comparison test
    was added;
  - browser `ng serve demo`: `main.js` contains the check. Playground typing,
    Interactive (name, counter, checkbox, add, remove) and Streaming checklist
    toggles produced no warnings or errors.
- **Dev-mode cost.** Every element resolves on every write, the 0.5.1 cost.
  `$computed` runs on every write in dev, and the README says so.

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
- `angular-compat` steps, each run as CI runs them in a throwaway clone of
  `7c9ff40`, on Angular 20.3.31 and 22.1.6. Each of these passed:
  - retarget and install;
  - `ng build ngx-json-render`;
  - `ng test ngx-json-render`, 314/314;
  - `ng build ngx-json-render-material`.
  - The Angular 20 log has warnings that were already there before this change:
    - NG0912 in `registry.spec`;
    - the expected missing-provider error in `testing.spec`;
    - "switching from uncontrolled to controlled mode" in the external-store
      tests of `render-precision.spec`. Those tests set the store after
      creating the component. The 0.5.1 ones warn too, and the store still
      takes effect.
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

- Nothing outstanding for this change.

### Residual risk

- A read the static walk doesn't model, but core does, would leave an element
  stale. That would come from a core upgrade changing an existing expression's
  semantics; a new `$` key falls back safely. The superset check is the guard
  and has to be extended with any new expression kind.
- A `$computed` function with hidden inputs (clock, globals) stops being
  re-run by unrelated writes. This is documented in the README.

## Approval gates

- Push and release are the user's; commits only when the user asks.
- This is a runtime behaviour change for every consumer, so it belongs in a
  renderer minor release note (0.6.0). The catalog peer range must move in the
  same commit as the version bump (see AGENTS.md, `check:peers`).

## Next concrete step

The user reviews the branch and decides whether to push it.
