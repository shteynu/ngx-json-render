// The MCP server for the Material catalog, on `ngx-json-render/mcp/server`,
// which registers the `render-ui` tool and its view the way upstream's
// `createMcpApp` does, with a short description and a typed input schema.
// What is specific to this deployment is here: the catalog, a CSP for the
// Material fonts, and the ChatGPT widget domain.
//
// Entry points: `server.ts` (stdio and a local HTTP server) and `vercel.ts`
// (the hosted endpoint).
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Catalog } from '@json-render/core';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  createRenderUiServer,
  renderUiDescription,
} from 'ngx-json-render/mcp/server';
// The catalog alone, from `ngx-json-render-material/catalog`, so the server
// does not load the Angular components (and Angular) along with it.
import { mcpCatalog } from './catalog';

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

/** The origin ChatGPT derives the view's sandbox origin from. */
export const VIEW_DOMAIN = 'https://ngx-json-render.vercel.app';

/** A server exposing the `render-ui` tool and its `ui://` view. */
export function createServerInstance(
  html: string,
  catalog: Catalog = mcpCatalog,
) {
  return createRenderUiServer({
    catalog,
    html,
    name: 'ngx-json-render Material',
    version: '0.1.0',
    toolName: TOOL_NAME,
    description: renderUiDescription(catalog, { ui: 'Angular Material UI' }),
    csp: VIEW_CSP,
    widgetDomain: VIEW_DOMAIN,
  });
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
