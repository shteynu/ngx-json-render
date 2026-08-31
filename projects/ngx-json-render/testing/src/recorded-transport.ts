import type { Spec } from '@json-render/core';

/**
 * The lines of one recorded response body, in the order the server sent them,
 * without their trailing newlines.
 */
export type Recording = readonly string[];

/**
 * What to replay for a request. Either one recording for every request, a
 * lookup by prompt, or a function for anything more involved.
 */
export type Recordings =
  | Recording
  | Readonly<Record<string, Recording>>
  | ((
      prompt: string,
      body: Readonly<Record<string, unknown>>,
    ) => Recording | undefined);

/** An error the recorded server answers with instead of a stream. */
export interface RecordedFailure {
  /** HTTP status. Defaults to 500. */
  status?: number;
  /** The `message` field of the JSON error body. */
  message?: string;
}

/** Options for {@link recordedTransport}. */
export interface RecordedTransportOptions {
  /**
   * Milliseconds between lines — the pace a model would emit them at.
   * Defaults to 0, which still yields to the event loop between lines, so a
   * test can observe the stream in flight.
   */
  delayMs?: number;
  /**
   * Answer with an error instead of a stream. A function is called per
   * request, so a test can turn the failure on and off between sends.
   */
  fail?: RecordedFailure | (() => RecordedFailure | null | undefined);
  /**
   * Pull the prompt out of the request body. The default reads `prompt`
   * (what `injectUIStream` sends) and falls back to the last message's
   * content (what `injectChatUI` sends).
   */
  promptOf?: (body: Readonly<Record<string, unknown>>) => string;
}

/** The rejection `fetch` raises when its signal fires. */
function abortError(): Error {
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

/** A JSON error body, shaped the way the streaming hooks read it. */
function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function parseBody(body: BodyInit | null | undefined): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(String(body ?? '{}'));
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * The prompt of a request, from either hook's body shape. Both are the
 * package's own, so the default knows them and a test does not have to.
 */
function defaultPromptOf(body: Readonly<Record<string, unknown>>): string {
  const prompt = body['prompt'];
  if (typeof prompt === 'string') return prompt;

  const messages = body['messages'];
  if (!Array.isArray(messages) || messages.length === 0) return '';
  const last: unknown = messages[messages.length - 1];
  const content = (last as { content?: unknown } | null)?.content;
  return typeof content === 'string' ? content : '';
}

function toFinder(
  recordings: Recordings,
): (prompt: string, body: Record<string, unknown>) => Recording | undefined {
  if (typeof recordings === 'function') return recordings;
  if (Array.isArray(recordings)) return () => recordings as Recording;
  const byPrompt = recordings as Readonly<Record<string, Recording>>;
  return (prompt) => byPrompt[prompt];
}

function replay(
  lines: Recording,
  delayMs: number,
  signal: AbortSignal | null,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      let index = 0;
      let timer: ReturnType<typeof setTimeout> | null = null;

      // A superseded or stopped generation has to die mid-flight the way a
      // real request does, or a test of that behaviour proves nothing.
      const onAbort = () => {
        if (timer) clearTimeout(timer);
        controller.error(abortError());
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      const push = () => {
        if (index >= lines.length) {
          signal?.removeEventListener('abort', onAbort);
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(`${lines[index++]}\n`));
        timer = setTimeout(push, delayMs);
      };
      timer = setTimeout(push, delayMs);
    },
  });
}

/**
 * A `fetch` that answers the streaming hooks from a recording instead of a
 * server.
 *
 * Both {@link injectUIStream} and {@link injectChatUI} take any function with
 * fetch's shape, so a test runs the real client — request body, streamed
 * lines, usage metadata, abort on supersede — with no server, no API key and
 * no global patched behind the test's back. Only the transport is recorded.
 *
 * @example
 * ```ts
 * const ui = injectUIStream({
 *   api: '/api/generate',
 *   fetch: recordedTransport(specStream(spec)),
 * });
 * ```
 *
 * @example Different answers per prompt, at a visible pace:
 * ```ts
 * recordedTransport(
 *   { 'a dashboard': specStream(dashboard), 'a form': specStream(form) },
 *   { delayMs: 20 },
 * );
 * ```
 */
export function recordedTransport(
  recordings: Recordings,
  options: RecordedTransportOptions = {},
): typeof globalThis.fetch {
  const { delayMs = 0, promptOf = defaultPromptOf } = options;
  const find = toFinder(recordings);

  return async (_input, init) => {
    const failure =
      typeof options.fail === 'function' ? options.fail() : options.fail;
    if (failure) {
      return errorResponse(
        failure.status ?? 500,
        failure.message ?? 'The recorded server failed this request.',
      );
    }

    const body = parseBody(init?.body);
    const prompt = promptOf(body);
    const lines = find(prompt, body);
    if (!lines) {
      return errorResponse(404, `No recording for ${JSON.stringify(prompt)}.`);
    }

    const signal = init?.signal ?? null;
    if (signal?.aborted) throw abortError();

    return new Response(replay(lines, delayMs, signal), { status: 200 });
  };
}

/** Escape a JSON Pointer segment (RFC 6901). */
function pointer(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * The JSONL patch lines a model would emit to build `spec`: the root, then
 * the state, then one line per element in declaration order.
 *
 * Recording a stream by hand means writing patches by hand; this writes them
 * from the spec a test already has, so the test says what it renders rather
 * than how the wire spells it.
 */
export function specStream(spec: Spec): string[] {
  const lines = [
    JSON.stringify({ op: 'add', path: '/root', value: spec.root }),
  ];
  if (spec.state) {
    lines.push(
      JSON.stringify({ op: 'add', path: '/state', value: spec.state }),
    );
  }
  for (const [key, element] of Object.entries(spec.elements ?? {})) {
    lines.push(
      JSON.stringify({
        op: 'add',
        path: `/elements/${pointer(key)}`,
        value: element,
      }),
    );
  }
  return lines;
}

/**
 * The usage metadata line `injectUIStream` reads into its `usage` signal.
 * Append it to a recording to exercise that path.
 */
export function usageLine(usage: {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}): string {
  return JSON.stringify({
    __meta: 'usage',
    promptTokens: usage.promptTokens ?? 0,
    completionTokens: usage.completionTokens ?? 0,
    totalTokens: usage.totalTokens ?? 0,
  });
}
