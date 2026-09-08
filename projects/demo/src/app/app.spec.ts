import { provideZonelessChangeDetection } from '@angular/core';
import {
  type ComponentFixture,
  DeferBlockBehavior,
  TestBed,
} from '@angular/core/testing';
import type { Spec } from 'ngx-json-render';
import { App } from './app';

// Material and CDK components hold live handles; without an explicit teardown
// the vitest process can stay alive after the suite passes.
afterEach(() => {
  TestBed.resetTestingModule();
});

async function settle(fixture: ComponentFixture<unknown>) {
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
}

async function render() {
  TestBed.configureTestingModule({
    // App has to be imported, not just instantiated: its `@defer` blocks give
    // it async metadata, and `compileComponents()` only resolves that for
    // components the testing module knows about.
    imports: [App],
    providers: [provideZonelessChangeDetection()],
    // Each tab sits behind an `@defer`; TestBed leaves those manual by
    // default, so without this the tabs never render and every assertion
    // below would be reading an empty page.
    deferBlockBehavior: DeferBlockBehavior.Playthrough,
  });
  // Playthrough resolves the deferred tabs, and resolving them means
  // fetching their components — which TestBed will only do after an explicit
  // compile.
  await TestBed.compileComponents();
  const fixture = TestBed.createComponent(App);
  await settle(fixture);
  return fixture;
}

describe('App', () => {
  it('opens on the playground', async () => {
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('.topbar h1')?.textContent).toContain(
      'ngx-json-render',
    );
    expect(fixture.componentInstance.tab()).toBe('playground');
    expect(host.querySelector('app-playground')).toBeTruthy();
    expect(host.textContent).toContain('Release dashboard');
  });

  it('renders the interactive demo from the dashboard spec', async () => {
    const fixture = await render();
    fixture.componentInstance.tab.set('interactive');
    await settle(fixture);

    // The spec-rendered UI is present: greeting card + todos from state.
    // Both assertions read the rendered pane rather than the page, or the
    // todo title would match the spec JSON the sidebar prints.
    expect(rendered(fixture)).toContain('Welcome back, Ada!');
    expect(rendered(fixture)).toContain('Wire up ngx-json-render');
  });
});

/** Every button currently on the page, in document order. */
function buttons(fixture: ComponentFixture<App>): HTMLButtonElement[] {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
  );
}

async function click(fixture: ComponentFixture<App>, label: string) {
  const button = buttons(fixture).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!button) throw new Error(`no button labelled "${label}"`);
  button.click();
  await settle(fixture);
}

/** Answer the confirm dialog, whose buttons live inside it. */
async function answerConfirm(
  fixture: ComponentFixture<App>,
  label: 'Clear all' | 'Cancel',
) {
  const dialog = (fixture.nativeElement as HTMLElement).querySelector(
    'jr-confirm-dialog',
  );
  if (!dialog) throw new Error('the confirm dialog is not open');
  const button = Array.from(dialog.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!button) throw new Error(`the dialog has no "${label}" button`);
  (button as HTMLButtonElement).click();
  await settle(fixture);
}

async function openInteractive() {
  const fixture = await render();
  fixture.componentInstance.tab.set('interactive');
  await settle(fixture);
  return fixture;
}

/**
 * Text of the rendered pane only.
 *
 * The sidebar prints the raw spec JSON, so the page as a whole always
 * contains every label and todo title the spec declares. Asserting against
 * the whole element would be matching the source rather than the render.
 */
function rendered(fixture: ComponentFixture<App>): string {
  return (
    (fixture.nativeElement as HTMLElement).querySelector('json-render')
      ?.textContent ?? ''
  );
}

describe('App interactive demo', () => {
  it('counts up through the increment handler and logs the change', async () => {
    const fixture = await openInteractive();

    await click(fixture, '+1');

    expect(fixture.componentInstance.log()[0]).toBe('state /count ← 1');
  });

  it('will not count below the minimum the spec gives decrement', async () => {
    const fixture = await openInteractive();

    // The spec passes min: 0. Clamping leaves the value where it was, so the
    // store emits nothing at all and the log stays empty — that absence is
    // the evidence the press was a no-op rather than going negative.
    await click(fixture, '−1');
    expect(fixture.componentInstance.log()).toEqual([]);

    await click(fixture, '+1');
    await click(fixture, '+1');
    await click(fixture, '−1');

    expect(fixture.componentInstance.log()[0]).toBe('state /count ← 1');
  });

  it('reveals the badge the spec hides behind a count of five', async () => {
    const fixture = await openInteractive();
    expect(rendered(fixture)).not.toContain('On a roll');

    for (let i = 0; i < 5; i++) await click(fixture, '+1');

    expect(rendered(fixture)).toContain('On a roll');
  });

  it('keeps the newest entry first and stops the log at fourteen', async () => {
    const fixture = await openInteractive();

    for (let i = 0; i < 20; i++) await click(fixture, '+1');

    const log = fixture.componentInstance.log();
    expect(log.length).toBe(14);
    expect(log[0]).toBe('state /count ← 20');
    expect(log[1]).toBe('state /count ← 19');
  });

  it('resyncs the todo count through the watch when a todo goes', async () => {
    const fixture = await openInteractive();
    expect(rendered(fixture)).toContain('Wire up ngx-json-render');

    await click(fixture, 'Remove');

    expect(rendered(fixture)).not.toContain('Read the json-render spec format');
    // The card watches /todos and calls syncTodoCount, so the derived count
    // has to follow the list down.
    expect(fixture.componentInstance.log()).toContain('state /todoCount ← 2');
  });

  it('clears every todo once the confirm is accepted', async () => {
    const fixture = await openInteractive();
    const host = fixture.nativeElement as HTMLElement;

    await click(fixture, 'Clear all');
    expect(host.querySelector('jr-confirm-dialog')).toBeTruthy();
    expect(host.textContent).toContain('Clear all todos?');

    await answerConfirm(fixture, 'Clear all');

    expect(host.querySelector('jr-confirm-dialog')).toBeNull();
    expect(rendered(fixture)).not.toContain('Wire up ngx-json-render');
    expect(rendered(fixture)).toContain(
      'All clear — add your first todo below',
    );
    expect(fixture.componentInstance.log()).toContain('action clearTodos');
  });

  it('leaves the todos alone when the confirm is dismissed', async () => {
    const fixture = await openInteractive();
    const host = fixture.nativeElement as HTMLElement;

    await click(fixture, 'Clear all');
    await answerConfirm(fixture, 'Cancel');

    expect(host.querySelector('jr-confirm-dialog')).toBeNull();
    expect(rendered(fixture)).toContain('Wire up ngx-json-render');
    expect(fixture.componentInstance.log()).not.toContain('action clearTodos');
  });

  it('adds a todo the built-in pushState action appends', async () => {
    const fixture = await openInteractive();
    const host = fixture.nativeElement as HTMLElement;

    const input = Array.from(host.querySelectorAll('input.input')).at(
      -1,
    ) as HTMLInputElement;
    input.value = 'Write the tests';
    input.dispatchEvent(new Event('input'));
    await settle(fixture);

    await click(fixture, 'Add');

    expect(rendered(fixture)).toContain('Write the tests');
    expect(fixture.componentInstance.log()).toContain('state /todoCount ← 4');
  });

  it('logs an action the handlers do not know', async () => {
    const fixture = await openInteractive();
    fixture.componentInstance.spec.set({
      root: 'btn',
      elements: {
        btn: {
          type: 'Button',
          props: { label: 'Poke' },
          on: { press: { action: 'mystery', params: { why: 'because' } } },
        },
      },
    } as unknown as Spec);
    await settle(fixture);

    await click(fixture, 'Poke');

    // Anything the registry cannot resolve falls through to onAction, which
    // is how the demo shows an unhandled action rather than swallowing it.
    expect(fixture.componentInstance.log()[0]).toBe(
      'onAction mystery({"why":"because"})',
    );
  });

  it('falls back to its own defaults when the spec omits the params', async () => {
    const fixture = await openInteractive();
    fixture.componentInstance.spec.set({
      root: 'row',
      elements: {
        row: {
          type: 'Stack',
          props: {},
          children: ['down', 'up', 'up-five'],
        },
        down: {
          type: 'Button',
          props: { label: 'Drop' },
          on: { press: { action: 'decrement' } },
        },
        up: {
          type: 'Button',
          props: { label: 'Bump' },
          on: { press: { action: 'increment' } },
        },
        'up-five': {
          type: 'Button',
          props: { label: 'Bump five' },
          on: { press: { action: 'increment', params: { by: 5 } } },
        },
      },
    } as unknown as Spec);
    await settle(fixture);

    // Nothing here names a state path, a step, a floor, and the spec has no
    // state at all: the handlers supply /count, a step of one, a starting
    // value of zero, and — for decrement without a min — no floor.
    await click(fixture, 'Drop');
    expect(fixture.componentInstance.log()[0]).toBe('state /count ← -1');

    await click(fixture, 'Bump');
    expect(fixture.componentInstance.log()[0]).toBe('state /count ← 0');

    await click(fixture, 'Bump five');
    expect(fixture.componentInstance.log()[0]).toBe('state /count ← 5');
  });

  it('does nothing when an action fires with no renderer mounted', async () => {
    // The handlers are handed to <json-render>, so they can in principle be
    // called when the interactive pane is not on screen and the viewChild
    // has nothing to resolve. Each one guards for that; none may throw.
    const fixture = await render();
    expect(fixture.componentInstance.tab()).toBe('playground');

    const { handlers } = fixture.componentInstance;
    expect(() => handlers['increment']({ statePath: '/count' })).not.toThrow();
    expect(() => handlers['decrement']({ statePath: '/count' })).not.toThrow();
    expect(() => handlers['syncTodoCount']({})).not.toThrow();
    expect(() => handlers['clearTodos']({})).not.toThrow();

    // clearTodos logs after its store write, so it alone leaves a trace.
    expect(fixture.componentInstance.log()).toEqual(['action clearTodos']);
  });

  it('shows the spec that drives the pane', async () => {
    const fixture = await openInteractive();

    expect(fixture.componentInstance.specJson()).toContain('"root": "root"');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('pre.code')
        ?.textContent,
    ).toContain('greeting-card');
  });
});
