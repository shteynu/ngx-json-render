# Prove the peer range at the top, not just the floor

## Metadata

- Branch: `chore/angular-22-compat`
- Base branch: `main`
- Base commit: `9f2ea0d`
- Current HEAD: `f190f5d` on `main` — the branch was merged
- Status: done, verified, merged into `main`
- Last updated: 2026-09-01
- Last agent/tool: Claude Code (Opus 5)

## Objective

The audit's ecosystem-parity item. The published peer range is
`@angular/core: >=20.0.0`, and CI proved only its floor: the `angular-compat`
job ran Angular 20, the main job ran the 21 the workspace pins, and nobody had
ever built the library against Angular 22 — which has been the current release
for some time. The range promised something no check had tried.

## What the run found

Nothing broken. Angular 22.1.4 with TypeScript 6.0.3: both libraries build and
all 173 library tests pass, with no source change. The only thing standing
between the workspace and that line was a dependency pin.

## Decisions made

- **A `typescript` pin per target line.** Angular 22 peers on `>=6.0 <6.1`;
  the workspace's `~5.9` ERESOLVEs before a file is compiled. The script
  already did this for 20 (`~5.8`), so 22 gets the same treatment rather than
  a new mechanism.
- **`fail-fast: false` stays.** 20 and 22 fail for unrelated reasons; one
  should not hide the other.
- **The workspace keeps pinning 21.** Proving 22 works is not a reason to
  move the whole workspace onto it — that is a separate decision with its own
  fallout, and the peer range does not ask for it.

## Verification

- The job's own steps, run for real in a throwaway copy at Angular 22:
  `angular-compat.mjs 22`, `npm install`, `ng build ngx-json-render`,
  `ng test ngx-json-render` (173 passed), `ng build ngx-json-render-material`
  — all green, exit 0.
- The script's output re-checked for both targets: 20 still produces
  `^20.0.0` + `~5.8` + vitest 3 and strips the v21-only builder options; 22
  produces `^22.0.0` + `~6.0` and keeps them.
- `npm run format:check`, `git diff --check`.

## Next concrete step

None. The branch is merged into `main`.
