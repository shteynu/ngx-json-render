// The MCP server half of an MCP App: one `render-ui` tool that takes a
// json-render spec, and the `ui://` view a host renders it in. Registered the
// way upstream's `createMcpApp` (`@json-render/mcp`) does it, same tool name
// and same view resource, with a short description and a typed input schema
// (`tool.ts`) in place of `catalog.prompt()` and `catalog.zodSchema()`.
//
// Nothing here is Angular-specific: the Angular part is the view, passed in
// as one HTML document.
import type { Catalog } from '@json-render/core';
import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from '@modelcontextprotocol/ext-apps/server';
import type { McpUiResourceCsp } from '@modelcontextprotocol/ext-apps';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { withSendMessage } from './actions';
import {
  renderUiDescription,
  specInputSchema,
  specOutputSchema,
  specProblems,
} from './tool';

/** Options for {@link createRenderUiServer}. */
export interface RenderUiServerOptions {
  /** The components and actions the model may use. */
  catalog: Catalog;
  /** The view: one self-contained HTML document that renders the spec. */
  html: string;
  /** The server's name, as hosts list it. Default `'ngx-json-render'`. */
  name?: string;
  /** The server's version. Default `'0.0.0'`. */
  version?: string;
  /** The tool's name; the view resource is `ui://<toolName>/view.html`. Default `'render-ui'`. */
  toolName?: string;
  /** The tool's title, as hosts show it. Default `'Render UI'`. */
  title?: string;
  /** The tool's description. Default: {@link renderUiDescription} for the catalog. */
  description?: string;
  /**
   * Add the `sendMessage` action to the catalog the model sees, so a button
   * in the view can post a message to the chat as the user. The view handles
   * it with `injectJsonRenderApp().handlers` from `ngx-json-render/mcp`.
   */
  sendMessage?: boolean;
  /**
   * The origins the view may load from (`resourceDomains`) and connect to
   * (`connectDomains`). Left out, the host's default applies, which the MCP
   * Apps spec defines as none.
   */
  csp?: McpUiResourceCsp;
  /**
   * The origin ChatGPT derives the view's sandbox origin from, which its
   * plugin directory requires, unique per plugin. Set through the OpenAI
   * alias rather than `_meta.ui.domain`, because that key's format is up to
   * each host and Claude expects a `{hash}.claudemcpcontent.com` value there.
   */
  widgetDomain?: string;
}

/**
 * An MCP server with a `render-ui` tool for `catalog` and its `ui://` view.
 * Connect it to any transport: `StdioServerTransport` for a local host,
 * or {@link handleRenderUiRequest} for Streamable HTTP.
 *
 * The tool checks a spec against the catalog before it echoes it back. A
 * rejected spec goes back to the model as an error it can fix.
 */
export function createRenderUiServer(options: RenderUiServerOptions) {
  const catalog = options.sendMessage
    ? withSendMessage(options.catalog)
    : options.catalog;
  const {
    html,
    name = 'ngx-json-render',
    version = '0.0.0',
    toolName = 'render-ui',
    title = 'Render UI',
    description = renderUiDescription(catalog),
    csp,
    widgetDomain,
  } = options;
  const resourceUri = `ui://${toolName}/view.html`;
  const server = new McpServer({ name, version });
  registerAppTool(
    server,
    toolName,
    {
      title,
      description,
      inputSchema: { spec: specInputSchema(catalog) },
      outputSchema: { spec: specOutputSchema },
      // It only echoes the spec back for the view to draw: nothing is read
      // from or written to any system.
      annotations: {
        title,
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: { ui: { resourceUri } },
    },
    // The SDK has already parsed `spec` against the input schema; what is
    // left is the structure between elements. The text keeps upstream's
    // shape, the bare spec, which is what views built on
    // `@json-render/mcp/app` read.
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
  const meta: Record<string, unknown> = {};
  if (csp) meta['ui'] = { csp };
  if (widgetDomain) meta['openai/widgetDomain'] = widgetDomain;
  registerAppResource(
    server,
    resourceUri,
    resourceUri,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => ({
      contents: [
        {
          uri: resourceUri,
          mimeType: RESOURCE_MIME_TYPE,
          text: html,
          ...(Object.keys(meta).length > 0 && { _meta: meta }),
        },
      ],
    }),
  );
  return server;
}

/**
 * Serve one Streamable HTTP request, statelessly: a fresh server and
 * transport per request, so it runs unchanged on a serverless or edge
 * function (anything with web `Request` and `Response`). Answers CORS,
 * because browser-based clients such as MCP Inspector call cross-origin.
 */
export async function handleRenderUiRequest(
  options: RenderUiServerOptions,
  request: Request,
): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  const server = createRenderUiServer(options);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    // One JSON body per request: nothing here streams, and a serverless
    // function returns as soon as the response is complete.
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(request);
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      headers.set(key, value);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } finally {
    await transport.close();
    await server.close();
  }
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
};
