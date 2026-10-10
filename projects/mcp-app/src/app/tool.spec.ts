import { z } from 'zod';
import { mcpCatalog } from '../../server/catalog';
import {
  DESCRIPTION_LIMIT,
  TOOL_DESCRIPTION,
  specInputSchema,
  specProblems,
} from '../../server/tool';

const schema = specInputSchema(mcpCatalog);

/** A card with an Approve button; `button` overrides the button element. */
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
        type: 'Metric',
        props: { label: 'Version', value: { $state: '/release/version' } },
      },
      approve: {
        type: 'Button',
        props: { label: 'Approve', variant: 'filled' },
        on: {
          press: {
            action: 'sendMessage',
            params: { text: 'Approve', data: { $state: '/release' } },
          },
        },
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

describe('render-ui tool', () => {
  it('fits its description in what Claude shows the model', () => {
    expect(TOOL_DESCRIPTION.length).toBeLessThan(DESCRIPTION_LIMIT);
    expect(TOOL_DESCRIPTION).toContain('sendMessage');
  });

  it('carries the catalog in a compact input schema', () => {
    const json = JSON.stringify(
      z.toJSONSchema(schema, { target: 'draft-7', io: 'input' }),
    );

    for (const name of [...mcpCatalog.componentNames, 'sendMessage']) {
      expect(json).toContain(`"${name}`);
    }
    // Shared parts are defined once and referred to.
    expect(json).toContain('#/definitions/DynamicValue');
    expect(json.length).toBeLessThan(45_000);
  });

  it('states the catalog’s validation hint once, where every field can find it', () => {
    const json = JSON.stringify(
      z.toJSONSchema(schema, { target: 'draft-7', io: 'input' }),
    );
    const count = (text: string) => json.split(text).length - 1;
    // Every component whose props take `validation`: the form fields.
    const components = mcpCatalog.data.components as Record<
      string,
      { props: Partial<z.ZodObject> }
    >;
    const fields = Object.keys(components).filter(
      (name) => components[name].props.shape?.['validation'] !== undefined,
    );
    expect(fields).toContain('Input');

    expect(count('Validate it with `validation`')).toBe(1);
    expect(count('On every component that takes `validation`: Validate')).toBe(
      1,
    );
    expect(count('Validation: see `elements`.')).toBe(fields.length);
    const descriptions: string[] = [];
    JSON.parse(json, (key, value) => {
      if (key === 'description' && typeof value === 'string') {
        descriptions.push(value);
      }
      return value;
    });
    for (const field of fields) {
      const own = descriptions.find((d) => d.startsWith(`${field}: `));
      expect(own, field).toMatch(/Validation: see `elements`\.$/);
    }
  });

  it("offers no Image, which the view's CSP would block", () => {
    expect(mcpCatalog.componentNames).not.toContain('Image');
    expect(
      errors(
        spec({
          type: 'Image',
          props: { src: 'https://example.com/a.png', alt: 'A' },
        }),
      ),
    ).not.toEqual([]);
  });

  it('accepts a spec with dynamic props and fills in missing children', () => {
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
    ).toEqual([
      expect.stringContaining('"text"|"filled"|"elevated"|"outlined"|"tonal"'),
    ]);
    expect(errors(spec({ props: { label: 'Go', kind: 'x' } }))).toEqual([
      expect.stringContaining('"kind"'),
    ]);
    expect(errors(spec({ props: { label: { text: 'Go' } } }))).toEqual([
      expect.stringContaining('Expected a dynamic value'),
    ]);
  });

  it("checks each action's params and rejects unknown actions", () => {
    const on = (press: unknown) => errors(spec({ on: { press } }));

    expect(
      on({ action: 'sendMessage', params: { text: 'Go', release: {} } }),
    ).toEqual([expect.stringContaining('"release"')]);
    expect(on({ action: 'submit', params: {} })).toEqual([
      expect.stringContaining('Unknown action. Use one of: sendMessage'),
    ]);
    expect(
      on([{ action: 'setState', params: { statePath: '/x', value: 1 } }]),
    ).toEqual([]);
  });

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
          type: 'List',
          props: {},
          repeat: { statePath: '/reps', key: 'id' },
          children: ['row'],
        },
        row: {
          type: 'ListItem',
          props: { title: { $template: text } },
          on: {
            press: {
              action: 'sendMessage',
              params: { text: { $template: label } },
            },
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
      'Element "row" props.title: inside $template write ${name}, not ${$item/name}',
    );
    expect(problems).toContain(
      'Element "row" props.title: inside $template write ${attainment}, not ${$item.attainment}',
    );
    expect(problems).toContain(
      'Element "row" on.press.params.text: inside $template write ${name}, not ${$item/name}',
    );
  });

  it('keeps the $template hint in the tool description', () => {
    expect(TOOL_DESCRIPTION).toContain('${field} inside a $template');
  });
});
