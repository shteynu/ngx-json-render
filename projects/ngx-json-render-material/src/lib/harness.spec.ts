import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import type { Spec } from '@json-render/core';
import { injectUIStream } from 'ngx-json-render';
import {
  recordedTransport,
  renderSpec,
  specStream,
} from 'ngx-json-render/testing';
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
});
