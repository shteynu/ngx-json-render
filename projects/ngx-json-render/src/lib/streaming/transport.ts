/**
 * Sink for the decoded text of a streamed response. `@json-render/core`'s
 * mixed-stream parser already has this shape, so a hook can hand its own
 * consumer or the core one to {@link streamRequest} unchanged.
 */
export interface StreamConsumer {
  push(text: string): void;
  flush(): void;
}

/** One streamed POST: where to send it, what to send, and how to cancel it. */
export interface StreamRequest {
  api: string;
  body: unknown;
  fetch?: typeof globalThis.fetch;
  signal: AbortSignal;
}

/**
 * The write permit of a single request.
 *
 * A hook's signals are shared by every request it ever makes, so a request
 * that has been superseded must not write to them on its way out — its stale
 * spec would flash over the fresh one, and its `finally` would clear
 * `isStreaming` while its replacement is still streaming. Routing every write
 * and callback through {@link commit} makes that structural: a superseded
 * request has no way to reach the signals, rather than each write site being
 * individually responsible for remembering to check.
 */
export interface RequestGate {
  readonly signal: AbortSignal;
  /** Whether this request is still the session's current one. */
  isCurrent(): boolean;
  /** Run `write` only while this request is still the current one. */
  commit(write: () => void): void;
}

/**
 * Tracks which request owns a hook's signals. Each {@link begin} supersedes
 * the one before it.
 */
export interface StreamSession {
  begin(): RequestGate;
  /** Abort the in-flight request, leaving no request current. */
  cancel(): void;
}

export function createStreamSession(): StreamSession {
  let current: AbortController | null = null;

  return {
    begin(): RequestGate {
      current?.abort();
      const controller = new AbortController();
      current = controller;
      const isCurrent = () => current === controller;
      return {
        signal: controller.signal,
        isCurrent,
        commit(write) {
          if (isCurrent()) write();
        },
      };
    },
    cancel() {
      current?.abort();
      // Cleared, not just aborted: with no current controller the in-flight
      // request's gate closes too, so a stop() cannot be undone a moment later
      // by the request it just cancelled.
      current = null;
    },
  };
}

/** True for the rejection `fetch` and a stream reader raise on abort. */
export function isAbortError(error: unknown): boolean {
  return (error as Error | undefined)?.name === 'AbortError';
}

/**
 * Buffer decoded text and hand back whole lines, dropping blank ones. What is
 * left when the stream ends is flushed as a final line, since a model's last
 * line often arrives without its newline.
 */
export function createLineConsumer(
  onLine: (line: string) => void,
): StreamConsumer {
  let buffer = '';
  return {
    push(text) {
      buffer += text;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) onLine(trimmed);
      }
    },
    flush() {
      const trimmed = buffer.trim();
      buffer = '';
      if (trimmed) onLine(trimmed);
    },
  };
}

/**
 * Mine an error response for something better to show than its status code.
 */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (body.message) return String(body.message);
    if (body.error) return String(body.error);
  } catch {
    // A non-JSON error body is ordinary; the status line still says enough.
  }
  return `HTTP error: ${response.status}`;
}

/**
 * POST `body` and feed the streamed response to `consumer` until it ends.
 *
 * Both hooks share this so the request lifecycle — error mining, the reader
 * loop, the decoder's final flush — has one implementation to get right
 * rather than one per hook that has to be fixed twice.
 */
export async function streamRequest(
  request: StreamRequest,
  consumer: StreamConsumer,
): Promise<void> {
  // Bound, because a bare `globalThis.fetch` called as a plain function is
  // an illegal invocation in the browser.
  const doFetch = request.fetch ?? globalThis.fetch.bind(globalThis);

  const response = await doFetch(request.api, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request.body),
    signal: request.signal,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    consumer.push(decoder.decode(value, { stream: true }));
  }

  // Without the final, non-streaming decode a multi-byte character split
  // across the last chunk is dropped instead of surfacing.
  const tail = decoder.decode();
  if (tail) consumer.push(tail);

  consumer.flush();
}
