import { NgComponentOutlet } from '@angular/common';
import {
  Component,
  Injector,
  provideZonelessChangeDetection,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type BaseEvent, EventType, HttpAgent } from '@ag-ui/client';
import type {
  ActivityDeltaEvent,
  ActivitySnapshotEvent,
  MessagesSnapshotEvent,
} from '@ag-ui/core';
import type { JsonPatch, Spec } from '@json-render/core';
import {
  JsonRenderer,
  defineRegistry,
  injectRenderContext,
  provideJsonRender,
  schema,
} from 'ngx-json-render';
import { z } from 'zod';
import {
  type AgUiAgent,
  type AgUiEvent,
  type AgUiSurface,
  JSON_RENDER_ACTIVITY_TYPE,
  JsonRenderActivity,
  applyAgUiEvent,
  injectAgentUI,
  isJsonRenderSpec,
  jsonRenderActivityRenderer,
  surfacesFromMessages,
} from './public-api';

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

const hello: Spec = {
  root: 'hello',
  elements: {
    hello: { type: 'Text', props: { content: 'Hello' }, children: [] },
  },
};

function snapshot(
  messageId: string,
  content: unknown,
  extra: Partial<ActivitySnapshotEvent> = {},
): ActivitySnapshotEvent {
  return {
    type: EventType.ACTIVITY_SNAPSHOT,
    messageId,
    activityType: JSON_RENDER_ACTIVITY_TYPE,
    content: content as Record<string, unknown>,
    ...extra,
  };
}

function delta(messageId: string, patch: JsonPatch[]): ActivityDeltaEvent {
  return {
    type: EventType.ACTIVITY_DELTA,
    messageId,
    activityType: JSON_RENDER_ACTIVITY_TYPE,
    patch: patch as ActivityDeltaEvent['patch'],
  };
}

/**
 * A real `HttpAgent` whose endpoint replays a fixed run as server-sent events,
 * so a test goes through AG-UI's own transport, decoder and event checks.
 * (Subclassing `AbstractAgent` here would not compile: `@ag-ui/client` pins
 * its own rxjs, so the workspace's `Observable` is a different type.)
 */
function replayAgent(events: () => BaseEvent[]): HttpAgent {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const { threadId, runId } = JSON.parse(String(init.body));
      const run = [
        { type: EventType.RUN_STARTED, threadId, runId },
        ...events(),
      ];
      const body = run.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
      return new Response(body, {
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }),
  );
  return new HttpAgent({ url: '/api/agent' });
}

function finished(): BaseEvent {
  return {
    type: EventType.RUN_FINISHED,
    threadId: 't',
    runId: 'r',
  } as BaseEvent;
}

afterEach(() => vi.unstubAllGlobals());

// Compile-time: real AG-UI objects fit the structural inputs. A version of
// @ag-ui that breaks this shape breaks the build here, not at a user's site.
const _event: AgUiEvent = snapshot('m', hello);
const _agent: AgUiAgent = new HttpAgent({ url: '/api/agent' });
void _event;
void _agent;

describe('applyAgUiEvent', () => {
  it('opens a surface from a snapshot', () => {
    const next = applyAgUiEvent([], snapshot('m1', hello));
    expect(next).toEqual([{ messageId: 'm1', spec: hello }]);
  });

  it('applies a delta immutably, keeping untouched elements', () => {
    const start = applyAgUiEvent([], snapshot('m1', hello));
    const next = applyAgUiEvent(
      start,
      delta('m1', [
        {
          op: 'add',
          path: '/elements/bye',
          value: { type: 'Text', props: { content: 'Bye' }, children: [] },
        },
      ]),
    );
    expect(next).not.toBe(start);
    expect(start[0].spec.elements['bye']).toBeUndefined();
    expect(next[0].spec.elements['bye']?.props).toEqual({ content: 'Bye' });
    expect(next[0].spec.elements['hello']).toBe(hello.elements['hello']);
  });

  it('starts a delta with no snapshot from an empty spec', () => {
    const next = applyAgUiEvent(
      [],
      delta('m1', [{ op: 'add', path: '/root', value: 'x' }]),
    );
    expect(next[0].spec).toEqual({ root: 'x', elements: {} });
  });

  it('drops malformed patch ops and returns the same array when nothing applied', () => {
    const start = applyAgUiEvent([], snapshot('m1', hello));
    const event = {
      ...delta('m1', []),
      patch: [{ nope: true }, 'x'],
    } as unknown as AgUiEvent;
    expect(applyAgUiEvent(start, event)).toBe(start);
  });

  it('ignores other activity types, other events and non-spec content', () => {
    const start: readonly AgUiSurface[] = [];
    expect(
      applyAgUiEvent(
        start,
        snapshot('m1', hello, { activityType: 'a2ui-surface' }),
      ),
    ).toBe(start);
    expect(applyAgUiEvent(start, snapshot('m1', { not: 'a spec' }))).toBe(
      start,
    );
    expect(
      applyAgUiEvent(start, { type: EventType.TEXT_MESSAGE_START }),
    ).toBe(start);
    expect(
      applyAgUiEvent(start, { type: EventType.ACTIVITY_DELTA, messageId: 1 } as AgUiEvent),
    ).toBe(start);
  });

  it('honours a custom activity type', () => {
    const next = applyAgUiEvent(
      [],
      snapshot('m1', hello, { activityType: 'ui' }),
      'ui',
    );
    expect(next).toHaveLength(1);
  });

  it('keeps an existing surface on replace: false, and replaces it otherwise', () => {
    const start = applyAgUiEvent([], snapshot('m1', hello));
    const other: Spec = { root: '', elements: {} };
    expect(
      applyAgUiEvent(start, snapshot('m1', other, { replace: false })),
    ).toBe(start);
    expect(applyAgUiEvent(start, snapshot('m1', other))[0].spec).toBe(other);
    expect(
      applyAgUiEvent(start, snapshot('m2', other, { replace: false })),
    ).toHaveLength(2);
  });

  it('follows MESSAGES_SNAPSHOT: activities present replace the set, absent keep it', () => {
    const start = applyAgUiEvent([], snapshot('m1', hello));
    const noActivities: MessagesSnapshotEvent = {
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [{ id: 'u', role: 'user', content: 'hi' }],
    };
    expect(applyAgUiEvent(start, noActivities)).toBe(start);

    const withActivities: MessagesSnapshotEvent = {
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [
        {
          id: 'a2',
          role: 'activity',
          activityType: JSON_RENDER_ACTIVITY_TYPE,
          content: hello as unknown as Record<string, unknown>,
        },
        {
          id: 'a3',
          role: 'activity',
          activityType: 'a2ui-surface',
          content: {},
        },
      ],
    };
    expect(applyAgUiEvent(start, withActivities)).toEqual([
      { messageId: 'a2', spec: hello },
    ]);
    expect(
      applyAgUiEvent(start, {
        type: EventType.MESSAGES_SNAPSHOT,
        messages: 'x',
      } as AgUiEvent),
    ).toBe(start);
  });
});

describe('isJsonRenderSpec / surfacesFromMessages', () => {
  it('checks the shape only', () => {
    expect(isJsonRenderSpec(hello)).toBe(true);
    expect(isJsonRenderSpec({ root: 1, elements: {} })).toBe(false);
    expect(isJsonRenderSpec({ root: '', elements: [] })).toBe(false);
    expect(isJsonRenderSpec(null)).toBe(false);
  });

  it('reads json-render activities out of a message list', () => {
    expect(
      surfacesFromMessages([
        { id: 'u', role: 'user' },
        {
          id: 'a',
          role: 'activity',
          activityType: JSON_RENDER_ACTIVITY_TYPE,
          content: hello,
        } as never,
      ]),
    ).toEqual([{ messageId: 'a', spec: hello }]);
  });
});

describe('injectAgentUI', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
  });

  function attach(agent: HttpAgent, options = {}) {
    const injector = TestBed.inject(Injector);
    return runInInjectionContext(injector, () =>
      injectAgentUI({ agent, ...options }),
    );
  }

  it('builds a spec from a real @ag-ui/client run and checks it at the end', async () => {
    const onComplete = vi.fn();
    const agent = replayAgent(() => [
      snapshot('m1', { root: '', elements: {} }),
      delta('m1', [
        { op: 'add', path: '/root', value: 'hello' },
        { op: 'add', path: '/elements/hello', value: hello.elements['hello'] },
      ]),
      finished(),
    ]);
    const ui = attach(agent, { onComplete, validate: 'strict', catalog });
    expect(ui.spec()).toBeNull();

    // The client calls onRunInitialized after an await, so isStreaming is
    // observed during the run rather than right after runAgent().
    const streamingDuringRun: boolean[] = [];
    agent.subscribe({
      onEvent: () => void streamingDuringRun.push(ui.isStreaming()),
    });
    await agent.runAgent();
    expect(streamingDuringRun.length).toBeGreaterThan(0);
    expect(streamingDuringRun.every(Boolean)).toBe(true);

    expect(ui.isStreaming()).toBe(false);
    expect(ui.error()).toBeNull();
    expect(ui.issues()).toEqual([]);
    expect(ui.spec()).toEqual(hello);
    expect(ui.surfaces()).toHaveLength(1);
    expect(onComplete).toHaveBeenCalledWith(hello, 'm1');
  });

  it('starts from the surfaces already in the agent history', () => {
    const agent = replayAgent(() => []);
    agent.addMessage({
      id: 'old',
      role: 'activity',
      activityType: JSON_RENDER_ACTIVITY_TYPE,
      content: hello as unknown as Record<string, unknown>,
    });
    expect(attach(agent).spec()).toEqual(hello);
  });

  it('reports a RUN_ERROR once and skips onComplete', async () => {
    const onError = vi.fn();
    const onComplete = vi.fn();
    const agent = replayAgent(() => [
      snapshot('m1', hello),
      { type: EventType.RUN_ERROR, message: 'model overloaded' } as BaseEvent,
    ]);
    const ui = attach(agent, { onError, onComplete });
    await agent.runAgent().catch(() => undefined);

    expect(ui.error()?.message).toBe('model overloaded');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
    expect(ui.isStreaming()).toBe(false);
    expect(ui.spec()).toEqual(hello);
  });

  it('fails a run whose surface breaks strict validation', async () => {
    const onError = vi.fn();
    const agent = replayAgent(() => [
      snapshot('m1', {
        root: 'x',
        elements: { x: { type: 'Nope', props: {}, children: [] } },
      }),
      finished(),
    ]);
    const ui = attach(agent, { onError, validate: 'strict', catalog });
    await agent.runAgent();

    expect(ui.error()?.message).toContain('failed validation');
    expect(ui.issues().length).toBeGreaterThan(0);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('fails the run when the client itself fails it', async () => {
    const onError = vi.fn();
    const agent = new HttpAgent({ url: '/api/agent' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const ui = attach(agent, { onError });
    await agent.runAgent().catch(() => undefined);
    expect(ui.error()?.message).toBe('network down');
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes on destroy', () => {
    const unsubscribe = vi.fn();
    const agent: AgUiAgent = { subscribe: () => ({ unsubscribe }) };
    const injector = Injector.create({
      providers: [],
      parent: TestBed.inject(Injector),
    }) as Injector & { destroy(): void };
    runInInjectionContext(injector, () => injectAgentUI({ agent }));
    injector.destroy();
    expect(unsubscribe).toHaveBeenCalled();
  });
});

describe('rendering', () => {
  it('renders what the agent streams with <json-render>', async () => {
    const agent = replayAgent(() => [snapshot('m1', hello), finished()]);

    @Component({
      imports: [JsonRenderer],
      template: `<json-render [spec]="ui.spec()" [registry]="registry" />`,
    })
    class Host {
      readonly registry = registry;
      readonly ui = injectAgentUI({ agent });
    }

    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    const fixture = TestBed.createComponent(Host);
    await agent.runAgent();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Hello');
  });

  it('mounts JsonRenderActivity the way CopilotKit mounts an activity renderer', async () => {
    const config = jsonRenderActivityRenderer();
    expect(config.activityType).toBe(JSON_RENDER_ACTIVITY_TYPE);
    expect('agentId' in config).toBe(false);

    @Component({
      imports: [NgComponentOutlet],
      template: `<ng-container
        *ngComponentOutlet="component; inputs: inputs()"
      />`,
    })
    class Host {
      readonly component = config.component;
      readonly inputs = signal<Record<string, unknown>>({
        activityType: JSON_RENDER_ACTIVITY_TYPE,
        content: hello,
        message: { id: 'm1', role: 'activity' },
        agent: undefined,
      });
    }

    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideJsonRender({ registry })],
    });
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Hello');

    fixture.componentInstance.inputs.update((i) => ({ ...i, content: 'junk' }));
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).not.toContain('Hello');
  });

  it('validates content through the config schema', () => {
    const config = jsonRenderActivityRenderer({
      activityType: 'ui',
      agentId: 'a',
      component: TextComponent,
    });
    expect(config).toMatchObject({ activityType: 'ui', agentId: 'a' });
    expect(config.component).toBe(TextComponent);
    expect(config.content.safeParse(hello)).toEqual({
      success: true,
      data: hello,
    });
    expect(config.content.safeParse({}).success).toBe(false);
    expect(JsonRenderActivity).toBeDefined();
  });
});
