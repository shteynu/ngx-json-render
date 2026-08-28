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
});

describe('spec part helpers', () => {
  it('buildSpecFromParts replays patch parts', () => {
    const spec = buildSpecFromParts([
      { type: 'text', text: 'hello' },
      {
        type: 'data-spec',
        data: { type: 'patch', patch: { op: 'add', path: '/root', value: 'a' } },
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
