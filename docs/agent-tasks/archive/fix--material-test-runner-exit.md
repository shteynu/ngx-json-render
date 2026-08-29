# Get the Material catalog tests into CI

## Metadata

- Branch: `fix/material-test-runner-exit`
- Base branch: `main`
- Base commit: 15b4d02
- Current HEAD: one commit on top of the base (`git log --oneline main..`); worktree clean
- Status: implemented, verified
- Last updated: 2026-08-29
- Last agent/tool: Claude Code (Opus 5)

## Objective

The Material catalog's tests were excluded from CI because the runner never
exits. CI built the package instead, so eight tests never ran on any push, and
locally `npm run test:material` had to be interrupted by hand.

## User-visible outcome

`npm run test:material` finishes on its own with an accurate exit code, `npm
test` covers all three suites, and CI runs the catalog's tests on every push
and pull request.

## Context

Sixth finding from the code review. Findings 1–5 are fixed on their own
branches off the same base.

## Scope

- `scripts/run-material-tests.mjs` (new)
- `package.json`, `.github/workflows/ci.yml`
- `projects/ngx-json-render-material/README.md`, `AGENTS.md`

## Non-goals

- Fixing the runner defect itself. It is in `@angular/build:unit-test` +
  Vitest, not in this repository's code (see the bisect below).

## Acceptance criteria

- `npm run test:material` exits 0 on a passing suite, 1 on a failing test, 1 on
  a build failure, and leaves no process behind in any case.
- CI runs the catalog's tests.
- The documented diagnosis matches what actually reproduces.

## Relevant repository instructions

`AGENTS.md` said to run the catalog's tests locally with a timeout and not to
chase the hang. This task changes that instruction, so `AGENTS.md` and the
package README were updated with it.

## Decisions made

- **Wait for the report, not for the process.** Vitest writes a complete JSON
  report before the process hangs, so the script asks for one
  (`--reporters=json --output-file=…`), polls for it, kills the runner, and
  exits on what it says.
- **Fail closed.** No report, an empty run, a build failure, or a runner that
  dies without reporting all exit non-zero. An empty run has to fail, or a
  broken include glob would look green.
- **Detect a build failure from the builder's own output.** On a compile error
  the builder prints `Application bundle generation failed` and keeps running,
  so waiting for either the report or the process would burn the full timeout;
  the script watches the stream and fails in ~3s instead.
- **`process.exitCode`, never `process.exit()`.** The runner is spawned
  detached so its whole process group can be killed; `process.exit()` skips
  `finally`, which would leave that group running after the script returns.
  Caught by testing for leftover processes rather than by reading the code.
- `npm test` now includes the catalog suite, since it no longer hangs.

## Assumptions

- The `Application bundle generation failed` string is stable enough for a
  fast-fail heuristic. If it changes, the run degrades to the timeout — slow,
  but still correct.

## Completed

The bisect, the script, the wiring, and the corrected documentation.

## Changed files

See `Scope`; one new file, four edited.

## Verification evidence

### Passed

- `npm run build` — exit 0.
- `npm test` — 29 library + 1 demo + 8 catalog, exit 0, no leftover process.
- Script behaviour, all three checked directly with `pgrep` afterwards:
  passing suite → exit 0 in ~5s; a deliberately failing test → exit 1, naming
  `deliberate failure fails on purpose`; an unresolvable import → exit 1 in
  ~3s with `The test build failed; no tests ran.` No `ng test` process
  survived any of the three.
- The bisect that produced the corrected diagnosis (each case run to either
  exit or a 60s cutoff):
  - empty spec, other sources removed → exits; empty spec with
    `material.spec.ts` merely present on disk → hangs;
  - `./form.components` → hangs; `./layout.components`, `./content.components`,
    `./feedback.components`, `./catalog` → exit;
  - all nine Material form modules alone → exits; nine plain components using
    them → exits; `JrmInput`, `JrmSelect`, `JrmSlider` each alone → exits;
  - `--watch=false` → still hangs.
  - The test worker itself is clean: after quiescing, no pending timers and
    only stdio pipes left, so the leak is in the runner process.

### Failed

None.

### Blocked or not run

- The CI change itself is unverified until it runs on GitHub; it is a
  three-line step calling a script proven locally.
- `npx prettier --check` — not run as a gate (`.prettierrc` sets
  `printWidth: 100` against a codebase written at 80).

### Environment

Local macOS, Node 22.23.1, Angular 21.2, Vitest 4.1.11. Note there is no
`timeout(1)` on this host, which is why the script does its own timing rather
than relying on the shell.

### Residual risk

- The script kills the runner by process group; on Windows there is no such
  group and it falls back to killing the child alone, which may leave workers.
  CI is Linux and the fallback is best-effort.

## Failed approaches

- Looking for a leak in the test worker. There is none — that is what
  redirected the investigation to the runner process.

## Known risks

None beyond the residual risk above.

## Approval gates

None.

## Questions requiring an owner decision

- Whether to report the runner hang upstream. There is a minimal
  reproduction — a project whose spec imports `form.components.ts` — but no
  reduced case smaller than "that whole file".

## Next concrete step

Nothing on this branch. The last open finding from the review is test coverage:
the `actions.service` built-ins (`pushState`, `removeState`, `push`, `pop`,
`validateForm`), `validation.service`, and controlled-mode `state.service`.
