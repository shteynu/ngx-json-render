---
name: ngx-json-render-material
description: Angular Material catalog for ngx-json-render. Use when rendering json-render specs with Angular Material components, working with ngx-json-render-material, generating specs against the Material vocabulary, overriding or extending its components, or writing form validation into a spec.
---

# ngx-json-render-material

28 Angular Material components registered for `ngx-json-render`, plus the catalog that describes them to a model. Drop `materialRegistry` into `<json-render>`, feed `materialCatalog.prompt()` to the model, and a generated spec renders with nothing else wired up.

## Installation

```bash
ng add ngx-json-render-material
```

`ng add` adds the renderer, `@json-render/core`, `zod`, and — when the
workspace has none — Angular Material at the workspace's Angular version,
then runs Material's own `ng add` (theme, typography, icon font). Installing
by hand, pin Material to the Angular major (`@angular/material@21` on Angular
21); a bare `@angular/material` resolves to the newest major and `ERESOLVE`s.

Angular ≥ 20. These are real Material components: the app needs a Material theme and the Material Symbols icon font, as any Material app does (see [Angular Material theming](https://material.angular.dev/guide/theming)).

## Exports

| Export                    | Purpose                                                                                                                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `materialCatalog`         | The catalog: `.prompt()` is the system prompt, `.jsonSchema()` the structured-output schema, `.validate(spec)` the spec check. Also from `ngx-json-render-material/catalog`, with no Angular, for servers |
| `materialRegistry`        | Ready registry for `<json-render [registry]="materialRegistry">`                                                                                                                                          |
| `materialComponents`      | Catalog name → component map, to override single entries                                                                                                                                                  |
| `JrmCard`, `JrmButton`, … | The individual components (`Jrm` + catalog name)                                                                                                                                                          |
| `MaterialProps<'Card'>`   | Props of one catalog component, from its Zod schema with every field optional — type a replacement with it                                                                                                |
| `ThemeColor`              | `'primary' \| 'accent' \| 'warn'`                                                                                                                                                                         |

## Render a spec

```ts
import { Component, signal } from '@angular/core';
import { JsonRenderer, type Spec } from 'ngx-json-render';
import { materialRegistry } from 'ngx-json-render-material';

@Component({
  selector: 'app-root',
  imports: [JsonRenderer],
  template: `<json-render [spec]="spec()" [registry]="registry" />`,
})
export class App {
  readonly registry = materialRegistry;
  readonly spec = signal<Spec>({
    root: 'card',
    state: { name: '' },
    elements: {
      card: { type: 'Card', props: { title: 'Profile' }, children: ['name', 'hi'] },
      name: { type: 'Input', props: { label: 'Name', value: { $bindState: '/name' } }, children: [] },
      hi: {
        type: 'Text',
        props: { content: { $template: 'Hello, ${/name}!' } },
        visible: { $state: '/name', neq: '' },
        children: [],
      },
    },
  });
}
```

## Generate a spec

```ts
import { materialCatalog } from 'ngx-json-render-material';

const system = materialCatalog.prompt(); // vocabulary + spec grammar + patch protocol
```

Server side with the AI SDK: `streamText({ model, system: materialCatalog.prompt(), prompt })` and write `result.textStream` to the response as-is; it is SpecStream JSONL, which `injectUIStream` from `ngx-json-render` consumes (see the `ngx-json-render` skill). On a server, import the catalog from `ngx-json-render-material/catalog`: it has the catalog without the components and loads no Angular, so plain Node works with no extra setup.

## Components

Prop names are renderer-neutral (`variant`, not `mat-raised-button`), so a spec written against this catalog stays portable to the other json-render renderers. Every element needs a `children` array, `[]` for leaves. `color` is always a `ThemeColor`: `primary`, `accent` or `warn`.

### Layout

- **Stack** — `direction` (`vertical` | `horizontal`), `gap`, `padding`, `align` (`start` | `center` | `end` | `stretch`), `justify` (`start` | `center` | `between` | `end`), `wrap`. Slot `default`. The primary building block: use it for every group of elements.
- **Grid** — `columns` (1–6), `gap`. Slot `default`. Equal columns, one column on narrow screens.
- **Card** — `title`, `subtitle`, `appearance` (`outlined` | `raised` | `filled`). Slots `default` and `actions` (rendered as a footer button row).
- **Toolbar** — `title`, `color`. Slot `default`; children go to the trailing edge.
- **ExpansionPanel** — `title` (required), `description`, `expanded`. Slot `default`.
- **Tabs** — no props. Slot `default`; children MUST all be `Tab`.
- **Tab** — `label` (required). Slot `default`. Valid only as a direct child of `Tabs`.
- **Divider** — no props, no children.

### Typography

- **Heading** — `content` (required), `level` (1–3).
- **Text** — `content` (required), `tone` (`default` | `muted` | `strong`).
- **Icon** — `name` (a Material Symbols ligature such as `check_circle`), `color`.

### Data display

- **Metric** — `label`, `value` (string or number), `delta`, `trend` (`up` | `down` | `flat`). Put several in a `Grid` for a dashboard summary.
- **Chip** — `label`, `color`, `icon`.
- **List** — no props. Slot `default`; children MUST all be `ListItem`.
- **ListItem** — `title`, `description`, `icon`. Emits `press`. Valid only as a direct child of `List`.
- **Table** — `columns: [{ field, header, align? }]` and `rows`, an array of objects keyed by each column's `field`. Bind `rows` with `{"$state": "/path"}` rather than using `repeat`.

### Forms

- **Button** — `label`, `variant` (`text` | `filled` | `elevated` | `outlined` | `tonal`), `color`, `icon`, `disabled`. Emits `press`. Use `filled` for the primary action on a screen and `text` for secondary ones. The action goes in the element's `on.press`, never in props.
- **IconButton** — `icon`, `label` (the accessible name, required; also shown as a tooltip), `color`, `disabled`. Emits `press`.
- **Input** — `label`, `value`, `placeholder`, `hint`, `type` (`text` | `number` | `email` | `password`), `required`, `disabled`, `validation`. Emits `submit` on Enter. `required` only draws the asterisk; enforcement comes from `validation`.
- **Textarea** — `label`, `value`, `placeholder`, `rows`, `disabled`, `validation`.
- **Select** — `label`, `value`, `options: [{ value, label }]`, `disabled`, `validation`.
- **Checkbox** — `label` (required), `checked`, `disabled`, `validation`.
- **RadioGroup** — `label`, `value`, `options: [{ value, label }]`, `direction` (`vertical` | `horizontal`), `validation`.
- **SlideToggle** — `label` (required), `checked`, `disabled`.
- **Slider** — `label`, `value`, `min`, `max`, `step`.

### Feedback

- **ProgressBar** — `value` (0–100), `mode` (`determinate` | `indeterminate`), `color`.
- **Spinner** — `diameter`, `color`.
- **Callout** — `title`, `content` (required), `severity` (`info` | `success` | `warning` | `error`).

## Events and two-way binding

`Button`, `IconButton` and `ListItem` emit `press`; `Input` emits `submit` on Enter. Bind them on the element, not in props:

```json
{
  "type": "Button",
  "props": { "label": "Billing", "variant": "text" },
  "on": { "press": { "action": "setState", "params": { "statePath": "/tab", "value": "billing" } } },
  "children": []
}
```

Form controls write back through their binding, not through an event. Bind `value` (`Input`, `Textarea`, `Select`, `RadioGroup`, `Slider`) or `checked` (`Checkbox`, `SlideToggle`) with `{"$bindState": "/path"}`, or `{"$bindItem": "field"}` inside a `repeat`. To react to what the user typed, `watch` the bound path.

```json
{ "type": "Input", "props": { "label": "Name", "value": { "$bindState": "/name" } }, "children": [] }
```

## Actions

The catalog declares no custom actions; the built-ins cover it: `setState`, `pushState`, `removeState`, `validateForm`, `submitForm`. Custom handlers, if you add any, go through `<json-render [handlers]>` as with any catalog.

## Validation

`Input`, `Textarea`, `Select`, `Checkbox` and `RadioGroup` take a `validation` prop. The checks run against the state path the field is bound to, so **validation applies only to a bound field**; on a literal `value` the config is ignored.

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

- Check types: `required`, `requiredIf`, `email`, `url`, `numeric`, `minLength`, `maxLength`, `pattern`, `min`, `max`, `matches`, `equalTo`, `lessThan`, `greaterThan`. Arguments go in `args` and may reference state: `{ "type": "equalTo", "args": { "other": { "$state": "/password" } }, "message": "Passwords must match" }`.
- `validateOn` is `change`, `blur` or `submit`. Defaults: `blur` for `Input` and `Textarea`, `change` for `Select`, `Checkbox` and `RadioGroup`. `enabled` takes a visibility condition and switches the whole config off when false.
- `required` rejects `null`, `undefined`, empty strings and empty arrays, but **not** `false`. A checkbox that must be ticked uses `{ "type": "equalTo", "args": { "other": true }, "message": "…" }`.
- Errors show in the form field's `<mat-error>` for `Input`, `Textarea` and `Select`, and on their own line under `Checkbox` and `RadioGroup`.

A submit button validates every bound field and dispatches only when all pass:

```json
{
  "type": "Button",
  "props": { "label": "Save", "variant": "filled" },
  "on": { "press": { "action": "submitForm", "params": { "action": "saveUser" } } },
  "children": []
}
```

`validateForm` alone writes `{ valid, errors }` to `/formValidation` (or `params.statePath`) and dispatches nothing.

## Overriding a component

`materialComponents` is the plain name → component map; swap one entry and keep the rest:

```ts
import { Component } from '@angular/core';
import { JrChildren, defineRegistry, injectRenderContext } from 'ngx-json-render';
import {
  type MaterialProps,
  materialCatalog,
  materialComponents,
} from 'ngx-json-render-material';

@Component({
  selector: 'app-branded-card',
  imports: [JrChildren],
  template: `
    <section class="brand-card">
      @if (ctx.props().title) {
        <h3>{{ ctx.props().title }}</h3>
      }
      <jr-children />
      <footer><jr-children slot="actions" /></footer>
    </section>
  `,
})
export class BrandedCard {
  readonly ctx = injectRenderContext<MaterialProps<'Card'>>();
}

export const { registry } = defineRegistry(materialCatalog, {
  components: { ...materialComponents, Card: BrandedCard },
});
```

The replacement is a catalog component like any other: it calls `injectRenderContext()`, typed with `MaterialProps<'Card'>` so its props are the ones the catalog declares (all optional, since the renderer checks them only when `validate` is on), and renders `<jr-children />` for the `default` slot and `<jr-children slot="actions" />` for the footer, the two slots the catalog declares for `Card`.

## Extending the vocabulary

`materialCatalog.data.components` holds the definitions. Spread them into your own catalog to add components or actions, register the extra implementations, and prompt with the extended catalog:

```ts
import { Component } from '@angular/core';
import { defineRegistry, injectRenderContext, schema } from 'ngx-json-render';
import { materialCatalog, materialComponents } from 'ngx-json-render-material';
import { z } from 'zod';

@Component({
  selector: 'app-sparkline',
  template: `<svg viewBox="0 0 100 20"><polyline [attr.points]="points()" fill="none" stroke="currentColor" /></svg>`,
})
export class Sparkline {
  readonly ctx = injectRenderContext<{ values: number[] }>();
  points(): string {
    const v = this.ctx.props().values;
    const max = Math.max(...v, 1);
    return v.map((y, i) => `${(i / Math.max(v.length - 1, 1)) * 100},${20 - (y / max) * 20}`).join(' ');
  }
}

export const catalog = schema.createCatalog({
  components: {
    ...materialCatalog.data.components,
    Sparkline: {
      props: z.object({ values: z.array(z.number()) }),
      slots: [],
      description: 'Inline trend line for a Metric',
    },
  },
  actions: {
    saveUser: { params: z.object({}), description: 'Persist the profile form' },
  },
});

export const { registry } = defineRegistry(catalog, {
  components: { ...materialComponents, Sparkline },
  actions: { saveUser: async () => {} },
});

const system = catalog.prompt(); // not materialCatalog.prompt()
```

## Notes

- `Tabs` discovers its tabs from `Tab` children in the spec, so every tab is its own `Tab` element with a `label`; `List` likewise needs `ListItem` children. The catalog descriptions say so, and `materialCatalog.prompt()` carries that to the model.
- `Table` is not a `repeat`: bind `rows` to a state array.
- `Input`'s `required` prop only draws the asterisk; a `required` check in `validation` both enforces and draws it, so in practice only `validation` is needed.
