# Adopt Nx — deferred until the workspace outgrows npm scripts

## Metadata

- Branch: none yet; use `chore/nx-workspace` if this is ever started
- Base branch: `main`
- Base commit: n/a — nothing implemented
- Current HEAD at the time of the decision: `050a194`
- Status: **deferred, not started.** Do not begin until a trigger below fires
- Last updated: 2026-08-30
- Last agent/tool: Claude Code (Opus 5)

## Objective

Decide whether this workspace should move to Nx. It should not, yet. This
file records why, and the conditions under which the answer changes, so the
question does not get re-litigated from scratch every few months.

## Decision

**No, at three projects.** Nx earns its keep through task caching and
`affected`; both scale with the workspace, and this one is too small for
either to pay for itself.

## Evidence the decision rests on

Measured on 2026-08-30 at `050a194`:

|                               | Then                                                      |
| ----------------------------- | --------------------------------------------------------- |
| Projects                      | 3 — `ngx-json-render`, `ngx-json-render-material`, `demo` |
| Source `.ts` files            | 22 + 10 + 26                                              |
| Dependency graph              | one chain: `lib → material → demo`                        |
| Whole CI run                  | ~2 min; `build-and-test` 1m22s–1m38s                      |
| Library build / test, locally | ~2s / ~1.8s                                               |

Two consequences. Tasks this short cost more to look up in a cache than to
re-run. And `affected` barely narrows anything, because the demo depends on
both libraries, so almost any change is "affected".

A large share of those two CI minutes is `npm ci`, which Nx does not touch:
it caches task results, not dependency installation. That is already handled
by `cache: npm` in `setup-node`.

## What Nx would collide with here

Not generic migration cost — three specific arrangements in this repository:

- **Compilation against `dist/`.** `tsconfig.json` maps both package names to
  built artifacts, so the demo and the catalog type-check against the real
  published package, ng-packagr output included. Nx's Angular convention
  points those paths at `projects/*/src/public-api.ts` instead: faster, but it
  stops testing what actually ships. Adopting the convention weakens a
  deliberate guarantee; keeping ours means working against Nx defaults.
- **`scripts/angular-compat.mjs`.** It rewrites `package.json` and
  `angular.json` to prove the `>=20` peer floor still holds. Under Nx those
  task options live in `project.json` / `targetDefaults`, so the script needs
  reworking — and `@nx/angular` carries its own per-Angular-major version
  matrix, which turns that job into a test of Nx compatibility as well.
  That job broke twice on 2026-08-30 for unrelated reasons; adding moving
  parts to it is a bad trade.
- **The catalog runner and the release path.** `scripts/run-material-tests.mjs`
  works around a runner that never exits; the builder underneath is the same
  under Nx, so the hang stays and only the script changes. Releases are
  tag-driven through npm trusted publishing (OIDC), which took real effort to
  get working — and Nx invites a move to `nx release`. See
  `.github/workflows/release.yml` and the README's release section.

## What Nx would give, honestly

- Module-boundary rules — but there is no ESLint in this workspace at all, so
  this is not "turn on a rule", it is standing up a lint layer first.
- Generators — marginal at three projects.
- A dependency graph that currently fits in one line and is already expressed
  by the order of the npm scripts.

## Triggers to revisit

- **More catalogs.** The likely one. A second or third renderer catalog
  (PrimeNG, Tailwind, in-house) turns the chain into a fan: N catalogs on a
  shared core, none depending on each other. `affected` stops being decorative
  there, because a change in one catalog should not run another's tests.
- Roughly five or more projects, and/or CI past ~5 minutes.
- Several regular contributors, where enforced module boundaries start
  preventing real mistakes rather than describing them.

Cheaper moves to reach for first, in order: dependency-install caching (done),
splitting CI jobs to run in parallel, then Nx.

## If this is ever picked up

Re-measure before acting. The numbers above are a snapshot from 2026-08-30
and are the whole basis of the decision — a stale table is not evidence.
Check the project count, the CI wall time and the shape of the dependency
graph first, then re-read the three collision points, which are the part
least likely to have changed.

## Next concrete step

None. This is a recorded decision, not queued work. Start only when a trigger
above has actually fired, and re-measure first.
