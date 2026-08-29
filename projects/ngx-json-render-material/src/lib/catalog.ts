import { schema } from 'ngx-json-render';
import { z } from 'zod';

/** Palette shared by every Material component that takes a colour. */
const themeColor = z.enum(['primary', 'accent', 'warn']);

/**
 * The Angular Material catalog: the vocabulary of components a spec — or an
 * LLM generating one — is allowed to use.
 *
 * Prop names are deliberately renderer-neutral rather than Material-specific
 * (`variant`, not `mat-raised-button`) so a spec written against this catalog
 * stays portable to the other json-render renderers, and so a model that has
 * never seen Angular Material can still target it.
 *
 * `materialCatalog.prompt()` turns this into a system prompt.
 */
export const materialCatalog = schema.createCatalog({
  components: {
    // ---------------------------------------------------------------- layout
    Stack: {
      props: z.object({
        direction: z.enum(['vertical', 'horizontal']).optional(),
        gap: z.number().optional(),
        padding: z.number().optional(),
        align: z.enum(['start', 'center', 'end', 'stretch']).optional(),
        justify: z.enum(['start', 'center', 'between', 'end']).optional(),
        wrap: z.boolean().optional(),
      }),
      slots: ['default'],
      description:
        'Layout container that stacks children vertically or horizontally. The primary building block — use it for every group of elements.',
    },
    Grid: {
      props: z.object({
        columns: z.number().min(1).max(6).optional(),
        gap: z.number().optional(),
      }),
      slots: ['default'],
      description:
        'Responsive grid that places children in equal columns, collapsing to one column on narrow screens. Use for dashboards and card galleries.',
    },
    Card: {
      props: z.object({
        title: z.string().optional(),
        subtitle: z.string().optional(),
        appearance: z.enum(['outlined', 'raised', 'filled']).optional(),
      }),
      slots: ['default', 'actions'],
      description:
        'Material card with an optional title/subtitle header and an "actions" slot rendered as a footer button row.',
    },
    Toolbar: {
      props: z.object({
        title: z.string().optional(),
        color: themeColor.optional(),
      }),
      slots: ['default'],
      description:
        'Material toolbar for a page or section header. Children are placed at the trailing edge.',
    },
    ExpansionPanel: {
      props: z.object({
        title: z.string(),
        description: z.string().optional(),
        expanded: z.boolean().optional(),
      }),
      slots: ['default'],
      description:
        'Collapsible Material panel. Use for secondary detail that should not compete with the main content.',
    },
    Tabs: {
      props: z.object({}),
      slots: ['default'],
      description:
        'Material tab group. Children MUST all be Tab components; each Tab supplies one tab and its body.',
    },
    Tab: {
      props: z.object({
        label: z.string(),
      }),
      slots: ['default'],
      description:
        'A single tab inside a Tabs component. Valid only as a direct child of Tabs.',
    },
    Divider: {
      props: z.object({}),
      slots: [],
      description: 'Horizontal Material divider.',
    },

    // ------------------------------------------------------------ typography
    Heading: {
      props: z.object({
        content: z.string(),
        level: z.number().min(1).max(3).optional(),
      }),
      slots: [],
      description: 'Section heading (level 1–3) using the Material type scale.',
    },
    Text: {
      props: z.object({
        content: z.string(),
        tone: z.enum(['default', 'muted', 'strong']).optional(),
      }),
      slots: [],
      description: 'A paragraph of body text.',
    },
    Icon: {
      props: z.object({
        name: z.string(),
        color: themeColor.optional(),
      }),
      slots: [],
      description:
        'Material Symbols icon. `name` is the ligature, e.g. "home", "check_circle", "warning".',
    },

    // ----------------------------------------------------------- data display
    Metric: {
      props: z.object({
        label: z.string(),
        value: z.union([z.string(), z.number()]),
        delta: z.string().optional(),
        trend: z.enum(['up', 'down', 'flat']).optional(),
      }),
      slots: [],
      description:
        'Key metric tile with an optional delta and trend direction. Use inside a Grid for dashboard summaries.',
    },
    Chip: {
      props: z.object({
        label: z.string(),
        color: themeColor.optional(),
        icon: z.string().optional(),
      }),
      slots: [],
      description: 'Material chip, for tags and status labels.',
    },
    List: {
      props: z.object({}),
      slots: ['default'],
      description:
        'Material list container. Children MUST all be ListItem components.',
    },
    ListItem: {
      props: z.object({
        title: z.string(),
        description: z.string().optional(),
        icon: z.string().optional(),
      }),
      slots: [],
      description:
        "Row inside a List. Emits a 'press' event when clicked. Valid only as a direct child of List.",
    },
    Table: {
      props: z.object({
        columns: z.array(
          z.object({
            field: z.string(),
            header: z.string(),
            align: z.enum(['start', 'end']).optional(),
          }),
        ),
        rows: z.array(z.record(z.string(), z.unknown())),
      }),
      slots: [],
      description:
        'Material table. `columns` describes the header; `rows` is an array of objects keyed by each column\'s `field`. Bind `rows` to a state array with {"$state":"/path"} rather than using repeat.',
    },

    // ------------------------------------------------------------------ forms
    Button: {
      props: z.object({
        label: z.string(),
        variant: z
          .enum(['text', 'filled', 'elevated', 'outlined', 'tonal'])
          .optional(),
        color: themeColor.optional(),
        icon: z.string().optional(),
        disabled: z.boolean().optional(),
      }),
      slots: [],
      description:
        "Material button that emits a 'press' event. `variant` follows the Material 3 button appearances; use \"filled\" for the primary action on a screen and \"text\" for secondary ones. Put the action in the element's `on.press`, never in props.",
    },
    IconButton: {
      props: z.object({
        icon: z.string(),
        label: z.string(),
        color: themeColor.optional(),
        disabled: z.boolean().optional(),
      }),
      slots: [],
      description:
        "Icon-only Material button that emits a 'press' event. `label` is the accessible name and is required.",
    },
    Input: {
      props: z.object({
        label: z.string().optional(),
        value: z.string().optional(),
        placeholder: z.string().optional(),
        hint: z.string().optional(),
        type: z.enum(['text', 'number', 'email', 'password']).optional(),
        required: z.boolean().optional(),
        disabled: z.boolean().optional(),
      }),
      slots: [],
      description:
        "Material text field. Bind `value` with {\"$bindState\":\"/path\"} for two-way binding; emits 'submit' on Enter.",
    },
    Textarea: {
      props: z.object({
        label: z.string().optional(),
        value: z.string().optional(),
        placeholder: z.string().optional(),
        rows: z.number().optional(),
        disabled: z.boolean().optional(),
      }),
      slots: [],
      description:
        'Multi-line Material text field. Bind `value` with {"$bindState":"/path"}.',
    },
    Select: {
      props: z.object({
        label: z.string().optional(),
        value: z.string().optional(),
        options: z.array(z.object({ value: z.string(), label: z.string() })),
        disabled: z.boolean().optional(),
      }),
      slots: [],
      description:
        'Material select. Bind `value` with {"$bindState":"/path"}; `options` is an explicit list.',
    },
    Checkbox: {
      props: z.object({
        label: z.string(),
        checked: z.boolean().optional(),
        disabled: z.boolean().optional(),
      }),
      slots: [],
      description:
        'Material checkbox. Bind `checked` with {"$bindState":"/path"} or {"$bindItem":"field"} inside a repeat.',
    },
    RadioGroup: {
      props: z.object({
        label: z.string().optional(),
        value: z.string().optional(),
        options: z.array(z.object({ value: z.string(), label: z.string() })),
        direction: z.enum(['vertical', 'horizontal']).optional(),
      }),
      slots: [],
      description:
        'Material radio group. Bind `value` with {"$bindState":"/path"}.',
    },
    SlideToggle: {
      props: z.object({
        label: z.string(),
        checked: z.boolean().optional(),
        disabled: z.boolean().optional(),
      }),
      slots: [],
      description:
        'Material slide toggle for on/off settings. Bind `checked` with {"$bindState":"/path"}.',
    },
    Slider: {
      props: z.object({
        label: z.string().optional(),
        value: z.number().optional(),
        min: z.number().optional(),
        max: z.number().optional(),
        step: z.number().optional(),
      }),
      slots: [],
      description:
        'Material slider for a numeric range. Bind `value` with {"$bindState":"/path"}.',
    },

    // --------------------------------------------------------------- feedback
    ProgressBar: {
      props: z.object({
        value: z.number().optional(),
        mode: z.enum(['determinate', 'indeterminate']).optional(),
        color: themeColor.optional(),
      }),
      slots: [],
      description:
        'Material progress bar (0–100). Use mode "indeterminate" when the amount of work is unknown.',
    },
    Spinner: {
      props: z.object({
        diameter: z.number().optional(),
        color: themeColor.optional(),
      }),
      slots: [],
      description: 'Material indeterminate progress spinner, for loading states.',
    },
    Callout: {
      props: z.object({
        title: z.string().optional(),
        content: z.string(),
        severity: z.enum(['info', 'success', 'warning', 'error']).optional(),
      }),
      slots: [],
      description:
        'Inline message block for informational, success, warning, or error text.',
    },
  },
  // No custom actions: the built-in setState / pushState / removeState /
  // validateForm cover everything this catalog needs.
  actions: {},
});

/** Type of the Angular Material catalog. */
export type MaterialCatalog = typeof materialCatalog;
