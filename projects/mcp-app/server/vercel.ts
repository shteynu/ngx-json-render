// The hosted endpoint: a Vercel Node.js function that serves the MCP server
// in `app.ts` at /mcp. `npm run build:mcp-app -- --vercel` bundles it, with
// every dependency and the view inlined, into `.vercel/output` (Vercel's Build
// Output API), so the function needs no `node_modules` at runtime.
import type { IncomingMessage, ServerResponse } from 'node:http';
import html from 'mcp-app-view.html';
import { handleMcpRequest } from './node';

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  try {
    await handleMcpRequest(html, req, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' }).end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        }),
      );
    }
  }
}
