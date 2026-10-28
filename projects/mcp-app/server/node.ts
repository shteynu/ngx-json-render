// `handleMcpFetch` on Node's `http` API, for the local HTTP server in
// `server.ts`.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { gzipSync } from 'node:zlib';
import { handleMcpFetch } from './app';

/**
 * Serve one MCP request. JSON replies are gzipped when the client accepts it:
 * the view's `resources/read` goes from about 1.6 MB to some 340 kB, and
 * nothing in front of a Node function compresses it otherwise.
 */
export async function handleMcpRequest(
  html: string,
  req: IncomingMessage,
  res: ServerResponse,
) {
  const response = await handleMcpFetch(html, await toWebRequest(req));
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
