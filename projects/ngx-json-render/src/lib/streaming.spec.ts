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

  it('copies a whole state branch as a snapshot rather than an alias', () => {
    const after = applyPatch(seed(), {
      op: 'copy',
      from: '/state',
      path: '/state/snapshot',
    });

    expect(after.state).toMatchObject({
      snapshot: { count: 1, user: { name: 'Ada' } },
    });

    // Handing over the live reference would make the spec self-referential,
    // and `toMatchObject` alone would not notice: it only walks the shape it
    // was given. The next request is where it surfaces, as a stringify that
    // throws while building the body.
    const state = after.state as Record<string, unknown>;
    expect(state['snapshot']).not.toBe(state);
    expect(() => JSON.stringify(after)).not.toThrow();
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

  it('continues from a previous spec handed to send', async () => {
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

describe('injectChatUI errors and lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function setupChat(options: Parameters<typeof injectChatUI>[0]) {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    return TestBed.runInInjectionContext(() => injectChatUI(options));
  }

  /** A failed response carrying `body`, which may or may not be JSON. */
  function errorResponse(status: number, body: string): Response {
    return new Response(body, { status });
  }

  it('sends nothing for a message that is only whitespace', async () => {
    const transport = vi.fn(async () => streamResponse(['hi\n']));
    const chat = setupChat({ api: '/api/chat', fetch: transport });

    await chat.send('   ');
    await chat.send('');

    expect(transport).not.toHaveBeenCalled();
    expect(chat.messages()).toEqual([]);
  });

  it('clears the conversation and the error with it', async () => {
    const chat = setupChat({
      api: '/api/chat',
      fetch: async () => errorResponse(500, JSON.stringify({ message: 'no' })),
    });

    await chat.send('hello');
    expect(chat.error()).not.toBeNull();

    chat.clear();

    expect(chat.messages()).toEqual([]);
    expect(chat.error()).toBeNull();
  });

  it('takes the error message the server reports', async () => {
    const onError = vi.fn();
    const chat = setupChat({
      api: '/api/chat',
      onError,
      fetch: async () =>
        errorResponse(500, JSON.stringify({ message: 'model overloaded' })),
    });

    await chat.send('hello');

    expect(chat.error()?.message).toBe('model overloaded');
    expect(onError).toHaveBeenCalledWith(chat.error());
    expect(chat.isStreaming()).toBe(false);
  });

  it('falls back to an `error` field when there is no `message`', async () => {
    const chat = setupChat({
      api: '/api/chat',
      fetch: async () =>
        errorResponse(429, JSON.stringify({ error: 'rate limited' })),
    });

    await chat.send('hello');

    expect(chat.error()?.message).toBe('rate limited');
  });

  it('falls back to the status when the error body is not JSON', async () => {
    const chat = setupChat({
      api: '/api/chat',
      fetch: async () => errorResponse(502, '<html>Bad Gateway</html>'),
    });

    await chat.send('hello');

    expect(chat.error()?.message).toBe('HTTP error: 502');
  });

  it('falls back to the status when the JSON says nothing useful', async () => {
    const chat = setupChat({
      api: '/api/chat',
      fetch: async () => errorResponse(503, JSON.stringify({ detail: 'busy' })),
    });

    await chat.send('hello');

    expect(chat.error()?.message).toBe('HTTP error: 503');
  });

  it('reports a response that arrives with no body', async () => {
    const chat = setupChat({
      api: '/api/chat',
      fetch: async () => new Response(null, { status: 200 }),
    });

    await chat.send('hello');

    expect(chat.error()?.message).toBe('No response body');
  });

  it('drops the empty assistant placeholder when the request fails', async () => {
    const chat = setupChat({
      api: '/api/chat',
      fetch: async () => errorResponse(500, JSON.stringify({ message: 'no' })),
    });

    await chat.send('hello');

    // The user's turn stays — it is what they typed — but the assistant
    // bubble never got any content and would render as an empty reply.
    const messages = chat.messages();
    expect(messages.length).toBe(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].text).toBe('hello');
  });

  it('keeps a partly streamed reply when the stream fails', async () => {
    const open = openStream();
    const chat = setupChat({
      api: '/api/chat',
      fetch: async () => open.response,
    });

    const sent = chat.send('hello');
    await tick();
    open.push('Half an answer\n');
    await tick();
    open.fail(new Error('connection reset'));
    await sent;

    // Something was said, so the bubble stays rather than vanishing.
    const assistant = chat.messages().at(-1);
    expect(assistant?.role).toBe('assistant');
    expect(assistant?.text).toBe('Half an answer');
    expect(chat.error()?.message).toBe('connection reset');
  });

  it('hands onComplete the finished message', async () => {
    const onComplete = vi.fn();
    const chat = setupChat({
      api: '/api/chat',
      onComplete,
      fetch: async () =>
        streamResponse([
          'All set\n',
          '```spec\n',
          '{"op":"add","path":"/root","value":"main"}\n',
          '{"op":"add","path":"/state/count","value":2}\n',
          '```\n',
        ]),
    });

    await chat.send('build it');

    expect(onComplete).toHaveBeenCalledTimes(1);
    const finished = onComplete.mock.calls[0][0];
    expect(finished.role).toBe('assistant');
    expect(finished.text).toBe('All set');
    expect(finished.spec?.root).toBe('main');
    // A spec that carries state has to survive the snapshot.
    expect(finished.spec?.state).toEqual({ count: 2 });
    expect(chat.messages().at(-1)?.spec?.state).toEqual({ count: 2 });
  });

  it('gives onComplete a null spec when the reply was only prose', async () => {
    const onComplete = vi.fn();
    const chat = setupChat({
      api: '/api/chat',
      onComplete,
      fetch: async () => streamResponse(['Just talking\n']),
    });

    await chat.send('hello');

    expect(onComplete.mock.calls[0][0].spec).toBeNull();
  });

  it('sends the whole conversation back on the next turn', async () => {
    const bodies: unknown[] = [];
    const replies = [
      streamResponse(['First reply\n']),
      streamResponse(['Second reply\n']),
    ];
    const chat = setupChat({
      api: '/api/chat',
      fetch: async (_url, init) => {
        bodies.push(JSON.parse(String((init as RequestInit).body)));
        return replies.shift() as Response;
      },
    });

    await chat.send('one');
    await chat.send('two');

    expect(bodies[0]).toEqual({ messages: [{ role: 'user', content: 'one' }] });
    // The second turn carries the first exchange. History is built before the
    // new pair is appended, so the new turn appears once rather than twice.
    expect(bodies[1]).toEqual({
      messages: [
        { role: 'user', content: 'one' },
        { role: 'assistant', content: 'First reply' },
        { role: 'user', content: 'two' },
      ],
    });
    expect(chat.messages().length).toBe(4);
  });

  it('gives every message an id without crypto.randomUUID', async () => {
    const real = globalThis.crypto;
    // Node and browsers both have randomUUID, but the helper carries a
    // counter-based fallback for hosts that do not.
    vi.stubGlobal('crypto', {
      getRandomValues: real.getRandomValues.bind(real),
    });

    const chat = setupChat({
      api: '/api/chat',
      fetch: async () => streamResponse(['ok\n']),
    });

    await chat.send('hello');

    const ids = chat.messages().map((message) => message.id);
    expect(ids.length).toBe(2);
    expect(ids[0]).toMatch(/^msg-\d+-\d+$/);
    expect(new Set(ids).size).toBe(2);
  });
});

describe('stream failures that are not Errors', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setup() {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
  }

  it('injectChatUI wraps a transport that throws something else', async () => {
    setup();
    const chat = TestBed.runInInjectionContext(() =>
      injectChatUI({
        api: '/api/chat',
        fetch: async () => {
          // Not everything a transport can throw is an Error.
          throw 'kaboom';
        },
      }),
    );

    await chat.send('hello');

    expect(chat.error()).toBeInstanceOf(Error);
    expect(chat.error()?.message).toBe('kaboom');
  });

  it('injectUIStream wraps a transport that throws something else', async () => {
    setup();
    const ui = TestBed.runInInjectionContext(() =>
      injectUIStream({
        api: '/api/generate',
        fetch: async () => {
          throw 'kaboom';
        },
      }),
    );

    await ui.send('go');

    expect(ui.error()).toBeInstanceOf(Error);
    expect(ui.error()?.message).toBe('kaboom');
    expect(ui.isStreaming()).toBe(false);
  });
});

describe('injectUIStream error responses', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setupStream(fetch: typeof globalThis.fetch) {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    return TestBed.runInInjectionContext(() =>
      injectUIStream({ api: '/api/generate', fetch }),
    );
  }

  it('falls back to an `error` field when there is no `message`', async () => {
    const ui = setupStream(
      async () =>
        new Response(JSON.stringify({ error: 'rate limited' }), {
          status: 429,
        }),
    );

    await ui.send('go');

    expect(ui.error()?.message).toBe('rate limited');
  });

  it('falls back to the status when the error body is not JSON', async () => {
    const ui = setupStream(
      async () => new Response('<html>Bad Gateway</html>', { status: 502 }),
    );

    await ui.send('go');

    expect(ui.error()?.message).toBe('HTTP error: 502');
  });

  it('falls back to the status when the JSON says nothing useful', async () => {
    const ui = setupStream(
      async () =>
        new Response(JSON.stringify({ detail: 'busy' }), { status: 503 }),
    );

    await ui.send('go');

    expect(ui.error()?.message).toBe('HTTP error: 503');
  });

  it('reports a response that arrives with no body', async () => {
    const ui = setupStream(async () => new Response(null, { status: 200 }));

    await ui.send('go');

    expect(ui.error()?.message).toBe('No response body');
  });

  it('applies a last line that arrives without a trailing newline', async () => {
    const ui = setupStream(async () =>
      streamResponse([
        '{"op":"add","path":"/root","value":"main"}\n',
        // No trailing newline: this one only ever reaches the parser when
        // the buffer is flushed at the end of the stream.
        '{"op":"add","path":"/elements/main","value":{"type":"Text","props":{}}}',
      ]),
    );

    await ui.send('go');

    expect(ui.spec()?.root).toBe('main');
    expect(Object.keys(ui.spec()?.elements ?? {})).toEqual(['main']);
    expect(ui.rawLines().length).toBe(2);
  });
});

describe('one patch engine', () => {
  /** A spec whose root element has a children array to insert into. */
  function seed(): Spec {
    return {
      root: 'main',
      state: { count: 1 },
      elements: {
        main: { type: 'Card', props: {}, children: ['a', 'b'] },
      },
    } as unknown as Spec;
  }

  it('inserts into an array for add and overwrites for replace', () => {
    // RFC 6902 and the write primitives in `@json-render/core` differ on
    // arrays exactly here, and a model adding a child to a container hits it:
    // overwriting would silently drop the child that was already there.
    const added = applyPatch(seed(), {
      op: 'add',
      path: '/elements/main/children/0',
      value: 'new',
    });
    expect(added.elements['main'].children).toEqual(['new', 'a', 'b']);

    const replaced = applyPatch(seed(), {
      op: 'replace',
      path: '/elements/main/children/0',
      value: 'new',
    });
    expect(replaced.elements['main'].children).toEqual(['new', 'b']);
  });

  it('appends to an array for the - segment', () => {
    const after = applyPatch(seed(), {
      op: 'add',
      path: '/elements/main/children/-',
      value: 'last',
    });

    expect(after.elements['main'].children).toEqual(['a', 'b', 'last']);
  });

  it('applies a patch to a top-level path it does not recognise', () => {
    // The spec grammar belongs to upstream and grows without this renderer,
    // so an unrecognised field is passed through rather than dropped.
    const after = applyPatch(seed(), {
      op: 'add',
      path: '/meta',
      value: { title: 'Report' },
    });

    expect((after as unknown as Record<string, unknown>)['meta']).toEqual({
      title: 'Report',
    });
    expect(after.root).toBe('main');
  });

  it('gives buildSpecFromParts the same result as a streamed patch', async () => {
    // The two entry points used to run different engines, so the same stream
    // rendered differently depending on which one an app reached for.
    const patches = [
      { op: 'add' as const, path: '/root', value: 'main' },
      {
        op: 'add' as const,
        path: '/elements/main',
        value: { type: 'Card', props: {}, children: ['a'] },
      },
      { op: 'add' as const, path: '/elements/main/children/0', value: 'first' },
    ];

    const built = buildSpecFromParts(
      patches.map((patch) => ({
        type: 'data-spec',
        data: { type: 'patch', patch },
      })),
    );

    const streamed = patches.reduce<Spec>(
      (spec, patch) => applyPatch(spec, patch),
      { root: '', elements: {} } as Spec,
    );

    expect(built).toEqual(streamed);
    expect(built?.elements['main'].children).toEqual(['first', 'a']);
  });
});

describe('a superseded request cannot reach the signals', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ignores a chunk that arrives after a second send replaced it', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });

    // The transport leaves its body open when the signal aborts, which is what
    // a real read whose promise already settled amounts to: the chunk is
    // delivered after the request that replaced this one reset the signals.
    const first = openStream();
    const second = openStream();
    let call = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      ++call === 1 ? first.response : second.response,
    );

    const onComplete = vi.fn();
    const ui = TestBed.runInInjectionContext(() =>
      injectUIStream({ api: '/api/generate', onComplete }),
    );

    const firstSend = ui.send('first');
    await tick();
    const secondSend = ui.send('second');
    await tick();
    second.push('{"op":"add","path":"/root","value":"fresh"}\n');
    await tick();

    // The superseded request delivers a patch and then finishes.
    first.push('{"op":"add","path":"/root","value":"stale"}\n');
    first.close();
    await tick();

    expect(ui.spec()?.root).toBe('fresh');
    expect(ui.rawLines()).toEqual([
      '{"op":"add","path":"/root","value":"fresh"}',
    ]);
    // onComplete persists the spec in most apps, so firing it for a generation
    // the user superseded would write the stale one back.
    expect(onComplete).not.toHaveBeenCalled();

    second.close();
    await Promise.all([firstSend, secondSend]);

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].root).toBe('fresh');
  });

  it('drops the empty placeholder of a superseded turn and keeps it out of history', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });

    const bodies: unknown[] = [];
    const first = openStream();
    const second = openStream();
    let call = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      bodies.push(JSON.parse(String((init as RequestInit).body)));
      const target = ++call === 1 ? first : second;
      (init as RequestInit).signal?.addEventListener('abort', target.abort);
      return target.response;
    });

    const chat = TestBed.runInInjectionContext(() =>
      injectChatUI({ api: '/api/chat' }),
    );

    const firstSend = chat.send('one');
    await tick();
    // Supersede before a single line streamed, so the first turn's assistant
    // bubble is still empty.
    const secondSend = chat.send('two');
    await tick();
    second.push('Answer\n');
    second.close();
    await Promise.all([firstSend, secondSend]);

    // The user's first turn stays — they typed it — but the bubble that never
    // got any content goes with the request that was replaced.
    expect(
      chat.messages().map((message) => `${message.role}:${message.text}`),
    ).toEqual(['user:one', 'user:two', 'assistant:Answer']);

    // An empty assistant turn says nothing to the model and some providers
    // reject it outright, so it never reaches the request either.
    expect(bodies[1]).toEqual({
      messages: [
        { role: 'user', content: 'one' },
        { role: 'user', content: 'two' },
      ],
    });
  });
});

describe('stopping a stream', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** A transport whose body aborts with its signal, as a real fetch does. */
  function abortableStream() {
    const open = openStream();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      (init as RequestInit).signal?.addEventListener('abort', open.abort);
      return open.response;
    });
    return open;
  }

  it('stop() ends the generation and keeps what has rendered', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    const open = abortableStream();
    const ui = TestBed.runInInjectionContext(() =>
      injectUIStream({ api: '/api/generate' }),
    );

    const sent = ui.send('go');
    await tick();
    open.push('{"op":"add","path":"/root","value":"partial"}\n');
    await tick();
    expect(ui.isStreaming()).toBe(true);

    ui.stop();
    await sent;
    await tick();

    // Stopping is the user's own decision, not a failure, and what was
    // generated up to that point stays on screen.
    expect(ui.isStreaming()).toBe(false);
    expect(ui.spec()?.root).toBe('partial');
    expect(ui.error()).toBeNull();
  });

  it('stop() on an idle stream does nothing', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      streamResponse(['{"op":"add","path":"/root","value":"main"}\n']),
    );
    const ui = TestBed.runInInjectionContext(() =>
      injectUIStream({ api: '/api/generate' }),
    );

    await ui.send('go');
    ui.stop();

    expect(ui.spec()?.root).toBe('main');
    expect(ui.isStreaming()).toBe(false);
  });

  it('clear() stops the request instead of letting it repopulate the spec', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });

    // Left open on abort on purpose: the point is that even a request still
    // producing lines cannot undo the clear.
    const open = openStream();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(open.response);
    const ui = TestBed.runInInjectionContext(() =>
      injectUIStream({ api: '/api/generate' }),
    );

    const sent = ui.send('go');
    await tick();
    open.push('{"op":"add","path":"/root","value":"a"}\n');
    open.push('{"__meta":"usage","totalTokens":7}\n');
    await tick();
    expect(ui.spec()?.root).toBe('a');
    expect(ui.usage()?.totalTokens).toBe(7);

    ui.clear();

    expect(ui.spec()).toBeNull();
    expect(ui.rawLines()).toEqual([]);
    expect(ui.usage()).toBeNull();
    expect(ui.isStreaming()).toBe(false);

    open.push('{"op":"add","path":"/root","value":"b"}\n');
    open.close();
    await sent;
    await tick();

    expect(ui.spec()).toBeNull();
    expect(ui.isStreaming()).toBe(false);
  });

  it('chat stop() ends the reply and keeps what was said', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    const open = abortableStream();
    const chat = TestBed.runInInjectionContext(() =>
      injectChatUI({ api: '/api/chat' }),
    );

    const sent = chat.send('hello');
    await tick();
    open.push('Half an answer\n');
    await tick();

    chat.stop();
    await sent;
    await tick();

    expect(chat.isStreaming()).toBe(false);
    expect(chat.messages().at(-1)?.text).toBe('Half an answer');
    expect(chat.error()).toBeNull();
  });
});

describe('line parsing rejects what is not a patch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('drops a parseable line that carries no op and path', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      streamResponse([
        '{"hello":"world"}\n',
        '{"op":"add","path":"/root","value":"main"}\n',
      ]),
    );
    const ui = TestBed.runInInjectionContext(() =>
      injectUIStream({ api: '/api/generate' }),
    );

    await ui.send('go');

    // Being valid JSON is not being a patch: recording one as a raw line
    // reports work that never happened.
    expect(ui.rawLines()).toEqual([
      '{"op":"add","path":"/root","value":"main"}',
    ]);
    expect(ui.spec()?.root).toBe('main');
  });

  it('keeps a multi-byte character split across the last two chunks', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });

    const line = '{"op":"add","path":"/state/label","value":"héé"}\n';
    const bytes = new TextEncoder().encode(line);
    // Split inside the final two-byte character, with no trailing chunk to
    // carry it: only the decoder's closing flush can complete it.
    const split = bytes.length - 2;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, split));
        controller.enqueue(bytes.slice(split));
        controller.close();
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(stream, { status: 200 }),
    );

    const ui = TestBed.runInInjectionContext(() =>
      injectUIStream({ api: '/api/generate' }),
    );

    await ui.send('go');

    expect(ui.spec()?.state).toEqual({ label: 'héé' });
  });
});

describe('a superseded chat turn that fails on its own', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('still takes its empty placeholder with it', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });

    // The transport leaves the superseded body open, so the first turn unwinds
    // through a real failure rather than through the abort.
    const first = openStream();
    const second = openStream();
    let call = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      ++call === 1 ? first.response : second.response,
    );

    const chat = TestBed.runInInjectionContext(() =>
      injectChatUI({ api: '/api/chat' }),
    );

    const firstSend = chat.send('one');
    await tick();
    const secondSend = chat.send('two');
    await tick();

    first.fail(new Error('connection reset'));
    second.push('Answer\n');
    second.close();
    await Promise.all([firstSend, secondSend]);

    expect(
      chat.messages().map((message) => `${message.role}:${message.text}`),
    ).toEqual(['user:one', 'user:two', 'assistant:Answer']);
    // The failure belonged to a request nobody is waiting for any more.
    expect(chat.error()).toBeNull();
  });
});

describe('validating what the model produced', () => {
  /** A generation that ends pointing at a child it never emitted. */
  const BROKEN_LINES = [
    '{"op":"add","path":"/root","value":"root"}\n',
    '{"op":"add","path":"/elements/root","value":{"type":"Box","props":{},"children":["ghost"]}}\n',
  ];

  /** The same mistake autoFixSpec repairs: `visible` written into `props`. */
  const MISPLACED_LINES = [
    '{"op":"add","path":"/root","value":"root"}\n',
    '{"op":"add","path":"/elements/root","value":{"type":"Text","props":{"content":"hi","visible":{"$state":"/s","eq":true}}}}\n',
  ];

  function mockStream(lines: string[]): void {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(streamResponse(lines));
  }

  it('says nothing about a broken spec while validation is off', async () => {
    mockStream(BROKEN_LINES);
    const ui = TestBed.runInInjectionContext(() =>
      injectUIStream({ api: '/api/generate' }),
    );

    await ui.send('a dashboard');

    expect(ui.issues()).toEqual([]);
    expect(ui.error()).toBeNull();
  });

  it('reports the issues of a completed generation under warn', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockStream(BROKEN_LINES);
    const onComplete = vi.fn();
    const ui = TestBed.runInInjectionContext(() =>
      injectUIStream({ api: '/api/generate', validate: 'warn', onComplete }),
    );

    await ui.send('a dashboard');

    expect(ui.issues().some((issue) => issue.code === 'missing_child')).toBe(
      true,
    );
    // warn still hands the app what it generated.
    expect(ui.spec()?.root).toBe('root');
    expect(ui.error()).toBeNull();
    expect(onComplete).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('fails the generation under strict instead of completing it', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockStream(BROKEN_LINES);
    const onComplete = vi.fn();
    const onError = vi.fn();
    const ui = TestBed.runInInjectionContext(() =>
      injectUIStream({
        api: '/api/generate',
        validate: 'strict',
        onComplete,
        onError,
      }),
    );

    await ui.send('a dashboard');

    // onComplete is where apps persist a spec. A spec that cannot render is
    // exactly what must not get there.
    expect(onComplete).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
    expect(ui.error()?.message).toContain('failed validation');
    error.mockRestore();
  });

  it('publishes the fixed spec, not the one that arrived', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    mockStream(MISPLACED_LINES);
    const ui = TestBed.runInInjectionContext(() =>
      injectUIStream({ api: '/api/generate', validate: 'warn' }),
    );

    await ui.send('a greeting');

    const root = ui.spec()?.elements?.['root'];
    expect(root?.visible).toBeDefined();
    expect(root?.props?.['visible']).toBeUndefined();
    info.mockRestore();
  });

  it('does not judge a chat reply that produced no spec', async () => {
    mockStream(['Just answering in prose.\n']);
    const onComplete = vi.fn();
    const chat = TestBed.runInInjectionContext(() =>
      injectChatUI({ api: '/api/chat', validate: 'strict', onComplete }),
    );

    await chat.send('hello');

    // "missing root" is a true statement about a sentence and a useless one.
    expect(chat.issues()).toEqual([]);
    expect(chat.error()).toBeNull();
    expect(onComplete).toHaveBeenCalled();
  });

  it('fails a chat reply whose spec is broken under strict', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockStream(BROKEN_LINES);
    const onComplete = vi.fn();
    const chat = TestBed.runInInjectionContext(() =>
      injectChatUI({ api: '/api/chat', validate: 'strict', onComplete }),
    );

    await chat.send('build me a dashboard');

    expect(chat.issues().some((issue) => issue.code === 'missing_child')).toBe(
      true,
    );
    expect(chat.error()?.message).toContain('failed validation');
    expect(onComplete).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
