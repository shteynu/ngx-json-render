# The confirmation dialog: accessible, themeable, replaceable

## Metadata

- Branch: `feat/replaceable-confirm`
- Base branch: `main`
- Base commit: `9f2ea0d`
- Current HEAD: `a6c5b6d` on `main` — the branch was merged
- Status: done, verified, merged into `main`
- Last updated: 2026-09-01
- Last agent/tool: Claude Code (Opus 5)

## Objective

Close the audit's adoption blocker. The confirmation dialog was hardcoded into
the renderer with no input, no token and no registry hook, so not even this
project's own Material catalog could replace it — and the dialog it forced on
everyone had no `role="dialog"`, no `aria-modal`, no focus management and no
Escape, with inline light-theme colours and English button labels. Any team
with an accessibility requirement or a dark theme hit this on day one.

## User-visible outcome

The packaged dialog is a real modal for keyboard and screen-reader users, it
follows a dark theme, its two words can be translated, and a team that wants
its own design-system modal provides one component and is done.

## Decisions made

- **Three levels of control, cheapest first**: `JR_CONFIRM_LABELS` for the
  words, CSS custom properties for the colours, `JR_CONFIRM_DIALOG` for the
  whole component. Most teams stop at the first or second.
- **A replacement takes no inputs and emits no outputs.** It injects
  `CONFIRM_CONTEXT` (`config`, `confirm()`, `cancel()`) the way catalog
  components inject `RENDER_CONTEXT`. The seam stays one token wide instead of
  a component contract the renderer would have to bind against, and it matches
  an idiom this package already has.
- **A token, not a renderer input.** Which component answers a confirmation is
  an application-wide decision, not something that varies between two
  confirmations on one page. An input can be added later if a real case turns
  up; starting with both would be two knobs for one job.
- **Focus opens on Cancel.** A dialog exists to interrupt; landing on the
  destructive answer makes a stray Enter destructive.
- **Dark defaults ship**, through `prefers-color-scheme` on the fallback
  values, so the variables are for overriding rather than for making the
  dialog usable at all.

## Non-goals

- A general overlay/portal layer. The dialog still renders inline in the
  renderer's own DOM.
- CDK dependency for the focus trap. With exactly two buttons the trap is
  wrapping the ends, and `@angular/cdk` is not a dependency of this package.

## Verification

Ran from a clean `dist/` on 2026-08-31, all green:

- `npm run build` (both libraries + the demo app)
- `ng test ngx-json-render --coverage` — 180 passed, statements 94.71%
- `ng test demo --coverage` — 58 passed, statements 92.06%
- `npm run test:material` — 61/61 passed, statements 99.01%
- `npm run format:check`

Six of the 180 library tests are new and cover this change: the aria wiring,
initial focus on Cancel, focus restored to the trigger on close, Escape,
the Tab wrap, `JR_CONFIRM_LABELS`, and a replacement through
`JR_CONFIRM_DIALOG`.

## Next concrete step

None. The branch is merged into `main`.
