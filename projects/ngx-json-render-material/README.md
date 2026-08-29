# ngx-json-render-material

Angular Material catalog for [`ngx-json-render`](https://www.npmjs.com/package/ngx-json-render) — a ready-made component vocabulary an LLM can generate UI against, so you don't have to write one before your first generated screen.

`ngx-json-render` gives you the renderer. This gives you the 28 components it renders.

## Install

```bash
npm install ngx-json-render-material ngx-json-render @json-render/core @angular/material zod
```

Requires Angular ≥ 20. Your app needs a Material theme and the icon font as usual — see [Angular Material theming](https://material.angular.dev/guide/theming).

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

## Components

| Group | Components |
| --- | --- |
| Layout | `Stack`, `Grid`, `Card`, `Toolbar`, `ExpansionPanel`, `Tabs`, `Tab`, `Divider` |
| Typography | `Heading`, `Text`, `Icon` |
| Data display | `Metric`, `Chip`, `List`, `ListItem`, `Table` |
| Forms | `Button`, `IconButton`, `Input`, `Textarea`, `Select`, `Checkbox`, `RadioGroup`, `SlideToggle`, `Slider` |
| Feedback | `ProgressBar`, `Spinner`, `Callout` |

Props are named for what they mean, not for Material's API (`variant`, not `mat-raised-button`), so a spec written against this catalog stays portable to the other json-render renderers — and a model that has never seen Angular Material can still target it.

Two-way binding works as it does everywhere else in `ngx-json-render`: bind `value` or `checked` with `{"$bindState": "/path"}`, or `{"$bindItem": "field"}` inside a `repeat`.

```json
{ "type": "Input", "props": { "label": "Name", "value": { "$bindState": "/name" } }, "children": [] }
```

The catalog declares no custom actions — the built-in `setState`, `pushState`, `removeState` and `validateForm` cover it — so `materialRegistry` renders a spec with nothing else wired up.

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

## Notes

- `Tabs` discovers its tabs from `Tab` children in the spec rather than through `@ContentChildren`, which a spec-driven tree cannot satisfy. Each `Tab` hands its label and body to the parent, which replays them into real `<mat-tab>` elements.
- `Table` takes `columns` and `rows` as props. Bind `rows` to a state array with `{"$state": "/path"}` rather than using `repeat`.
- `List` requires `ListItem` children, and `Tabs` requires `Tab` children; the catalog descriptions say so, and the prompt carries them through to the model.

## Known issue: the test runner does not exit

`ng test ngx-json-render-material` runs the suite correctly — 8/8 pass in well
under a second — but the process then stays alive instead of exiting, so the
command has to be interrupted. This is a defect in the
`@angular/build:unit-test` + vitest combination, not in the catalog:

- importing all nine Material form modules on their own exits cleanly;
- the `effect()` + `viewChild()` pattern the inputs use exits cleanly on its own;
- only the combination, in `form.components.ts`, keeps the process alive;
- `isolate: true` with either the `forks` or `threads` pool does not change it.

Because of this the tests are not part of `npm test` or CI. CI builds the
package instead, which type-checks every component template against the
catalog. Run the suite locally with:

```bash
npm run test:material
```

## License

Apache-2.0
