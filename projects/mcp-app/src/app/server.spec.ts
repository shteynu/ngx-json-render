import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { TOOL_NAME, createServerInstance } from '../../server/app';

/** A client connected to a fresh server, as a host would see it. */
async function connect() {
  const server = createServerInstance('<!doctype html><p>view</p>');
  const client = new Client({ name: 'test-host', version: '0.0.0' });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

const SPEC = {
  root: 'card',
  state: { title: 'Release' },
  elements: {
    card: {
      type: 'Card',
      props: { title: { $state: '/title' } },
      children: ['note'],
    },
    // No `children`: the input schema fills them in.
    note: { type: 'Text', props: { content: 'Shipped' } },
  },
};

describe('render-ui over MCP', () => {
  it('declares an output schema that outlines the spec, not the catalog', async () => {
    const client = await connect();

    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === TOOL_NAME);

    expect(tool?.outputSchema?.properties).toHaveProperty('spec');
    expect(tool?.outputSchema?.required).toEqual(['spec']);
    // The catalog stays in the input schema only.
    const output = JSON.stringify(tool?.outputSchema);
    expect(output).not.toContain('"Card');
    expect(output.length).toBeLessThan(2_000);
    await client.close();
  });

  it('returns the spec as structured content, and as text for the view', async () => {
    const client = await connect();

    const result = await client.callTool({
      name: TOOL_NAME,
      arguments: { spec: SPEC },
    });

    expect(result.isError).toBeFalsy();
    const filled = {
      ...SPEC,
      elements: {
        ...SPEC.elements,
        note: { ...SPEC.elements.note, children: [] },
      },
    };
    expect(result.structuredContent).toEqual({ spec: filled });
    const [text] = result.content as { type: string; text: string }[];
    expect(JSON.parse(text.text)).toEqual(filled);
    await client.close();
  });

  it('returns a broken spec as an error the model can fix, without structured content', async () => {
    const client = await connect();
    const broken = {
      ...SPEC,
      elements: {
        ...SPEC.elements,
        card: { ...SPEC.elements.card, children: ['note', 'ghost'] },
      },
    };

    const result = await client.callTool({
      name: TOOL_NAME,
      arguments: { spec: broken },
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    const [text] = result.content as { type: string; text: string }[];
    expect(text.text).toContain('references child "ghost"');
    await client.close();
  });
});
