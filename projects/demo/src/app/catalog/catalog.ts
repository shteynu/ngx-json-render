import { ValidationConfigSchema } from '@json-render/core';
import { schema } from 'ngx-json-render';
import { z } from 'zod';

/**
 * The demo catalog: the vocabulary of components and actions the spec (or an
 * LLM generating one) is allowed to use. `catalog.prompt()` turns this into a
 * system prompt for UI generation.
 */
export const catalog = schema.createCatalog({
  components: {
    Stack: {
      props: z.object({
        direction: z.enum(['vertical', 'horizontal']).optional(),
        gap: z.number().optional(),
        padding: z.number().optional(),
        align: z.enum(['start', 'center', 'end', 'stretch']).optional(),
        justify: z.enum(['start', 'between', 'end']).optional(),
      }),
      slots: ['default'],
      description:
        'Layout container that stacks children vertically or horizontally',
    },
    Card: {
      props: z.object({
        title: z.string().optional(),
        subtitle: z.string().optional(),
      }),
      slots: ['default', 'actions'],
      description:
        'Card container with optional title/subtitle and an "actions" slot in the header',
    },
    Heading: {
      props: z.object({
        content: z.string(),
        level: z.number().min(1).max(3).optional(),
      }),
      slots: [],
      description: 'Section heading (level 1–3)',
    },
    Text: {
      props: z.object({
        content: z.string(),
        tone: z.enum(['default', 'muted', 'strong']).optional(),
      }),
      slots: [],
      description: 'A paragraph of text',
    },
    Button: {
      props: z.object({
        label: z.string(),
        variant: z.enum(['primary', 'secondary', 'danger']).optional(),
        disabled: z.boolean().optional(),
      }),
      slots: [],
      description: "Clickable button that emits a 'press' event",
    },
    Badge: {
      props: z.object({
        label: z.string(),
        color: z.enum(['gray', 'green', 'orange', 'blue']).optional(),
      }),
      slots: [],
      description: 'Small status badge',
    },
    Input: {
      props: z.object({
        value: z.string().optional(),
        placeholder: z.string().optional(),
        label: z.string().optional(),
        type: z.enum(['text', 'email']).optional(),
        multiline: z.boolean().optional(),
        validation: ValidationConfigSchema.optional(),
      }),
      slots: [],
      description:
        "Text input with an optional label; multiline makes it a text area. Bind value with $bindState; emits 'submit' on Enter (single line only). " +
        'Validate it with `validation`: {"checks":[{"type":"required","message":"..."}],"validateOn":"blur"}; check types include required, email, minLength (args {"min":n}) and maxLength. ' +
        'The built-in submitForm action validates every bound field and dispatches its action only if all pass',
    },
    Checkbox: {
      props: z.object({
        label: z.string(),
        checked: z.boolean().optional(),
      }),
      slots: [],
      description:
        'Checkbox with a label; bind checked with $bindItem/$bindState',
    },
    Metric: {
      props: z.object({
        label: z.string(),
        value: z.union([z.string(), z.number()]),
        delta: z.string().optional(),
        trend: z.array(z.number()).optional(),
      }),
      slots: [],
      description:
        'Key metric tile with an optional delta and an optional sparkline of recent values (trend)',
    },
    Progress: {
      props: z.object({
        label: z.string().optional(),
        value: z.number(),
      }),
      slots: [],
      description: 'Progress bar (0–100)',
    },
    Divider: {
      props: z.object({}),
      slots: [],
      description: 'Horizontal divider',
    },
    Grid: {
      props: z.object({
        minColumnWidth: z.number().optional(),
        gap: z.number().optional(),
      }),
      slots: ['default'],
      description:
        'Responsive grid: as many equal columns as fit at minColumnWidth px (default 220), one column on narrow screens. Use for rows of metrics or cards',
    },
    LineChart: {
      props: z.object({
        labels: z.array(z.string()),
        series: z.array(
          z.object({ name: z.string(), values: z.array(z.number()) }),
        ),
        format: z.enum(['number', 'currency', 'percent']).optional(),
        height: z.number().optional(),
      }),
      slots: [],
      description:
        'Line chart over shared x labels, up to 4 series; values[i] belongs to labels[i]. Append points with an add patch to /series/<n>/values/- to draw the line as it streams',
    },
    BarChart: {
      props: z.object({
        labels: z.array(z.string()),
        values: z.array(z.number()),
        format: z.enum(['number', 'currency', 'percent']).optional(),
      }),
      slots: [],
      description:
        'Horizontal bar chart for a ranking, one bar per label, in the order given',
    },
  },
  actions: {
    increment: {
      params: z.object({ statePath: z.string(), by: z.number().optional() }),
      description: 'Increment a numeric state value',
    },
    decrement: {
      params: z.object({
        statePath: z.string(),
        by: z.number().optional(),
        min: z.number().optional(),
      }),
      description: 'Decrement a numeric state value',
    },
    syncTodoCount: {
      params: z.object({}),
      description: 'Recompute /todoCount from /todos',
    },
    clearTodos: {
      params: z.object({}),
      description: 'Remove all todos',
    },
    sendSupportRequest: {
      params: z.object({
        name: z.string(),
        email: z.string(),
        message: z.string(),
      }),
      description:
        'Send a support request. Dispatch it through submitForm so the form is validated first',
    },
  },
});
