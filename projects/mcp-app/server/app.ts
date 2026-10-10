// The MCP server for the Material catalog, on upstream's @json-render/mcp.
// The `render-ui` tool is registered the way its `createMcpApp` does it (same
// name, same view resource) with three changes: a short description and a
// typed input schema (`tool.ts`), and a narrower CSP (`VIEW_CSP`). Nothing
// here is Angular-specific; the only Angular part is the view, passed in as
// HTML.
//
// Entry points: `server.ts` (stdio and a local HTTP server) and `vercel.ts`
// (the hosted endpoint).
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Catalog } from '@json-render/core';
import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from '@modelcontextprotocol/ext-apps/server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
// The catalog alone, from `ngx-json-render-material/catalog`, so the server
// does not load the Angular components (and Angular) along with it.
import { mcpCatalog } from './catalog';
import {
  TOOL_DESCRIPTION,
  specInputSchema,
  specOutputSchema,
  specProblems,
} from './tool';

export const TOOL_NAME = 'render-ui';
export const RESOURCE_URI = `ui://${TOOL_NAME}/view.html`;

/**
 * What the view may load. `registerJsonRenderResource` allows any `https:`
 * origin; the view only fetches its fonts (Roboto and Material Symbols) from
 * Google Fonts and makes no network requests of its own.
 */
export const VIEW_CSP = {
  resourceDomains: [
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
  ],
  connectDomains: [] as string[],
};

/**
 * The origin ChatGPT derives the view's sandbox origin from; its plugin
 * submission requires one, unique per plugin. Set through the OpenAI alias
 * rather than `_meta.ui.domain`, because that key's format is up to each host
 * and Claude expects a `{hash}.claudemcpcontent.com` value there.
 */
export const VIEW_DOMAIN = 'https://ngx-json-render.vercel.app';

/** A server exposing the `render-ui` tool and its `ui://` view. */
export function createServerInstance(
  html: string,
  catalog: Catalog = mcpCatalog,
) {
  const server = new McpServer({
    name: 'ngx-json-render Material',
    version: '0.1.0',
  });
  registerAppTool(
    server,
    TOOL_NAME,
    {
      title: 'Render UI',
      description: TOOL_DESCRIPTION,
      inputSchema: { spec: specInputSchema(catalog) },
      outputSchema: { spec: specOutputSchema },
      // It only echoes the spec back for the view to draw: nothing is read
      // from or written to any system.
      annotations: {
        title: 'Render UI',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    // The SDK has already parsed `spec` against the input schema; what is
    // left is the structure between elements. A rejected spec goes back to
    // the model as an error it can fix. The text keeps upstream's shape, the
    // bare spec, which is what views built on `@json-render/mcp/app` read.
    async ({ spec }) => {
      const problems = specProblems(spec);
      return problems
        ? { isError: true, content: [{ type: 'text', text: problems }] }
        : {
            content: [{ type: 'text', text: JSON.stringify(spec) }],
            structuredContent: { spec },
          };
    },
  );
  registerAppResource(
    server,
    RESOURCE_URI,
    RESOURCE_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => ({
      contents: [
        {
          uri: RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: html,
          _meta: {
            ui: { csp: VIEW_CSP },
            'openai/widgetDomain': VIEW_DOMAIN,
          },
        },
      ],
    }),
  );
  return server;
}

/**
 * Serve one Streamable HTTP request, statelessly: a fresh server and
 * transport per request, so it runs unchanged on a serverless function.
 */
export async function handleMcpRequest(
  html: string,
  req: IncomingMessage,
  res: ServerResponse,
) {
  // Browser-based clients (MCP Inspector) call the endpoint cross-origin.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
  );
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  const server = createServerInstance(html);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res);
}
