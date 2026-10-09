import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  type StreamObserver,
  injectChatUI,
  injectUIStream,
  ɵregisterStreamObserver,
} from './streaming';

function respond(lines: string[], status = 200): typeof globalThis.fetch {
  return async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const line of lines) controller.enqueue(encoder.encode(line));
        controller.close();
      },
    });
    return new Response(body, { status });
  };
}

/**
 * A transport whose first request hangs until it is aborted, and whose later
 * requests answer with `lines` — a generation that gets superseded.
 */
function hangThenRespond(lines: string[]): typeof globalThis.fetch {
  let calls = 0;
  return async (input, init) => {
    if (calls++ > 0) return respond(lines)(input, init);
    return new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () =>
        reject(new DOMException('Aborted', 'AbortError')),
      );
    });
  };
}

/** Records every observer call as `name(args)`. */
function recorder() {
  const calls: string[] = [];
  const observer: StreamObserver = {
    onStart: () => calls.push('start'),
    onPatch: (patch) => calls.push(`patch ${patch.path}`),
    onText: (text) => calls.push(`text ${text}`),
    onUsage: (usage) => calls.push(`usage ${usage.totalTokens}`),
    onEnd: (ok) => calls.push(`end ${ok}`),
  };
  return { calls, observer };
}

function inContext<T>(fn: () => T): T {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  });
  return TestBed.runInInjectionContext(fn);
}

describe('stream observers', () => {
  const cleanups: (() => void)[] = [];
  afterEach(() => {
    cleanups.splice(0).forEach((fn) => fn());
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  function observe() {
    const r = recorder();
    cleanups.push(ɵregisterStreamObserver(r.observer));
    return r.calls;
  }

  it('sees an injectUIStream generation from start to end', async () => {
    const calls = observe();
    const ui = inContext(() =>
      injectUIStream({
        api: '/api/generate',
        fetch: respond([
          '{"op":"add","path":"/root","value":"main"}\n',
          '{"__meta":"usage","promptTokens":1,"completionTokens":2,"totalTokens":3}\n',
        ]),
      }),
    );

    await ui.send('go');

    expect(calls).toEqual(['start', 'patch /root', 'usage 3', 'end true']);
  });

  it('reports a failed generation as not ok', async () => {
    const calls = observe();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ui = inContext(() =>
      injectUIStream({ api: '/api/generate', fetch: respond(['no'], 500) }),
    );

    await ui.send('go');

    expect(calls).toEqual(['start', 'end false']);
  });

  it('reports a spec blocked by a render limit as not ok', async () => {
    const calls = observe();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ui = inContext(() =>
      injectUIStream({
        api: '/api/generate',
        renderLimits: { maxElements: 1 },
        fetch: respond([
          '{"op":"add","path":"/root","value":"a"}\n',
          '{"op":"add","path":"/elements/a","value":{"type":"T","props":{},"children":["b"]}}\n',
          '{"op":"add","path":"/elements/b","value":{"type":"T","props":{},"children":[]}}\n',
        ]),
      }),
    );

    await ui.send('go');

    expect(calls.at(-1)).toBe('end false');
  });

  it('sees prose and patches from injectChatUI', async () => {
    const calls = observe();
    const chat = inContext(() =>
      injectChatUI({
        api: '/api/chat',
        fetch: respond([
          'Here you go\n',
          '{"op":"add","path":"/root","value":"main"}\n',
        ]),
      }),
    );

    await chat.send('hi');

    expect(calls).toEqual([
      'start',
      'text Here you go',
      'patch /root',
      'end true',
    ]);
  });

  it('reports a failed chat turn as not ok', async () => {
    const calls = observe();
    const chat = inContext(() =>
      injectChatUI({ api: '/api/chat', fetch: respond(['no'], 500) }),
    );

    await chat.send('hi');

    expect(calls).toEqual(['start', 'end false']);
  });

  it('ends a superseded generation before the next one starts', async () => {
    const calls = observe();
    const ui = inContext(() =>
      injectUIStream({
        api: '/api/generate',
        fetch: hangThenRespond([
          '{"op":"add","path":"/root","value":"main"}\n',
        ]),
      }),
    );

    const first = ui.send('first');
    await ui.send('second');
    await first;

    // One end per start, in order: the late settle of the aborted request
    // does not close the second generation.
    expect(calls).toEqual([
      'start',
      'end true',
      'start',
      'patch /root',
      'end true',
    ]);
  });

  it('ends a generation the moment it is stopped', async () => {
    const calls = observe();
    const ui = inContext(() =>
      injectUIStream({ api: '/api/generate', fetch: hangThenRespond([]) }),
    );

    const pending = ui.send('go');
    ui.stop();
    expect(calls).toEqual(['start', 'end true']);

    await pending;
    expect(calls).toEqual(['start', 'end true']);
  });

  it('ends a superseded chat turn before the next one starts', async () => {
    const calls = observe();
    const chat = inContext(() =>
      injectChatUI({
        api: '/api/chat',
        fetch: hangThenRespond(['Hello\n']),
      }),
    );

    const first = chat.send('one');
    await chat.send('two');
    await first;

    expect(calls).toEqual([
      'start',
      'end true',
      'start',
      'text Hello',
      'end true',
    ]);
  });

  it('keeps a generation alive when an observer throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    cleanups.push(
      ɵregisterStreamObserver({
        onPatch: () => {
          throw new Error('devtools bug');
        },
      }),
    );
    const ui = inContext(() =>
      injectUIStream({
        api: '/api/generate',
        fetch: respond(['{"op":"add","path":"/root","value":"main"}\n']),
      }),
    );

    await ui.send('go');

    expect(ui.spec()?.root).toBe('main');
    expect(ui.error()).toBeNull();
    expect(error).toHaveBeenCalledWith(
      '[ngx-json-render] A stream observer threw:',
      expect.any(Error),
    );
  });

  it('stops calling an observer once it is removed', async () => {
    const { calls, observer } = recorder();
    const remove = ɵregisterStreamObserver(observer);
    remove();
    const ui = inContext(() =>
      injectUIStream({
        api: '/api/generate',
        fetch: respond(['{"op":"add","path":"/root","value":"main"}\n']),
      }),
    );

    await ui.send('go');

    expect(calls).toEqual([]);
  });
});
