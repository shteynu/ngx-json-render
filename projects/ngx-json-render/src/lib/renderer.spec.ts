import { Component, signal } from '@angular/core';
import {
  type ComponentFixture,
  TestBed,
} from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import type { ActionHandler, Spec } from '@json-render/core';
import { JrChildren } from './children.component';
import { JsonRenderer } from './renderer.component';
import { injectRenderContext } from './tokens';
import type { ComponentRegistry, StateChange } from './types';

// ---------------------------------------------------------------------------
// Test catalog components
// ---------------------------------------------------------------------------

@Component({
  selector: 't-text',
  template: `<span class="t-text">{{ content() }}</span>`,
})
class TText {
  private readonly ctx = injectRenderContext<{ content?: unknown }>();
  readonly content = () => String(this.ctx.props().content ?? '');
}

@Component({
  selector: 't-box',
  imports: [JrChildren],
  template: `<div class="t-box"><jr-children /></div>`,
})
class TBox {}

@Component({
  selector: 't-card',
  imports: [JrChildren],
  template: `
    <div class="t-card">
      <div class="t-card-header"><jr-children slot="header" /></div>
      <div class="t-card-body"><jr-children /></div>
    </div>
  `,
})
class TCard {}

@Component({
  selector: 't-btn',
  template: `<button class="t-btn" (click)="ctx.emit('press')">
    {{ label() }}
  </button>`,
})
class TBtn {
  readonly ctx = injectRenderContext<{ label?: string }>();
  readonly label = () => this.ctx.props().label ?? '';
}

@Component({
  selector: 't-input',
  template: `<input
    class="t-input"
    [value]="value()"
    (input)="onInput($event)"
  />`,
})
class TInput {
  readonly ctx = injectRenderContext<{ value?: string }>();
  readonly value = () => this.ctx.props().value ?? '';
  onInput(event: Event): void {
    this.ctx.setBound('value', (event.target as HTMLInputElement).value);
  }
}

@Component({
  selector: 't-fallback',
  template: `<span class="t-fallback">unknown</span>`,
})
class TFallback {}

const REGISTRY: ComponentRegistry = {
  Text: TText,
  Box: TBox,
  Btn: TBtn,
  Input: TInput,
  Card: { component: TCard, slots: ['header'] },
};

// ---------------------------------------------------------------------------
// Host
// ---------------------------------------------------------------------------

@Component({
  imports: [JsonRenderer],
  template: `<json-render
    #renderer
    [spec]="spec()"
    [registry]="registry"
    [loading]="loading()"
    [handlers]="handlers"
    [onAction]="onAction"
    [fallback]="fallback"
    (stateChange)="changes.push($event)"
  />`,
})
class Host {
  readonly spec = signal<Spec | null>(null);
  readonly loading = signal(false);
  registry: ComponentRegistry = REGISTRY;
  handlers: Record<string, ActionHandler> | undefined = undefined;
  onAction: ((name: string, params?: Record<string, unknown>) => void) | null =
    null;
  fallback = null as unknown as typeof TFallback | null;
  readonly changes: StateChange[][] = [];
}

async function setup(spec: Spec | null, configure?: (host: Host) => void) {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  });
  const fixture = TestBed.createComponent(Host);
  configure?.(fixture.componentInstance);
  fixture.componentInstance.spec.set(spec);
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<unknown>) {
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
}

function text(fixture: ComponentFixture<unknown>, selector: string): string[] {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll(selector),
  ).map((el) => (el.textContent ?? '').trim());
}

function stateService(fixture: ComponentFixture<Host>) {
  return fixture.debugElement.children[0].componentInstance.stateStore as {
    get(path: string): unknown;
    set(path: string, value: unknown): void;
    state(): Record<string, unknown>;
  };
}

// ---------------------------------------------------------------------------
// Specs
// ---------------------------------------------------------------------------

describe('JsonRenderer', () => {
  it('renders the root element tree with literal props', async () => {
    const fixture = await setup({
      root: 'root',
      elements: {
        root: { type: 'Box', props: {}, children: ['a', 'b'] },
        a: { type: 'Text', props: { content: 'Hello' } },
        b: { type: 'Text', props: { content: 'World' } },
      },
    });

    expect(text(fixture, '.t-text')).toEqual(['Hello', 'World']);
  });

  it('resolves $state props from spec.state and updates reactively', async () => {
    const fixture = await setup({
      root: 'root',
      state: { name: 'Ada' },
      elements: {
        root: { type: 'Text', props: { content: { $state: '/name' } } },
      },
    });

    expect(text(fixture, '.t-text')).toEqual(['Ada']);

    stateService(fixture).set('/name', 'Grace');
    await settle(fixture);
    expect(text(fixture, '.t-text')).toEqual(['Grace']);
  });

  it('toggles visibility on state changes', async () => {
    const fixture = await setup({
      root: 'root',
      state: { show: false },
      elements: {
        root: { type: 'Box', props: {}, children: ['secret'] },
        secret: {
          type: 'Text',
          props: { content: 'Secret' },
          visible: { $state: '/show' },
        },
      },
    });

    expect(text(fixture, '.t-text')).toEqual([]);

    stateService(fixture).set('/show', true);
    await settle(fixture);
    expect(text(fixture, '.t-text')).toEqual(['Secret']);
  });

  it('executes the built-in setState action and emits stateChange', async () => {
    const fixture = await setup({
      root: 'root',
      state: { count: 1 },
      elements: {
        root: { type: 'Box', props: {}, children: ['count', 'inc'] },
        count: { type: 'Text', props: { content: { $state: '/count' } } },
        inc: {
          type: 'Btn',
          props: { label: '+1' },
          on: {
            press: {
              action: 'setState',
              params: { statePath: '/count', value: 2 },
            },
          },
        },
      },
    });

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.t-btn')!
      .click();
    await settle(fixture);

    expect(text(fixture, '.t-text')).toEqual(['2']);
    expect(fixture.componentInstance.changes.flat()).toContainEqual({
      path: '/count',
      value: 2,
    });
  });

  it('routes custom actions to handlers with $state params resolved', async () => {
    const received: unknown[] = [];
    const fixture = await setup(
      {
        root: 'root',
        state: { q: 'angular' },
        elements: {
          root: {
            type: 'Btn',
            props: { label: 'Search' },
            on: {
              press: { action: 'search', params: { query: { $state: '/q' } } },
            },
          },
        },
      },
      (host) => {
        host.handlers = {
          search: (params) => {
            received.push(params);
          },
        };
      },
    );

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.t-btn')!
      .click();
    await settle(fixture);

    expect(received).toEqual([{ query: 'angular' }]);
  });

  it('falls back to onAction for actions without a dedicated handler', async () => {
    const received: Array<[string, unknown]> = [];
    const fixture = await setup(
      {
        root: 'root',
        elements: {
          root: {
            type: 'Btn',
            props: { label: 'Go' },
            on: { press: { action: 'custom', params: { a: 1 } } },
          },
        },
      },
      (host) => {
        host.onAction = (name, params) => received.push([name, params]);
      },
    );

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.t-btn')!
      .click();
    await settle(fixture);

    expect(received).toEqual([['custom', { a: 1 }]]);
  });

  it('renders repeat children with $item, $index, and $template', async () => {
    const fixture = await setup({
      root: 'root',
      state: {
        todos: [
          { id: 'a', title: 'One' },
          { id: 'b', title: 'Two' },
        ],
      },
      elements: {
        root: {
          type: 'Box',
          props: {},
          repeat: { statePath: '/todos', key: 'id' },
          children: ['row'],
        },
        row: {
          type: 'Text',
          props: { content: { $template: '${/title}#${title}' } },
        },
      },
    });

    // ${/title} resolves against state (missing → ''), ${title} against the item
    expect(text(fixture, '.t-text')).toEqual(['#One', '#Two']);
  });

  it('supports two-way binding via $bindItem inside repeat', async () => {
    const fixture = await setup({
      root: 'root',
      state: { todos: [{ title: 'One' }, { title: 'Two' }] },
      elements: {
        root: {
          type: 'Box',
          props: {},
          repeat: { statePath: '/todos' },
          children: ['edit'],
        },
        edit: { type: 'Input', props: { value: { $bindItem: 'title' } } },
      },
    });

    const inputs = (fixture.nativeElement as HTMLElement).querySelectorAll<
      HTMLInputElement
    >('.t-input');
    expect(Array.from(inputs).map((i) => i.value)).toEqual(['One', 'Two']);

    inputs[1].value = 'Two!';
    inputs[1].dispatchEvent(new Event('input'));
    await settle(fixture);

    expect(stateService(fixture).get('/todos/1/title')).toBe('Two!');
  });

  it('renders named slots alongside default children', async () => {
    const fixture = await setup({
      root: 'root',
      elements: {
        root: {
          type: 'Card',
          props: {},
          children: ['body'],
          slots: { header: ['title'] },
        },
        title: { type: 'Text', props: { content: 'Header' } },
        body: { type: 'Text', props: { content: 'Body' } },
      },
    });

    const host = fixture.nativeElement as HTMLElement;
    expect(
      host.querySelector('.t-card-header .t-text')?.textContent?.trim(),
    ).toBe('Header');
    expect(host.querySelector('.t-card-body .t-text')?.textContent?.trim()).toBe(
      'Body',
    );
  });

  it('warns and renders nothing for unknown component types', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fixture = await setup({
      root: 'root',
      elements: {
        root: { type: 'Box', props: {}, children: ['x'] },
        x: { type: 'Mystery', props: {} },
      },
    });

    expect((fixture.nativeElement as HTMLElement).querySelector('.t-box'))
      .toBeTruthy();
    expect(warn).toHaveBeenCalledWith(
      'No renderer for component type: Mystery',
    );
    warn.mockRestore();
  });

  it('renders the fallback component for unknown types when provided', async () => {
    const fixture = await setup(
      {
        root: 'root',
        elements: { root: { type: 'Mystery', props: {} } },
      },
      (host) => {
        host.fallback = TFallback;
      },
    );

    expect(text(fixture, '.t-fallback')).toEqual(['unknown']);
  });

  it('warns about missing children when not loading', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await setup({
      root: 'root',
      elements: {
        root: { type: 'Box', props: {}, children: ['ghost'] },
      },
    });

    expect(
      warn.mock.calls.some(
        (args) => typeof args[0] === 'string' && args[0].includes('"ghost"'),
      ),
    ).toBe(true);
    warn.mockRestore();
  });

  it('tolerates partially streamed specs and completes them', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fixture = await setup(
      {
        root: 'root',
        elements: {
          root: { type: 'Box', props: {}, children: ['a', 'b'] },
          a: { type: 'Text', props: { content: 'First' } },
          // "b" not streamed yet
        },
      },
      (host) => {
        host.loading.set(true);
      },
    );

    expect(text(fixture, '.t-text')).toEqual(['First']);
    expect(warn).not.toHaveBeenCalled();

    fixture.componentInstance.spec.update((spec) => ({
      ...spec!,
      elements: {
        ...spec!.elements,
        b: { type: 'Text', props: { content: 'Second' } },
      },
    }));
    fixture.componentInstance.loading.set(false);
    await settle(fixture);

    expect(text(fixture, '.t-text')).toEqual(['First', 'Second']);
    warn.mockRestore();
  });

  it('gates handler execution behind the confirm dialog', async () => {
    let executed = 0;
    const fixture = await setup(
      {
        root: 'root',
        elements: {
          root: {
            type: 'Btn',
            props: { label: 'Delete' },
            on: {
              press: {
                action: 'destroy',
                confirm: { title: 'Sure?', message: 'Really delete?' },
              },
            },
          },
        },
      },
      (host) => {
        host.handlers = {
          destroy: () => {
            executed += 1;
          },
        };
      },
    );

    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('.t-btn')!.click();
    await settle(fixture);

    expect(executed).toBe(0);
    const dialogButtons = host.querySelectorAll<HTMLButtonElement>(
      'jr-confirm-dialog button',
    );
    expect(dialogButtons.length).toBe(2);

    dialogButtons[1].click(); // Confirm
    await settle(fixture);

    expect(executed).toBe(1);
    expect(host.querySelector('jr-confirm-dialog')).toBeNull();
  });

  it('fires watch actions when watched state paths change', async () => {
    const received: unknown[] = [];
    const fixture = await setup(
      {
        root: 'root',
        state: { country: '' },
        elements: {
          root: {
            type: 'Box',
            props: {},
            watch: {
              '/country': {
                action: 'loadCities',
                params: { country: { $state: '/country' } },
              },
            },
          },
        },
      },
      (host) => {
        host.handlers = {
          loadCities: (params) => {
            received.push(params);
          },
        };
      },
    );

    stateService(fixture).set('/country', 'DE');
    await settle(fixture);
    // watch handlers run async — give the microtask queue a turn
    await new Promise((resolve) => setTimeout(resolve));

    expect(received).toEqual([{ country: 'DE' }]);
  });

  it('resolves $cond props', async () => {
    const fixture = await setup({
      root: 'root',
      state: { vip: true },
      elements: {
        root: {
          type: 'Text',
          props: {
            content: {
              $cond: { $state: '/vip' },
              $then: 'Welcome back!',
              $else: 'Hello',
            },
          },
        },
      },
    });

    expect(text(fixture, '.t-text')).toEqual(['Welcome back!']);

    stateService(fixture).set('/vip', false);
    await settle(fixture);
    expect(text(fixture, '.t-text')).toEqual(['Hello']);
  });
});
