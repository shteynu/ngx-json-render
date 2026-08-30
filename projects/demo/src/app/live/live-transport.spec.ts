import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { catalog } from '../catalog/catalog';
import { ChatTab } from '../chat/chat';
import { StreamTab } from '../streaming/streaming';
import { ApiKeyStore } from './api-key';
import { liveOrRecorded, liveTransport } from './live-transport';

/** A key that is obviously not one. Nothing here ever reaches the network. */
const FAKE_KEY = 'sk-ant-not-a-real-key';

afterEach(() => {
  TestBed.resetTestingModule();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

/** Wrap SSE frames in the response the Messages API would send. */
function sseResponse(frames: readonly string[], status = 200): Response {
  const body = frames.map((frame) => `${frame}\n\n`).join('');
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function frame(event: Record<string, unknown>): string {
  return `event: ${event['type']}\ndata: ${JSON.stringify(event)}`;
}

/** A generation: two patch lines, arriving split across deltas. */
const GENERATION: readonly string[] = [
  frame({ type: 'message_start', message: { usage: { input_tokens: 11 } } }),
  frame({
    type: 'content_block_delta',
    delta: { type: 'text_delta', text: '{"op":"add","path":"/root","value"' },
  }),
  frame({
    type: 'content_block_delta',
    delta: { type: 'text_delta', text: ':"root"}\n' },
  }),
  frame({
    type: 'content_block_delta',
    delta: {
      type: 'text_delta',
      text: '{"op":"add","path":"/elements/root","value":{"type":"Heading","props":{"content":"Live","level":1},"children":[]}}\n',
    },
  }),
  frame({ type: 'message_delta', usage: { output_tokens: 7 } }),
];

/** Read a transport's response body back into the lines a client would see. */
async function linesOf(response: Response): Promise<string[]> {
  const text = await response.text();
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function server(overrides: Partial<Parameters<typeof liveTransport>[0]> = {}) {
  return liveTransport({
    settings: () => ({ key: FAKE_KEY, model: 'claude-opus-5' }),
    system: () => 'SYSTEM',
    messagesOf: (body) => [
      { role: 'user', content: String(body['prompt'] ?? '') },
    ],
    usageLine: true,
    ...overrides,
  });
}

function post(body: unknown): RequestInit {
  return { method: 'POST', body: JSON.stringify(body) };
}

describe('ApiKeyStore', () => {
  function store(): ApiKeyStore {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    return TestBed.inject(ApiKeyStore);
  }

  it('starts recorded and goes live only once a key is set', () => {
    const keys = store();
    expect(keys.isLive()).toBe(false);
    expect(keys.settings()).toBeNull();

    keys.set(`  ${FAKE_KEY}  `);
    expect(keys.isLive()).toBe(true);
    expect(keys.settings()).toEqual({
      key: FAKE_KEY,
      model: 'claude-opus-5',
    });
  });

  it('keeps the key in sessionStorage only, and forgets it on clear', () => {
    const keys = store();
    keys.set(FAKE_KEY);

    const stored = Object.entries(sessionStorage).filter(([, value]) =>
      String(value).includes(FAKE_KEY),
    );
    expect(stored.length).toBe(1);
    // Never the longer-lived store.
    expect(JSON.stringify(localStorage)).not.toContain(FAKE_KEY);

    keys.clear();
    expect(keys.isLive()).toBe(false);
    expect(JSON.stringify(sessionStorage)).not.toContain(FAKE_KEY);
  });
});

describe('liveTransport', () => {
  it('sends the headers a browser-direct call needs, and the key only there', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(sseResponse(GENERATION));

    await server()('/api/generate', post({ prompt: 'a landing page' }));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    const headers = (init?.headers ?? {}) as Record<string, string>;

    expect(String(url)).toBe('https://api.anthropic.com/v1/messages');
    expect(headers['x-api-key']).toBe(FAKE_KEY);
    expect(headers['anthropic-version']).toBe('2023-06-01');
    // Without this the API refuses a call made from a page.
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    // Not in the URL, and not in the body.
    expect(String(url)).not.toContain(FAKE_KEY);
    expect(String(init?.body)).not.toContain(FAKE_KEY);

    const sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(sent['model']).toBe('claude-opus-5');
    expect(sent['stream']).toBe(true);
    expect(sent['system']).toBe('SYSTEM');
    expect(sent['messages']).toEqual([
      { role: 'user', content: 'a landing page' },
    ]);
  });

  it('turns text deltas into patch lines and synthesises the usage line', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(sseResponse(GENERATION));

    const lines = await linesOf(
      await server()('/api/generate', post({ prompt: 'x' })),
    );

    // The line split across two deltas came back whole.
    expect(lines[0]).toBe('{"op":"add","path":"/root","value":"root"}');
    expect(lines[1]).toContain('"type":"Heading"');
    expect(JSON.parse(lines[2])).toEqual({
      __meta: 'usage',
      promptTokens: 11,
      completionTokens: 7,
      totalTokens: 18,
    });
  });

  it('leaves the usage line out for the chat client, which reads prose', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(sseResponse(GENERATION));

    const lines = await linesOf(
      await server({ usageLine: false })('/api/chat', post({ prompt: 'x' })),
    );

    expect(lines.length).toBe(2);
    expect(lines.join('\n')).not.toContain('__meta');
  });

  it('flattens an API error into the message the clients read', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          type: 'error',
          error: { type: 'authentication_error', message: 'invalid x-api-key' },
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const response = await server()('/api/generate', post({ prompt: 'x' }));

    expect(response.ok).toBe(false);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      message: 'authentication_error: invalid x-api-key',
    });
  });

  it('reports a call that never left the browser without losing an abort', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new TypeError('Failed to fetch'),
    );
    const blocked = await server()('/api/generate', post({ prompt: 'x' }));
    expect(blocked.status).toBe(503);
    expect((await blocked.json()).message).toContain('never reached the API');

    const aborted = Object.assign(new Error('aborted'), { name: 'AbortError' });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(aborted);
    await expect(
      server()('/api/generate', post({ prompt: 'x' })),
    ).rejects.toThrow('aborted');
  });
});

describe('liveOrRecorded', () => {
  it('picks per request, so a key set mid-session takes effect', async () => {
    let live = false;
    const onLive = vi.fn().mockResolvedValue(new Response('live'));
    const onRecorded = vi.fn().mockResolvedValue(new Response('recorded'));
    const transport = liveOrRecorded(() => live, onLive, onRecorded);

    await transport('/api/generate', post({ prompt: 'x' }));
    expect(onRecorded).toHaveBeenCalledTimes(1);
    expect(onLive).not.toHaveBeenCalled();

    live = true;
    await transport('/api/generate', post({ prompt: 'x' }));
    expect(onLive).toHaveBeenCalledTimes(1);
  });
});

describe('StreamTab with a key', () => {
  async function render(): Promise<ComponentFixture<StreamTab>> {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    const fixture = TestBed.createComponent(StreamTab);
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  it('generates from the API instead of a recording', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(sseResponse(GENERATION));

    const fixture = await render();
    TestBed.inject(ApiKeyStore).set(FAKE_KEY);

    // A prompt no recording answers: only a live call can produce anything.
    fixture.componentInstance.generate('something nobody recorded');
    for (
      let i = 0;
      i < 100 && fixture.componentInstance.ui.isStreaming();
      i++
    ) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    fixture.detectChanges();
    await fixture.whenStable();

    const ui = fixture.componentInstance.ui;
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(ui.error()).toBeNull();
    expect(ui.rawLines().length).toBe(2);
    expect(ui.usage()?.totalTokens).toBe(18);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.layout .pane')
        ?.textContent,
    ).toContain('Live');
  });

  it('leaves the network alone while no key is set', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const fixture = await render();
    fixture.componentInstance.generate('something nobody recorded');
    for (let i = 0; i < 40 && fixture.componentInstance.ui.isStreaming(); i++) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('ChatTab with a key', () => {
  it('sends the conversation and keeps the usage line out of the prose', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse([
        frame({ type: 'message_start', message: { usage: {} } }),
        frame({
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'Here it is:\n' },
        }),
        frame({
          type: 'content_block_delta',
          delta: {
            type: 'text_delta',
            text: '{"op":"add","path":"/root","value":"root"}\n{"op":"add","path":"/elements/root","value":{"type":"Heading","props":{"content":"Live","level":1},"children":[]}}\n',
          },
        }),
        frame({ type: 'message_delta', usage: { output_tokens: 4 } }),
      ]),
    );

    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    const fixture = TestBed.createComponent(ChatTab);
    await fixture.whenStable();
    TestBed.inject(ApiKeyStore).set(FAKE_KEY);

    void fixture.componentInstance.chat.send('build me a header');
    for (
      let i = 0;
      i < 100 && fixture.componentInstance.chat.isStreaming();
      i++
    ) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    fixture.detectChanges();
    await fixture.whenStable();

    const sent = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body)) as {
      messages: { role: string; content: string }[];
      system: string;
    };
    expect(sent.messages).toEqual([
      { role: 'user', content: 'build me a header' },
    ]);
    // `inline`, not the default: this tab wants prose alongside the patches.
    expect(sent.system).toBe(catalog.prompt({ mode: 'inline' }));
    expect(sent.system).not.toBe(catalog.prompt());

    const reply = fixture.componentInstance.chat
      .messages()
      .find((m) => m.role === 'assistant');
    expect(reply?.text).toContain('Here it is:');
    expect(reply?.text).not.toContain('__meta');
    expect(reply?.spec?.root).toBe('root');
  });
});
