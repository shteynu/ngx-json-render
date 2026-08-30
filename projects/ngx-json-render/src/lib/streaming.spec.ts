import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import type { Spec } from '@json-render/core';
import {
  applyPatch,
  buildSpecFromParts,
  flatToTree,
  getTextFromParts,
  injectChatUI,
  injectUIStream,
  jsonRenderMessage,
} from './streaming';

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

/**
 * A response whose body stays open until the test closes it, so a request can
 * be observed while it is still in flight.
 */
function openStream(): {
  response: Response;
  push: (chunk: string) => void;
  close: () => void;
  abort: () => void;
  fail: (error: Error) => void;
} {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    response: new Response(stream, { status: 200 }),
    push: (chunk) => controller.enqueue(encoder.encode(chunk)),
    close: () => controller.close(),
    abort: () => {
      // What fetch does to an in-flight body when its signal is aborted.
      const error = new Error('The operation was aborted.');
      error.name = 'AbortError';
      controller.error(error);
    },
    fail: (error) => controller.error(error),
  };
}

/** Let pending microtasks and stream reads run. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('applyPatch', () => {
  it('builds a spec from add patches without mutating the input', () => {
    const empty: Spec = { root: '', elements: {} };
    const withRoot = applyPatch(empty, {
      op: 'add',
      path: '/root',
      value: 'main',
    });
    const withElement = applyPatch(withRoot, {
      op: 'add',
      path: '/elements/main',
      value: { type: 'Text', props: { content: 'hi' } },
    });

    expect(empty.elements).toEqual({});
    expect(withElement.root).toBe('main');
    expect(withElement.elements['main']).toEqual({
      type: 'Text',
      props: { content: 'hi' },
    });
  });

  it('handles nested element paths, state paths, and remove', () => {
    let spec: Spec = {
      root: 'main',
      elements: { main: { type: 'Text', props: { content: 'hi' } } },
    };
    spec = applyPatch(spec, {
      op: 'replace',
      path: '/elements/main/props/content',
      value: 'hello',
    });
    spec = applyPatch(spec, { op: 'add', path: '/state/count', value: 2 });
    expect(spec.elements['main'].props).toEqual({ content: 'hello' });
    expect(spec.state).toEqual({ count: 2 });

    spec = applyPatch(spec, { op: 'remove', path: '/elements/main' });
    expect(spec.elements['main']).toBeUndefined();
  });
});

describe('injectUIStream', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('progressively applies streamed patches and reports usage', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });

    const lines = [
      '{"op":"add","path":"/root","value":"main"}\n',
      '{"op":"add","path":"/elements/main","value":{"type":"Text","props":{"content":"hi"}}}\n',
      '{"__meta":"usage","promptTokens":10,"completionTokens":5,"totalTokens":15}\n',
    ];
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(streamResponse(lines));

    const ui = TestBed.runInInjectionContext(() =>
      injectUIStream({ api: '/api/generate' }),
    );

    await ui.send('build me a text');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/generate',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(ui.spec()).toEqual({
      root: 'main',
      elements: { main: { type: 'Text', props: { content: 'hi' } } },
    });
    expect(ui.usage()).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
    expect(ui.rawLines().length).toBe(2);
    expect(ui.isStreaming()).toBe(false);
    expect(ui.error()).toBeNull();

    ui.clear();
    expect(ui.spec()).toBeNull();
  });

  it('streams through a supplied fetch instead of the global one', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });

    const globalFetch = vi.spyOn(globalThis, 'fetch');
    const calls: RequestInit[] = [];
    const transport = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        calls.push(init ?? {});
        return streamResponse([
          '{"op":"add","path":"/root","value":"main"}\n',
          '{"op":"add","path":"/elements/main","value":{"type":"Text","props":{"content":"hi"}}}\n',
        ]);
      },
    );

    const ui = TestBed.runInInjectionContext(() =>
      injectUIStream({ api: '/api/generate', fetch: transport }),
    );

    await ui.send('build me a text');

    expect(globalFetch).not.toHaveBeenCalled();
    expect(transport).toHaveBeenCalledTimes(1);
    // The supplied transport gets the same request the global one would.
    expect(JSON.parse(String(calls[0].body))).toEqual({
      prompt: 'build me a text',
      context: undefined,
      currentSpec: { root: '', elements: {} },
    });
    expect(calls[0].signal).toBeInstanceOf(AbortSignal);
    expect(ui.spec()).toEqual({
      root: 'main',
      elements: { main: { type: 'Text', props: { content: 'hi' } } },
    });
    expect(ui.error()).toBeNull();
  });

  it('aborts a supplied fetch when a second send supersedes it', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });

    const first = openStream();
    const responses = [
      first.response,
      streamResponse(['{"op":"add","path":"/root","value":"second"}\n']),
    ];
    const signals: (AbortSignal | null | undefined)[] = [];
    const transport = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        signals.push(init?.signal);
        return responses.shift() as Response;
      },
    );

    const ui = TestBed.runInInjectionContext(() =>
      injectUIStream({ api: '/api/generate', fetch: transport }),
    );

    void ui.send('first');
    await tick();
    const second = ui.send('second');
    first.abort();
    await second;
    await tick();

    expect(signals[0]?.aborted).toBe(true);
    expect(ui.spec()?.root).toBe('second');
    expect(ui.isStreaming()).toBe(false);
  });

  it('surfaces HTTP errors', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'nope' }), { status: 500 }),
    );

    const onError = vi.fn();
    const ui = TestBed.runInInjectionContext(() =>
      injectUIStream({ api: '/api/generate', onError }),
    );

    await ui.send('boom');

    expect(ui.error()?.message).toBe('nope');
    expect(onError).toHaveBeenCalled();
  });

  it('keeps isStreaming true when a second send supersedes the first', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });

    const first = openStream();
    const second = openStream();
    let call = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const target = ++call === 1 ? first : second;
      (init as RequestInit).signal?.addEventListener('abort', target.abort);
      return target.response;
    });

    const ui = TestBed.runInInjectionContext(() =>
      injectUIStream({ api: '/api/generate' }),
    );

    const firstSend = ui.send('first');
    await tick();
    first.push('{"op":"add","path":"/root","value":"a"}\n');
    await tick();
    expect(ui.isStreaming()).toBe(true);

    // Supersede it. The first request aborts and unwinds while the second is
    // still open — it must not clear the flag on its way out.
    const secondSend = ui.send('second');
    await tick();
    second.push('{"op":"add","path":"/root","value":"b"}\n');
    await tick();

    expect(ui.isStreaming()).toBe(true);
    expect(ui.error()).toBeNull();

    second.close();
    await Promise.all([firstSend, secondSend]);

    expect(ui.isStreaming()).toBe(false);
    expect(ui.spec()?.root).toBe('b');
  });

  it('ignores a superseded request that fails after being replaced', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });

    const first = openStream();
    const second = openStream();
    let call = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      ++call === 1 ? first.response : second.response,
    );

    const onError = vi.fn();
    const ui = TestBed.runInInjectionContext(() =>
      injectUIStream({ api: '/api/generate', onError }),
    );

    const firstSend = ui.send('first');
    await tick();
    const secondSend = ui.send('second');
    await tick();

    // The superseded stream fails for its own reason rather than by abort.
    first.fail(new Error('connection reset'));
    second.close();
    await Promise.all([firstSend, secondSend]);

    expect(ui.error()).toBeNull();
    expect(onError).not.toHaveBeenCalled();
    expect(ui.isStreaming()).toBe(false);
  });
});

describe('injectChatUI', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('splits mixed streams into text and spec per message', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      streamResponse([
        'Here is your UI:\n',
        '```spec\n',
        '{"op":"add","path":"/root","value":"main"}\n',
        '{"op":"add","path":"/elements/main","value":{"type":"Text","props":{}}}\n',
        '```\n',
        'Done!\n',
      ]),
    );

    const chat = TestBed.runInInjectionContext(() =>
      injectChatUI({ api: '/api/chat' }),
    );

    await chat.send('make a text');

    const messages = chat.messages();
    expect(messages.length).toBe(2);
    expect(messages[0].role).toBe('user');
    const assistant = messages[1];
    expect(assistant.text).toContain('Here is your UI:');
    expect(assistant.text).toContain('Done!');
    expect(assistant.spec?.root).toBe('main');
    expect(assistant.spec?.elements['main']).toBeTruthy();
  });

  it('streams through a supplied fetch instead of the global one', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });

    const globalFetch = vi.spyOn(globalThis, 'fetch');
    const calls: RequestInit[] = [];
    const transport = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        calls.push(init ?? {});
        return streamResponse(['Hello back\n']);
      },
    );

    const chat = TestBed.runInInjectionContext(() =>
      injectChatUI({ api: '/api/chat', fetch: transport }),
    );

    await chat.send('hello');

    expect(globalFetch).not.toHaveBeenCalled();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(calls[0].body))).toEqual({
      messages: [{ role: 'user', content: 'hello' }],
    });
    expect(calls[0].signal).toBeInstanceOf(AbortSignal);
    expect(chat.messages().at(-1)?.text).toBe('Hello back');
    expect(chat.error()).toBeNull();
  });

  it('keeps isStreaming true when a second send supersedes the first', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });

    const first = openStream();
    const second = openStream();
    let call = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const target = ++call === 1 ? first : second;
      (init as RequestInit).signal?.addEventListener('abort', target.abort);
      return target.response;
    });

    const chat = TestBed.runInInjectionContext(() =>
      injectChatUI({ api: '/api/chat' }),
    );

    const firstSend = chat.send('first');
    await tick();
    first.push('Thinking...\n');
    await tick();
    expect(chat.isStreaming()).toBe(true);

    const secondSend = chat.send('second');
    await tick();
    second.push('Answer\n');
    await tick();

    expect(chat.isStreaming()).toBe(true);
    expect(chat.error()).toBeNull();

    second.close();
    await Promise.all([firstSend, secondSend]);

    expect(chat.isStreaming()).toBe(false);
    expect(chat.messages().at(-1)?.text).toBe('Answer');
  });
});

describe('spec part helpers', () => {
  it('buildSpecFromParts replays patch parts', () => {
    const spec = buildSpecFromParts([
      { type: 'text', text: 'hello' },
      {
        type: 'data-spec',
        data: {
          type: 'patch',
          patch: { op: 'add', path: '/root', value: 'a' },
        },
      },
      {
        type: 'data-spec',
        data: {
          type: 'patch',
          patch: {
            op: 'add',
            path: '/elements/a',
            value: { type: 'Text', props: {} },
          },
        },
      },
    ]);
    expect(spec?.root).toBe('a');
    expect(Object.keys(spec?.elements ?? {})).toEqual(['a']);
  });

  it('getTextFromParts joins text parts', () => {
    expect(
      getTextFromParts([
        { type: 'text', text: ' one ' },
        { type: 'data-spec', data: {} },
        { type: 'text', text: 'two' },
      ]),
    ).toBe('one\n\ntwo');
  });

  it('jsonRenderMessage derives spec/text/hasSpec signals', () => {
    const msg = jsonRenderMessage(() => [
      { type: 'text', text: 'hi' },
      {
        type: 'data-spec',
        data: {
          type: 'flat',
          spec: { root: 'a', elements: { a: { type: 'Text', props: {} } } },
        },
      },
    ]);
    expect(msg.text()).toBe('hi');
    expect(msg.hasSpec()).toBe(true);
    expect(msg.spec()?.root).toBe('a');
  });

  it('flatToTree builds a spec from key/parentKey elements', () => {
    const spec = flatToTree([
      { key: 'root', type: 'Box', props: {} },
      { key: 'child', parentKey: 'root', type: 'Text', props: {} },
    ]);
    expect(spec.root).toBe('root');
    expect(spec.elements['root'].children).toEqual(['child']);
  });
});

describe('applyPatch operations and paths', () => {
  /** A spec with something in every path family a patch can address. */
  function seed(): Spec {
    return {
      root: 'main',
      state: { count: 1, user: { name: 'Ada' } },
      elements: {
        main: { type: 'Card', props: { title: 'Hi' }, children: ['leaf'] },
        leaf: { type: 'Text', props: { content: 'body', tone: 'muted' } },
      },
    } as unknown as Spec;
  }

  it('removes the whole state branch', () => {
    const before = seed();
    const after = applyPatch(before, { op: 'remove', path: '/state' });

    expect(after.state).toBeUndefined();
    expect(before.state).toEqual({ count: 1, user: { name: 'Ada' } });
  });

  it('removes a single state key and leaves its siblings', () => {
    const before = seed();
    const after = applyPatch(before, { op: 'remove', path: '/state/count' });

    expect(after.state).toEqual({ user: { name: 'Ada' } });
    expect(before.state).toEqual({ count: 1, user: { name: 'Ada' } });
  });

  it('removes a nested state key', () => {
    const after = applyPatch(seed(), {
      op: 'remove',
      path: '/state/user/name',
    });

    expect(after.state).toEqual({ count: 1, user: {} });
  });

  it('removes a single prop and leaves the element its other props', () => {
    const before = seed();
    const after = applyPatch(before, {
      op: 'remove',
      path: '/elements/leaf/props/tone',
    });

    expect(after.elements['leaf'].props).toEqual({ content: 'body' });
    expect(after.elements['leaf'].type).toBe('Text');
    expect(before.elements['leaf'].props).toEqual({
      content: 'body',
      tone: 'muted',
    });
  });

  it('ignores a remove aimed at an element that is not there', () => {
    const after = applyPatch(seed(), {
      op: 'remove',
      path: '/elements/ghost/props/content',
    });

    expect(Object.keys(after.elements).sort()).toEqual(['leaf', 'main']);
  });

  it('ignores a remove with an empty element key', () => {
    const after = applyPatch(seed(), { op: 'remove', path: '/elements/' });

    expect(Object.keys(after.elements).sort()).toEqual(['leaf', 'main']);
  });

  it('ignores a state remove on a spec that has no state', () => {
    const stateless: Spec = { root: 'a', elements: {} } as unknown as Spec;
    const after = applyPatch(stateless, { op: 'remove', path: '/state/x' });

    expect(after.state).toBeUndefined();
  });

  it('ignores a remove on a path it does not recognise', () => {
    const after = applyPatch(seed(), { op: 'remove', path: '/nonsense' });

    expect(after.root).toBe('main');
    expect(Object.keys(after.elements).sort()).toEqual(['leaf', 'main']);
  });

  it('moves an element to a new key', () => {
    const before = seed();
    const after = applyPatch(before, {
      op: 'move',
      from: '/elements/leaf',
      path: '/elements/moved',
    });

    expect(after.elements['leaf']).toBeUndefined();
    expect(after.elements['moved']).toEqual({
      type: 'Text',
      props: { content: 'body', tone: 'muted' },
    });
    expect(before.elements['leaf']).toBeDefined();
  });

  it('moves a value between state paths', () => {
    const after = applyPatch(seed(), {
      op: 'move',
      from: '/state/count',
      path: '/state/total',
    });

    expect(after.state).toEqual({ total: 1, user: { name: 'Ada' } });
  });

  it('moves the root value into state', () => {
    const after = applyPatch(seed(), {
      op: 'move',
      from: '/root',
      path: '/state/wasRoot',
    });

    expect(after.state).toMatchObject({ wasRoot: 'main' });
  });

  it('does nothing for a move with no from', () => {
    const after = applyPatch(seed(), {
      op: 'move',
      path: '/elements/moved',
    });

    expect(after.elements['moved']).toBeUndefined();
    expect(Object.keys(after.elements).sort()).toEqual(['leaf', 'main']);
  });

  it('copies an element, leaving the original in place', () => {
    const after = applyPatch(seed(), {
      op: 'copy',
      from: '/elements/leaf',
      path: '/elements/clone',
    });

    expect(after.elements['leaf']).toBeDefined();
    expect(after.elements['clone']).toEqual(after.elements['leaf']);
  });

  it('copies a whole state branch', () => {
    const after = applyPatch(seed(), {
      op: 'copy',
      from: '/state',
      path: '/state/snapshot',
    });

    expect(after.state).toMatchObject({
      snapshot: { count: 1, user: { name: 'Ada' } },
    });
  });

  it('does nothing for a copy with no from', () => {
    const after = applyPatch(seed(), {
      op: 'copy',
      path: '/elements/clone',
    });

    expect(after.elements['clone']).toBeUndefined();
  });

  it('leaves the spec alone for a test op', () => {
    const before = seed();
    const after = applyPatch(before, {
      op: 'test',
      path: '/root',
      value: 'main',
    });

    // `test` is a validation op with nothing to render, so it passes the spec
    // through — as a new object, like every other patch.
    expect(after).not.toBe(before);
    expect(after.root).toBe('main');
    expect(after.state).toEqual(before.state);
    expect(Object.keys(after.elements).sort()).toEqual(['leaf', 'main']);
  });

  it('replaces the whole state object', () => {
    const after = applyPatch(seed(), {
      op: 'replace',
      path: '/state',
      value: { fresh: true },
    });

    expect(after.state).toEqual({ fresh: true });
  });

  it('creates the state branch when a state path is set on a spec without one', () => {
    const stateless: Spec = { root: 'a', elements: {} } as unknown as Spec;
    const after = applyPatch(stateless, {
      op: 'add',
      path: '/state/count',
      value: 3,
    });

    expect(after.state).toEqual({ count: 3 });
    expect(stateless.state).toBeUndefined();
  });

  it('ignores an add with an empty element key', () => {
    const after = applyPatch(seed(), {
      op: 'add',
      path: '/elements/',
      value: { type: 'Text', props: {} },
    });

    expect(Object.keys(after.elements).sort()).toEqual(['leaf', 'main']);
  });

  it('ignores a prop add aimed at an element that is not there', () => {
    const after = applyPatch(seed(), {
      op: 'add',
      path: '/elements/ghost/props/content',
      value: 'x',
    });

    expect(after.elements['ghost']).toBeUndefined();
  });
});

describe('spec part helper guards', () => {
  it('buildSpecFromParts returns null when nothing carries a spec', () => {
    expect(buildSpecFromParts([])).toBeNull();
    expect(
      buildSpecFromParts([
        { type: 'text', text: 'just prose' },
        { type: 'reasoning', text: 'thinking' },
      ]),
    ).toBeNull();
  });

  it('buildSpecFromParts skips payloads that are not shaped like a spec part', () => {
    // A model can emit anything into a data part; none of these should throw
    // or half-build a spec.
    const spec = buildSpecFromParts([
      { type: 'data-spec', data: null },
      { type: 'data-spec', data: 'not an object' },
      { type: 'data-spec', data: { type: 'patch', patch: null } },
      { type: 'data-spec', data: { type: 'flat', spec: 'nope' } },
      { type: 'data-spec', data: { type: 'nested', spec: 42 } },
      { type: 'data-spec', data: { type: 'something-else' } },
      { type: 'data-spec', data: {} },
    ]);

    expect(spec).toBeNull();
  });

  it('buildSpecFromParts keeps the good parts among the bad', () => {
    const spec = buildSpecFromParts([
      { type: 'data-spec', data: { type: 'patch', patch: null } },
      {
        type: 'data-spec',
        data: {
          type: 'flat',
          spec: { root: 'a', elements: { a: { type: 'Text', props: {} } } },
        },
      },
      { type: 'data-spec', data: { type: 'unknown' } },
    ]);

    expect(spec?.root).toBe('a');
    expect(Object.keys(spec?.elements ?? {})).toEqual(['a']);
  });

  it('buildSpecFromParts flattens a nested payload', () => {
    const spec = buildSpecFromParts([
      {
        type: 'data-spec',
        data: {
          type: 'nested',
          spec: {
            type: 'Card',
            props: { title: 'Hello' },
            children: [{ type: 'Text', props: { content: 'World' } }],
            state: { count: 0 },
          },
        },
      },
    ]);

    expect(spec?.root).toBe('el-0');
    expect(spec?.elements['el-0'].children).toEqual(['el-1']);
    expect(spec?.elements['el-1'].props).toEqual({ content: 'World' });
    expect(spec?.state).toEqual({ count: 0 });
  });

  it('getTextFromParts ignores text parts with no string to show', () => {
    expect(
      getTextFromParts([
        { type: 'text' },
        { type: 'text', text: '   ' },
        { type: 'text', text: 'kept' },
      ]),
    ).toBe('kept');
    expect(getTextFromParts([])).toBe('');
  });

  it('jsonRenderMessage reports no spec when the spec has no elements', () => {
    const msg = jsonRenderMessage(() => [
      { type: 'text', text: 'hi' },
      {
        type: 'data-spec',
        data: {
          type: 'patch',
          patch: { op: 'add', path: '/root', value: 'a' },
        },
      },
    ]);

    // A root pointing at nothing is not something a renderer can show.
    expect(msg.spec()).not.toBeNull();
    expect(msg.hasSpec()).toBe(false);
    expect(msg.text()).toBe('hi');
  });

  it('flatToTree drops a child whose parent is not in the list', () => {
    const spec = flatToTree([
      { key: 'root', type: 'Box', props: {} },
      { key: 'orphan', parentKey: 'ghost', type: 'Text', props: {} },
    ]);

    expect(spec.root).toBe('root');
    expect(spec.elements['root'].children).toEqual([]);
    // The element itself survives; only the parent link is dropped.
    expect(spec.elements['orphan']).toBeDefined();
  });

  it('flatToTree carries visible through and nests deeply', () => {
    const spec = flatToTree([
      { key: 'a', type: 'Box', props: {} },
      { key: 'b', parentKey: 'a', type: 'Box', props: {}, visible: false },
      { key: 'c', parentKey: 'b', type: 'Text', props: { content: 'x' } },
    ]);

    expect(spec.elements['a'].children).toEqual(['b']);
    expect(spec.elements['b'].children).toEqual(['c']);
    expect(spec.elements['b'].visible).toBe(false);
  });
});

describe('injectUIStream line parsing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setupStream(lines: string[]) {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(streamResponse(lines));
    return TestBed.runInInjectionContext(() =>
      injectUIStream({ api: '/api/generate' }),
    );
  }

  it('skips blank lines, comments and unparsable JSON', async () => {
    const ui = setupStream([
      '\n',
      '   \n',
      '// a comment the model felt like adding\n',
      '{"op":"add","path":"/root","value":"main"}\n',
      '{"op":"add","path":"/elements/\n',
      'not json at all\n',
      '{"op":"add","path":"/elements/main","value":{"type":"Text","props":{}}}\n',
    ]);

    await ui.send('go');

    // A half-written or commented line is normal in a model's output; it has
    // to be dropped rather than aborting the generation.
    expect(ui.spec()?.root).toBe('main');
    expect(Object.keys(ui.spec()?.elements ?? {})).toEqual(['main']);
    expect(ui.error()).toBeNull();
    // Only the two real patches are recorded.
    expect(ui.rawLines().length).toBe(2);
  });

  it('fills in a usage line that omits its counts', async () => {
    const ui = setupStream([
      '{"op":"add","path":"/root","value":"main"}\n',
      '{"__meta":"usage"}\n',
    ]);

    await ui.send('go');

    expect(ui.usage()).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });
  });

  it('continues from a previous spec passed in the context', async () => {
    const ui = setupStream([
      '{"op":"add","path":"/elements/added","value":{"type":"Text","props":{}}}\n',
    ]);
    const previousSpec: Spec = {
      root: 'main',
      elements: { main: { type: 'Card', props: {}, children: [] } },
    } as unknown as Spec;

    await ui.send('add one more', { previousSpec });

    expect(ui.spec()?.root).toBe('main');
    expect(Object.keys(ui.spec()?.elements ?? {}).sort()).toEqual([
      'added',
      'main',
    ]);
  });

  it('starts from an empty spec when the previous one has no root', async () => {
    const ui = setupStream(['{"op":"add","path":"/root","value":"fresh"}\n']);

    await ui.send('start over', {
      previousSpec: { root: '', elements: {} } as unknown as Spec,
    });

    expect(ui.spec()?.root).toBe('fresh');
    expect(ui.spec()?.elements).toEqual({});
  });
});

describe('applyPatch leaves its input alone', () => {
  // applyPatch copies every node a patch descends through and shares the
  // rest. These pin the copying down at each depth a patch can reach: a
  // caller who keeps a spec — a previousSpec handed to send(), a snapshot
  // taken off the spec signal for undo or a diff view — must never see it
  // change underneath them.

  it('at a top-level state key', () => {
    const before = { root: 'a', state: { count: 1 }, elements: {} } as Spec;
    applyPatch(before, { op: 'replace', path: '/state/count', value: 2 });

    expect(before.state).toEqual({ count: 1 });
  });

  it('at a nested state key, on set and on remove', () => {
    const before = {
      root: 'a',
      state: { user: { name: 'Ada', age: 36 } },
      elements: {},
    } as unknown as Spec;

    applyPatch(before, {
      op: 'replace',
      path: '/state/user/name',
      value: 'Grace',
    });
    applyPatch(before, { op: 'remove', path: '/state/user/age' });

    expect(before.state).toEqual({ user: { name: 'Ada', age: 36 } });
  });

  it('at an element prop, on set and on remove', () => {
    const before = {
      root: 'a',
      elements: { a: { type: 'Text', props: { x: 1, y: 2 } } },
    } as unknown as Spec;

    applyPatch(before, {
      op: 'replace',
      path: '/elements/a/props/x',
      value: 9,
    });
    applyPatch(before, { op: 'remove', path: '/elements/a/props/y' });

    expect(before.elements['a'].props).toEqual({ x: 1, y: 2 });
  });

  it('inside an array', () => {
    const before = {
      root: 'a',
      state: { todos: [{ done: false }] },
      elements: { a: { type: 'Box', props: {}, children: ['x'] } },
    } as unknown as Spec;

    applyPatch(before, {
      op: 'add',
      path: '/elements/a/children/1',
      value: 'y',
    });
    applyPatch(before, {
      op: 'replace',
      path: '/state/todos/0/done',
      value: true,
    });

    expect(before.elements['a'].children).toEqual(['x']);
    expect(before.state).toEqual({ todos: [{ done: false }] });
  });

  it('through a move and a copy', () => {
    const before = {
      root: 'a',
      state: { user: { name: 'Ada' } },
      elements: { a: { type: 'Text', props: { x: 1 } } },
    } as unknown as Spec;

    applyPatch(before, {
      op: 'move',
      from: '/state/user/name',
      path: '/state/moved',
    });
    applyPatch(before, {
      op: 'copy',
      from: '/elements/a',
      path: '/elements/clone',
    });

    expect(before.state).toEqual({ user: { name: 'Ada' } });
    expect(Object.keys(before.elements)).toEqual(['a']);
  });

  it('shares the parts a patch never touches', () => {
    const before = {
      root: 'a',
      state: { kept: { deep: true } },
      elements: {
        a: { type: 'Text', props: { x: 1 } },
        untouched: { type: 'Box', props: {}, children: [] },
      },
    } as unknown as Spec;

    const after = applyPatch(before, {
      op: 'replace',
      path: '/elements/a/props/x',
      value: 2,
    });

    // Structural sharing is the point: only the path that was written gets
    // new objects, so a patch costs its depth rather than the whole spec.
    expect(after.elements['untouched']).toBe(before.elements['untouched']);
    expect(after.state?.['kept']).toBe(before.state?.['kept']);
    expect(after.elements['a']).not.toBe(before.elements['a']);
    expect(after.elements['a'].props).not.toBe(before.elements['a'].props);
  });

  it('keeps earlier specs stable as a stream applies patch after patch', () => {
    const first = applyPatch(
      {
        root: 'a',
        elements: { a: { type: 'Text', props: { n: 0 } } },
      } as unknown as Spec,
      { op: 'replace', path: '/elements/a/props/n', value: 1 },
    );
    const second = applyPatch(first, {
      op: 'replace',
      path: '/elements/a/props/n',
      value: 2,
    });

    // A consumer that snapshotted `first` still sees 1, and got no signal
    // telling it otherwise because the object never changed identity.
    expect(first.elements['a'].props).toEqual({ n: 1 });
    expect(second.elements['a'].props).toEqual({ n: 2 });
  });
});

describe('applyPatch through a scalar', () => {
  it('replaces a scalar that a path tries to descend through', () => {
    const before = {
      root: 'a',
      elements: { a: { type: 'Text', props: { meta: 7 } } },
    } as unknown as Spec;

    // A model can address a path below something that is not an object.
    // setByPath overwrites it, and there is nothing of the caller's beneath
    // it to preserve — but the element above it still has to be copied.
    const after = applyPatch(before, {
      op: 'replace',
      path: '/elements/a/props/meta/nested',
      value: 1,
    });

    expect(after.elements['a'].props).toEqual({ meta: { nested: 1 } });
    expect(before.elements['a'].props).toEqual({ meta: 7 });
  });

  it('ignores a remove below a scalar', () => {
    const before = {
      root: 'a',
      state: { count: 3 },
      elements: {},
    } as unknown as Spec;

    const after = applyPatch(before, {
      op: 'remove',
      path: '/state/count/nested',
    });

    expect(after.state).toEqual({ count: 3 });
    expect(before.state).toEqual({ count: 3 });
  });
});
