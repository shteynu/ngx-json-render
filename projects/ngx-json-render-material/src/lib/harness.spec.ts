import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import type { Spec } from '@json-render/core';
import { injectUIStream } from 'ngx-json-render';
import {
  recordedTransport,
  renderComponent,
  renderSpec,
  specStream,
} from 'ngx-json-render/testing';
import { JrmButton, JrmSlideToggle } from './form.components';
import { materialRegistry } from './registry';

/**
 * The testing entry point, used the way the catalog's own users would use it:
 * imported from the built package, against the real Material registry.
 *
 * The suite next door tests the components; this one tests that a consumer
 * can reach them through `ngx-json-render/testing` at all — the export map,
 * the self-import of the primary entry point, and the harness against a
 * catalog it knows nothing about.
 */

// Material and CDK components hold live handles; without this the runner
// stays alive after the suite passes.
afterEach(() => {
  TestBed.resetTestingModule();
});

const CARD: Spec = {
  root: 'card',
  state: { email: '' },
  elements: {
    card: {
      type: 'Card',
      props: { title: 'Sign up' },
      children: ['email', 'save'],
    },
    email: {
      type: 'Input',
      props: { label: 'Email', value: { $bindState: '/email' } },
      children: [],
    },
    save: {
      type: 'Button',
      props: { label: 'Save' },
      on: { press: { action: 'save' } },
      children: [],
    },
  },
} as unknown as Spec;

describe('the testing entry point, from a catalog package', () => {
  it('renders a Material spec and drives it', async () => {
    const ui = await renderSpec(CARD, { registry: materialRegistry });

    expect(ui.text('mat-card-title')).toBe('Sign up');
    expect(ui.find('button').textContent?.trim()).toBe('Save');

    await ui.fill('input', 'ada@example.com');
    expect(ui.read('/email')).toBe('ada@example.com');
    expect(ui.changes).toContainEqual({
      path: '/email',
      value: 'ada@example.com',
    });

    await ui.click('button');
    expect(ui.dispatched).toEqual([{ name: 'save', params: {} }]);
  });

  it('renders what a recorded generation streamed', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });

    const ui = TestBed.runInInjectionContext(() =>
      injectUIStream({
        api: '/api/generate',
        fetch: recordedTransport(specStream(CARD)),
      }),
    );
    await ui.send('a sign-up card');

    expect(ui.error()).toBeNull();
    const rendered = await renderSpec(ui.spec(), {
      registry: materialRegistry,
    });
    expect(rendered.text('mat-card-title')).toBe('Sign up');
  });

  it('mounts a Material component on its own, with no spec', async () => {
    const button = await renderComponent(JrmButton, {
      props: { label: 'Save' },
    });

    expect(button.text('button')).toBe('Save');
    await button.click('button');
    expect(button.emitted).toEqual(['press']);

    await button.patchProps({ disabled: true });
    expect(button.find<HTMLButtonElement>('button').disabled).toBe(true);
  });

  it('records what a Material control writes to its bound prop', async () => {
    const toggle = await renderComponent(JrmSlideToggle, {
      props: { label: 'Dark mode', checked: false },
      bindings: { checked: '/dark' },
    });

    await toggle.click('button[role="switch"]');

    expect(toggle.writes).toEqual([{ prop: 'checked', value: true }]);
    expect(toggle.props()).toMatchObject({ checked: true });
  });
});
