/** Anything that carries a recorded response body. */
interface Recorded {
  readonly lines: readonly string[];
}

/** How the recorded server behaves for the next request. */
export interface RecordedServer {
  /** Delay between lines, in ms — the pace a model would emit them. */
  readonly delayMs: number;
  /** When true, answer with a 500 instead of a stream. */
  readonly fail: () => boolean;
  /**
   * Pull the prompt out of the request body. The two clients word it
   * differently: `injectUIStream` sends `{ prompt }`, `injectChatUI` sends
   * `{ messages: [{ role, content }] }`.
   */
  readonly promptOf: (body: Record<string, unknown>) => string;
  /** Pick the recording to replay for a prompt. */
  readonly find: (prompt: string) => Recorded | undefined;
}

/** The abort a `fetch` raises when its signal fires. */
function abortError(): Error {
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

/** A JSON error body, shaped the way `injectUIStream` reads it. */
function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * A `fetch` that answers the demo's own endpoint from a recording.
 *
 * `injectUIStream` takes any function with fetch's shape, so the demo runs the
 * real client — request body, streamed JSONL, usage line, abort on supersede —
 * without a server or an API key. Only the transport is recorded.
 */
export function recordedTransport(
  server: RecordedServer,
): typeof globalThis.fetch {
  return async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<
      string,
      unknown
    >;
    const recording = server.find(server.promptOf(body));

    if (server.fail()) {
      return errorResponse(500, 'The model provider returned 503.');
    }
    if (!recording) {
      return errorResponse(404, 'No recording for that prompt.');
    }

    const signal = init?.signal ?? null;
    if (signal?.aborted) throw abortError();

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let index = 0;
        let timer: ReturnType<typeof setTimeout> | null = null;

        // A superseded generation has to stop mid-flight the way a real
        // request does, or the supersede this tab shows would be theatre.
        const onAbort = () => {
          if (timer) clearTimeout(timer);
          controller.error(abortError());
        };
        signal?.addEventListener('abort', onAbort, { once: true });

        const push = () => {
          if (index >= recording.lines.length) {
            signal?.removeEventListener('abort', onAbort);
            controller.close();
            return;
          }
          controller.enqueue(encoder.encode(`${recording.lines[index++]}\n`));
          timer = setTimeout(push, server.delayMs);
        };
        timer = setTimeout(push, server.delayMs);
      },
    });

    return new Response(stream, { status: 200 });
  };
}
