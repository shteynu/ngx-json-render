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

`ngx-json-render` has a second entry point, `ngx-json-render/testing`, whose
sources live in `projects/ngx-json-render/testing/src` (ng-packagr finds it by
the `ng-package.json` in that directory) and whose own imports of the primary
entry point go through the package name, not a relative path — a relative one
would bundle a second copy of the renderer, with its own DI tokens. Its specs
need the explicit `include` in that project's `test.options`: the builder
resolves those globs against `sourceRoot`, so a spec outside `src` is invisible
without the `../testing/...` pattern, and it fails silently — the run just
reports fewer tests.

`ngx-json-render/devtools` (sources in `projects/ngx-json-render/devtools/src`)
is built the same way and needs the same `../devtools/...` patterns. It mounts
upstream's `@json-render/devtools` panel, an optional peer and a workspace
devDependency, and fills the Stream tab from `ɵregisterStreamObserver`, a
private hook in the primary entry point that `injectUIStream` and
`injectChatUI` call. `@json-render/devtools` pins `@json-render/core` exactly,
so it moves in lockstep with core: whenever core is reinstalled at another
version (`core-compat`, the canary, a core bump), devtools goes with it.

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

Formatting is checked, whatever the row: CI's first gate is
`npm run format:check` (`prettier --check .`), and a misformatted file turns
the whole run red and skips the demo deploy. Before handing over a commit,
check the tracked files the way CI sees them:
`git ls-files -z | xargs -0 npx prettier --check --ignore-unknown` (fix with
`npx prettier --write <file>`). A plain local `npm run format:check` also
reads gitignored `*.local*` files and other sessions' uncommitted edits, which
CI never sees, so its noise is not a signal.

| Changed area                                               | Commands                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projects/ngx-json-render`                                 | `npm run build:lib` then `npx ng test ngx-json-render --coverage`; when the public API changed, also `npm run build:material` and `npx ng build demo`                                                                                                                                        |
| `projects/ngx-json-render-material`                        | `npm run build:lib`, then `npm run build:material` — the build type-checks every catalog template — and `npm run test:material`                                                                                                                                                              |
| `projects/demo`                                            | `npm run build:lib` **and** `npm run build:material` — the demo's playground renders the Material catalog — then `npx ng test demo --coverage` and `npx ng build demo`. A stale `dist/` hides a missing build step locally; CI starts empty                                                  |
| Public API, exports or the JSON spec/contract              | The full `npm run build` and `npm test`, plus a read of the affected `README.md` — a contract change that the docs still describe the old way is not done                                                                                                                                    |
| `package.json`, `package-lock.json`, Angular version       | `npm ci` then the full `npm run build` and `npm test`; for an Angular-version change, a new dev dependency, or a new `test.options` key in `angular.json`, also run the `angular-compat` job's own steps in a throwaway checkout, and `scripts/consumer-smoke.mjs` for 19 and 22 — see below |
| `@json-render/core` version or its peer range              | `npm ci`, then the full `npm run build` and `npm test` on the version the workspace pins, then the `core-compat` steps at the floor of the range — see below                                                                                                                                 |
| `.github/workflows/**`, release config                     | Read the workflow diff against the matching `npm run` script; releases are tag-driven (a manual `workflow_dispatch` run creates the tag itself) and publish to npm — never trigger one as verification; `core-canary.yml` may be dispatched by hand, it only reads and files issues          |
| `projects/*/schematics/**`, `scripts/build-schematics.mjs` | `npm run build:lib` and `npm run build:material` (each compiles its package's schematic into `dist/`), then `npm run test:schematics`; for a change in what `ng add` installs, also the end-to-end run below and `node scripts/ng-add-smoke.mjs 20`                                          |
| `skills/**`                                                | `npm run build:lib` and `npm run build:material`, then `npm run check:skills` — every `ts` block in a skill is compiled against the builds; then `npm run sync:plugin` and `npm run check:plugin`; see below                                                                                 |
| Docs only (`README.md`, `docs/**`)                         | `git diff --check` and a link check; no build needed                                                                                                                                                                                                                                         |

Coverage: each project declares `coverageThresholds` in `angular.json`,
scoped to its own sources by `coverageInclude`. They are only enforced when
coverage is collected, which is why the test commands above pass `--coverage`
and why `npm test` does too — run `ng test` without it and a regression passes
silently. `npm run test:material` always collects it: the catalog's runner is
killed before the builder's own threshold check would run, so
`scripts/run-material-tests.mjs` reads the thresholds out of `angular.json`
and checks them itself. Raise a threshold when a suite clears it with room;
never lower one to make a red build green.

Skills: `npm run check:skills` (`scripts/check-skill-snippets.mjs`) compiles
every `ts` block in `skills/*/SKILL.md` with ngc, templates included, against
`dist/`, because an agent reads the skill instead of the README and a snippet
that no longer compiles teaches the wrong API. Each block becomes its own
module under `dist/skill-check/`; a block may use what an earlier block in the
same skill declared at top level (`catalog`, `registry`, a component class)
without importing it, and relative imports such as `./catalog` are dropped for
the same reason — the stitcher (`scripts/lib/skill-snippets.mjs`, tested under
`npm run test:scripts`) adds the import from the earlier block. A block that is
an excerpt rather than a module — a server route for another process, a test
fragment with free variables — carries `fragment` in its info string
(` ```ts fragment `) and is skipped; keep those few. Errors are reported
against the skill file and line. CI runs it after both builds.

Plugin: `plugins/ngx-json-render` is the Claude Code plugin that Anthropic's
plugin directory installs, listed by `.claude-plugin/marketplace.json`. The
directory installs only that folder and refuses symbolic links, so it holds
copies of `skills/*` and the root `LICENSE`. `skills/` stays the source:
edit there, then `npm run sync:plugin` (`scripts/sync-plugin.mjs`) rewrites
the copies, removes skills that no longer exist, and sets the plugin's version
to the renderer's. A renderer version bump therefore needs a sync in the same
commit; `npm run check:plugin`, which CI runs, fails on any drift. The
directory wants the version raised on every update, which tying it to the
renderer's release gives for free.

`ng add`: each published package ships an `ng-add` schematic, sources in
`projects/<package>/schematics`, compiled by `scripts/build-schematics.mjs` into
`dist/<package>/schematics` after ng-packagr (which cleans `dist/<package>`
first, so `build:lib` and `build:material` run both). They are `.cts` and
compile to `.cjs`: ng-packagr marks the package `"type": "module"`, the CLI
loads schematics with `require`, and `npm pack` drops a nested
`{ "type": "commonjs" }` package.json, so that fix does not survive publishing.
The schematics add each package's peers at the ranges its own manifest
declares, read at run time, so a peer range change needs no schematic change.
`npm run test:schematics` runs them against a workspace `@schematics/angular`
generates. What it cannot show is npm's resolution: the catalog's
`@angular/cdk` and `@angular/material` peers are optional
(`peerDependenciesMeta`) because npm auto-installs a required `>=20.0.0` peer
at its newest major, which on an Angular 21 app ERESOLVEs before the
schematic ever runs. The end-to-end check, in the scratchpad: `ng new` an app
with the Angular line the workspace pins, `npm pack` both `dist/` folders,
`ng add` each tarball, and build the app with the README's Material example.

The renderer's `ngx-json-render:mcp-app` builder lives in the same folder
(`schematics/builders.json`, `schematics/mcp-app-builder`) for the same reason:
Architect loads builders with `require` too, so it is `.cts` built by the same
script. `test:schematics` covers its inliner; the builder as a whole runs in
`npm run build:mcp-app`, where `angular.json` names it by path
(`./dist/ngx-json-render:mcp-app`) because this workspace does not install its
own package. A change to it is checked like a schematic change plus
`npm run build:mcp-app`. The `mcp-app` schematic (`schematics/mcp-app`), which
generates a view project, its server and the target, is checked end to end in
the scratchpad: `ng new`, install the packed `dist/ngx-json-render` (and
`dist/ngx-json-render-material` for the Material mode), `ng generate
ngx-json-render:mcp-app`, `ng run <name>:mcp`, then list the tools of
`node dist/<name>/server.mjs` and open `--http` in ext-apps' basic-host.

Formatting: `npm run format:check` (config in `.prettierrc`, exclusions in
`.prettierignore`). CI runs it, so a failure is something you introduced;
`npm run format` fixes it. Note `embeddedLanguageFormatting` is off on
purpose: Prettier otherwise reformats inline `template:` and `styles:`
blocks, and splitting a `mat-icon` interpolation across lines changes the
ligature text the icon renders.

Zoneless: `npm run check:zoneless` (`scripts/check-zoneless.mjs`) asserts the
property both READMEs now claim outright — no `zone.js` in any manifest, no
`NgZone` in any source, every TestBed suite explicitly under
`provideZonelessChangeDetection()`, and neither reference in the built
bundles. Nothing else fails on an `NgZone` import, and a suite that forgets
the provider still passes, so the guarantee could otherwise erode with every
check green. Run it after the library builds — the bundle half is skipped
(with a note) when `dist/` is empty, which is why CI places it after both.

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
omitted the release.

Its severity is asymmetric on purpose, and the asymmetry is finer than it
first looks. The package must install as **itself, on its own** — always
fatal, since no later release repairs a publish that did not take. Installed
**alongside its siblings** it must still resolve to itself, and a downgrade
there is fatal _unless this very commit already carries the sibling that
repairs it_: ahead of what npm serves, and declaring a peer range that admits
the version just published. Whichever package publishes first necessarily
sees the incoherent pair, so calling that fatal painted two correct releases
red — `material-v0.3.0` and then `v0.4.0`, once in each direction — which is
how a check stops being believed. When the sibling on disk is as stale as the
one on npm, nothing is pending and the pair is broken for good; that is the
case the check still has to catch. An out-of-date sibling that did not cause
a downgrade is fatal only on the catalog's release, since it ships second.

That decision lives in `scripts/lib/resolution-verdict.mjs`, apart from the
npm calls so it can be tested without a registry, and `npm run test:scripts`
covers it against the releases this repository has actually performed. CI runs
it beside `check:peers`. Change the severity rules there, not in the message
strings.

Known caveat, handled by the runner script: `ng test ngx-json-render-material`
passes but the runner process does not exit (see
`projects/ngx-json-render-material/README.md` for what has been ruled out).
Always invoke it as `npm run test:material`, which goes through
`scripts/run-material-tests.mjs` and exits on the reported results. Do not call
the raw `ng test` for that project — it will hang — and do not chase the
underlying runner defect as a side quest.

The `angular-compat` CI job proves the renderer's `>=19` peer range at both
ends: the library builds on Angular 19, the floor it promises, and builds and
passes on 20 and on 22, the newest line a consumer can be on. (The workspace
itself pins 21, which the main job covers.) On 19 the job builds the renderer
only: Angular 19's CLI has no `@angular/build:unit-test` builder, and the
Material catalog keeps a `>=20` floor of its own — it uses Material 20's
`matButton`/`matIconButton` API and `appearance="filled"` cards. `scripts/angular-compat.mjs` rewrites `package.json` and
`angular.json` to the target line, so anything version-coupled has to be
mirrored there or the job breaks on a change that looks unrelated to Angular.
Three kinds have bitten:

- a dev dependency whose major is tied to another's — `@vitest/coverage-v8`
  peers on its own `vitest` major, so pinning one and not the other turns
  one ERESOLVE into the next;
- a peer on an exact TypeScript minor — Angular 22 wants `>=6.0 <6.1`, so the
  workspace's own `~5.9` pin ERESOLVEs before a single file is compiled; each
  target line gets its own `typescript` pin in the script;
- a builder option that only exists in v21 — the v20 schema rejects unknown
  keys outright rather than ignoring them, which is why the script deletes
  the `coverage*` options it finds in `test.options`;
- a builder option that became optional later — the v19 ng-packagr builder
  requires `project`, which the script adds for that line only.

Verify it the way CI runs it, in a throwaway checkout — the script rewrites
the workspace, so never run it in the user's working tree:

    git clone --depth 1 file://"$PWD" /tmp/compat20 && cd /tmp/compat20
    node scripts/angular-compat.mjs 20 && npm install --no-audit --no-fund
    npx ng build ngx-json-render && npx ng test ngx-json-render
    npx ng build ngx-json-render-material

Repeat with `19` and `22` in further checkouts; the matrix runs all three
and a change can break one line without touching the others. On `19` stop
after `npx ng build ngx-json-render`, as the job does.

Run all of it, not just the install: the job stops at the first failing step,
so a later break stays invisible until the earlier one is fixed. The job
deliberately tests without `--coverage`; thresholds belong to the main job,
which runs on the version the workspace actually pins.

The `consumer-smoke` CI job covers what `angular-compat` cannot: the package
as it ships. `scripts/consumer-smoke.mjs <major>` packs `dist/ngx-json-render`
(built on the pinned line), installs it into a fresh app on the target line,
builds that app with `strictTemplates` and `skipLibCheck: false`, and drives
it in Chrome (render, `setState`, visibility, `repeat`, `pushState`). It is the
only runtime evidence for Angular 19. It caught the first real break of the
range: the published `.d.ts` named `DestroyableInjector`, a type Angular 20
added, because two `Injector.create` results were left to inference. Keep
public and protected members that hold Angular values explicitly typed with
types the floor exports. Run it after `npm run build:lib`, with
`CHROMIUM_PATH` pointing at a Chrome or Chromium binary; Angular 22's CLI
needs Node 22.22.3 or newer.

The `ng-add-smoke` CI job (`scripts/ng-add-smoke.mjs <major>`, Angular 20)
takes the README's path instead: `ng new`, `ng add` of the packed
`dist/ngx-json-render`, `ng generate ngx-json-render:mcp-app`, `ng run
mcp-app:mcp`, then the generated server over stdio must list `render-ui`.
`consumer-smoke` pins every dependency itself, so it cannot see what `ng add`
installs next to the CLI's own: on Angular 20 the CLI hoists zod 4.1.13, and
until 0.9.8 `ng add` wrote `zod@^4.0.0`, which kept it, while
`@json-render/core` nested its own zod and catalog schemas stopped
type-checking. Run it after `npm run build:lib`; it needs network for `ng new`.

The `core-compat` CI job proves the floor of the `@json-render/core` peer range
the way `angular-compat` proves the Angular floor. The workspace pins the newest
core the packages admit, so the main job and its coverage thresholds run against
that end; the job reinstalls `@json-render/core` and `@json-render/directives`
at the floor with `npm install --no-save` (manifests and lockfile untouched) and
builds and tests both libraries. It exists because upstream ships a core minor
every two or three weeks and a 0.x caret stops below the next minor: `^0.20.0`
shipped in 0.7.1, and once core 0.21 was out it ERESOLVEd for anyone already on
0.21 and silently resolved core _down_ on a fresh install. When core publishes
a new minor: move the workspace (`npm install @json-render/core@^0.x` and the
same for `@json-render/directives` and `@json-render/devtools`), widen the
peer range in **both** package manifests to `>=0.20.0 <0.(x+1).0` (the
`@json-render/devtools` peer of `ngx-json-render` too), keep the floor in the
matrix, and release both packages. Locally, the job's steps are

    npm install --no-save @json-render/core@0.20 @json-render/directives@0.20 @json-render/devtools@0.20
    npm run build:lib && npx ng test ngx-json-render
    npm run build:material && npm run test:material
    npm ci   # back to the lockfile

`core-canary.yml` is the other half of that: `core-compat` proves the floor of
the range on every push, the canary proves the newest published core against
`main` every night (`npm install --no-save @json-render/core@latest
@json-render/directives@latest @json-render/devtools@latest`, then the same
build and test steps). When the newest core is outside the admitted range, or
the suite fails against it, the run goes red and `scripts/core-canary-report.sh` opens one issue per core
version, labelled `core-canary`, with the outcome and the procedure above; the
first green run afterwards closes it. The decision logic is a script so that
`scripts/lib/core-canary-report.test.mjs` can dry-run it with a stubbed `gh`
under `npm run test:scripts`. A red canary is a to-do, not a broken build:
nothing on `main` changed.

Deployment: pushing to `main` deploys the demo to GitHub Pages via
`.github/workflows/ci.yml`. Treat `main` as deployed state.
