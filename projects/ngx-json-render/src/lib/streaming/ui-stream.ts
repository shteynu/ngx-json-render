import { DestroyRef, type Signal, inject, signal } from '@angular/core';
import type { JsonPatch, Spec } from '@json-render/core';
import { applyPatch } from './patch';
import {
  createLineConsumer,
  createStreamSession,
  isAbortError,
  streamRequest,
} from './transport';

/**
 * Token usage metadata from AI generation.
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Parse result for a single line — either a patch or usage metadata.
 */
type ParsedLine =
  | { type: 'patch'; patch: JsonPatch }
  | { type: 'usage'; usage: TokenUsage }
  | null;

/**
 * Parse a single JSON line (patch or metadata). Anything that is not one of
 * the two is dropped: half-written lines and stray prose are ordinary in a
 * model's output, and aborting the generation over one would lose the UI
 * built so far.
 */
function parseLine(line: string): ParsedLine {
  try {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) {
      return null;
    }
    const parsed = JSON.parse(trimmed);

    // Check for usage metadata
    if (parsed.__meta === 'usage') {
      return {
        type: 'usage',
        usage: {
          promptTokens: parsed.promptTokens ?? 0,
          completionTokens: parsed.completionTokens ?? 0,
          totalTokens: parsed.totalTokens ?? 0,
        },
      };
    }

    // Parseable JSON is not yet a patch: without this, a stray object would be
    // recorded as a raw line and handed to the engine as an opless patch.
    if (typeof parsed?.op !== 'string' || typeof parsed?.path !== 'string') {
      return null;
    }

    return { type: 'patch', patch: parsed as JsonPatch };
  } catch {
    return null;
  }
}

/**
 * Per-call options for {@link UIStreamReturn.send}.
 */
export interface UIStreamSendOptions {
  /** Arbitrary context forwarded to the endpoint as `context`. */
  context?: Record<string, unknown>;
  /**
   * Spec to refine instead of starting from an empty one. It is sent to the
   * endpoint as `currentSpec` and the streamed patches apply on top of it.
   */
  previousSpec?: Spec;
}

/**
 * Options for {@link injectUIStream}.
 */
export interface UIStreamOptions {
  /** API endpoint */
  api: string;
  /** Callback when complete */
  onComplete?: (spec: Spec) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /**
   * Transport, defaulting to the global `fetch`.
   *
   * Anything with fetch's shape works, so a test, a demo replaying a recorded
   * generation, or an app that has to add auth headers or route through its
   * own HTTP layer can supply one instead of patching the global. It is called
   * with the endpoint and a request carrying the JSON body and the abort
   * signal, and must resolve to a `Response` whose `body` is a readable
   * stream of the JSONL patches.
   */
  fetch?: typeof globalThis.fetch;
}

/**
 * Return type for {@link injectUIStream}.
 */
export interface UIStreamReturn {
  /** Current UI spec */
  readonly spec: Signal<Spec | null>;
  /** Whether currently streaming */
  readonly isStreaming: Signal<boolean>;
  /** Error if any */
  readonly error: Signal<Error | null>;
  /** Token usage from the last generation */
  readonly usage: Signal<TokenUsage | null>;
  /** Raw JSONL lines received from the stream (JSON patch lines) */
  readonly rawLines: Signal<string[]>;
  /** Send a prompt to generate UI */
  send: (prompt: string, options?: UIStreamSendOptions) => Promise<void>;
  /**
   * Stop the in-flight generation, keeping whatever has rendered so far.
   * A no-op when nothing is streaming.
   */
  stop: () => void;
  /** Stop any generation and clear the spec, error, usage and raw lines. */
  clear: () => void;
}

/**
 * Streaming UI generation. POSTs `{ prompt, context, currentSpec }` to the
 * endpoint and progressively applies the returned JSONL patch stream to the
 * `spec` signal, so partial UIs render as they arrive.
 *
 * Must be called in an injection context (aborts in-flight requests on
 * destroy).
 *
 * @example
 * ```ts
 * export class GeneratePage {
 *   readonly ui = injectUIStream({ api: '/api/generate' });
 * }
 * // template:
 * // <json-render [spec]="ui.spec()" [registry]="registry" [loading]="ui.isStreaming()" />
 * ```
 */
export function injectUIStream(options: UIStreamOptions): UIStreamReturn {
  const spec = signal<Spec | null>(null);
  const isStreaming = signal(false);
  const error = signal<Error | null>(null);
  const usage = signal<TokenUsage | null>(null);
  const rawLines = signal<string[]>([]);
  const session = createStreamSession();

  inject(DestroyRef).onDestroy(() => session.cancel());

  const stop = () => {
    session.cancel();
    isStreaming.set(false);
  };

  const clear = () => {
    // Aborting first is what makes this true: without it the in-flight
    // request puts its spec straight back on the next patch it applies.
    stop();
    spec.set(null);
    error.set(null);
    usage.set(null);
    rawLines.set([]);
  };

  const send = async (prompt: string, sendOptions?: UIStreamSendOptions) => {
    const gate = session.begin();

    isStreaming.set(true);
    error.set(null);
    usage.set(null);
    rawLines.set([]);

    const previousSpec = sendOptions?.previousSpec;
    let currentSpec: Spec =
      previousSpec && previousSpec.root
        ? { ...previousSpec, elements: { ...previousSpec.elements } }
        : { root: '', elements: {} };
    spec.set(currentSpec);

    const handleLine = (line: string) => {
      const parsed = parseLine(line);
      if (!parsed) return;
      gate.commit(() => {
        if (parsed.type === 'usage') {
          usage.set(parsed.usage);
          return;
        }
        rawLines.update((prev) => [...prev, line]);
        currentSpec = applyPatch(currentSpec, parsed.patch);
        spec.set(currentSpec);
      });
    };

    try {
      await streamRequest(
        {
          api: options.api,
          body: {
            prompt,
            context: sendOptions?.context,
            currentSpec,
          },
          fetch: options.fetch,
          signal: gate.signal,
        },
        createLineConsumer(handleLine),
      );

      gate.commit(() => options.onComplete?.(currentSpec));
    } catch (err) {
      if (isAbortError(err)) return;
      const resolvedError = err instanceof Error ? err : new Error(String(err));
      gate.commit(() => {
        error.set(resolvedError);
        options.onError?.(resolvedError);
      });
    } finally {
      gate.commit(() => isStreaming.set(false));
    }
  };

  return {
    spec: spec.asReadonly(),
    isStreaming: isStreaming.asReadonly(),
    error: error.asReadonly(),
    usage: usage.asReadonly(),
    rawLines: rawLines.asReadonly(),
    send,
    stop,
    clear,
  };
}
