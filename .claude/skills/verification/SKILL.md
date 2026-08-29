---
name: verification
description: Verify changes and runtime behavior before claiming them done - prove a bugfix or feature correct, choose checks proportional to the diff, check merge readiness, verify a deployed environment safely, and record verification evidence (passed, failed, blocked, not run) without unverified claims. Use before any substantive "this works" or "ready to merge" statement.
---

# Verification

## How to read this skill

Always in force: `Purpose` — proportionality to risk; `Preflight` — without
it the matrix rows cannot be chosen; `Selection matrix` — the mandatory floor
per affected area; `Handling results` and `Evidence format` — what counts as
a passed check and how to report it.

Conditional, after the matrix has chosen rows: `Project matrix` — the
consuming project's concrete commands for the chosen rows, one subsection per
row rather than the whole document; `Runtime scenarios` — the diff changes a
user-visible flow.

## Purpose

Choose the minimal set of checks that proves the changed behavior, then widen
it in proportion to risk. Do not run a full suite mechanically for a
docs-only change, and do not stop at one targeted test for changes to
privacy, auth, persistence, contracts, money or deployment.

## Preflight

1. Find the repository root via `git rev-parse --show-toplevel`.
2. Read the project's `AGENTS.md` or equivalent, its build manifests —
   `package.json`, `pyproject.toml`, `Makefile`, CI workflows, whatever the
   stack uses — the relevant source, and the nearest tests.
3. Check `git status --short`, the staged/unstaged diff and the changed-file
   list.
4. Identify affected layers: docs, UI, API, services, persistence/schema,
   generated artifacts, dependencies, auth/security, deploy/config.
5. Fix the evidence context: `local`, `test` or `deployed`. `test` means an
   isolated harness, not a third product environment. Never mix evidence from
   different environments without labeling it.
6. Against a deployed environment the default is read-only smoke: do not
   create data, fire webhooks or change configuration or aliases without
   authorization appropriate to that environment. The rule lives here, not in
   the scenarios section, because non-UI checks — callbacks, service
   boundaries — also reach deployed systems.
7. A running dev server is a runtime, not evidence.

## Selection matrix

The floor per affected area. The `Project matrix` adds concrete commands and
stack-specific rows on top; when a diff touches several rows, take the union
and deduplicate.

| Changed area | Mandatory minimum |
| --- | --- |
| Docs, instructions or skills only | Link and frontmatter integrity, `git diff --check`, and any structural doc lint the project defines |
| UI components, styles | Targeted tests, project lint and build; runtime smoke when a user-visible flow changed |
| API, services, business logic | Nearest unit/API tests, then the full test suite and build |
| Schema or migrations | Schema validation, client/codegen regeneration, data-access tests; confirm which database a command will hit before any write |
| Generated artifacts or published contracts | Regenerate with the project command — never hand-edit generated output; run integrity tests; check the artifact tells the truth about the real handlers, which regeneration alone cannot prove |
| Dependencies, lockfiles, toolchain | The project's dependency lint; regenerate locks with the documented commands, not by hand; when the deployed runtime differs from the dev machine, prove the change in a container matching it |
| Auth, secrets, authorization | Negative tests — unauthorized, missing secret, tenant isolation — plus a security-focused diff review |
| Deploy, env or runtime config | Full local suite, deployed source/build/health/logs checks, and a safe read-only smoke |

One check binds to no row: if the stack has a static type layer, run the
project's full typecheck for any change in typed code. Build commands often
type only the application graph and miss tests, and linters may not check
types at all, so no row above substitutes for it.

## Project matrix

A consuming project should keep its own concrete matrix — real commands, rows
for its stack, and the history of why its non-obvious rows exist — in its
`AGENTS.md` or a project verification skill. That matrix extends this one and
wins on specificity; this skill remains the floor when the project declares
nothing.

## Runtime scenarios

When a user-visible flow changed, verify only the states relevant to the
scenario, typically drawn from:

- empty state, with no seeded or invented data;
- the primary happy path;
- permission, privacy or entitlement locks;
- loading, not-found, upstream-error and unauthorized states;
- for UI changes: reading order (including RTL where applicable), keyboard
  access, responsive layout and reduced motion.

An automated end-to-end smoke answers "is the application standing?", not
"are the rules right?" — it does not replace the other rows.

## Handling results

- A check passed only on an actual exit code `0` or a confirmed expected
  runtime result. A check that was piped or wrapped must have its own exit
  code read — a pipeline reports the last command's status, not the check's.
- Keep `passed`, `failed`, `blocked` and `not run` separate.
- On failure, keep the exact command and a useful fragment of the error;
  never mask a problem with a fallback success.
- Do not fix an unrelated failure without widening scope. Determine whether
  it predates the current diff when that can be checked safely.
- After a fix, rerun the failed check first, then the affected suite.
- If the diff touches privacy, authentication, authorization, contracts,
  deployment or a service boundary and residual risk warrants it, return the
  short signal `Independent review recommended.` to the tracker skill; the
  tracker owns any model recommendation.

## Evidence format

Before finishing, report:

```text
Verification:
- Passed: <command or smoke and result>
- Failed: <command and concise cause>
- Blocked/not run: <check and reason>
- Environment: <local/test/deployed>
- Residual risk: <what remains unverified>
```

If an active branch task file exists and a handoff is being prepared, update
its `Verification evidence` section — `Passed`, `Failed`, `Blocked or not
run`, `Environment`, `Residual risk` — before handing over. Never record a
check that did not run, and never copy ordinary task evidence into milestone
or operational documents unless it changes project-wide or deployed state.
