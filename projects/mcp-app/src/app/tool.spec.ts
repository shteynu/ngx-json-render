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
});
