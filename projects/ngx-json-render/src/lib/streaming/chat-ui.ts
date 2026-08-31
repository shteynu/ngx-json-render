import { DestroyRef, type Signal, inject, signal } from '@angular/core';
import type { Spec } from '@json-render/core';
import { createMixedStreamParser } from '@json-render/core';
import { applyPatch } from './patch';
import { createStreamSession, isAbortError, streamRequest } from './transport';

/**
 * A single message in the chat, which may contain text, a rendered UI spec,
 * or both.
 */
export interface ChatMessage {
  /** Unique message ID */
  id: string;
  /** Who sent this message */
  role: 'user' | 'assistant';
  /** Text content (conversational prose) */
  text: string;
  /** json-render Spec built from JSONL patches (null if no UI was generated) */
  spec: Spec | null;
}

/**
 * Options for {@link injectChatUI}.
 */
export interface ChatUIOptions {
  /** API endpoint that accepts `{ messages: Array<{ role, content }> }` and returns a text stream */
  api: string;
  /** Callback when streaming completes for a message */
  onComplete?: (message: ChatMessage) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /**
   * Transport, defaulting to the global `fetch`. Same contract as
   * `UIStreamOptions.fetch`: it receives the endpoint and a request
   * carrying the JSON body and the abort signal, and must resolve to a
   * `Response` whose `body` streams the reply.
   */
  fetch?: typeof globalThis.fetch;
}

/**
 * Return type for {@link injectChatUI}.
 */
export interface ChatUIReturn {
  /** All messages in the conversation */
  readonly messages: Signal<ChatMessage[]>;
  /** Whether currently streaming an assistant response */
  readonly isStreaming: Signal<boolean>;
  /** Error from the last request, if any */
  readonly error: Signal<Error | null>;
  /** Send a user message */
  send: (text: string) => Promise<void>;
  /**
   * Stop the in-flight reply, keeping whatever the assistant has said so far.
   * A no-op when nothing is streaming.
   */
  stop: () => void;
  /** Stop any reply and clear all messages and the error. */
  clear: () => void;
}

let chatMessageIdCounter = 0;
function generateChatId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  chatMessageIdCounter += 1;
  return `msg-${Date.now()}-${chatMessageIdCounter}`;
}

/**
 * Chat + GenUI: manages a multi-turn conversation where each assistant
 * message can contain both conversational text and a json-render UI spec.
 * The full message history is sent to the endpoint and the streamed response
 * is split into text lines and JSONL patch lines.
 *
 * Must be called in an injection context.
 */
export function injectChatUI(options: ChatUIOptions): ChatUIReturn {
  const messages = signal<ChatMessage[]>([]);
  const isStreaming = signal(false);
  const error = signal<Error | null>(null);
  const session = createStreamSession();

  inject(DestroyRef).onDestroy(() => session.cancel());

  const stop = () => {
    session.cancel();
    isStreaming.set(false);
  };

  const clear = () => {
    stop();
    messages.set([]);
    error.set(null);
  };

  const send = async (text: string) => {
    if (!text.trim()) return;

    const gate = session.begin();

    const userMessage: ChatMessage = {
      id: generateChatId(),
      role: 'user',
      text: text.trim(),
      spec: null,
    };

    const assistantId = generateChatId();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      text: '',
      spec: null,
    };

    /**
     * Drop this turn's assistant bubble if it never got any text.
     *
     * Deliberately outside the gate: the edit is scoped to this request's own
     * message id, so it is safe even once a newer request has appended its
     * turn — and a superseded request is exactly when it is needed, since an
     * empty bubble left behind renders as a blank reply and is serialised
     * into every later turn's history.
     */
    const dropEmptyPlaceholder = () => {
      messages.update((prev) =>
        prev.filter((m) => m.id !== assistantId || m.text.length > 0),
      );
    };

    // Built before the new turn is appended, so it carries the conversation so
    // far. Assistant turns with no text are left out: they say nothing to the
    // model, some providers reject empty content outright, and a turn being
    // superseded right now may still have its placeholder in the list.
    const historyForApi = [
      ...messages()
        .filter((m) => m.role !== 'assistant' || m.text.length > 0)
        .map((m) => ({
          role: m.role,
          content: m.text,
        })),
      { role: 'user' as const, content: text.trim() },
    ];

    // Append user message and empty assistant placeholder
    messages.update((prev) => [...prev, userMessage, assistantMessage]);
    isStreaming.set(true);
    error.set(null);

    // Mutable state for accumulating the assistant response
    let accumulatedText = '';
    let currentSpec: Spec = { root: '', elements: {} };
    let hasSpec = false;

    const parser = createMixedStreamParser({
      onPatch(patch) {
        hasSpec = true;
        // applyPatch returns a fresh spec that shares what the patch did not
        // touch, so the message can hold it directly — no snapshot copy.
        currentSpec = applyPatch(currentSpec, patch);
        const snapshot = currentSpec;
        gate.commit(() =>
          messages.update((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, spec: snapshot } : m,
            ),
          ),
        );
      },
      onText(line) {
        accumulatedText += (accumulatedText ? '\n' : '') + line;
        const snapshot = accumulatedText;
        gate.commit(() =>
          messages.update((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, text: snapshot } : m,
            ),
          ),
        );
      },
    });

    try {
      await streamRequest(
        {
          api: options.api,
          body: { messages: historyForApi },
          fetch: options.fetch,
          signal: gate.signal,
        },
        parser,
      );

      const finalMessage: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        text: accumulatedText,
        spec: hasSpec ? currentSpec : null,
      };
      gate.commit(() => options.onComplete?.(finalMessage));
    } catch (err) {
      // Unconditional: however this turn ended, its own bubble goes with it if
      // nothing was ever said into it. A superseded request usually unwinds by
      // abort, but one whose stream failed for its own reason after being
      // replaced would otherwise leave the placeholder behind.
      dropEmptyPlaceholder();
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
    messages: messages.asReadonly(),
    isStreaming: isStreaming.asReadonly(),
    error: error.asReadonly(),
    send,
    stop,
    clear,
  };
}
