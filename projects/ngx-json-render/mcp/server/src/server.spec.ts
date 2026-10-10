import { defineCatalog } from '@json-render/core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { schema } from 'ngx-json-render/schema';
import { z } from 'zod';
import {
  type RenderUiServerOptions,
  createRenderUiServer,
  handleRenderUiRequest,
} from './server';
import { renderUiDescription } from './tool';

const catalog = defineCatalog(schema, {
  components: {
    Card: {
      props: z.object({ title: z.string() }),
      description: 'A card with a title.',
    },
    Text: {
      props: z.object({ content: z.string() }),
      description: 'A line of text.',
    },
  },
  actions: {},
});

const HTML = '<!doctype html><p>view</p>';

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

/** A client connected to a fresh server, as a host would see it. */
async function connect(options: Partial<RenderUiServerOptions> = {}) {
  const server = createRenderUiServer({ catalog, html: HTML, ...options });
  const client = new Client({ name: 'test-host', version: '0.0.0' });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

describe('createRenderUiServer', () => {
  it('registers render-ui, linked to its view, with the defaults', async () => {
    const client = await connect();

    const { tools } = await client.listTools();

    expect(client.getServerVersion()).toMatchObject({
      name: 'ngx-json-render',
      version: '0.0.0',
    });
    expect(tools).toHaveLength(1);
    const [tool] = tools;
    expect(tool).toMatchObject({
      name: 'render-ui',
      title: 'Render UI',
      description: renderUiDescription(catalog),
      annotations: { readOnlyHint: true, destructiveHint: false },
      _meta: { ui: { resourceUri: 'ui://render-ui/view.html' } },
    });
    expect(tool.outputSchema?.required).toEqual(['spec']);
    expect(JSON.stringify(tool.inputSchema)).toContain('"Card');
    await client.close();
  });

  it('takes its name, title and description from the options', async () => {
    const client = await connect({
      name: 'releases',
      version: '1.2.3',
      toolName: 'show-release',
      title: 'Show release',
      description: 'Draw a release.',
    });

    const [tool] = (await client.listTools()).tools;
    const { resources } = await client.listResources();

    expect(client.getServerVersion()).toMatchObject({
      name: 'releases',
      version: '1.2.3',
    });
    expect(tool).toMatchObject({
      name: 'show-release',
      title: 'Show release',
      description: 'Draw a release.',
      _meta: { ui: { resourceUri: 'ui://show-release/view.html' } },
    });
    expect(resources.map((r) => r.uri)).toEqual([
      'ui://show-release/view.html',
    ]);
    await client.close();
  });

  it('returns the spec as structured content, and as text for the view', async () => {
    const client = await connect();

    const result = await client.callTool({
      name: 'render-ui',
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

  it('returns a broken spec as an error the model can fix', async () => {
    const client = await connect();
    const broken = {
      ...SPEC,
      elements: {
        ...SPEC.elements,
        card: { ...SPEC.elements.card, children: ['note', 'ghost'] },
      },
    };

    const result = await client.callTool({
      name: 'render-ui',
      arguments: { spec: broken },
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    const [text] = result.content as { type: string; text: string }[];
    expect(text.text).toContain('references child "ghost"');
    await client.close();
  });

  it('serves the view with no meta by default', async () => {
    const client = await connect();

    const { contents } = await client.readResource({
      uri: 'ui://render-ui/view.html',
    });

    expect(contents).toHaveLength(1);
    expect(contents[0]).toMatchObject({
      text: HTML,
      mimeType: 'text/html;profile=mcp-app',
    });
    expect(contents[0]._meta).toBeUndefined();
    await client.close();
  });

  it('declares the CSP and the ChatGPT widget domain when given', async () => {
    const csp = {
      resourceDomains: ['https://fonts.gstatic.com'],
      connectDomains: [],
    };
    const client = await connect({
      csp,
      widgetDomain: 'https://example.com',
    });

    const { contents } = await client.readResource({
      uri: 'ui://render-ui/view.html',
    });

    expect(contents[0]._meta).toEqual({
      ui: { csp },
      'openai/widgetDomain': 'https://example.com',
    });
    await client.close();
  });
});

describe('handleRenderUiRequest', () => {
  const options = { catalog, html: HTML };

  function post(body: unknown) {
    return new Request('https://example.com/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(body),
    });
  }

  it('answers a CORS preflight', async () => {
    const response = await handleRenderUiRequest(
      options,
      new Request('https://example.com/mcp', { method: 'OPTIONS' }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain(
      'Mcp-Protocol-Version',
    );
  });

  it('serves each request on its own, as JSON with CORS headers', async () => {
    const initialize = await handleRenderUiRequest(
      options,
      post({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '0' },
        },
      }),
    );
    expect(initialize.status).toBe(200);
    expect(initialize.headers.get('Content-Type')).toContain(
      'application/json',
    );
    expect(initialize.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(await initialize.json()).toMatchObject({
      id: 1,
      result: { serverInfo: { name: 'ngx-json-render' } },
    });

    // Stateless: a later request needs no session from the first.
    const call = await handleRenderUiRequest(
      options,
      post({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'render-ui', arguments: { spec: SPEC } },
      }),
    );
    expect(call.status).toBe(200);
    const { result } = await call.json();
    expect(result.structuredContent.spec.root).toBe('card');
  });

  it('passes the transport’s errors through', async () => {
    const response = await handleRenderUiRequest(
      options,
      new Request('https://example.com/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
    );

    expect(response.status).toBe(406);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});
