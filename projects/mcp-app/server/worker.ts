// The hosted endpoint as a Cloudflare Worker: the MCP server in `app.ts` at
// /mcp. `npm run build:mcp-app -- --cloudflare` bundles it, with every
// dependency and the view inlined, into `.cloudflare/worker.mjs`, and the
// landing page into `.cloudflare/static`, which `wrangler.jsonc` serves as
// static assets before the Worker runs.
//
// Responses are not compressed here: Cloudflare compresses JSON on its way
// out, outside the Worker's CPU time.
import html from 'mcp-app-view.html';
import { handleMcpFetch } from './app';

export default {
  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname !== '/mcp' && !pathname.startsWith('/mcp/')) {
      return new Response('Not found', { status: 404 });
    }
    try {
      return await handleMcpFetch(html, request);
    } catch (err) {
      console.error(err);
      return Response.json(
        {
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        },
        { status: 500 },
      );
    }
  },
};
