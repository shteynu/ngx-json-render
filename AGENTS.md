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

| Changed area                                         | Commands                                                                                                                                                                                                                                                              |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projects/ngx-json-render`                           | `npm run build:lib` then `npx ng test ngx-json-render`; when the public API changed, also `npm run build:material` and `npx ng build demo`                                                                                                                            |
| `projects/ngx-json-render-material`                  | `npm run build:lib`, then `npm run build:material` — the build type-checks every catalog template — and `npm run test:material`                                                                                                                                       |
| `projects/demo`                                      | `npm run build:lib` **and** `npm run build:material` — the demo's playground renders the Material catalog — then `npx ng test demo` and `npx ng build demo`. A stale `dist/` hides a missing build step locally; CI starts empty                                      |
| Public API, exports or the JSON spec/contract        | The full `npm run build` and `npm test`, plus a read of the affected `README.md` — a contract change that the docs still describe the old way is not done                                                                                                             |
| `package.json`, `package-lock.json`, Angular version | `npm ci` then the full `npm run build` and `npm test`; for an Angular-version change also `node scripts/angular-compat.mjs 20` in a throwaway checkout, mirroring the `angular-compat` CI job — it rewrites the workspace, so never run it in the user's working tree |
| `.github/workflows/**`, release config               | Read the workflow diff against the matching `npm run` script; releases are tag-driven and publish to npm — never trigger one as verification                                                                                                                          |
| Docs only (`README.md`, `docs/**`)                   | `git diff --check` and a link check; no build needed                                                                                                                                                                                                                  |

Formatting: `npm run format:check` (config in `.prettierrc`, exclusions in
`.prettierignore`). CI runs it, so a failure is something you introduced;
`npm run format` fixes it. Note `embeddedLanguageFormatting` is off on
purpose: Prettier otherwise reformats inline `template:` and `styles:`
blocks, and splitting a `mat-icon` interpolation across lines changes the
ligature text the icon renders.

Known caveat, handled by the runner script: `ng test ngx-json-render-material`
passes but the runner process does not exit (see
`projects/ngx-json-render-material/README.md` for what has been ruled out).
Always invoke it as `npm run test:material`, which goes through
`scripts/run-material-tests.mjs` and exits on the reported results. Do not call
the raw `ng test` for that project — it will hang — and do not chase the
underlying runner defect as a side quest.

Deployment: pushing to `main` deploys the demo to GitHub Pages via
`.github/workflows/ci.yml`. Treat `main` as deployed state.
