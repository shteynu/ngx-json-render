import type { LiveSettings } from './api-key';

/** Messages exactly as the Messages API wants them. */
export interface LiveMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const MAX_TOKENS = 8000;

/**
 * Below the default `high`. The output contract is fully specified by
 * `catalog.prompt()` and the specs are small, so the extra thinking mostly
 * buys latency — and the visitor is paying for it.
 */
const EFFORT = 'medium';

/** What the live transport needs from the tab it is standing in for. */
export interface LiveServer {
  /** The visitor's key and model, or null when there is no key. */
  readonly settings: () => LiveSettings | null;
  /** System prompt — `catalog.prompt()`, in the mode this tab needs. */
  readonly system: () => string;
  /** Turn the client's own request body into a conversation. */
  readonly messagesOf: (body: Record<string, unknown>) => LiveMessage[];
  /**
   * Append the `{"__meta":"usage"}` line `injectUIStream` reads. The chat
   * client has no usage signal, and the line would surface as prose.
   */
  readonly usageLine: boolean;
}

/** An error body shaped the way both clients read it. */
function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * The API answers errors as `{ error: { type, message } }`; the clients look
 * for a flat `message`, so translate rather than let them print an object.
 */
async function translateError(response: Response): Promise<Response> {
  let message = `The API returned ${response.status}.`;
  try {
    const body = (await response.json()) as {
      error?: { message?: string; type?: string };
    };
    if (body.error?.message) {
      message = `${body.error.type ?? 'error'}: ${body.error.message}`;
    }
  } catch {
    // Keep the status-only message.
  }
  return errorResponse(response.status, message);
}

/**
 * Re-emit an SSE response as the newline-delimited body both clients expect.
 *
 * The model's visible text *is* the JSONL — `catalog.prompt()` tells it to
 * emit one patch per line — so the text deltas pass through untouched and
 * only the trailing usage line is synthesised, out of `message_start` and
 * `message_delta`.
 */
function patchLines(
  sse: ReadableStream<Uint8Array>,
  usageLine: boolean,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = sse.getReader();
      let buffer = '';
      let promptTokens = 0;
      let completionTokens = 0;

      const handle = (payload: string) => {
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(payload) as Record<string, unknown>;
        } catch {
          // A frame this transport does not understand is not worth killing a
          // generation over; the clients skip unreadable lines too.
          return;
        }
        const type = String(event['type']);

        if (type === 'content_block_delta') {
          const delta = event['delta'] as { type?: string; text?: string };
          // Thinking deltas arrive here too, and are not part of the spec.
          if (delta?.type === 'text_delta' && delta.text) {
            controller.enqueue(encoder.encode(delta.text));
          }
          return;
        }
        if (type === 'message_start') {
          const message = event['message'] as {
            usage?: { input_tokens?: number };
          };
          promptTokens = message?.usage?.input_tokens ?? 0;
          return;
        }
        if (type === 'message_delta') {
          const usage = event['usage'] as { output_tokens?: number };
          completionTokens = usage?.output_tokens ?? completionTokens;
          return;
        }
        if (type === 'error') {
          const error = event['error'] as { message?: string };
          throw new Error(error?.message ?? 'The stream reported an error.');
        }
      };

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            handle(line.slice('data:'.length).trim());
          }
        }

        if (usageLine) {
          const meta = {
            __meta: 'usage',
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
          };
          // Leading newline: the last patch line may still be open.
          controller.enqueue(encoder.encode(`\n${JSON.stringify(meta)}\n`));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      } finally {
        reader.releaseLock();
      }
    },
  });
}

/**
 * A `fetch` that calls the Messages API directly from the browser with the
 * visitor's own key.
 *
 * This is the same seam the recorded transport uses, so both tabs run the
 * shipped clients unchanged — only where the bytes come from differs.
 */
export function liveTransport(server: LiveServer): typeof globalThis.fetch {
  return async (_url, init) => {
    const settings = server.settings();
    if (!settings) {
      return errorResponse(401, 'No API key — add one to run against a model.');
    }

    const body = JSON.parse(String(init?.body ?? '{}')) as Record<
      string,
      unknown
    >;

    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': settings.key,
          'anthropic-version': API_VERSION,
          // Required for a call made from a page: the API rejects browser
          // origins that do not say so. The official SDK sends this same
          // header when constructed with `dangerouslyAllowBrowser`.
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: settings.model,
          max_tokens: MAX_TOKENS,
          stream: true,
          output_config: { effort: EFFORT },
          system: server.system(),
          messages: server.messagesOf(body),
        }),
        signal: init?.signal ?? null,
      });
    } catch (err) {
      // An abort has to stay an abort, or the client mistakes a superseded
      // generation for a failure.
      if ((err as Error).name === 'AbortError') throw err;
      return errorResponse(
        503,
        'The request never reached the API — check the key, the network, or a blocked cross-origin call.',
      );
    }

    if (!response.ok) return translateError(response);
    if (!response.body) return errorResponse(502, 'The API sent no body.');

    return new Response(patchLines(response.body, server.usageLine), {
      status: 200,
    });
  };
}

/**
 * Pick a transport per request rather than per tab, so switching the key on
 * takes effect on the next generation without rebuilding the client.
 */
export function liveOrRecorded(
  isLive: () => boolean,
  live: typeof globalThis.fetch,
  recorded: typeof globalThis.fetch,
): typeof globalThis.fetch {
  return (url, init) => (isLive() ? live : recorded)(url, init);
}
