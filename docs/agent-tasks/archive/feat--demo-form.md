# Demo: a support form recording

## Metadata

- Branch: feat/demo-form
- Base branch: main
- Base commit: 75af912
- Status: done, merged to main
- Last updated: 2026-10-09
- Last agent/tool: Claude Code

## Objective

A second showcase recording on the Streaming tab: a model-generated support
request form with field validation and a submit action. The sales dashboard
shows rendering; this one shows state and actions, so the devtools State
and Actions tabs have something to show and there is material for a second
clip.

## Plan

1. Demo catalog: `Input` gains `label`, `type` (`text` / `email`),
   `multiline` and `validation` (core's `ValidationConfigSchema`); a new app
   action `sendSupportRequest`.
2. `InputComponent` registers field validation through
   `injectFieldValidation`, validates on blur, and shows messages and a
   required marker.
3. Registry: `sendSupportRequest` simulates a request (short delay).
4. Recording `SUPPORT_FORM` as the second prompt: Submit runs `submitForm` →
   `sendSupportRequest`, `onSuccess` sets `/sent`, a confirmation card
   replaces the form.
5. Tests: the recording renders; submitting empty shows errors and sends
   nothing; a valid form sends once and shows the confirmation.

## Done

All five plan steps, plus:

- `Recording.hint`: a muted "try it" line shown once an interactive recording
  has finished. `note` stays the warning banner for flawed recordings.
- `--danger` token in `styles.scss`, light `#b3261e` / dark `#f2b8b5`.
- The Input shows only the first failing check's message, re-validates as
  an invalid field is corrected, and sets `aria-invalid`,
  `aria-describedby` and `aria-required`.
- Root README demo line mentions the form.

Fixed along the way: `viewChild.required` threw NG0951 once the control
moved inside `@if`; the query is optional now.

## Verification (2026-10-09)

- `npx ng test demo --coverage`: 73/73, 93.03/89.15/82.53/95 against
  thresholds 89/87/75/92.
- `npx ng build demo` (production) builds.
- Prettier is clean on the touched files.
- Browser (dev server), light and dark:
  - an empty submit shows three errors and sends nothing;
  - a valid form swaps in "Request sent" after the 600 ms pretend request;
  - the Interactive tab's inputs still work;
  - no console errors.

## Next concrete step

None: archived. The devtools clip of the form lives with the outreach
drafts (`docs/devtools-capture.local.mjs`).
