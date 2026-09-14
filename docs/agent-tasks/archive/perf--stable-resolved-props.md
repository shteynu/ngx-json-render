# A state write re-renders only what it changed (M-core-3)

## Metadata

- Branch: `perf/stable-resolved-props`
- Base branch: `main`
- Base commit: `aac1c64`
- Current HEAD: `45d2675` on `main` (fast-forwarded)
- Status: done, merged into `main`; released as ngx-json-render 0.5.1 once the user pushes `v0.5.1`
- Last updated: 2026-09-14
- Last agent/tool: Claude Code (Opus 5)

## Objective

Close roadmap M-core-3: every state write re-ran every catalog template in
the tree. `JrElement.resolvedElement` built a new props object on each
resolution, and `_state` has `equal: () => false`, so a single keystroke made
every element's props "change".

## User-visible outcome

A state write re-runs only the templates whose resolved props differ. In the
precision spec: a write to `/user/name` re-runs 1 template instead of the
whole tree, and appending to a repeated array creates the new item and
re-runs no existing one. Measured before the fix: 6 of 6 and 7 of 7.

## Scope

- `resolvedElement` and `bindings` get an `equal` in
  `projects/ngx-json-render/src/lib/element.component.ts`.
- New spec `projects/ngx-json-render/src/lib/render-precision.spec.ts`.
- README section "What a state write re-renders"
  (`projects/ngx-json-render/README.md`).

## Non-goals

- Skipping the re-resolution itself: every element still re-resolves its
  props on every write. That is JavaScript work, not template work. The next
  step would be tracking which state paths each element reads.
- Nested literal objects and arrays in props: core `resolvePropValue`
  rebuilds them on every resolution, so they still count as changed.
- `_state`'s `equal: () => false` stays. The roadmap's F3 idea (reference
  equality for the internal store) is not needed for this outcome.

## Decisions made

- **Props compare shallowly.** With the internal store, object values compare
  by reference: core `createStateStore` copies every path it writes via
  `immutableSetByPath`. With an external `store`, only primitives compare
  equal. The spec's in-place-mutating store proves that guard is load-bearing:
  comparing by reference there fails "an array mutated in place still reaches
  the component".
- **Non-props element fields compare by reference always.** They come from
  the spec, never from state.
- **Elements with any two-way binding are exempt** (`untracked(this.bindings)`
  is truthy, so every resolution counts as a change). Found in the live demo:
  the Interactive tab's "What needs doing?" input kept the typed text after
  Add, intermittently. The prop went '' → typed → '' before the demo
  `InputComponent`'s sync effect ran, and the README tells catalog authors to
  use exactly that effect. The failing case is pinned by "re-assert the DOM
  when state returns to the value they last saw".

## Verification evidence

### Passed

- New spec before the fix: 2 of 6 failed (6/6 and 7/7 re-runs), as expected.
  After: 8/8, including the bound-input case, which failed before the
  exemption with "expected 'milk' to be ''".
- `npm run build:lib`; `npx ng test ngx-json-render --coverage`: 283 passed,
  thresholds met (95.77 / 89.31 / 94.92 / 96.94).
- `npm run build:material`; `npm run test:material`: 67/67.
- `npx ng test demo --coverage`: 58 passed. `npx ng build demo`: built.
- `npm run check:zoneless`: passed. `git diff --check`: clean. Prettier is
  clean on every changed file.
- Browser, demo served from the rebuilt `dist`:
  - Interactive tab: four rounds of typing and Add all clear the input.
  - Counter, `$bindItem` checkbox, and Remove with index shift all work.
  - Playground: the Material input updates the greeting. No console errors.
- Baseline check: with the fix stashed, the same keyboard sequence cleared
  correctly, so the demo failure was a regression of the first version of
  the fix, not pre-existing.

### Failed

- `npm run format:check` reports 3 files under
  `docs/devto-article-5-bench.local/`. They are not part of this change and
  are gitignored, so CI does not see them.

### Blocked or not run

- `angular-compat` (Angular 20/22) not run. The change uses `computed`'s
  `equal` option and `Object.hasOwn`, both available on 20.

### Residual risk

- A catalog template that reads non-signal mutable data used to be refreshed
  by any unrelated state write. It no longer is. This is documented in the
  README.

## Approval gates

- Commit and push are the user's.
- The change alters runtime behaviour for every consumer, so it belongs in a
  renderer release note.

## Next concrete step

None on this task. The user pushes `main` and the `v0.5.1` tag; the catalog
needs no release, since its peer `^0.5.0` admits 0.5.1.
