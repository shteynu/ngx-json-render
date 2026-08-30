import {
  DestroyRef,
  type Signal,
  computed,
  inject,
  signal,
} from '@angular/core';
import type {
  FlatElement,
  JsonPatch,
  Spec,
  SpecDataPart,
  UIElement,
} from '@json-render/core';
import {
  SPEC_DATA_PART_TYPE,
  applySpecPatch,
  createMixedStreamParser,
  getByPath,
  nestedToFlat,
  removeByPath,
  setByPath,
} from '@json-render/core';

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
 * Parse a single JSON line (patch or metadata).
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

    return { type: 'patch', patch: parsed as JsonPatch };
  } catch {
    return null;
  }
}

/**
 * Split a JSON Pointer into its segments, undoing RFC 6901's escapes.
 *
 * `@json-render/core` parses pointers the same way for `setByPath` and
 * friends but does not export the helper, so {@link copyAlongPath} carries
 * its own copy. The two must agree on where a path descends, or a write would
 * land on a node that was never copied.
 */
function parseJsonPointer(path: string): string[] {
  const raw = path.startsWith('/') ? path.slice(1).split('/') : path.split('/');
  return raw.map((token) => token.replace(/~1/g, '/').replace(/~0/g, '~'));
}

/**
 * Replace every node `path` descends through with a shallow copy of itself.
 *
 * `root` must already be private to the caller. Afterwards a mutating write
 * along that same path — `setByPath`, `removeByPath` — only ever touches
 * nodes nobody else is holding, while everything off the path stays shared.
 * That keeps a patch proportional to the depth of its path rather than to the
 * size of the spec, which matters when a stream applies hundreds of them.
 *
 * Descent stops at anything that is not an object: `setByPath` overwrites
 * such a node outright, and one that does not exist yet is created fresh, so
 * in neither case is there anything of the caller's left to protect.
 */
function copyAlongPath(root: Record<string, unknown>, path: string): void {
  const segments = parseJsonPointer(path);
  let current = root;

  // The final segment is written, not descended into, so it needs no copy.
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    const child = current[segment];
    if (child === null || typeof child !== 'object') return;

    const copy = Array.isArray(child)
      ? [...child]
      : { ...(child as Record<string, unknown>) };
    current[segment] = copy;
    current = copy as unknown as Record<string, unknown>;
  }
}

/**
 * Set a value at a spec path (for add/replace operations).
 */
function setSpecValue(newSpec: Spec, path: string, value: unknown): void {
  if (path === '/root') {
    newSpec.root = value as string;
    return;
  }

  if (path === '/state') {
    newSpec.state = value as Record<string, unknown>;
    return;
  }

  if (path.startsWith('/state/')) {
    if (!newSpec.state) newSpec.state = {};
    const statePath = path.slice('/state'.length); // e.g. "/posts"
    const state = newSpec.state as Record<string, unknown>;
    copyAlongPath(state, statePath);
    setByPath(state, statePath, value);
    return;
  }

  if (path.startsWith('/elements/')) {
    const pathParts = path.slice('/elements/'.length).split('/');
    const elementKey = pathParts[0];
    if (!elementKey) return;

    if (pathParts.length === 1) {
      newSpec.elements[elementKey] = value as UIElement;
    } else {
      const element = newSpec.elements[elementKey];
      if (element) {
        const propPath = '/' + pathParts.slice(1).join('/');
        const newElement = { ...element } as unknown as Record<string, unknown>;
        copyAlongPath(newElement, propPath);
        setByPath(newElement, propPath, value);
        newSpec.elements[elementKey] = newElement as unknown as UIElement;
      }
    }
  }
}

/**
 * Remove a value at a spec path.
 */
function removeSpecValue(newSpec: Spec, path: string): void {
  if (path === '/state') {
    delete newSpec.state;
    return;
  }

  if (path.startsWith('/state/') && newSpec.state) {
    const statePath = path.slice('/state'.length);
    const state = newSpec.state as Record<string, unknown>;
    copyAlongPath(state, statePath);
    removeByPath(state, statePath);
    return;
  }

  if (path.startsWith('/elements/')) {
    const pathParts = path.slice('/elements/'.length).split('/');
    const elementKey = pathParts[0];
    if (!elementKey) return;

    if (pathParts.length === 1) {
      const { [elementKey]: _, ...rest } = newSpec.elements;
      newSpec.elements = rest;
    } else {
      const element = newSpec.elements[elementKey];
      if (element) {
        const propPath = '/' + pathParts.slice(1).join('/');
        const newElement = { ...element } as unknown as Record<string, unknown>;
        copyAlongPath(newElement, propPath);
        removeByPath(newElement, propPath);
        newSpec.elements[elementKey] = newElement as unknown as UIElement;
      }
    }
  }
}

/**
 * Get a value at a spec path.
 */
function getSpecValue(spec: Spec, path: string): unknown {
  if (path === '/root') return spec.root;
  if (path === '/state') return spec.state;
  if (path.startsWith('/state/') && spec.state) {
    const statePath = path.slice('/state'.length);
    return getByPath(spec.state as Record<string, unknown>, statePath);
  }
  return getByPath(spec as unknown as Record<string, unknown>, path);
}

/**
 * Apply an RFC 6902 JSON patch to the current spec, returning a new spec
 * object (structural sharing for untouched elements).
 * Supports add, remove, replace, move, copy, and test operations.
 */
export function applyPatch(spec: Spec, patch: JsonPatch): Spec {
  const newSpec = {
    ...spec,
    elements: { ...spec.elements },
    ...(spec.state ? { state: { ...spec.state } } : {}),
  };

  switch (patch.op) {
    case 'add':
    case 'replace': {
      setSpecValue(newSpec, patch.path, patch.value);
      break;
    }
    case 'remove': {
      removeSpecValue(newSpec, patch.path);
      break;
    }
    case 'move': {
      if (!patch.from) break;
      const moveValue = getSpecValue(newSpec, patch.from);
      removeSpecValue(newSpec, patch.from);
      setSpecValue(newSpec, patch.path, moveValue);
      break;
    }
    case 'copy': {
      if (!patch.from) break;
      const copyValue = getSpecValue(newSpec, patch.from);
      setSpecValue(newSpec, patch.path, copyValue);
      break;
    }
    case 'test': {
      // test is a no-op for rendering purposes (validation only)
      break;
    }
  }

  return newSpec;
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
  send: (prompt: string, context?: Record<string, unknown>) => Promise<void>;
  /** Clear the current spec */
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
  let abortController: AbortController | null = null;

  inject(DestroyRef).onDestroy(() => {
    abortController?.abort();
  });

  const clear = () => {
    spec.set(null);
    error.set(null);
  };

  const send = async (prompt: string, context?: Record<string, unknown>) => {
    // Abort any existing request
    abortController?.abort();
    const controller = new AbortController();
    abortController = controller;

    // A superseded request must not write to the shared signals on its way
    // out: its `finally` would otherwise clear `isStreaming` while the request
    // that replaced it is still streaming.
    const isCurrent = () => abortController === controller;

    isStreaming.set(true);
    error.set(null);
    usage.set(null);
    rawLines.set([]);

    // Start with previous spec if provided, otherwise empty spec
    const previousSpec = context?.['previousSpec'] as Spec | undefined;
    let currentSpec: Spec =
      previousSpec && previousSpec.root
        ? { ...previousSpec, elements: { ...previousSpec.elements } }
        : { root: '', elements: {} };
    spec.set(currentSpec);

    const handleLine = (trimmed: string) => {
      const result = parseLine(trimmed);
      if (!result) return;
      if (result.type === 'usage') {
        usage.set(result.usage);
      } else {
        rawLines.update((prev) => [...prev, trimmed]);
        currentSpec = applyPatch(currentSpec, result.patch);
        spec.set(currentSpec);
      }
    };

    // Bound, because a bare `globalThis.fetch` called as a plain function is
    // an illegal invocation in the browser.
    const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);

    try {
      const response = await doFetch(options.api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          context,
          currentSpec,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        // Try to parse JSON error response for better error messages
        let errorMessage = `HTTP error: ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData.message) {
            errorMessage = errorData.message;
          } else if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          // Ignore JSON parsing errors, use default message
        }
        throw new Error(errorMessage);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          handleLine(trimmed);
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        handleLine(buffer.trim());
      }

      options.onComplete?.(currentSpec);
    } catch (err) {
      if ((err as Error).name === 'AbortError' || !isCurrent()) {
        return;
      }
      const resolvedError = err instanceof Error ? err : new Error(String(err));
      error.set(resolvedError);
      options.onError?.(resolvedError);
    } finally {
      if (isCurrent()) {
        isStreaming.set(false);
      }
    }
  };

  return {
    spec: spec.asReadonly(),
    isStreaming: isStreaming.asReadonly(),
    error: error.asReadonly(),
    usage: usage.asReadonly(),
    rawLines: rawLines.asReadonly(),
    send,
    clear,
  };
}

/**
 * Convert a flat element list to a Spec.
 * Input elements use key/parentKey to establish identity and relationships.
 * Output spec uses the map-based format where key is the map entry key
 * and parent-child relationships are expressed through children arrays.
 */
export function flatToTree(elements: FlatElement[]): Spec {
  // The map is what gives every element its children array, so the second
  // pass can push into one without checking for it.
  const elementMap: Record<string, UIElement & { children: string[] }> = {};
  let root = '';

  // First pass: add all elements to map
  for (const element of elements) {
    elementMap[element.key] = {
      type: element.type,
      props: element.props,
      children: [],
      visible: element.visible,
    };
  }

  // Second pass: build parent-child relationships
  for (const element of elements) {
    if (element.parentKey) {
      const parent = elementMap[element.parentKey];
      if (parent) {
        parent.children.push(element.key);
      }
    } else {
      root = element.key;
    }
  }

  return { root, elements: elementMap };
}

// =============================================================================
// buildSpecFromParts — Derive Spec from AI SDK data parts
// =============================================================================

/**
 * A single part from the AI SDK's `message.parts` array. This is a minimal
 * structural type so that library helpers do not depend on the AI SDK.
 */
export interface DataPart {
  type: string;
  text?: string;
  data?: unknown;
}

/**
 * Type guard that validates a data part payload looks like a valid
 * {@link SpecDataPart} before we cast it.
 */
function isSpecDataPart(data: unknown): data is SpecDataPart {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  switch (obj['type']) {
    case 'patch':
      return typeof obj['patch'] === 'object' && obj['patch'] !== null;
    case 'flat':
    case 'nested':
      return typeof obj['spec'] === 'object' && obj['spec'] !== null;
    default:
      return false;
  }
}

/**
 * Build a `Spec` by replaying all spec data parts from a message's
 * parts array (AI SDK `UIMessage.parts`). Returns `null` if no spec data
 * parts are present.
 */
export function buildSpecFromParts(parts: DataPart[]): Spec | null {
  const spec: Spec = { root: '', elements: {} };
  let hasSpec = false;

  for (const part of parts) {
    if (part.type === SPEC_DATA_PART_TYPE) {
      if (!isSpecDataPart(part.data)) continue;
      const payload = part.data;
      if (payload.type === 'patch') {
        hasSpec = true;
        applySpecPatch(spec, payload.patch);
      } else if (payload.type === 'flat') {
        hasSpec = true;
        Object.assign(spec, payload.spec);
      } else if (payload.type === 'nested') {
        hasSpec = true;
        const flat = nestedToFlat(payload.spec);
        Object.assign(spec, flat);
      }
    }
  }

  return hasSpec ? spec : null;
}

/**
 * Extract and join all text content from a message's parts array.
 */
export function getTextFromParts(parts: DataPart[]): string {
  return parts
    .filter(
      (p): p is DataPart & { text: string } =>
        p.type === 'text' && typeof p.text === 'string',
    )
    .map((p) => p.text.trim())
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Extract both the json-render spec and the text content from a message's
 * parts array, as memoized signals. Angular counterpart of
 * `useJsonRenderMessage` from the other renderers.
 *
 * @example
 * ```ts
 * readonly msg = jsonRenderMessage(() => this.message().parts);
 * // template: @if (msg.hasSpec()) { <json-render [spec]="msg.spec()" ... /> }
 * ```
 */
export function jsonRenderMessage(
  parts: Signal<DataPart[]> | (() => DataPart[]),
): {
  spec: Signal<Spec | null>;
  text: Signal<string>;
  hasSpec: Signal<boolean>;
} {
  const result = computed(() => {
    const p = parts();
    return {
      spec: buildSpecFromParts(p),
      text: getTextFromParts(p),
    };
  });

  return {
    spec: computed(() => result().spec),
    text: computed(() => result().text),
    hasSpec: computed(() => {
      const s = result().spec;
      return s !== null && Object.keys(s.elements || {}).length > 0;
    }),
  };
}

// =============================================================================
// injectChatUI — Chat + GenUI
// =============================================================================

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
   * {@link UIStreamOptions.fetch}: it receives the endpoint and a request
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
  /** Clear all messages and reset the conversation */
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
  let abortController: AbortController | null = null;

  inject(DestroyRef).onDestroy(() => {
    abortController?.abort();
  });

  const clear = () => {
    messages.set([]);
    error.set(null);
  };

  const send = async (text: string) => {
    if (!text.trim()) return;

    // Abort any existing request
    abortController?.abort();
    const controller = new AbortController();
    abortController = controller;

    // See injectUIStream: a superseded request must not clear `isStreaming`
    // out from under the request that replaced it.
    const isCurrent = () => abortController === controller;

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

    // Build messages array for the API (full conversation history + new message).
    const historyForApi = [
      ...messages()
        .filter((m) => m.id !== userMessage.id && m.id !== assistantId)
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
    const currentSpec: Spec = { root: '', elements: {} };
    let hasSpec = false;

    const snapshotSpec = (): Spec => ({
      root: currentSpec.root,
      elements: { ...currentSpec.elements },
      ...(currentSpec.state ? { state: { ...currentSpec.state } } : {}),
    });

    // Bound, because a bare `globalThis.fetch` called as a plain function is
    // an illegal invocation in the browser.
    const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);

    try {
      const response = await doFetch(options.api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: historyForApi }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorMessage = `HTTP error: ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData.message) {
            errorMessage = errorData.message;
          } else if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          // Ignore JSON parsing errors
        }
        throw new Error(errorMessage);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();

      // Use createMixedStreamParser to classify lines
      const parser = createMixedStreamParser({
        onPatch(patch) {
          hasSpec = true;
          applySpecPatch(currentSpec, patch);
          const snapshot = snapshotSpec();
          messages.update((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, spec: snapshot } : m,
            ),
          );
        },
        onText(line) {
          accumulatedText += (accumulatedText ? '\n' : '') + line;
          messages.update((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, text: accumulatedText } : m,
            ),
          );
        },
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        parser.push(decoder.decode(value, { stream: true }));
      }
      parser.flush();

      // Build final message for onComplete callback
      const finalMessage: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        text: accumulatedText,
        spec: hasSpec ? snapshotSpec() : null,
      };
      options.onComplete?.(finalMessage);
    } catch (err) {
      if ((err as Error).name === 'AbortError' || !isCurrent()) {
        return;
      }
      const resolvedError = err instanceof Error ? err : new Error(String(err));
      error.set(resolvedError);
      // Remove empty assistant message on error
      messages.update((prev) =>
        prev.filter((m) => m.id !== assistantId || m.text.length > 0),
      );
      options.onError?.(resolvedError);
    } finally {
      if (isCurrent()) {
        isStreaming.set(false);
      }
    }
  };

  return {
    messages: messages.asReadonly(),
    isStreaming: isStreaming.asReadonly(),
    error: error.asReadonly(),
    send,
    clear,
  };
}
