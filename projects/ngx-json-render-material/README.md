# ngx-json-render-material

[![npm](https://img.shields.io/npm/v/ngx-json-render-material)](https://www.npmjs.com/package/ngx-json-render-material) [![CI](https://github.com/shteynu/ngx-json-render/actions/workflows/ci.yml/badge.svg)](https://github.com/shteynu/ngx-json-render/actions/workflows/ci.yml) [![license](https://img.shields.io/npm/l/ngx-json-render-material)](https://github.com/shteynu/ngx-json-render/blob/main/LICENSE)

Angular Material catalog for [`ngx-json-render`](https://www.npmjs.com/package/ngx-json-render) — a ready-made component vocabulary for generative UI in Angular, which an LLM can generate screens against, so you don't have to write one before your first generated screen.

`ngx-json-render` gives you the renderer. This gives you the 30 components it renders.

## Install

```bash
ng add ngx-json-render-material
```

That adds the renderer, `@json-render/core` and `zod` at the ranges this
package admits, and — when the workspace has no Angular Material yet — adds
Material at your Angular version and runs Material's own `ng add`, which sets
up the theme, typography and icon font the components need. A workspace that
already has Material keeps its setup as it is.

Or by hand — pin Material to your Angular major (`@angular/material@21` on
Angular 21): a bare `@angular/material` resolves to the newest major, whose
peers reject an older Angular with `ERESOLVE`.

```bash
npm install ngx-json-render-material ngx-json-render @json-render/core zod @angular/material@<your Angular major>
```

Requires Angular ≥ 20 and `@json-render/core` 0.20 or 0.21. Installed by hand,
your app needs a Material theme and the icon font as usual — see
[Angular Material theming](https://material.angular.dev/guide/theming).

Bundle size: Angular Material and `zod` put a new app's initial bundle at
about 1.3 MB raw (≈250 kB transferred), which is over the 1 MB error budget
`ng new` writes into `angular.json`. Raise `maximumError` there, or render
specs in a lazy-loaded route.

## Agent skill

Using an AI coding agent (Claude Code, Cursor, Codex, …)? Install the skill
that teaches it this catalog — every component, its props, its events and the
validation contract — so the specs and overrides it writes match what ships:

```bash
npx skills add shteynu/ngx-json-render --skill ngx-json-render-material
```

The source is [`skills/ngx-json-render-material/SKILL.md`](https://github.com/shteynu/ngx-json-render/blob/main/skills/ngx-json-render-material/SKILL.md);
the renderer's skill is `--skill ngx-json-render`.

## Use

```ts
import { Component } from '@angular/core';
import { JsonRenderer } from 'ngx-json-render';
import { materialRegistry } from 'ngx-json-render-material';

@Component({
  imports: [JsonRenderer],
  template: `<json-render [spec]="spec" [registry]="registry" />`,
})
export class AppComponent {
  readonly registry = materialRegistry;
  readonly spec = {
    root: 'card',
    elements: {
      card: { type: 'Card', props: { title: 'Revenue' }, children: ['total'] },
      total: { type: 'Metric', props: { label: 'Q3', value: '$1.2M', delta: '+8%', trend: 'up' }, children: [] },
    },
  };
}
```

To generate specs, feed the catalog's prompt to the model:

```ts
import { materialCatalog } from 'ngx-json-render-material';

const systemPrompt = materialCatalog.prompt();
```

On a server, import it from `ngx-json-render-material/catalog` instead. That entry point holds the catalog without the components, so it loads no Angular, and plain Node or an edge function can describe the vocabulary to a model and validate what comes back:

```ts
import { materialCatalog } from 'ngx-json-render-material/catalog';
```

## Components

| Group        | Components                                                                                                             |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Layout       | `Stack`, `Grid`, `Card`, `Toolbar`, `ExpansionPanel`, `Tabs`, `Tab`, `Divider`                                         |
| Typography   | `Heading`, `Text`, `Icon`, `Image`                                                                                     |
| Data display | `Metric`, `Chip`, `List`, `ListItem`, `Table`                                                                          |
| Forms        | `Button`, `IconButton`, `Input`, `Textarea`, `Select`, `DatePicker`, `Checkbox`, `RadioGroup`, `SlideToggle`, `Slider` |
| Feedback     | `ProgressBar`, `Spinner`, `Callout`                                                                                    |

Props are named for what they mean, not for Material's API (`variant`, not `mat-raised-button`), so a spec written against this catalog stays portable to the other json-render renderers — and a model that has never seen Angular Material can still target it.

Two-way binding works as it does everywhere else in `ngx-json-render`: bind `value` or `checked` with `{"$bindState": "/path"}`, or `{"$bindItem": "field"}` inside a `repeat`.

```json
{ "type": "Input", "props": { "label": "Name", "value": { "$bindState": "/name" } }, "children": [] }
```

The catalog declares no custom actions — the built-in `setState`, `pushState`, `removeState`, `validateForm` and `submitForm` cover it — so `materialRegistry` renders a spec with nothing else wired up.

## Validation

`Input`, `Textarea`, `Select`, `DatePicker`, `Checkbox` and `RadioGroup` take a
`validation` prop. The checks run against the state path the field's value is bound to, so
**validation applies only to a bound field** — a literal `value` has no path to
validate and the config is ignored.

```json
{
  "type": "Input",
  "props": {
    "label": "Email",
    "value": { "$bindState": "/email" },
    "validation": {
      "checks": [
        { "type": "required", "message": "Email is required" },
        { "type": "email", "message": "That is not an email address" }
      ],
      "validateOn": "blur"
    }
  },
  "children": []
}
```

Check types: `required`, `requiredIf`, `email`, `url`, `numeric`, `minLength`,
`maxLength`, `pattern`, `min`, `max`, `matches`, `equalTo`, `lessThan`,
`greaterThan`. Arguments go in `args`, and may reference state:

```json
{ "type": "minLength", "args": { "min": 8 }, "message": "At least 8 characters" }
{ "type": "equalTo", "args": { "other": { "$state": "/password" } }, "message": "Passwords must match" }
```

`validateOn` is `"change"`, `"blur"` or `"submit"`. It defaults to `"blur"` for
`Input` and `Textarea` — validating on every keystroke is noisy — and to
`"change"` for `Select`, `DatePicker`, `Checkbox` and `RadioGroup`, where a
change is a deliberate choice. `enabled` takes a visibility condition and switches the
whole config off when it is false.

The built-in `validateForm` action validates every bound field at once,
regardless of `validateOn`, and writes the outcome to `/formValidation` (or the
`statePath` you pass):

```json
{ "type": "Button", "props": { "label": "Save" },
  "on": { "press": { "action": "validateForm" } }, "children": [] }
```

```jsonc
// /formValidation after a failed submit
{ "valid": false, "errors": { "/email": ["Email is required"] } }
```

`submitForm` does the same check and then dispatches your own action, but only
if every field passed — one binding instead of a validation the button cannot
act on:

```json
{ "type": "Button", "props": { "label": "Save" },
  "on": { "press": { "action": "submitForm", "params": { "action": "saveUser" } } },
  "children": [] }
```

Errors appear in the Material form field's subscript (`<mat-error>`) for
`Input`, `Textarea`, `Select` and `DatePicker`, and on their own line under `Checkbox` and
`RadioGroup`, which have no form field to host one.

Two things worth knowing:

- On `Input`, the `required` prop only draws the asterisk. Enforcement comes
  from a `required` check in `validation` — which also draws the asterisk, so
  in practice you only need `validation`.
- `required` rejects `null`, `undefined`, empty strings and empty arrays, but
  **not** `false`. For a checkbox that must be ticked, use
  `{ "type": "equalTo", "args": { "other": true }, "message": "…" }`.

## Overriding a component

`materialComponents` is the plain catalog-name → component map, so swapping one entry keeps the rest:

```ts
import { defineRegistry } from 'ngx-json-render';
import { materialCatalog, materialComponents } from 'ngx-json-render-material';
import { BrandedCard } from './branded-card';

export const { registry } = defineRegistry(materialCatalog, {
  components: { ...materialComponents, Card: BrandedCard },
  actions: {},
});
```

Type the replacement's props with `MaterialProps`, so they are the ones the catalog declares for that component — every field optional, because the renderer checks them against the schema only when `validate` is on:

```ts
export class BrandedCard {
  readonly ctx = injectRenderContext<MaterialProps<'Card'>>();
}
```

## Notes

- `Tabs` discovers its tabs from `Tab` children in the spec rather than through `@ContentChildren`, which a spec-driven tree cannot satisfy. Each `Tab` hands its label and body to the parent, which replays them into real `<mat-tab>` elements.
- `DatePicker` keeps its date in state as a `"YYYY-MM-DD"` string, and so do
  `min` and `max`; clearing the field writes `""`. ISO dates compare correctly
  as strings, so an end date after a start date is a `greaterThan` check with
  `{ "other": { "$state": "/start" } }`. It uses the app's `DateAdapter` and
  `MAT_DATE_FORMATS` when the app provides them (`provideLuxonDateAdapter()`,
  `provideDateFnsAdapter()`, a `MAT_DATE_LOCALE`), and the native `Date`
  adapter otherwise, so it needs no provider of its own.
- `Table` takes `columns` and `rows` as props. Bind `rows` to a state array with `{"$state": "/path"}` rather than using `repeat`.
- `Image` renders only an absolute `https:` URL and nothing for any other `src` — `javascript:`, `data:`, `http:` and relative URLs included. The schema says so too, so `checkSpec` reports such a `src`; the component checks again at render time, because a `src` bound to `$state` is only known then. It sends no referrer. `alt` is required; `""` marks a decorative image.
- `List` requires `ListItem` children, and `Tabs` requires `Tab` children; the catalog descriptions say so, and the prompt carries them through to the model.

## Known issue: the test runner does not exit

`ng test ngx-json-render-material` runs the suite correctly — 12/12 pass in well
under a second — but the process then stays alive instead of exiting. This is a
defect in the `@angular/build:unit-test` + Vitest combination, not in the
catalog: the test worker is clean when the suite ends (no pending timers, no
stray handles), and it is the runner process that lingers.

What the bisect actually shows, against Angular 21.2 and Vitest 4.1:

- a spec containing nothing but `expect(1).toBe(1)` hangs too, as long as the
  rest of the project's sources are on disk — so it is not what the tests _do_;
- importing `./form.components` reproduces it; `./layout.components`,
  `./content.components`, `./catalog` and `./registry`'s other dependencies do
  not;
- importing all nine Material form modules on their own exits cleanly;
- so does a file of nine plain components that use those modules in their
  templates;
- so does each of `JrmInput`, `JrmSelect` and `JrmSlider` on its own — which
  rules out the `effect()` + `viewChild()` pattern the inputs use, an earlier
  suspect here;
- `--watch=false` and `isolate: true` with either the `forks` or `threads` pool
  change nothing.

It looks like a threshold in the runner rather than any one API: only the whole
of `form.components.ts` trips it, and nothing smaller does.

The tests do run in CI. Because the results are complete and written out before
the process hangs, `npm run test:material` goes through
[`scripts/run-material-tests.mjs`](../../scripts/run-material-tests.mjs), which
asks Vitest for a JSON report, waits for the report rather than for the
process, kills the runner, and exits on what the report says. A failing test, a
build failure, an empty run and a suite that never finishes all fail the
command.

```bash
npm run test:material
```

## License

Apache-2.0
