// The MCP server for the Material catalog, on `ngx-json-render/mcp/server`,
// which registers the `render-ui` tool and its view the way upstream's
// `createMcpApp` does, with a short description and a typed input schema.
// What is specific to this deployment is here: the catalog, a CSP for the
// Material fonts, and the ChatGPT widget domain.
//
// Entry points: `server.ts` (stdio and a local HTTP server), `vercel.ts`
// (the hosted endpoint) and `worker.ts` (the same endpoint on Cloudflare).
// This file stays free of Node APIs so the Worker can bundle it.
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
export const VIEW_DOMAIN =
  'https://ngx-json-render.angular-generative-ui-chat.workers.dev';

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
    version: '0.1.1',
    toolName: TOOL_NAME,
    description: renderUiDescription(catalog, { ui: 'Angular Material UI' }),
    csp: VIEW_CSP,
    widgetDomain: VIEW_DOMAIN,
  });
}

/** CORS for browser-based clients (MCP Inspector) calling cross-origin. */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
};

/**
 * Serve one Streamable HTTP request, statelessly: a fresh server and
 * transport per request, so it runs unchanged on a serverless function or a
 * Worker. Web standard `Request` in, `Response` out; `node.ts` adapts it to
 * Node's `http` API.
 *
 * Replies are plain JSON rather than a one-event SSE stream: `resources/read`
 * carries the whole view (about 1.6 MB of JSON), and nothing compresses an
 * event stream on the way out.
 *
 * A GET gets 405, which the spec allows: the server never sends a message of
 * its own, and the event stream a GET would open only sits idle until the
 * platform times the request out, after which clients open another one —
 * a function kept busy for as long as a client stays connected.
 */
export async function handleMcpFetch(
  html: string,
  request: Request,
): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method === 'GET') {
    return new Response(METHOD_NOT_ALLOWED, {
      status: 405,
      headers: {
        ...CORS_HEADERS,
        Allow: 'POST, DELETE, OPTIONS',
        'Content-Type': 'application/json',
      },
    });
  }
  await logRequest(request.clone());
  const server = createServerInstance(html);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  const response = await transport.handleRequest(request);
  // A JSON reply is complete; an event stream lives until the client leaves.
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    void transport.close();
    void server.close();
  }
  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(name, value);
  }
  return response;
}

/**
 * One log line per request: which JSON-RPC methods came in, the tool or
 * resource they name, the client's self-reported name on `initialize`, and
 * the User-Agent. Never the arguments, which carry the caller's data.
 */
async function logRequest(request: Request) {
  let messages: unknown;
  try {
    messages = await request.json();
  } catch {
    return;
  }
  const calls = (Array.isArray(messages) ? messages : [messages]).map(
    (message) => {
      const { method, params } = (message ?? {}) as {
        method?: string;
        params?: {
          name?: string;
          uri?: string;
          clientInfo?: { name?: string; version?: string };
        };
      };
      const detail =
        params?.name ??
        params?.uri ??
        (params?.clientInfo &&
          `${params.clientInfo.name}/${params.clientInfo.version}`);
      return detail ? `${method} ${detail}` : String(method);
    },
  );
  console.log(
    JSON.stringify({ mcp: calls, ua: request.headers.get('user-agent') }),
  );
}
