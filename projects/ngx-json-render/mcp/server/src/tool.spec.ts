import { defineCatalog } from '@json-render/core';
import { schema as jsonRenderSchema } from 'ngx-json-render/schema';
import { z } from 'zod';
import {
  DESCRIPTION_LIMIT,
  renderUiDescription,
  specInputSchema,
  specOutputSchema,
  specProblems,
} from './tool';

/** The hint a catalog repeats on each form field, long enough to be shared. */
const HINT =
  'Validate it with `validation`: {"checks":[{"type":"required","message":"Required"}]}, ' +
  'and add {"type":"email"}, {"type":"minLength","args":{"min":3}} or any other check the renderer knows. ' +
  'A field is checked on blur and when a submitForm action runs.';

const validation = z.object({ checks: z.array(z.unknown()) }).optional();

const components = {
  Card: {
    props: z.object({ title: z.string() }),
    description: 'A card with a title.',
  },
  Text: {
    props: z.object({ content: z.string() }),
    description: 'A line of text.',
  },
  Button: {
    props: z.object({
      label: z.string(),
      variant: z.enum(['filled', 'text']).optional(),
    }),
    description: 'A button.',
  },
  Input: {
    props: z.object({ label: z.string(), validation }),
    description: `A text field. ${HINT}`,
  },
  Select: {
    props: z.object({ label: z.string(), validation }),
    description: `A drop-down. ${HINT}`,
  },
};

const catalog = defineCatalog(jsonRenderSchema, {
  components,
  actions: {
    sendMessage: {
      params: z.object({ text: z.string() }),
      description: 'Send a message to the assistant.',
    },
  },
});

/** The same components, no catalog actions. */
const plainCatalog = defineCatalog(jsonRenderSchema, {
  components,
  actions: {},
});

const schema = specInputSchema(catalog);

/** A card with a button; `button` overrides the button element. */
function spec(button: Record<string, unknown> = {}) {
  return {
    root: 'card',
    state: { release: { version: '2.4.0' } },
    elements: {
      card: {
        type: 'Card',
        props: { title: 'Release' },
        children: ['version', 'approve'],
      },
      version: {
        type: 'Text',
        props: { content: { $state: '/release/version' } },
      },
      approve: {
        type: 'Button',
        props: { label: 'Approve', variant: 'filled' },
        on: { press: { action: 'sendMessage', params: { text: 'Approve' } } },
        children: [],
        ...button,
      },
    },
  };
}

function errors(input: unknown) {
  const result = schema.safeParse(input);
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.message);
}

function jsonSchema() {
  return JSON.stringify(
    z.toJSONSchema(schema, { target: 'draft-7', io: 'input' }),
  );
}

describe('renderUiDescription', () => {
  it('fits in what Claude shows the model', () => {
    const description = renderUiDescription(catalog);

    expect(description.length).toBeLessThan(DESCRIPTION_LIMIT);
    expect(description).toMatch(/^Render an interactive UI inline/);
    expect(description).toContain('${field} inside a $template');
  });

  it('names what the tool draws', () => {
    expect(renderUiDescription(catalog, { ui: 'dashboard' })).toMatch(
      /^Render an interactive dashboard inline/,
    );
  });

  it('explains sendMessage only when the catalog defines it', () => {
    expect(renderUiDescription(catalog)).toContain('use sendMessage');
    expect(renderUiDescription(plainCatalog)).not.toContain('sendMessage');
  });
});

describe('specInputSchema', () => {
  it('carries every component and action, sharing definitions', () => {
    const json = jsonSchema();

    for (const name of [...catalog.componentNames, 'sendMessage']) {
      expect(json).toContain(`"${name}`);
    }
    expect(json).toContain('#/definitions/DynamicValue');
    expect(json).toContain('#/definitions/ActionBinding');
  });

  it('is built once per catalog', () => {
    expect(specInputSchema(catalog)).toBe(schema);
    expect(specInputSchema(plainCatalog)).not.toBe(schema);
  });

  it('states a validation hint the fields share once, on `elements`', () => {
    const json = jsonSchema();
    const count = (text: string) => json.split(text).length - 1;

    expect(count('Validate it with `validation`')).toBe(1);
    expect(count('On every component that takes `validation`: Validate')).toBe(
      1,
    );
    expect(count('Validation: see `elements`.')).toBe(2);
  });

  it('leaves a short shared tail in each description', () => {
    const short = defineCatalog(jsonRenderSchema, {
      components: {
        Input: {
          props: z.object({ validation }),
          description: 'A text field. Validate it.',
        },
        Select: {
          props: z.object({ validation }),
          description: 'A drop-down. Validate it.',
        },
      },
      actions: {},
    });
    const json = JSON.stringify(
      z.toJSONSchema(specInputSchema(short), { target: 'draft-7' }),
    );

    expect(json).not.toContain('see `elements`');
    expect(json).toContain('A text field. Validate it.');
  });

  it('accepts dynamic props and fills in missing children', () => {
    const result = schema.parse(
      spec({ props: { label: { $template: 'Approve ${/release/version}' } } }),
    );

    expect(result.elements['version']).toMatchObject({ children: [] });
    expect(result.elements['approve']).toMatchObject({
      props: { label: { $template: 'Approve ${/release/version}' } },
    });
  });

  it('rejects a prop value outside the catalog, naming the allowed ones', () => {
    expect(
      errors(spec({ props: { label: 'Go', variant: 'primary' } })),
    ).toEqual([expect.stringContaining('"filled"|"text"')]);
    expect(errors(spec({ props: { label: 'Go', kind: 'x' } }))).toEqual([
      expect.stringContaining('"kind"'),
    ]);
    expect(errors(spec({ props: { label: { text: 'Go' } } }))).toEqual([
      expect.stringContaining('Expected a dynamic value'),
    ]);
  });

  it('rejects a component outside the catalog', () => {
    expect(errors(spec({ type: 'Image', props: {} }))).not.toEqual([]);
  });

  it("checks each action's params and rejects unknown actions", () => {
    const on = (press: unknown) => errors(spec({ on: { press } }));

    expect(on({ action: 'sendMessage', params: { text: 'Go', x: 1 } })).toEqual(
      [expect.stringContaining('"x"')],
    );
    expect(on({ action: 'submit', params: {} })).toEqual([
      expect.stringContaining('Unknown action. Use one of: sendMessage'),
    ]);
    expect(
      on([{ action: 'setState', params: { statePath: '/x', value: 1 } }]),
    ).toEqual([]);
  });

  it('declares state, visible, repeat and watch', () => {
    expect(
      errors({
        ...spec(),
        elements: {
          ...spec().elements,
          card: {
            ...spec().elements.card,
            visible: { $state: '/release/version', neq: '' },
            repeat: { statePath: '/items', key: 'id' },
            watch: {
              '/release/version': {
                action: 'setState',
                params: { statePath: '/seen', value: true },
              },
            },
          },
        },
      }),
    ).toEqual([]);
  });

  it('offers only the built-in actions to a catalog without its own', () => {
    const plain = specInputSchema(plainCatalog);
    const press = (action: string) =>
      plain.safeParse(
        spec({ on: { press: { action, params: { text: 'Go' } } } }),
      ).success;

    expect(press('setState')).toBe(true);
    expect(press('sendMessage')).toBe(false);
  });
});

describe('specOutputSchema', () => {
  it('outlines a spec without the catalog', () => {
    expect(specOutputSchema.safeParse(schema.parse(spec())).success).toBe(true);
    expect(JSON.stringify(z.toJSONSchema(specOutputSchema))).not.toContain(
      'Card',
    );
  });
});

describe('specProblems', () => {
  it('reports what the schema cannot express: missing children', () => {
    expect(specProblems(spec())).toBeUndefined();

    const broken = spec();
    broken.elements.card.children.push('ghost');
    expect(specProblems(broken)).toContain(
      'Element "card" references child "ghost"',
    );
  });

  it('tells the model to write ${field}, not ${$item/field}, in a $template', () => {
    const list = (text: string, label: string) => ({
      root: 'list',
      state: { reps: [{ id: 'a', name: 'Ada', attainment: 92 }] },
      elements: {
        list: {
          type: 'Card',
          props: { title: 'Reps' },
          repeat: { statePath: '/reps', key: 'id' },
          children: ['row'],
        },
        row: {
          type: 'Button',
          props: { label: { $template: text } },
          on: {
            press: [
              {
                action: 'sendMessage',
                params: { text: { $template: label } },
              },
            ],
          },
          children: [],
        },
      },
    });

    expect(
      specProblems(list('${name}: ${attainment}%', 'Open ${name}')),
    ).toBeUndefined();

    const problems = specProblems(
      list('${$item/name}: ${$item.attainment}%', 'Open ${$item/name}'),
    );
    expect(problems).toContain(
      'Element "row" props.label: inside $template write ${name}, not ${$item/name}',
    );
    expect(problems).toContain(
      'Element "row" props.label: inside $template write ${attainment}, not ${$item.attainment}',
    );
    expect(problems).toContain(
      'Element "row" on.press[0].params.text: inside $template write ${name}, not ${$item/name}',
    );
  });
});
