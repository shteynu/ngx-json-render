import type { Spec, UIElement } from '@json-render/core';
// The catalog without its Angular components: plain data and zod schemas, so
// this file also runs under Node for the tests.
import { materialCatalog } from 'ngx-json-render-material/catalog';
import { z } from 'zod';

/**
 * The slice of the Material catalog a small model is asked to use. A 1–3B
 * model writes a usable tree from a dozen components; from all thirty-odd it
 * mostly confuses them, and the full prompt would not fit its context window.
 */
export const COMPONENTS = [
  'Stack',
  'Grid',
  'Card',
  'List',
  'Heading',
  'Text',
  'Metric',
  'Chip',
  'Icon',
  'ListItem',
  'Table',
  'Callout',
  'ProgressBar',
  'Divider',
  'Button',
  'Input',
  'Select',
  'Checkbox',
] as const;

export type ComponentName = (typeof COMPONENTS)[number];

/** Components whose children the renderer draws; the rest are leaves. */
export const CONTAINERS: ReadonlySet<string> = new Set([
  'Stack',
  'Grid',
  'Card',
  'List',
]);

interface CatalogEntry {
  props: z.ZodType;
  description?: string;
}

const entries = (
  materialCatalog.data as unknown as {
    components: Record<string, CatalogEntry>;
  }
).components;

function entry(name: string): CatalogEntry | undefined {
  return Object.hasOwn(entries, name) ? entries[name] : undefined;
}

type JsonSchema = Record<string, unknown>;

/**
 * JSON Schema for one component's props, taken from the catalog's own zod
 * schema. `validation` is dropped: its schema is larger than all the others
 * together and a demo form does not need it. Table rows are a record of
 * unknown in the catalog, which a grammar cannot constrain, so they become
 * objects of strings and numbers.
 */
export function propsSchema(name: ComponentName): JsonSchema {
  const props = entry(name)?.props;
  if (!props) throw new Error(`${name} is not in the Material catalog`);
  const schema = z.toJSONSchema(props) as JsonSchema;
  delete schema['$schema'];
  delete schema['$defs'];
  const properties = { ...(schema['properties'] as JsonSchema) };
  delete properties['validation'];
  if (name === 'Table') {
    properties['rows'] = {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: { type: ['string', 'number'] },
      },
    };
  }
  return { ...schema, properties };
}

/**
 * The schema the model's whole answer must match: one sentence, then a tree
 * of nodes, each `{ type, props, children? }`. WebLLM compiles it into a
 * grammar, so every token the model samples keeps the answer valid JSON of
 * this shape — no prose around it, no unknown component, no misspelt prop.
 */
export function answerSchema(): JsonSchema {
  const node = {
    anyOf: COMPONENTS.map((name) => ({
      type: 'object',
      properties: {
        type: { const: name },
        props: propsSchema(name),
        ...(CONTAINERS.has(name)
          ? {
              // At least two: left free, a small model closes a container
              // after its first child and the answer ends half-built.
              children: {
                type: 'array',
                items: { $ref: '#/$defs/node' },
                minItems: 2,
                maxItems: 8,
              },
            }
          : {}),
      },
      required: CONTAINERS.has(name)
        ? ['type', 'props', 'children']
        : ['type', 'props'],
      additionalProperties: false,
    })),
  };
  return {
    type: 'object',
    properties: {
      say: { type: 'string' },
      ui: { $ref: '#/$defs/node' },
    },
    required: ['say', 'ui'],
    additionalProperties: false,
    $defs: { node },
  };
}

/** `Metric(label*, value*: string|number, trend: up|down|flat)` */
function signature(name: ComponentName): string {
  const schema = propsSchema(name);
  const properties = schema['properties'] as Record<string, JsonSchema>;
  const required = new Set((schema['required'] as string[] | undefined) ?? []);
  const props = Object.entries(properties).map(([prop, s]) => {
    const values = s['enum'] as string[] | undefined;
    const items = s['items'] as JsonSchema | undefined;
    const itemKeys = Object.keys((items?.['properties'] as object) ?? {});
    const type = values
      ? values.join('|')
      : itemKeys.length
        ? `[{${itemKeys.join(', ')}}]`
        : items?.['additionalProperties']
          ? '[{column field: value}]'
          : Array.isArray(s['type'])
            ? s['type'].join('|')
            : (s['anyOf'] as JsonSchema[] | undefined)
              ? 'string'
              : String(s['type']);
    return `${prop}${required.has(prop) ? '*' : ''}: ${type}`;
  });
  return `${name}(${props.join(', ')})`;
}

const EXAMPLES = [
  {
    say: 'Here is your storage usage.',
    ui: {
      type: 'Card',
      props: { title: 'Storage', subtitle: 'Personal plan' },
      children: [
        {
          type: 'Grid',
          props: { columns: 2, gap: 12 },
          children: [
            {
              type: 'Metric',
              props: { label: 'Used', value: '42 GB', trend: 'up' },
            },
            { type: 'Metric', props: { label: 'Free', value: '58 GB' } },
          ],
        },
        { type: 'Text', props: { content: '42% of 100 GB', tone: 'muted' } },
        { type: 'ProgressBar', props: { value: 42 } },
        {
          type: 'Button',
          props: { label: 'Upgrade', variant: 'filled', icon: 'upgrade' },
        },
      ],
    },
  },
  {
    say: 'Here is a feedback form.',
    ui: {
      type: 'Card',
      props: { title: 'Send feedback' },
      children: [
        { type: 'Text', props: { content: 'We read every message.' } },
        {
          type: 'Stack',
          props: { gap: 8 },
          children: [
            { type: 'Input', props: { label: 'Email', type: 'email' } },
            {
              type: 'Select',
              props: {
                label: 'Topic',
                options: [
                  { value: 'bug', label: 'Bug' },
                  { value: 'idea', label: 'Idea' },
                ],
              },
            },
            { type: 'Button', props: { label: 'Send', variant: 'filled' } },
          ],
        },
      ],
    },
  },
].map((example) => JSON.stringify(example));

/**
 * The system prompt. It lists the components with their props, which the
 * grammar enforces anyway, so the model spends its few billion parameters on
 * picking components rather than on guessing what they are called.
 */
export function systemPrompt(): string {
  const lines = COMPONENTS.map((name) => {
    const description = entry(name)?.description?.split('. ')[0] ?? '';
    const kind = CONTAINERS.has(name) ? ' [container]' : '';
    return `- ${signature(name)}${kind} — ${description.replace(/\.$/, '')}`;
  });
  return [
    'You design small user interfaces for an Angular app.',
    'Answer with JSON: {"say": one short sentence for the user, "ui": a component tree}.',
    'A node is {"type": component, "props": {...}, "children": [nodes]}. Only [container] components have children.',
    'Props marked * are required. Icons are Material Symbols names such as "cloud", "bolt", "person".',
    '',
    'Components:',
    ...lines,
    '',
    'Rules:',
    '- Start with a Card that has a title. Use 6 to 15 nodes and realistic sample data.',
    '- Numbers and stats: a Metric each, side by side in a Grid.',
    '- Progress towards a goal: a Text saying how far, then a ProgressBar (0–100).',
    '- Forms: Input, Select and Checkbox fields in a vertical Stack, ending with a Button.',
    '- Several similar items: a List of ListItems, or a Table when they have columns.',
    '- Warnings and tips: a Callout. Never leave a container empty.',
    '',
    ...EXAMPLES.map((example) => `Example: ${example}`),
  ].join('\n');
}

/** The answer as the model writes it. */
export interface Answer {
  say: string;
  ui: unknown;
}

/**
 * Turns the nested tree into json-render's flat spec. A node that is not a
 * catalog component, or whose props do not yet satisfy the catalog (a
 * `Metric` whose `value` has not streamed in), is left out together with its
 * children, so a half-written answer always renders as the part that is done.
 */
export function treeToSpec(tree: unknown): Spec | null {
  const elements: Record<string, UIElement> = {};
  let next = 0;

  const visit = (node: unknown): string | null => {
    if (!node || typeof node !== 'object') return null;
    const { type, props, children } = node as Record<string, unknown>;
    if (
      typeof type !== 'string' ||
      !(COMPONENTS as readonly string[]).includes(type)
    ) {
      return null;
    }
    const parsed = entry(type)?.props.safeParse(props ?? {});
    if (!parsed?.success) return null;
    const id = `${type.toLowerCase()}-${next++}`;
    const element: UIElement = {
      type,
      props: tidy(type, parsed.data as Record<string, unknown>),
    };
    elements[id] = element;
    if (CONTAINERS.has(type) && Array.isArray(children)) {
      element.children = children
        .map(visit)
        .filter((child): child is string => child !== null);
    }
    return id;
  };

  const root = visit(tree);
  return root ? { root, elements } : null;
}

/**
 * Fixes what the grammar cannot: a small model often puts the raw count in a
 * progress bar ("5000" steps) instead of a percentage.
 */
function tidy(
  type: string,
  props: Record<string, unknown>,
): Record<string, unknown> {
  const value = props['value'];
  if (type === 'ProgressBar' && typeof value === 'number') {
    return { ...props, value: Math.min(100, Math.max(0, value)) };
  }
  return props;
}
