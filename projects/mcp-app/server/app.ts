// The MCP server for the Material catalog, on `ngx-json-render/mcp/server`,
// which registers the `render-ui` tool and its view the way upstream's
// `createMcpApp` does, with a short description and a typed input schema.
// What is specific to this deployment is here: the catalog, a CSP for the
// Material fonts, and the ChatGPT widget domain.
//
// Entry points: `server.ts` (stdio and a local HTTP server) and `vercel.ts`
// (the hosted endpoint).
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { gzipSync } from 'node:zlib';
import type { Catalog } from '@json-render/core';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
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

/** The SDK's own reply to a method the transport does not serve. */
const METHOD_NOT_ALLOWED = JSON.stringify({
  jsonrpc: '2.0',
  error: { code: -32000, message: 'Method not allowed.' },
  id: null,
});

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
 *
 * Replies are plain JSON rather than a one-event SSE stream, gzipped when the
 * client accepts it: `resources/read` carries the whole view (about 1.6 MB of
 * JSON, some 360 kB gzipped), and nothing compresses an event stream on the
 * way out.
 *
 * A GET gets 405, which the spec allows: the server never sends a message of
 * its own, and the event stream a GET would open only sits idle until the
 * platform times the function out, after which clients open another one —
 * a function kept busy for as long as a client stays connected.
 */
export async function handleMcpRequest(
  html: string,
  req: IncomingMessage,
  res: ServerResponse,
) {
  // Browser-based clients (MCP Inspector) call the endpoint cross-origin.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
  );
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }
  if (req.method === 'GET') {
    res.setHeader('Allow', 'POST, DELETE, OPTIONS');
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(405).end(METHOD_NOT_ALLOWED);
    return;
  }

  const server = createServerInstance(html);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  const response = await transport.handleRequest(await toWebRequest(req));
  await writeResponse(response, req, res);
}

async function toWebRequest(req: IncomingMessage): Promise<Request> {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) {
      headers.append(name, v);
    }
  }
  const chunks: Buffer[] = [];
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    for await (const chunk of req) chunks.push(chunk as Buffer);
  }
  const url = new URL(
    req.url ?? '/',
    `http://${req.headers.host ?? 'localhost'}`,
  );
  return new Request(url, {
    method: req.method,
    headers,
    body: chunks.length > 0 ? Buffer.concat(chunks) : undefined,
  });
}

async function writeResponse(
  response: Response,
  req: IncomingMessage,
  res: ServerResponse,
) {
  response.headers.forEach((value, name) => res.setHeader(name, value));
  // No JSON body (a 202 for a notification), or an event stream: pass it
  // through as it comes.
  if (!response.headers.get('content-type')?.includes('application/json')) {
    res.writeHead(response.status).flushHeaders();
    if (!response.body) {
      res.end();
      return;
    }
    await pipeline(Readable.fromWeb(response.body as WebReadableStream), res);
    return;
  }
  let body = Buffer.from(await response.arrayBuffer());
  if (
    body.length > 1024 &&
    /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')
  ) {
    body = gzipSync(body);
    res.setHeader('Content-Encoding', 'gzip');
  }
  res.setHeader('Vary', 'Accept-Encoding');
  res.setHeader('Content-Length', body.length);
  res.writeHead(response.status).end(body);
}
