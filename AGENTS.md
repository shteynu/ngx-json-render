# Agent instructions — ngx-json-render

An Angular workspace with two published libraries and one demo application:

| Project                    | Path                                | Kind                                              |
| -------------------------- | ----------------------------------- | ------------------------------------------------- |
| `ngx-json-render`          | `projects/ngx-json-render`          | library, published to npm                         |
| `ngx-json-render-material` | `projects/ngx-json-render-material` | library (Material catalog), published to npm      |
| `demo`                     | `projects/demo`                     | application, deployed to GitHub Pages from `main` |

`tsconfig.json` maps `ngx-json-render` and `ngx-json-render-material` to
`dist/`, so the demo and the catalog compile against the _built_ library.
Run `npm run build:lib` before building or testing anything that imports it,
or the check tests a stale `dist/`.

## Skill routing

- Starting, continuing or resuming work, reporting status, saving progress,
  or preparing a handoff → `.claude/skills/task-tracker/SKILL.md`.
- Verifying changes, proving a fix, checking merge readiness, or recording
  verification evidence → `.claude/skills/verification/SKILL.md`.

Both skills are vendored copies; see `.claude/skills/SOURCE.md`.

## Project profile (task-tracker)

| Role                  | This project                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| Task directory        | `docs/agent-tasks/active/`, archive in `docs/agent-tasks/archive/` (skill default; create on first use) |
| Task template         | `.claude/skills/task-tracker/references/task-template.md`                                               |
| Operational handoff   | none declared — dormant                                                                                 |
| Architecture document | none declared — dormant; `README.md` and each project's `README.md` are product docs, not an ADR record |
| Milestones document   | none declared — dormant                                                                                 |
| Context command       | none — use the read-only Git checks in `Starting work`                                                  |

`docs/` currently holds launch and announcement copy, not agent state. Do not
write session details into it.

## Project matrix (verification)

Extends the skill's selection matrix and wins on specificity. There is no
lint script and no separate typecheck script in this workspace: **the builds
are the typecheck**, and they are strict — `strict`, `strictTemplates`,
`noPropertyAccessFromIndexSignature` and friends are on in `tsconfig.json`.

| Changed area                                         | Commands                                                                                                                                                                                                                                     |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projects/ngx-json-render`                           | `npm run build:lib` then `npx ng test ngx-json-render --coverage`; when the public API changed, also `npm run build:material` and `npx ng build demo`                                                                                        |
| `projects/ngx-json-render-material`                  | `npm run build:lib`, then `npm run build:material` — the build type-checks every catalog template — and `npm run test:material`                                                                                                              |
| `projects/demo`                                      | `npm run build:lib` **and** `npm run build:material` — the demo's playground renders the Material catalog — then `npx ng test demo --coverage` and `npx ng build demo`. A stale `dist/` hides a missing build step locally; CI starts empty  |
| Public API, exports or the JSON spec/contract        | The full `npm run build` and `npm test`, plus a read of the affected `README.md` — a contract change that the docs still describe the old way is not done                                                                                    |
| `package.json`, `package-lock.json`, Angular version | `npm ci` then the full `npm run build` and `npm test`; for an Angular-version change, a new dev dependency, or a new `test.options` key in `angular.json`, also run the `angular-compat` job's own steps in a throwaway checkout — see below |
| `.github/workflows/**`, release config               | Read the workflow diff against the matching `npm run` script; releases are tag-driven and publish to npm — never trigger one as verification                                                                                                 |
| Docs only (`README.md`, `docs/**`)                   | `git diff --check` and a link check; no build needed                                                                                                                                                                                         |

Coverage: each project declares `coverageThresholds` in `angular.json`,
scoped to its own sources by `coverageInclude`. They are only enforced when
coverage is collected, which is why the test commands above pass `--coverage`
and why `npm test` does too — run `ng test` without it and a regression passes
silently. `npm run test:material` always collects it: the catalog's runner is
killed before the builder's own threshold check would run, so
`scripts/run-material-tests.mjs` reads the thresholds out of `angular.json`
and checks them itself. Raise a threshold when a suite clears it with room;
never lower one to make a red build green.

Formatting: `npm run format:check` (config in `.prettierrc`, exclusions in
`.prettierignore`). CI runs it, so a failure is something you introduced;
`npm run format` fixes it. Note `embeddedLanguageFormatting` is off on
purpose: Prettier otherwise reformats inline `template:` and `styles:`
blocks, and splitting a `mat-icon` interpolation across lines changes the
ligature text the icon renders.

Peer ranges: `npm run check:peers` (`scripts/check-peer-ranges.mjs`) asserts
that each published package's peer range on a sibling published package admits
that sibling's current version. CI and both release workflows run it. It exists
because `tsconfig.json` maps both package names to `dist/`, so npm's view of
the manifests is exercised nowhere in this workspace — which is how
`ngx-json-render-material@0.2.0` shipped a peer of `ngx-json-render: ^0.1.0`
(a 0.x caret stops below the next minor) and ERESOLVEd for anyone following
the catalog's own install line. The operational consequence: the catalog's
peer range is pinned to the renderer's current minor, so **a renderer minor
bump has to move that range in the same commit**, and the catalog then needs
its own patch release — publish the renderer first, the catalog after. A red
`check:peers` on a release is that rule firing, not a flake.

What `check:peers` cannot see: it reads the manifests in this workspace, which
are bumped together and therefore always agree. The gap that bites is between
this commit and what npm is serving. `npm run check:published -- <package>`
(`scripts/check-published-resolution.mjs`) closes it by installing the
packages from the public registry the way a new user would and reporting what
actually resolved; both release workflows run it after their publish step. It
exists because publishing `ngx-json-render@0.2.1` while the catalog on npm was
still 0.2.0 — carrying the old `^0.1.0` peer — made a clean install of the
pair resolve the renderer **down** to 0.1.4. No ERESOLVE: npm satisfied the
stale peer by choosing an older version, so the install looked fine and simply
omitted the release. Its severity is asymmetric on purpose. The released
package failing to resolve to itself is always fatal; an out-of-date sibling
is fatal only on the catalog's release, because releasing the renderer first
_necessarily_ leaves the pair incoherent until the catalog follows — there it
warns and names the follow-up instead.

Known caveat, handled by the runner script: `ng test ngx-json-render-material`
passes but the runner process does not exit (see
`projects/ngx-json-render-material/README.md` for what has been ruled out).
Always invoke it as `npm run test:material`, which goes through
`scripts/run-material-tests.mjs` and exits on the reported results. Do not call
the raw `ng test` for that project — it will hang — and do not chase the
underlying runner defect as a side quest.

The `angular-compat` CI job proves the library still builds and passes on
Angular 20, the floor of the `>=20` peer range. `scripts/angular-compat.mjs`
rewrites `package.json` and `angular.json` to that line, so anything
version-coupled has to be mirrored there or the job breaks on a change that
looks unrelated to Angular. Two kinds have bitten:

- a dev dependency whose major is tied to another's — `@vitest/coverage-v8`
  peers on its own `vitest` major, so pinning one and not the other turns
  one ERESOLVE into the next;
- a builder option that only exists in v21 — the v20 schema rejects unknown
  keys outright rather than ignoring them, which is why the script deletes
  the `coverage*` options it finds in `test.options`.

Verify it the way CI runs it, in a throwaway checkout — the script rewrites
the workspace, so never run it in the user's working tree:

    git clone --depth 1 file://"$PWD" /tmp/compat20 && cd /tmp/compat20
    node scripts/angular-compat.mjs 20 && npm install --no-audit --no-fund
    npx ng build ngx-json-render && npx ng test ngx-json-render
    npx ng build ngx-json-render-material

Run all of it, not just the install: the job stops at the first failing step,
so a later break stays invisible until the earlier one is fixed. The job
deliberately tests without `--coverage`; thresholds belong to the main job,
which runs on the version the workspace actually pins.

Deployment: pushing to `main` deploys the demo to GitHub Pages via
`.github/workflows/ci.yml`. Treat `main` as deployed state.
