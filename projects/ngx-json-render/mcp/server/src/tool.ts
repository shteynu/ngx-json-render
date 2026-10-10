// What the model sees of the `render-ui` tool: a short description and an
// input schema that carries the catalog.
//
// `catalog.prompt()` is written to be a system prompt, and it is about 26 000
// characters long. Claude shows a tool's description to the model cut off
// after roughly 2 000 characters, which `catalog.prompt()` spends on its
// JSON Patch streaming instructions: the model never saw a component, a prop
// or an action. So the description here stays short, and each component's
// props and each action's params go into the input schema, where they are
// also enforced.
import { type Catalog, type Spec, validateSpec } from '@json-render/core';
import { z } from 'zod';

/** Claude cuts a tool description off after roughly this many characters. */
export const DESCRIPTION_LIMIT = 2000;

/** Options for {@link renderUiDescription}. */
export interface RenderUiDescriptionOptions {
  /** What the tool draws, as the first sentence names it. Default `'UI'`. */
  ui?: string;
}

/**
 * The `render-ui` tool description for `catalog`: how a spec is put
 * together, in under {@link DESCRIPTION_LIMIT} characters. The components,
 * props and actions are left to the input schema. The paragraph on
 * `sendMessage` is included only when the catalog defines that action, since
 * the view has to handle it.
 */
export function renderUiDescription(
  catalog: Catalog,
  { ui = 'UI' }: RenderUiDescriptionOptions = {},
): string {
  const actions = (catalog.data as CatalogData).actions ?? {};
  const lines = [
    `Render an interactive ${ui} inline in the chat. Pass \`spec\`: one complete json-render spec object (not JSON Patch lines). The input schema lists every component, its props and allowed values, and every action; use only those.`,
    '',
    '- `root` is the key of the top element. `elements` is a flat map of key → { type, props, children: [child keys] }; every child key must exist in `elements`.',
    '- `state` holds the data. Read it with {"$state":"/path"} rather than repeating values in props. Data-backed UI always needs `state`; use realistic sample data.',
    '- A prop can be dynamic: {"$state":"/p"} reads, {"$bindState":"/p"} binds a form field both ways, {"$template":"Hi ${/name}"} interpolates, {"$cond":{"$state":"/p"},"$then":a,"$else":b} picks.',
    '- Lists: on a container, "repeat":{"statePath":"/items","key":"id"}; its children render once per item and read {"$item":"field"}, or ${field} inside a $template.',
    '- `visible` and `on` sit next to `props`, never inside: "visible":{"$state":"/tab","eq":"home"}, "on":{"press":{"action":"setState","params":{"statePath":"/tab","value":"home"}}}.',
    '- Forms: give inputs props.validation {"checks":[{"type":"required","message":"..."}]} and submit with submitForm, which runs its inner action only when every field is valid.',
  ];
  if ('sendMessage' in actions) {
    lines.push(
      '- To continue the conversation from a button, use sendMessage: {"action":"sendMessage","params":{"text":"Approve release 2.4.0","data":{"$state":"/release"}}}. The host puts `text` (and `data` as JSON) in the chat as the user\'s message, so write it in their voice. For a form: {"action":"submitForm","params":{"action":"sendMessage","params":{"text":"Sign me up","data":{"$state":"/form"}}}}.',
    );
  }
  return lines.join('\n');
}

/** The parts of a catalog's data this file reads. */
interface CatalogData {
  components: Record<string, { props: z.ZodType; description: string }>;
  actions?: Record<string, { params?: z.ZodType; description: string }>;
}

/** A prop value computed from state, such as `{ "$state": "/path" }`. */
const dynamic = z
  .looseObject({})
  .refine((value) => Object.keys(value).some((key) => key.startsWith('$')), {
    message:
      'Expected a dynamic value such as {"$state": "/path"} or {"$bindState": "/path"}',
  })
  .meta({
    // An id makes the JSON Schema define it once and refer to it.
    id: 'DynamicValue',
    description:
      'Dynamic value: {"$state"}, {"$bindState"}, {"$bindItem"}, {"$item"}, {"$index"}, {"$template"} or {"$cond","$then","$else"}.',
  });

/**
 * A union's error that says why its first branch failed (say, the allowed
 * enum values), rather than just that no branch matched.
 */
function firstBranchError(suffix = '') {
  return (issue: z.core.$ZodRawIssue) => {
    if (issue.code !== 'invalid_union') return undefined;
    const reasons = issue.errors[0]?.map((error) => error.message);
    return reasons?.length ? reasons.join('; ') + suffix : undefined;
  };
}

/** `shape`'s fields, each of which may also be a dynamic value; nothing else. */
function allowDynamic(schema: z.ZodType) {
  const shape = (schema as z.ZodObject).shape ?? {};
  return z.strictObject(
    Object.fromEntries(
      Object.entries(shape).map(([key, field]) => {
        const optional = field instanceof z.ZodOptional;
        const value = z.union([optional ? field.unwrap() : field, dynamic], {
          error: firstBranchError(
            ', or a dynamic value such as {"$state": "/path"}',
          ),
        });
        return [key, optional ? value.optional() : value];
      }),
    ),
  );
}

/**
 * An action binding, or several, with one branch per action so the params
 * of the catalog's own actions are checked.
 */
function actionBinding(catalog: Catalog) {
  const common = {
    confirm: z.unknown().optional(),
    onSuccess: z.unknown().optional(),
    onError: z.unknown().optional(),
    preventDefault: z.boolean().optional(),
  };
  const builtIn = catalog.schema.builtInActions ?? [];
  const actions = (catalog.data as CatalogData).actions ?? {};
  const bindings: z.ZodObject[] = Object.entries(actions).map(
    ([name, action]) =>
      z
        .strictObject({
          action: z.literal(name),
          params: allowDynamic(action.params ?? z.object({})),
          ...common,
        })
        .describe(`${name}: ${action.description}`),
  );
  if (builtIn.length > 0) {
    const names = builtIn.map((action) => action.name) as [string, ...string[]];
    bindings.push(
      z
        .strictObject({
          action: z.enum(names),
          params: z.record(z.string(), z.unknown()).optional(),
          ...common,
        })
        .describe(
          builtIn
            .map((action) => `${action.name}: ${action.description}`)
            .join('\n'),
        ),
    );
  }
  const binding = z
    .discriminatedUnion('action', bindings as [z.ZodObject, ...z.ZodObject[]], {
      error: `Unknown action. Use one of: ${[...Object.keys(actions), ...builtIn.map((action) => action.name)].join(', ')}.`,
    })
    .meta({ id: 'ActionBinding' });
  return z.union([binding, z.array(binding)], { error: firstBranchError() });
}

/**
 * The tool's input schema: a spec whose elements are typed per component.
 *
 * `catalog.zodSchema()` types an element's `type` but not its props, and it
 * has no `state`, `on` or `watch`, so the MCP SDK, which parses tool
 * arguments with the input schema, stripped those and let any prop through.
 * Here each component's props are its catalog schema (with dynamic values
 * allowed and unknown props rejected), and each action's params are checked.
 */
export function specInputSchema(catalog: Catalog) {
  let schema = inputSchemas.get(catalog);
  if (!schema) {
    schema = buildSpecInputSchema(catalog);
    inputSchemas.set(catalog, schema);
  }
  return schema;
}

/**
 * The sentences every validatable component's description ends with, or ""
 * when there are none worth sharing.
 *
 * The catalog repeats its validation hint on each form field because
 * `catalog.prompt()` lists components one by one and shows no prop-level
 * descriptions. In the input schema the same ~600 characters would arrive
 * once per field component, so the schema says them once, on `elements`, and
 * each field points there. Found as the descriptions' common tail, cut back
 * to a sentence start, so the catalog does not have to export it.
 */
function sharedValidationHint(components: CatalogData['components']): string {
  const descriptions = Object.values(components)
    .filter(
      (component) =>
        (component.props as Partial<z.ZodObject>).shape?.['validation'] !==
        undefined,
    )
    .map((component) => component.description);
  if (descriptions.length < 2) return '';

  let tail = descriptions[0];
  for (const description of descriptions.slice(1)) {
    let n = 0;
    while (
      n < tail.length &&
      n < description.length &&
      tail[tail.length - 1 - n] === description[description.length - 1 - n]
    ) {
      n++;
    }
    tail = tail.slice(tail.length - n);
  }
  // The shared tail usually starts part-way through the sentence before it.
  const before = descriptions[0].slice(0, descriptions[0].length - tail.length);
  if (before !== '' && !/[.!?] $/.test(before)) {
    const next = tail.indexOf('. ');
    tail = next === -1 ? '' : tail.slice(next + 2);
  }
  return tail.length >= 200 ? tail : '';
}

/**
 * What `render-ui` returns as `structuredContent`: the spec it was given,
 * after the input schema filled in missing `children`. Only its outline,
 * since the input schema already carries the catalog and a second copy would
 * double what every `tools/list` sends the model. ChatGPT flags a tool
 * without an output schema ("Output schema recommended").
 */
export const specOutputSchema = z
  .looseObject({
    root: z.string(),
    elements: z.record(
      z.string(),
      z.looseObject({
        type: z.string(),
        props: z.record(z.string(), z.unknown()),
        children: z.array(z.string()),
      }),
    ),
    state: z.record(z.string(), z.unknown()).optional(),
  })
  .describe('The json-render spec that was rendered.');

// The server is stateless, so it is created for every request; build each
// catalog's schema once.
const inputSchemas = new WeakMap<
  Catalog,
  ReturnType<typeof buildSpecInputSchema>
>();

function buildSpecInputSchema(catalog: Catalog) {
  const bindings = actionBinding(catalog);
  // The fields every element shares, defined once in the JSON Schema.
  const shared = {
    visible: z
      .unknown()
      .meta({
        id: 'Visibility',
        description:
          'Show the element only when this holds: {"$state":"/p","eq":v} (or neq, gt, gte, lt, lte, not), an array of conditions (all), {"$or":[...]}, true or false.',
      })
      .optional(),
    repeat: z
      .strictObject({
        statePath: z.union([z.string(), dynamic]),
        key: z.string().optional(),
      })
      .meta({
        id: 'Repeat',
        description:
          'Render the children once per item of the state array at statePath; they read {"$item":"field"} and {"$index":true}.',
      })
      .optional(),
    on: z
      .record(z.string(), bindings)
      .meta({
        id: 'Events',
        description:
          'Event name (such as "press", "change" or "submit") → action binding.',
      })
      .optional(),
    watch: z
      .record(z.string(), bindings)
      .meta({
        id: 'Watchers',
        description:
          'State path → action binding, run when the value at that path changes.',
      })
      .optional(),
  };
  const { components } = catalog.data as CatalogData;
  const hint = sharedValidationHint(components);
  const elements = Object.entries(components).map(([type, component]) => {
    const description =
      hint && component.description.endsWith(hint)
        ? `${component.description.slice(0, -hint.length)}Validation: see \`elements\`.`
        : component.description;
    return z
      .strictObject({
        type: z.literal(type),
        props: allowDynamic(component.props),
        children: z.array(z.string()).default([]),
        ...shared,
      })
      .describe(`${type}: ${description}`);
  });
  return z.strictObject({
    root: z.string().describe('Key of the top element in `elements`.'),
    elements: z
      .record(
        z.string(),
        z.discriminatedUnion(
          'type',
          elements as unknown as [z.ZodObject, ...z.ZodObject[]],
        ),
      )
      .describe(
        hint
          ? `Elements by key. On every component that takes \`validation\`: ${hint}`
          : 'Elements by key.',
      ),
    state: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        'Initial state model; bindings read it with {"$state": "/path"}.',
      ),
  });
}

/**
 * What the input schema cannot express: a root and children that exist,
 * repeat with a template child, valid visibility conditions, and `$template`
 * placeholders that read a repeat item. Returns the problems as text for the
 * model, or `undefined` when there are none.
 */
export function specProblems(spec: object): string | undefined {
  // The input schema has already checked the shape `Spec` describes.
  const { issues } = validateSpec(spec as Spec);
  const errors = issues.filter((issue) => issue.severity === 'error');
  const messages = [
    ...errors.map((issue) => issue.message),
    ...itemTemplateProblems(spec as Spec),
  ];
  return messages.length > 0
    ? [
        'The generated UI spec has the following errors:',
        ...messages.map((message) => `- ${message}`),
      ].join('\n')
    : undefined;
}

/**
 * `${$item/field}` placeholders in a `$template`. A `$template` reads an
 * absolute `${/path}` from state and a bare `${field}` from the repeat item
 * first, so `$item/field` is looked up as the state path `/$item/field`,
 * finds nothing and renders as an empty string, without an error anywhere.
 */
function itemTemplateProblems(spec: Spec): string[] {
  const problems: string[] = [];
  for (const [key, { props, on, watch }] of Object.entries(spec.elements)) {
    walk({ props, on, watch }, '', (template, path) => {
      for (const [, placeholder, field] of template.matchAll(
        ITEM_PLACEHOLDER,
      )) {
        problems.push(
          `Element "${key}" ${path}: inside $template write \${${field.replaceAll('.', '/')}}, not \${${placeholder}}`,
        );
      }
    });
  }
  return problems;
}

/** `${$item/field}` or `${$item.field}`; the groups are the placeholder and the field. */
const ITEM_PLACEHOLDER = /\$\{(\$item[/.]([^}]+))\}/g;

/** Calls `visit` with every `$template` string under `value` and where it sits. */
function walk(
  value: unknown,
  path: string,
  visit: (template: string, path: string) => void,
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`, visit));
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key === '$template' && typeof child === 'string') {
        visit(child, path);
      } else {
        walk(child, path ? `${path}.${key}` : key, visit);
      }
    }
  }
}
