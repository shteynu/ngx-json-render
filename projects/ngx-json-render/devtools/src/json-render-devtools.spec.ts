import {
  Component,
  provideZonelessChangeDetection,
  signal,
  viewChild,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  type Catalog,
  type Spec,
  isDevtoolsActive,
  nextActionDispatchId,
  notifyActionDispatch,
  notifyActionSettle,
} from '@json-render/core';
import type { DevtoolsEvent } from '@json-render/devtools';
import {
  type ChatMessage,
  type ChatUIReturn,
  JsonRenderer,
  defineRegistry,
  injectRenderContext,
  injectChatUI,
  injectUIStream,
  schema,
} from 'ngx-json-render';
import {
  recordedTransport,
  specStream,
  usageLine,
} from 'ngx-json-render/testing';
import { z } from 'zod';
import { JsonRenderDevtools } from './json-render-devtools';

@Component({
  selector: 'test-text',
  template: `<p>{{ ctx.props().content }}</p>`,
})
class TextComponent {
  readonly ctx = injectRenderContext<{ content?: string }>();
}

const catalog = schema.createCatalog({
  components: {
    Text: {
      props: z.object({ content: z.string() }),
      slots: [],
      description: 'A paragraph',
    },
  },
  actions: {},
});
const { registry } = defineRegistry(catalog, {
  components: { Text: TextComponent },
  actions: {},
});

const spec: Spec = {
  root: 'hello',
  elements: {
    hello: { type: 'Text', props: { content: 'Hello' }, children: [] },
  },
  state: { count: 1 },
};

@Component({
  imports: [JsonRenderer, JsonRenderDevtools],
  template: `
    <json-render
      #r
      [spec]="ui.spec() ?? spec"
      [registry]="registry"
      [catalog]="rendererCatalog()"
    />
    @if (showDevtools()) {
      <json-render-devtools
        [renderer]="r"
        [spec]="specOverride()"
        [catalog]="catalogInput()"
        [chat]="chat()"
        [initialOpen]="true"
        [reserveSpace]="false"
        (event)="events.push($event)"
      />
    }
  `,
})
class Host {
  readonly spec = spec;
  readonly registry = registry;
  readonly catalog = catalog;
  readonly showDevtools = signal(true);
  readonly specOverride = signal<Spec | null | undefined>(undefined);
  readonly catalogInput = signal<Catalog | null | undefined>(catalog);
  readonly rendererCatalog = signal<Catalog | null>(null);
  readonly chat = signal<ChatUIReturn | null>(null);
  readonly events: DevtoolsEvent[] = [];
  readonly renderer = viewChild.required(JsonRenderer);
  readonly devtools = viewChild(JsonRenderDevtools);
  readonly liveChat = injectChatUI({
    api: '/api/chat',
    fetch: recordedTransport([
      'Here is a greeting',
      '{"op":"add","path":"/root","value":"hi"}',
    ]),
  });
  readonly ui = injectUIStream({
    api: '/api/generate',
    fetch: recordedTransport([
      ...specStream({
        root: 'hi',
        elements: {
          hi: { type: 'Text', props: { content: 'Streamed' }, children: [] },
        },
      }),
      usageLine({ promptTokens: 3, completionTokens: 5, totalTokens: 8 }),
    ]),
  });
}

const panelHost = () => document.querySelector('[data-jr-devtools-host]');

async function until(predicate: () => boolean) {
  for (let i = 0; i < 200 && !predicate(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(predicate()).toBe(true);
}

async function render() {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  // The panel module arrives through a dynamic import after first render.
  await until(() => panelHost() !== null);
  await fixture.whenStable();
  return fixture;
}

afterEach(() => {
  TestBed.resetTestingModule();
  panelHost()?.remove();
});

describe('JsonRenderDevtools', () => {
  it('mounts the panel and turns the picker keys on', async () => {
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;

    expect(panelHost()?.shadowRoot).toBeTruthy();
    expect(isDevtoolsActive()).toBe(true);
    // The renderer now wraps elements for the picker and the highlight.
    await until(() => host.querySelector('[data-jr-key="hello"]') !== null);
  });

  it('records every stream in the app, with no wiring', async () => {
    const fixture = await render();
    await fixture.componentInstance.ui.send('anything');
    await fixture.whenStable();

    const kinds = fixture.componentInstance.events.map((e) => e.kind);
    expect(kinds[0]).toBe('stream-lifecycle');
    expect(kinds).toContain('stream-patch');
    expect(kinds).toContain('stream-usage');
    const last = fixture.componentInstance.events.at(-1);
    expect(last).toMatchObject({
      kind: 'stream-lifecycle',
      phase: 'end',
      ok: true,
    });
  });

  it('turns state writes into events', async () => {
    const fixture = await render();
    fixture.componentInstance.renderer().stateStore.set('/count', 2);

    expect(fixture.componentInstance.events).toContainEqual(
      expect.objectContaining({ kind: 'state-set', path: '/count', next: 2 }),
    );
  });

  it('reads spec, catalog and state through the renderer', async () => {
    const fixture = await render();
    const devtools = fixture.componentInstance.devtools()!;

    expect(devtools['currentSpec']()).toBe(spec);
    expect(devtools['currentCatalog']()).toBe(catalog);
    expect(devtools['generations']()).toEqual([
      { id: 'current', label: 'Current', spec },
    ]);

    const store = devtools['stateStore']()!;
    store.set('/count', 5);
    expect(store.get('/count')).toBe(5);
    store.update({ '/count': 6 });
    expect(store.getSnapshot()).toMatchObject({ count: 6 });
    expect(typeof store.subscribe(() => {})).toBe('function');
  });

  it('lists each chat reply with a spec as a generation', async () => {
    const fixture = await render();
    const reply = (id: string, content: string): ChatMessage => ({
      id,
      role: 'assistant',
      text: '',
      spec: {
        root: 'r',
        elements: { r: { type: 'Text', props: { content }, children: [] } },
      },
    });
    const messages = signal<ChatMessage[]>([
      { id: 'u1', role: 'user', text: 'hi', spec: null },
      reply('a1', 'first'),
      { id: 'a2', role: 'assistant', text: 'just talk', spec: null },
      reply('a3', 'second'),
    ]);
    fixture.componentInstance.chat.set({ messages } as unknown as ChatUIReturn);
    await fixture.whenStable();

    const devtools = fixture.componentInstance.devtools()!;
    expect(
      devtools['generations']().map((g: { label: string }) => g.label),
    ).toEqual(['Generation 1', 'Generation 2']);
    // The latest reply's spec is the one on show.
    expect(devtools['currentSpec']()?.elements['r']?.props['content']).toBe(
      'second',
    );
  });

  it("records action dispatches and settles from the app's core", async () => {
    const fixture = await render();
    const id = nextActionDispatchId();
    notifyActionDispatch({ id, name: 'save', params: { a: 1 }, at: 1 });
    notifyActionSettle({
      id,
      name: 'save',
      ok: false,
      at: 2,
      durationMs: 1,
      error: new Error('nope'),
    });
    notifyActionSettle({ id, name: 'save', ok: true, at: 3, durationMs: 2 });

    const actions = fixture.componentInstance.events.filter((e) =>
      e.kind.startsWith('action'),
    );
    expect(actions).toEqual([
      expect.objectContaining({ kind: 'action-dispatched', name: 'save' }),
      expect.objectContaining({
        kind: 'action-settled',
        ok: false,
        error: 'Error: nope',
      }),
      expect.objectContaining({
        kind: 'action-settled',
        ok: true,
        error: undefined,
      }),
    ]);
  });

  it('records chat prose as stream text', async () => {
    const fixture = await render();
    await fixture.componentInstance.liveChat.send('hi');

    expect(fixture.componentInstance.events).toContainEqual(
      expect.objectContaining({
        kind: 'stream-text',
        text: 'Here is a greeting',
      }),
    );
  });

  it('prefers its own spec and catalog inputs, and falls back to the renderer', async () => {
    const fixture = await render();
    const devtools = fixture.componentInstance.devtools()!;
    const other: Spec = { root: '', elements: {} };

    fixture.componentInstance.specOverride.set(other);
    fixture.componentInstance.catalogInput.set(undefined);
    await fixture.whenStable();
    expect(devtools['currentSpec']()).toBe(other);
    // No catalog anywhere: the tab says so instead of guessing.
    expect(devtools['currentCatalog']()).toBeNull();

    fixture.componentInstance.rendererCatalog.set(catalog);
    await fixture.whenStable();
    expect(devtools['currentCatalog']()).toBe(catalog);

    fixture.componentInstance.specOverride.set(null);
    await fixture.whenStable();
    expect(devtools['generations']()).toEqual([]);
  });

  it('tears everything down with the component', async () => {
    const fixture = await render();
    fixture.componentInstance.showDevtools.set(false);
    await fixture.whenStable();

    expect(panelHost()).toBeNull();
    expect(isDevtoolsActive()).toBe(false);

    // Streams no longer reach the destroyed panel.
    const before = fixture.componentInstance.events.length;
    await fixture.componentInstance.ui.send('again');
    expect(fixture.componentInstance.events.length).toBe(before);
  });
});
