// Local entry points for the MCP server in `app.ts`:
//
//   npm run build:mcp-app
//   node dist/mcp-app/server.mjs            # stdio, for Claude Desktop / Cursor / VS Code
//   node dist/mcp-app/server.mjs --http     # Streamable HTTP on :3001/mcp
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServerInstance } from './app';
import { handleMcpRequest } from './node';

const html = readFileSync(new URL('./view.html', import.meta.url), 'utf8');

async function main() {
  if (!process.argv.includes('--http')) {
    await createServerInstance(html).connect(new StdioServerTransport());
    return;
  }

  const port = Number(process.env['PORT'] ?? 3001);
  createServer((req, res) => {
    if (!req.url?.startsWith('/mcp')) {
      res.writeHead(404).end();
      return;
    }
    handleMcpRequest(html, req, res).catch((err: unknown) => {
      console.error(err);
      if (!res.headersSent) res.writeHead(500).end();
    });
  }).listen(port, () => {
    console.error(`MCP server on http://localhost:${port}/mcp`);
  });
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
