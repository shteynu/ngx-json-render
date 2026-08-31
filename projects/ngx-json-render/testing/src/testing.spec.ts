import {
  Component,
  InjectionToken,
  inject,
  provideZonelessChangeDetection,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Spec, ValidationConfig } from '@json-render/core';
import {
  JrChildren,
  injectChatUI,
  injectFieldValidation,
  injectRenderContext,
  injectUIStream,
} from 'ngx-json-render';
import { recordedTransport, specStream, usageLine } from './recorded-transport';
import { renderSpec } from './render-spec';

// ---------------------------------------------------------------------------
// A catalog small enough to read, big enough to exercise the harness
// ---------------------------------------------------------------------------

const GREETING = new InjectionToken<string>('greeting', {
  factory: () => 'hello',
});

@Component({
  selector: 't-text',
  template: `<span class="text">{{ content() }}</span>`,
})
class TText {
  private readonly ctx = injectRenderContext<{ content?: unknown }>();
  readonly content = () => String(this.ctx.props().content ?? '');
}

@Component({
  selector: 't-box',
  imports: [JrChildren],
  template: `<div class="box"><jr-children /></div>`,
})
class TBox {}

@Component({
  selector: 't-btn',
  template: `<button class="btn" (click)="ctx.emit('press')">
    {{ label() }}
  </button>`,
})
class TBtn {
  readonly ctx = injectRenderContext<{ label?: string }>();
  readonly label = () => this.ctx.props().label ?? '';
}

@Component({
  selector: 't-input',
  template: `<input class="input" [value]="value()" (input)="onInput($event)" />`,
})
class TInput {
  readonly ctx = injectRenderContext<{ value?: string }>();
  readonly value = () => this.ctx.props().value ?? '';
  onInput(event: Event): void {
    this.ctx.setBound('value', (event.target as HTMLInputElement).value);
  }
}

/** What a real catalog's field does: bind a value and register validation. */
@Component({
  selector: 't-field',
  template: `<input class="field" [value]="value()" (input)="onInput($event)" />`,
})
class TField {
  private readonly ctx = injectRenderContext<{
    value?: string;
    validation?: ValidationConfig;
  }>();
  readonly value = () => this.ctx.props().value ?? '';
  private readonly field = injectFieldValidation(
    () => this.ctx.bindings()?.['value'] ?? '',
    () => this.ctx.props().validation,
  );
  readonly errors = this.field.errors;
  onInput(event: Event): void {
    this.ctx.setBound('value', (event.target as HTMLInputElement).value);
  }
}

@Component({
  selector: 't-greeting',
  template: `<span class="greeting">{{ greeting }}</span>`,
})
class TGreeting {
  readonly greeting = inject(GREETING);
}

const REGISTRY = {
  Text: TText,
  Box: TBox,
  Btn: TBtn,
  Input: TInput,
  Field: TField,
  Greeting: TGreeting,
};

const HELLO: Spec = {
  root: 'root',
  elements: {
    root: { type: 'Box', props: {}, children: ['a', 'b'] },
    a: { type: 'Text', props: { content: 'first' } },
    b: { type: 'Text', props: { content: 'second' } },
  },
};

// ---------------------------------------------------------------------------
// renderSpec
// ---------------------------------------------------------------------------

describe('renderSpec', () => {
  it('renders a spec and reads what came out', async () => {
    const ui = await renderSpec(HELLO, { registry: REGISTRY });

    expect(ui.texts('.text')).toEqual(['first', 'second']);
    expect(ui.text('.box')).toBe('firstsecond');
    expect(ui.findAll('.text').length).toBe(2);
    expect(ui.find('.text').textContent).toBe('first');
    expect(ui.element.querySelector('.box')).not.toBeNull();
  });

  it('says what was rendered when a selector matches nothing', async () => {
    const ui = await renderSpec(HELLO, { registry: REGISTRY });

    expect(() => ui.find('.missing')).toThrowError(
      /nothing matches ".missing"/,
    );
    // The message carries the DOM, so the failure names the mismatch instead
    // of leaving the reader to print it themselves.
    expect(() => ui.find('.missing')).toThrowError(/first/);
    expect(ui.findAll('.missing')).toEqual([]);
  });

  it('records every dispatch, handled or not', async () => {
    const handled: unknown[] = [];
    const spec: Spec = {
      root: 'root',
      elements: {
        root: { type: 'Box', props: {}, children: ['save', 'quit'] },
        save: {
          type: 'Btn',
          props: { label: 'Save' },
          on: { press: { action: 'save', params: { id: 7 } } },
        },
        quit: {
          type: 'Btn',
          props: { label: 'Quit' },
          on: { press: { action: 'quit' } },
        },
      },
    };

    const ui = await renderSpec(spec, {
      registry: REGISTRY,
      handlers: {
        save: (params) => {
          handled.push(params);
        },
      },
    });

    await ui.click('.btn');
    await ui.click(ui.findAll('.btn')[1]);

    expect(handled).toEqual([{ id: 7 }]);
    expect(ui.dispatched).toEqual([
      { name: 'save', params: { id: 7 } },
      { name: 'quit', params: {} },
    ]);
  });

  it('drives bound state and collects the emitted changes', async () => {
    const spec: Spec = {
      root: 'root',
      elements: {
        root: { type: 'Input', props: { value: { $bindState: '/email' } } },
      },
      state: { email: 'old@example.com' },
    };

    const ui = await renderSpec(spec, { registry: REGISTRY });
    expect(ui.read('/email')).toBe('old@example.com');

    await ui.fill('.input', 'new@example.com');

    expect(ui.read('/email')).toBe('new@example.com');
    expect(ui.state()).toEqual({ email: 'new@example.com' });
    expect(ui.changes).toEqual([{ path: '/email', value: 'new@example.com' }]);
    expect(ui.find<HTMLInputElement>('.input').value).toBe('new@example.com');

    await ui.write('/email', 'third@example.com');
    expect(ui.find<HTMLInputElement>('.input').value).toBe('third@example.com');
  });

  it('renders later frames and the loading flag', async () => {
    const ui = await renderSpec(null, { registry: REGISTRY });
    expect(ui.text()).toBe('');
    expect(ui.renderer.stateStore).toBe(ui.store);

    await ui.setSpec(HELLO);
    expect(ui.texts('.text')).toEqual(['first', 'second']);

    await ui.setLoading(true);
    expect(ui.renderer.loading()).toBe(true);

    ui.destroy();
  });

  it("exposes the renderer's own services, not the root injector's", async () => {
    const spec: Spec = {
      root: 'root',
      elements: {
        root: {
          type: 'Field',
          props: {
            value: { $bindState: '/email' },
            validation: { checks: [{ type: 'required', message: 'Required' }] },
          },
        },
      },
      state: { email: '' },
    };

    const ui = await renderSpec(spec, { registry: REGISTRY });

    expect(ui.validation.validateAll()).toBe(false);
    await ui.write('/email', 'ada@example.com');
    expect(ui.validation.validateAll()).toBe(true);
    expect(ui.store.get('/email')).toBe('ada@example.com');
  });

  it('passes extra providers to the components under test', async () => {
    const ui = await renderSpec(
      { root: 'root', elements: { root: { type: 'Greeting', props: {} } } },
      {
        registry: REGISTRY,
        providers: [{ provide: GREETING, useValue: 'guten tag' }],
      },
    );

    expect(ui.text('.greeting')).toBe('guten tag');
  });
});

// ---------------------------------------------------------------------------
// recordedTransport
// ---------------------------------------------------------------------------

describe('recordedTransport', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
  });

  it('replays a recording through the real client', async () => {
    const ui = TestBed.runInInjectionContext(() =>
      injectUIStream({
        api: '/api/generate',
        fetch: recordedTransport([
          ...specStream(HELLO),
          usageLine({ promptTokens: 10, completionTokens: 5, totalTokens: 15 }),
        ]),
      }),
    );

    await ui.send('anything');

    expect(ui.spec()).toEqual(HELLO);
    expect(ui.usage()).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
    expect(ui.isStreaming()).toBe(false);
    expect(ui.error()).toBeNull();
  });

  it('renders what a recording streams', async () => {
    const ui = TestBed.runInInjectionContext(() =>
      injectUIStream({
        api: '/api/generate',
        fetch: recordedTransport(specStream(HELLO)),
      }),
    );
    await ui.send('a greeting');

    const rendered = await renderSpec(ui.spec(), { registry: REGISTRY });
    expect(rendered.texts('.text')).toEqual(['first', 'second']);
  });

  it('answers each prompt with its own recording, and 404s the rest', async () => {
    const other: Spec = {
      root: 'root',
      elements: { root: { type: 'Text', props: { content: 'other' } } },
    };
    const transport = recordedTransport({
      hello: specStream(HELLO),
      other: specStream(other),
    });

    const ui = TestBed.runInInjectionContext(() =>
      injectUIStream({ api: '/api/generate', fetch: transport }),
    );

    await ui.send('other');
    expect(ui.spec()).toEqual(other);

    await ui.send('nothing recorded');
    expect(ui.error()?.message).toBe('No recording for "nothing recorded".');
  });

  it('reads the prompt out of a chat request too', async () => {
    const seen: string[] = [];
    const transport = recordedTransport((prompt) => {
      seen.push(prompt);
      return ['Here you go.', ...specStream(HELLO)];
    });

    const chat = TestBed.runInInjectionContext(() =>
      injectChatUI({ api: '/api/chat', fetch: transport }),
    );

    await chat.send('draw me a box');

    expect(seen).toEqual(['draw me a box']);
    const assistant = chat.messages()[1];
    expect(assistant.text).toBe('Here you go.');
    expect(assistant.spec).toEqual(HELLO);
  });

  it('fails on demand, and recovers when the failure is switched off', async () => {
    let down = true;
    const ui = TestBed.runInInjectionContext(() =>
      injectUIStream({
        api: '/api/generate',
        fetch: recordedTransport(specStream(HELLO), {
          fail: () =>
            down ? { status: 503, message: 'Model is down.' } : null,
        }),
      }),
    );

    await ui.send('anything');
    expect(ui.error()?.message).toBe('Model is down.');

    down = false;
    await ui.send('anything');
    expect(ui.error()).toBeNull();
    expect(ui.spec()).toEqual(HELLO);
  });

  it('dies mid-flight when the generation is stopped', async () => {
    const ui = TestBed.runInInjectionContext(() =>
      injectUIStream({
        api: '/api/generate',
        fetch: recordedTransport(specStream(HELLO), { delayMs: 5 }),
      }),
    );

    const sent = ui.send('anything');
    await new Promise((resolve) => setTimeout(resolve, 12));
    const partial = ui.spec();
    ui.stop();
    await sent;

    // Whatever had arrived stays on screen; the rest never does, and the
    // abort is not reported as a failure.
    expect(ui.isStreaming()).toBe(false);
    expect(ui.error()).toBeNull();
    expect(Object.keys(partial?.elements ?? {}).length).toBeLessThan(3);
    expect(ui.spec()).toEqual(partial);
  });

  it('answers a request directly, for the paths no hook reaches', async () => {
    const transport = recordedTransport({ hi: specStream(HELLO) });

    // A body that is not the JSON either hook sends: no prompt, no recording.
    const unknown = await transport('/api/generate', { body: 'not json' });
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({
      message: 'No recording for "".',
    });

    // A signal that fired before the request went out fails the way fetch
    // does, rather than answering a request nobody is waiting for.
    const controller = new AbortController();
    controller.abort();
    await expect(
      transport('/api/generate', {
        body: JSON.stringify({ prompt: 'hi' }),
        signal: controller.signal,
      }),
    ).rejects.toThrowError('The operation was aborted.');
  });

  it('falls back to a 500 when the failure says nothing more', async () => {
    const response = await recordedTransport([], { fail: {} })(
      '/api/generate',
      { body: JSON.stringify({ prompt: 'hi' }) },
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: 'The recorded server failed this request.',
    });
  });

  it('writes patch lines for the root, the state and every element', () => {
    const lines = specStream({
      root: 'root',
      elements: { 'a/b': { type: 'Text', props: {} } },
      state: { count: 1 },
    });

    expect(lines.map((line) => JSON.parse(line))).toEqual([
      { op: 'add', path: '/root', value: 'root' },
      { op: 'add', path: '/state', value: { count: 1 } },
      // The key is a JSON Pointer segment, so its slash is escaped rather
      // than read as another level of path.
      { op: 'add', path: '/elements/a~1b', value: { type: 'Text', props: {} } },
    ]);
  });
});
