# Material catalog: DatePicker, Stepper, ToggleGroup, multiple Select

## Metadata

- Branch: main (committed directly, no feature branch)
- Base commit: 8653590
- Current HEAD: 687d8ac on main, in sync with origin/main
- Status: done; released as material-v0.3.13, material-v0.3.14, v0.9.2
- Last updated: 2026-10-10
- Last agent/tool: Claude Code

## Objective

Take what was useful from ng-render.dev (`@ng-render/angular`, abandoned
2026-02): the "generative UI" wording and a Material DatePicker. Then close
the most visible gaps in the Material catalog.

## User-visible outcome

- Docs, meta tags, package descriptions and the GitHub repo description
  lead with "generative UI for Angular".
- The Material catalog has 33 components: `DatePicker` (ISO `YYYY-MM-DD`
  state), `Stepper` + `Step` (Next validates its own step's fields),
  `ToggleGroup`, and `Select` with `multiple: true` (array state).
- The MCP App offers all 33 to the model.

## Decisions made

- DatePicker state is an ISO date string, not a `Date`; the adapter falls
  back to `NativeDateAdapter` when the app provides none (`skipSelf`).
- `Select` renders two `@if` branches, because `MatSelect` cannot change
  `multiple` after init; its `viewChild` is optional (NG0951 otherwise).
- Step validation goes through a `JrmStepFields` scope provided by `JrmStep`
  and reached through ng-template declaration DI; `injectJrmField` registers
  into it when present.
- `linear` steppers mark a step complete only after its Next passed.
- MCP App input schema went to 46 945 chars against the 45k budget; the
  shared validation hint is now stated once on `elements` instead of on
  every form field (about 44 000). The budget was not raised.

## Commits

72cb899, 9bbcce1, 2afd49f (material 0.3.13), 9d630a7, ca193b3,
d219cc0 (material 0.3.14), 687d8ac (0.9.2). Tags were set and pushed by
the user.

## Verification evidence

### Passed

- Material suite 99/99 (date picker, toggle group, multiple select,
  stepper suites with Material harnesses); mcp-app tests incl. the
  validation-hint dedupe test.
- CI on main green; release workflows for all three tags green;
  `check:published` OK after each release.
- Live MCP endpoint (Vercel auto-deploy of main) checked with curl: the
  tool lists the new components.

### Blocked or not run

- The Vercel MCP returned 403 for the project scope; deploy state was read
  from GitHub commit statuses instead.

## Known risks

- MCP App schema has about 1k chars of headroom to its 45k budget; the next
  validatable component will likely exceed it and needs another trim or a
  deliberate budget decision.
- Hosts cache the tool list: Claude and ChatGPT connectors show the new
  components only after a refresh.

## Next concrete step

None required. Optional: refresh the Claude/ChatGPT connector to see the new
components; future candidates are a TimePicker and code export.
