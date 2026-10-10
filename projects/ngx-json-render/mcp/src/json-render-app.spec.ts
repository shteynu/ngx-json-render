import {
  EnvironmentInjector,
  createEnvironmentInjector,
  provideZonelessChangeDetection,
  runInInjectionContext,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Spec } from '@json-render/core';
import type { McpUiHostCapabilities } from '@modelcontextprotocol/ext-apps';
import { AppBridge } from '@modelcontextprotocol/ext-apps/app-bridge';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  type JsonRenderApp,
  type JsonRenderAppOptions,
  injectJsonRenderApp,
  messageText,
  parseSpecFromToolResult,
} from './json-render-app';

const spec: Spec = {
  root: 'title',
  elements: {
    title: { type: 'Heading', props: { content: 'Hi' }, children: [] },
  },
};

const text = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value) }],
});

afterEach(() => {
  TestBed.resetTestingModule();
});

/** Resolves once the signal-reading predicate holds, polling the event loop. */
async function until(predicate: () => boolean) {
  for (let i = 0; i < 100 && !predicate(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(predicate()).toBe(true);
}

/**
 * An MCP Apps host (the real `AppBridge`) on one end of an in-memory pair and
 * the app under test on the other.
 */
async function connect(
  options: JsonRenderAppOptions = {},
  hostCapabilities: McpUiHostCapabilities = { serverTools: {}, message: {} },
) {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  });
  const [hostSide, appSide] = InMemoryTransport.createLinkedPair();
  const bridge = new AppBridge(
    null,
    { name: 'test-host', version: '0' },
    hostCapabilities,
  );
  const initialized = new Promise<void>((resolve) => {
    bridge.oninitialized = () => resolve();
  });
  await bridge.connect(hostSide);

  const injector = createEnvironmentInjector(
    [],
    TestBed.inject(EnvironmentInjector),
  );
  const mcp: JsonRenderApp = runInInjectionContext(injector, () =>
    injectJsonRenderApp({ transport: appSide, autoResize: false, ...options }),
  );
  await initialized;
  await until(() => mcp.connected());
  return { bridge, mcp, injector };
}

describe('injectJsonRenderApp', () => {
  it('connects to the host and waits for a spec', async () => {
    const { mcp } = await connect();

    expect(mcp.connected()).toBe(true);
    expect(mcp.connecting()).toBe(false);
    expect(mcp.error()).toBeNull();
    expect(mcp.spec()).toBeNull();
    expect(mcp.loading()).toBe(true);
  });

  it('renders partial tool input while the model is still writing', async () => {
    const { bridge, mcp } = await connect();

    await bridge.sendToolInputPartial({ arguments: { spec } });
    await until(() => mcp.spec() !== null);

    expect(mcp.spec()).toEqual(spec);
    expect(mcp.loading()).toBe(true);
  });

  it('ignores partial input when streaming is turned off', async () => {
    const { bridge, mcp } = await connect({ streamPartialInput: false });

    await bridge.sendToolInputPartial({ arguments: { spec } });
    await bridge.sendToolInput({ arguments: { spec: { ...spec, root: 'x' } } });
    await until(() => mcp.spec() !== null);

    expect(mcp.spec()?.root).toBe('x');
  });

  it('ignores arguments that are not a spec', async () => {
    const { bridge, mcp } = await connect();

    await bridge.sendToolInputPartial({ arguments: { spec: 'nope' } });
    await bridge.sendToolInput({ arguments: { other: true } });
    await bridge.sendToolResult(text({ spec }));
    await until(() => !mcp.loading());

    expect(mcp.spec()).toEqual(spec);
  });

  it('takes the final spec from the tool result and stops loading', async () => {
    const { bridge, mcp } = await connect();
    const withState = { ...spec, state: { name: 'Ada' } };

    await bridge.sendToolInput({ arguments: { spec } });
    await bridge.sendToolResult(text(withState));
    await until(() => !mcp.loading());

    expect(mcp.spec()).toEqual(withState);
  });

  it('stops loading when the host cancels the tool call', async () => {
    const { bridge, mcp } = await connect();

    await bridge.sendToolCancelled({ reason: 'user' });
    await until(() => !mcp.loading());

    expect(mcp.spec()).toBeNull();
  });

  it('replaces the spec with the result of a server tool call', async () => {
    const { bridge, mcp } = await connect();
    const next = { ...spec, root: 'next' };
    const calls: unknown[] = [];
    bridge.oncalltool = async (params) => {
      calls.push(params);
      return text({ spec: next });
    };

    const pending = mcp.callServerTool('refresh', { page: 2 });
    expect(mcp.loading()).toBe(true);
    await pending;

    expect(calls).toEqual([
      expect.objectContaining({ name: 'refresh', arguments: { page: 2 } }),
    ]);
    expect(mcp.spec()).toEqual(next);
    expect(mcp.loading()).toBe(false);
  });

  it('stops loading when a server tool call fails', async () => {
    const { bridge, mcp } = await connect();
    bridge.oncalltool = async () => {
      throw new Error('boom');
    };

    await expect(mcp.callServerTool('refresh')).rejects.toThrow('boom');
    expect(mcp.loading()).toBe(false);
  });

  it('posts a user message to the chat, with the data as JSON', async () => {
    const { bridge, mcp } = await connect();
    const messages: unknown[] = [];
    bridge.onmessage = async (params) => {
      messages.push(params);
      return {};
    };

    await mcp.sendMessage('Approve the release', { release: '2.4', ok: true });

    expect(messages).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: messageText('Approve the release', {
              release: '2.4',
              ok: true,
            }),
          },
        ],
      },
    ]);
  });

  it('rejects when the host declines the message', async () => {
    const { bridge, mcp } = await connect();
    bridge.onmessage = async () => ({ isError: true });

    await expect(mcp.sendMessage('Approve')).rejects.toThrow(
      'The host declined the message.',
    );
  });

  it('rejects without sending when the host takes no messages', async () => {
    const { bridge, mcp } = await connect({}, { serverTools: {} });
    const onmessage = vi.fn(async () => ({}));
    bridge.onmessage = onmessage;

    await expect(mcp.sendMessage('Approve')).rejects.toThrow(
      'The host does not accept messages from the view.',
    );
    expect(onmessage).not.toHaveBeenCalled();
  });

  it('handles a sendMessage action and records how it went', async () => {
    const { bridge, mcp } = await connect();
    const messages: unknown[] = [];
    bridge.onmessage = async (params) => {
      messages.push(params);
      return {};
    };
    const { sendMessage } = mcp.handlers;
    expect(mcp.lastMessage()).toBeNull();

    await sendMessage!({ text: 'Show more', data: ['not', 'an', 'object'] });

    expect(messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Show more' }] },
    ]);
    expect(mcp.lastMessage()).toEqual({ ok: true });
  });

  it('records a failed sendMessage action and rethrows it', async () => {
    const { bridge, mcp } = await connect();
    const onmessage = vi.fn(async () => ({ isError: true }));
    bridge.onmessage = onmessage;
    const { sendMessage } = mcp.handlers;

    await expect(sendMessage!({ text: ' ' })).rejects.toThrow(
      'sendMessage needs a non-empty "text" param.',
    );
    expect(onmessage).not.toHaveBeenCalled();
    await expect(sendMessage!({ text: 'Approve' })).rejects.toThrow(
      'The host declined the message.',
    );
    expect(mcp.lastMessage()).toEqual({
      ok: false,
      error: new Error('The host declined the message.'),
    });
  });

  it('reports a connection that fails', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    const broken: Transport = {
      start: () => Promise.reject(new Error('no host')),
      send: () => Promise.resolve(),
      close: () => Promise.resolve(),
    };
    const mcp = TestBed.runInInjectionContext(() =>
      injectJsonRenderApp({ transport: broken }),
    );

    await until(() => mcp.error() !== null);
    expect(mcp.error()?.message).toBe('no host');
    expect(mcp.connecting()).toBe(false);
    expect(mcp.connected()).toBe(false);
  });

  it('closes the connection with its injector', async () => {
    const { mcp, injector } = await connect();
    const close = vi.spyOn(mcp.app, 'close');

    injector.destroy();

    expect(close).toHaveBeenCalledOnce();
  });
});

describe('messageText', () => {
  it('is the text alone without data', () => {
    expect(messageText('Show more')).toBe('Show more');
  });

  it('appends the data as a fenced JSON block', () => {
    expect(messageText('Sign me up', { email: 'ada@example.com' })).toBe(
      'Sign me up\n\n```json\n{\n  "email": "ada@example.com"\n}\n```',
    );
  });
});

describe('parseSpecFromToolResult', () => {
  it('reads a bare spec or a { spec } wrapper', () => {
    expect(parseSpecFromToolResult(text(spec))).toEqual(spec);
    expect(parseSpecFromToolResult(text({ spec }))).toEqual(spec);
  });

  it('returns null for anything else', () => {
    expect(parseSpecFromToolResult({})).toBeNull();
    expect(
      parseSpecFromToolResult({ content: [{ type: 'image' }] }),
    ).toBeNull();
    expect(
      parseSpecFromToolResult({ content: [{ type: 'text', text: '{oops' }] }),
    ).toBeNull();
    expect(parseSpecFromToolResult(text({ nope: true }))).toBeNull();
    expect(parseSpecFromToolResult(text(42))).toBeNull();
  });
});
