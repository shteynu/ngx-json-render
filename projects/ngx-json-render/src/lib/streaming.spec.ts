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
