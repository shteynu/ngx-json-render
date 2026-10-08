import {
  DestroyRef,
  type Signal,
  computed,
  inject,
  signal,
} from '@angular/core';
import type { Spec } from '@json-render/core';
import { App } from '@modelcontextprotocol/ext-apps';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

/** Options for {@link injectJsonRenderApp}. */
export interface JsonRenderAppOptions {
  /** App name sent to the host during initialization. Defaults to `"json-render"`. */
  name?: string;
  /** App version sent to the host. Defaults to `"1.0.0"`. */
  version?: string;
  /**
   * Render the spec while the model is still writing the tool call, from the
   * host's `toolinputpartial` notifications. The host "heals" the truncated
   * JSON, so each partial spec is valid but may end in a half-written
   * element; the renderer skips children that do not exist yet. Defaults to
   * `true`. `useJsonRenderApp` in `@json-render/mcp/app` has no equivalent —
   * it waits for the tool result.
   */
  streamPartialInput?: boolean;
  /**
   * Transport to the host. Omit it inside a real MCP Apps iframe: `App`
   * then talks to `window.parent` over `postMessage`. Tests pass one end of
   * an in-memory pair here and an `AppBridge` on the other.
   */
  transport?: Transport;
  /**
   * Report the page's size to the host as it changes, so the iframe grows
   * with the rendered UI. Defaults to `true`; needs `ResizeObserver`.
   */
  autoResize?: boolean;
}

/**
 * What {@link injectJsonRenderApp} returns — the fields of
 * `UseJsonRenderAppReturn` from `@json-render/mcp/app`, as signals.
 */
export interface JsonRenderApp {
  /** The current spec; `null` until the first tool input or result. */
  readonly spec: Signal<Spec | null>;
  /** Whether the app is still connecting to the host. */
  readonly connecting: Signal<boolean>;
  /** Whether the app is connected to the host. */
  readonly connected: Signal<boolean>;
  /** Connection error, if any. */
  readonly error: Signal<Error | null>;
  /** Whether the spec is still arriving: pass it to `<json-render [loading]>`. */
  readonly loading: Signal<boolean>;
  /** The underlying MCP Apps `App`. */
  readonly app: App;
  /**
   * Call a tool on the MCP server and replace the spec with its result —
   * for refresh and drill-down interactions.
   */
  callServerTool(name: string, args?: Record<string, unknown>): Promise<void>;
  /**
   * Post a user message to the host's chat, so the model answers what the
   * user did in the view. `data`, if given, follows the text as a JSON block.
   * Rejects when the host does not accept messages from views or turns this
   * one down, so an action's `onError` runs.
   */
  sendMessage(text: string, data?: Record<string, unknown>): Promise<void>;
}

/** The text of a {@link JsonRenderApp.sendMessage} message. */
export function messageText(
  text: string,
  data?: Record<string, unknown>,
): string {
  if (!data) return text;
  return `${text}\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
}

interface ToolResultLike {
  content?: { type: string; text?: string }[];
}

/**
 * Read a spec out of a tool result. Same rule as `@json-render/mcp/app`: the
 * first text block, parsed as JSON, either a bare spec or `{ spec }`.
 */
export function parseSpecFromToolResult(result: ToolResultLike): Spec | null {
  const text = result.content?.find((c) => c.type === 'text')?.text;
  if (!text) return null;
  try {
    return specFrom(JSON.parse(text));
  } catch {
    return null;
  }
}

/** A bare spec, or the `spec` field of a tool's arguments or result. */
function specFrom(value: unknown): Spec | null {
  if (!value || typeof value !== 'object') return null;
  const spec = 'spec' in value ? (value as { spec: unknown }).spec : value;
  if (!spec || typeof spec !== 'object' || !('root' in spec)) return null;
  return spec as Spec;
}

/**
 * Connect an Angular app running inside an MCP Apps iframe to its host and
 * keep the json-render spec the model sent in a signal. The Angular
 * counterpart of `useJsonRenderApp` from `@json-render/mcp/app`; the server
 * side is `createMcpApp` from `@json-render/mcp`, unchanged.
 *
 * Call it in an injection context. The connection closes when the injector
 * that created it is destroyed.
 *
 * ```ts
 * readonly mcp = injectJsonRenderApp();
 * // <json-render [spec]="mcp.spec()" [loading]="mcp.loading()" [registry]="registry" />
 * ```
 */
export function injectJsonRenderApp(
  options: JsonRenderAppOptions = {},
): JsonRenderApp {
  const {
    name = 'json-render',
    version = '1.0.0',
    streamPartialInput = true,
    transport,
    autoResize = true,
  } = options;

  const spec = signal<Spec | null>(null);
  const loading = signal(true);
  const connected = signal(false);
  const error = signal<Error | null>(null);

  const app = new App({ name, version }, {}, { autoResize });

  // Listeners go on before connect(), so a notification the host sends right
  // after the handshake is not lost.
  if (streamPartialInput) {
    app.addEventListener('toolinputpartial', ({ arguments: args }) => {
      const partial = specFrom(args);
      if (partial) spec.set(partial);
    });
  }
  app.addEventListener('toolinput', ({ arguments: args }) => {
    const input = specFrom(args);
    if (input) spec.set(input);
  });
  app.addEventListener('toolresult', (result) => {
    const parsed = parseSpecFromToolResult(result);
    if (parsed) spec.set(parsed);
    loading.set(false);
  });
  app.addEventListener('toolcancelled', () => loading.set(false));

  app
    .connect(transport)
    .then(() => connected.set(true))
    .catch((err: unknown) =>
      error.set(err instanceof Error ? err : new Error(String(err))),
    );

  inject(DestroyRef).onDestroy(() => {
    app.close().catch(() => undefined);
  });

  return {
    spec: spec.asReadonly(),
    connecting: computed(() => !connected() && !error()),
    connected: connected.asReadonly(),
    error: error.asReadonly(),
    loading: loading.asReadonly(),
    app,
    async callServerTool(toolName, args = {}) {
      loading.set(true);
      try {
        const result = await app.callServerTool({
          name: toolName,
          arguments: args,
        });
        const parsed = parseSpecFromToolResult(result);
        if (parsed) spec.set(parsed);
      } finally {
        loading.set(false);
      }
    },
    async sendMessage(text, data) {
      if (!app.getHostCapabilities()?.message) {
        throw new Error('The host does not accept messages from the view.');
      }
      const result = await app.sendMessage({
        role: 'user',
        content: [{ type: 'text', text: messageText(text, data) }],
      });
      if (result.isError) throw new Error('The host declined the message.');
    },
  };
}
