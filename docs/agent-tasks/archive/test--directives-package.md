# Prove the ecosystem's directives render here

## Metadata

- Branch: `test/directives-package`
- Base branch: `main`
- Base commit: `9f2ea0d`
- Current HEAD: `6b72101` on `main` — the branch was merged
- Status: done, verified, merged into `main`
- Last updated: 2026-09-01
- Last agent/tool: Claude Code (Opus 5)

## Objective

The audit's second ecosystem-parity item. Both READMEs claim that everything
built on `@json-render/core` composes with this package, and the renderer has
a `directives` input for exactly that — but `@json-render/directives`, the
one ecosystem package that exercises it, had never been installed here, let
alone rendered. The claim was prose.

## What the run found

It works, unmodified: `standardDirectives` spreads straight into the
`directives` input with no cast, and every directive resolves state through
the same path as any other prop, so a derived value updates when its state
does. One documentation-worthy surprise: `$pluralize`'s `one` / `other` are
the noun, not a template — the directive prefixes the count itself and
interpolates nothing, so `other: '{n} files'` renders `2 {n} files`.

## Decisions made

- **A devDependency, not a peer.** The package is optional for consumers;
  making it a peer would push an install on everyone who never writes `$math`.
- **The test renders through `<json-render>`**, not through core's resolver
  directly. Testing the resolver would test somebody else's package; what is
  unproven here is the path from the `directives` input to a rendered string.
- **`TestBed.resetTestingModule()` inside the spec's `render` helper**,
  because several of these tests render more than one spec and a second
  `configureTestingModule` on a live module throws.

## Verification

Ran on 2026-09-01, all green:

- `npm ci`, then from a clean `dist/`: `npm run build`,
  `ng test ngx-json-render --coverage` (178 passed, 5 new),
  `ng test demo --coverage` (58 passed), `npm run test:material` (61/61),
  `npm run format:check`, `npm run check:peers`.
- The `angular-compat` job's own steps in a throwaway copy at Angular 20 —
  required by AGENTS.md for a new dev dependency: install, build, 178 tests,
  catalog build, exit 0.

## Known gap — closed

The compat run on this branch covered Angular 20 only, the matrix it inherited
from `main`. `chore/angular-22-compat` added 22 to that matrix. On 2026-09-01,
with every branch merged, the matrix's top end was run again against the full
tree: a throwaway copy of `main` retargeted by `scripts/angular-compat.mjs
22`, `npm install` (Angular 22.1.4, Material 22.1.4, TypeScript 6.0.3,
ng-packagr 22.1.1), `ng build ngx-json-render`, `ng test ngx-json-render` —
**224 passed** — and `ng build ngx-json-render-material`. Beyond the job's own
steps: `npm run test:material` (65/65, 98.9% statements), `ng test demo` (58
passed) and `npm run check:zoneless`, all green. `@json-render/directives`
renders all eight of its directives on both ends of the peer range.

## Next concrete step

None. The branch is merged into `main`, and its dev dependency is now proved
at 20 and at 22.
