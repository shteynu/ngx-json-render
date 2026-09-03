# Render limits: make the security section something the API enforces

## Metadata

- Branch: `claude/ngx-json-render-security-limits-pdlzee`
- Base branch: `main`
- Base commit: `c752213`
- Landed as: `b0fa27b` and `c4cc9ce` on `main` — the branch was fast-forwarded
- Status: done, verified, merged into `main`
- Last updated: 2026-09-03
- Last agent/tool: Claude Code

## Objective

The README's Security section tells the reader that a spec "sizes its own
render tree" and to "cap spec size and array lengths at the boundary where you
accept one" — advice the library gave no API for taking. Close that gap with an
enforced limits layer, and fix the crash found while surveying it.

## User-visible outcome

`<json-render [renderLimits]="{ maxElements: 500, maxDepth: 16, maxRepeatItems: 200 }">`
caps what a spec can cost the browser, and a cyclic spec degrades instead of
killing the tab. `validate="strict"` plus a `catalog` is one pipeline:
structure, limits and component types all refuse the same way.

## Context

Survey of the library at `c752213`, before any change:

- `validate` (`off | warn | strict`) existed and wrapped core's `autoFixSpec` +
  `validateSpec`. Structural only.
- **No limits of any kind.** No element count, no depth, no repeat cap.
- **Cycle detection was absent and the renderer crashed on a cycle.** Measured
  in a throwaway spec at `c752213`: `a → children [b]`, `b → children [a]`.

  | Probe                                          | Result                                    |
  | ---------------------------------------------- | ----------------------------------------- |
  | `validateSpec(cyclic, { checkOrphans: true })` | `{ valid: true, issues: [] }`             |
  | renderer, `validate="off"`                     | `RangeError: Maximum call stack exceeded` |
  | renderer, `validate="strict"`                  | same `RangeError` — strict did not help   |

  143 elements rendered before the stack blew. This is the library bug
  `feat--playground-bad-generation` reserved as its own task: "If the
  recording turns up a case where it throws rather than degrades, that is a
  library bug and its own task."

- Catalog validation lived only in the demo (`spec-check.ts` checked each
  element `type` against `catalog.componentNames`). `feat--validated-streaming`
  listed it as a non-goal: "Catalog-level validation … is a separate finding."

## Non-goals

- Defaults. Every limit is opt-in; only cycle breaking is unconditional,
  because it is a crash guard rather than a policy.
- A reporting channel for render-time breaches (`maxDepth`, `maxRepeatItems`
  truncation). Console warnings only — an output or signal for them is its own
  design.
- Sanitising prop values, action allow-lists, navigation allow-lists. The
  README already assigns those to the app and nothing here changes that.

## Decisions made

- **Cycle breaking is unconditional** — independent of `validate` and of
  `loading`. A crash is not a validation opinion. A partial spec is a subset of
  the final one, and a subset of an acyclic graph is acyclic, so running it
  mid-stream cannot produce a false positive.
- **The cycle rule is "renders itself without reading any deeper", not "is its
  own descendant".** Found by adversarial review of the first implementation,
  which would have broken a legitimate pattern. Drawing a tree — a comment
  thread, a file browser, a nested menu — _is_ an element rendering itself, and
  it terminates because each pass repeats over a path relative to the item it
  is already inside. `JrElement` therefore compares against the nearest
  occurrence of its own key above it and allows the pass only when the repeat's
  resolved state path descended: `/tree/0` → `/tree/0/children/1` walks down,
  `/items/0` → `/items/1` does not.
- **A same-key/same-item test was not enough.** The second implementation
  compared scope identity, which allowed every _ordering_ of a fixed array: a
  spec repeating over 8 items inside itself drew 8! subtrees instead of
  crashing — bounded, but still a denial of service. The prefix test replaced
  it; the 8-item spec now draws 9 boxes, which is what the test pins.
- **Break the cycle, do not refuse the spec.** Matches the renderer's existing
  tolerance (unknown type warns and renders nothing; a missing root yields
  null). Everything above the repetition still renders.
- **Enforcement is separate from `validate`.** Limits apply whenever they are
  set, in any mode; `validate` governs structural reporting and strict refusal.
  A limit an app set is a control, not advice.
- **`maxElements` refuses the whole spec; `maxDepth` and `maxRepeatItems`
  truncate.** Element count is a whole-spec property with no sensible partial
  answer; the other two are positional and truncate where they are hit.
- **The cheap caps run before the structural check.** Core's `validateSpec`
  recurses over the tree, so the specs that most need a limit are the ones that
  would overflow the stack proving they exceed it. `checkSpec` counts elements
  first, then measures depth with its own iterative walk, and only then hands
  the spec to `autoFixSpec`/`validateSpec`. Safe because the lossless fixes
  only relocate fields inside `props` and never touch `children` or `slots`.
- **Limits are opt-in with no defaults.** Any default would change what an
  existing app renders on upgrade, and no single number is right for every
  catalog.

## Completed

- `render-limits.ts` (new) — `RenderLimits`, the widened `SpecCheckIssue` /
  `SpecCheckIssueCode`, the structural `SpecCatalog`, the iterative graph walk
  (`analyseSpecGraph`), the issue constructors and `catalogIssues`.
- `spec-validation.ts` — `checkSpec(spec, mode, options)` with limits and
  catalog, the safe check ordering, the new `blocked` flag, and
  `formatSpecCheckIssues` (core's `formatSpecIssues` drops warnings and cannot
  type the new codes).
- `element.component.ts` — `RENDER_PATH` ancestry, the cycle refusal and
  `maxDepth`, each warned once with the path that caused it.
- `children.component.ts` — `maxRepeatItems`, applied as the repeat expands.
- `renderer.component.ts` — `[renderLimits]` and `[catalog]` inputs; `rootKey`
  honours `blocked`; the report effect stays silent while `loading`.
- `tokens.ts`, `types.ts` (`RenderPath`), `root-context.ts`, `public-api.ts`.
- Both streaming hooks — `renderLimits` / `catalog` options, widened `issues()`,
  and a limit failing the generation in any mode.
- 42 tests in `render-limits.spec.ts`, 2 in `streaming.spec.ts`; README's
  Security section, a new "Capping what a spec may cost" section, the inputs
  table and the API surface list.
- Second commit, from the security review: a refused element no longer wires
  its `watch`. `watch` is the only thing an element does without being on
  screen, so leaving it live let an element past `maxDepth`, or the one closing
  a cycle, keep dispatching actions from behind the cap. The effect reads
  `refusal()`, so lifting a cap re-wires it — pinned by a test.

## Remaining

Nothing required. Optional follow-ups, none of them blocking:

- A `(specRefused)` output or signal so an app can surface truncation without
  reading the console.
- Teaching the demo's playground to set limits, which would show the feature.

## Changed files

15 files: `render-limits.ts` and `render-limits.spec.ts` new; `README.md`,
`children.component.ts`, `element.component.ts`, `renderer.component.ts`,
`root-context.ts`, `spec-validation.ts`, `streaming.spec.ts`,
`streaming/chat-ui.ts`, `streaming/ui-stream.ts`, `tokens.ts`, `types.ts`,
`public-api.ts` modified, plus this task file.

## Verification evidence

### Passed

- `npm run format:check` — exit 0.
- `npm run build` — exit 0 (renderer, catalog and demo; the builds are this
  workspace's typecheck).
- `npm test` — exit 0. 268 renderer, 58 demo, 65 material. Coverage over every
  declared threshold: renderer 95.88 / 89.54 / 94.86 / 97.09 against 94 / 88 /
  92 / 96.
- `npm run check:zoneless` — exit 0; 70 sources, 16 TestBed suites, 3 bundles.
- `npm run check:peers` — exit 0.
- `git diff --cached --check` — exit 0.
- The original crash, pinned as a test: a two-element cycle now renders two
  boxes instead of raising `RangeError`, in `off`, `strict` and mid-stream.
- `/security-review` over `origin/HEAD...` — no HIGH or MEDIUM findings. It
  modelled the cycle guard against core's own path resolvers and could not
  build unbounded recursion: every allowed re-entry must satisfy
  `inner.startsWith(outer + "/")`, so the scope chain strictly lengthens, and
  state is JSON and therefore finite. Separator collisions in state keys make
  the two paths _equal_ rather than prefix-extending, so they add refusals
  rather than bypasses. Slots increment depth like children; `maxElements`
  blocks mid-stream because only reporting is suppressed while `loading`.
  Its one behavioural note — the still-wired `watch` — is fixed in the second
  commit.

### Failed

None outstanding. Two failures during development, both fixed and pinned:

- The first cycle rule refused a legitimate recursive tree.
- The second bounded a self-repeating spec at `k!` subtrees rather than at its
  depth.

### Blocked or not run

- `scripts/angular-compat.mjs` (Angular 20 / 22 matrix). Run before the merge,
  in throwaway checkouts, because CI only fires on `main` and on pull requests
  — so on a branch there was nothing to catch a break before it landed. Both
  lines passed the job's own steps in full: install, build library, 268 tests,
  build Material catalog. Angular 22 needed a newer Node than the session
  container carried (v22.22.2 against the CLI's v22.22.3 floor), which is a
  property of the container and not of the change; 22.23.2 was fetched to run
  it. CI then confirmed both on `main`.
- `npm run check:published`. Not applicable: it inspects the public registry
  after a release, and nothing is released here.
- No runtime smoke in a browser. The renderer changes are covered by TestBed
  suites that assert real DOM output; the demo's playground does not yet set
  limits, so there is nothing new to click through.

### Environment

Local, on the session container. Node/npm from the repo's own `npm ci`.

### Residual risk

- A spec with no `maxDepth` set and absurd nesting can still overflow core's
  recursive `validateSpec` when `validate` is on. Documented in the README as
  the reason to set `maxDepth` for specs you did not generate; fixing it
  properly belongs in `@json-render/core`.
- `SpecCheckIssue` widens core's closed `SpecIssue['code']` union, so a
  consumer doing an exhaustive `switch` over `issues()` stops compiling. A
  type-level break only, acceptable in a 0.x minor, and `formatSpecCheckIssues`
  is the drop-in for `formatSpecIssues`.
- Depth reported by the static walk is a lower bound once a cycle is cut
  (`depthBelow` is memoised, and which edge closes a cycle depends on discovery
  order). The cycle itself is reported as an error, which is the actionable
  finding.

## Next concrete step

None. The work is in `main` and CI is green there — `build-and-test` plus both
compatibility jobs — and the demo redeployed to Pages from that commit.

The two optional follow-ups under `Remaining` are unclaimed, neither blocking:
a `(specRefused)` output so an app can surface truncation without reading the
console, and teaching the demo's playground to set limits.
