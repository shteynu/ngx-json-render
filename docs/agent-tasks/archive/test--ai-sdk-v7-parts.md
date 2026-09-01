# Audit the AI SDK v7 data parts

## Metadata

- Branch: `test/ai-sdk-v7-parts`
- Base branch: `main`
- Base commit: `9f2ea0d`
- Current HEAD: `a2064bd` on `main` — the branch was merged
- Status: done, verified, merged into `main`
- Last updated: 2026-09-01
- Last agent/tool: Claude Code (Opus 5)

## Objective

The audit's last ecosystem-parity item. `buildSpecFromParts`,
`getTextFromParts` and `jsonRenderMessage` read the AI SDK's
`UIMessage.parts` through a hand-written structural `DataPart` — deliberately,
so the library does not depend on the SDK, but also with nothing to notice if
the two drift. The SDK is on v7; this code was written against v5's shape and
had never been run against the real thing.

## What the audit found

The structural type still fits: `UIMessage['parts']` from `ai@7.0.87` is
assignable to `DataPart[]` with no cast, and both helpers read it correctly.
Two SDK semantics are not visible from the type, and both fail silently:

- **A data part written with an `id` is reconciled**, not appended: the next
  part with the same id replaces it. A spec streamed as patches under one id
  therefore arrives as its final patch alone — a spec with no root, and no
  error anywhere. An id belongs on a part that is a snapshot of itself, which
  is what the `flat` / `nested` payloads are.
- **A transient part never reaches `message.parts`.** It goes to `onData` and
  nowhere else, so a spec written transiently cannot be rebuilt from the
  message.

Also worth knowing, and now asserted: a `nested` payload is a tree, not a
`{ root, elements }` map — core's `nestedToFlat` walks it and mints the keys
itself (`el-0`, `el-1`, …).

## Decisions made

- **Test against the SDK, not a fixture.** The spec writes chunks the way a
  server route would and reads the message the way a client would, through
  `createUIMessageStream` / `readUIMessageStream`. A copied fixture would rot
  in exactly the way this item is complaining about.
- **`ai` as a devDependency.** Nothing in the shipped code imports it; only
  the test does, which is the point — the structural type stays honest
  without the dependency reaching consumers.
- **Document the reconciliation trap; do not try to detect it.** By the time
  the parts reach `buildSpecFromParts`, the SDK has already collapsed them —
  a warning could only fire on "a patch payload arrived with an id", which is
  harmless for a single patch and would cry wolf.
- **`DataPart` gains `id?: string`.** It costs nothing, mirrors the SDK's
  shape, and gives the reconciliation note a place to live in the code.

## Verification

Ran on 2026-09-01 against `ai@7.0.87`, all green:

- `npm ci`, then from a clean `dist/`: `npm run build`,
  `ng test ngx-json-render --coverage` (177 passed, 4 new),
  `ng test demo --coverage` (58 passed), `npm run test:material` (61/61),
  `npm run format:check`, `npm run check:peers`.
- The `angular-compat` job's own steps in a throwaway copy at Angular 20 —
  required for a new dev dependency: install, build, 177 tests, catalog
  build, exit 0.

## Known gap — closed

Like `test/directives-package`, the compat run on this branch covered Angular
20 only, the matrix it inherited from `main`. On 2026-09-01, with every branch
merged, the matrix's top end was run again against the full tree: a throwaway
copy of `main` retargeted by `scripts/angular-compat.mjs 22`, `npm install`
(Angular 22.1.4, Material 22.1.4, TypeScript 6.0.3, ng-packagr 22.1.1), `ng
build ngx-json-render`, `ng test ngx-json-render` — **224 passed** — and `ng
build ngx-json-render-material`. Beyond the job's own steps: `npm run
test:material` (65/65, 98.9% statements), `ng test demo` (58 passed) and `npm
run check:zoneless`, all green. `ai@7.0.87` streams and reconciles its data
parts on both ends of the peer range.

## Next concrete step

None. The branch is merged into `main`, and its dev dependency is now proved
at 20 and at 22.
