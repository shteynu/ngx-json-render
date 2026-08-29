import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { Spec } from '@json-render/core';
import { JsonRenderer, type StateChange } from 'ngx-json-render';
import { materialCatalog } from './catalog';
import { materialComponents, materialRegistry } from './registry';

@Component({
  imports: [JsonRenderer],
  template: `<json-render
    [spec]="spec()"
    [registry]="registry"
    (stateChange)="changes.push($event)"
  />`,
})
class Host {
  readonly spec = signal<Spec | null>(null);
  readonly registry = materialRegistry;
  readonly changes: StateChange[][] = [];
}

// Material and CDK components hold live handles (ViewportRuler listeners,
// FocusMonitor, ripple timers). Without an explicit teardown the vitest
// process stays alive after the suite passes, which would hang CI.
afterEach(() => {
  TestBed.resetTestingModule();
});

async function settle(fixture: ComponentFixture<unknown>) {
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
}

async function render(spec: Spec) {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  });
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.spec.set(spec);
  await settle(fixture);
  return fixture;
}

/** Text of every error message currently displayed, in document order. */
function errorTexts(fixture: ComponentFixture<unknown>): string[] {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll(
      'mat-error, .jrm-error',
    ),
  ).map((el) => (el.textContent ?? '').trim());
}

/** The most recent value written to a state path, or undefined. */
function lastValueAt(fixture: ComponentFixture<Host>, path: string): unknown {
  const flat = fixture.componentInstance.changes.flat();
  return flat.filter((change) => change.path === path).at(-1)?.value;
}

/** Catalog component names, read off the built catalog. */
function catalogComponentNames(): string[] {
  const data = (
    materialCatalog as unknown as {
      data?: { components?: Record<string, unknown> };
    }
  ).data;
  return Object.keys(data?.components ?? {});
}

describe('material catalog', () => {
  it('registers an Angular component for every catalog entry', () => {
    const catalogNames = catalogComponentNames().sort();
    const registered = Object.keys(materialComponents).sort();
    expect(catalogNames.length).toBeGreaterThan(0);
    expect(registered).toEqual(catalogNames);
  });

  it('carries slot metadata from the catalog into the registry', () => {
    const card = materialRegistry['Card'];
    expect(typeof card === 'object' && card.slots).toEqual(['default', 'actions']);
  });

  it('produces a system prompt naming its components', () => {
    const prompt = materialCatalog.prompt();
    expect(prompt).toContain('Card');
    expect(prompt).toContain('SlideToggle');
  });
});

describe('material components', () => {
  it('renders a card with a heading and a button', async () => {
    const fixture = await render({
      root: 'card',
      elements: {
        card: {
          type: 'Card',
          props: { title: 'Revenue' },
          children: ['heading', 'button'],
        },
        heading: {
          type: 'Heading',
          props: { content: 'Q3 summary', level: 2 },
          children: [],
        },
        button: {
          type: 'Button',
          props: { label: 'Export', variant: 'filled' },
          children: [],
        },
      },
    } as unknown as Spec);

    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('mat-card')).toBeTruthy();
    expect(host.textContent).toContain('Revenue');
    expect(host.textContent).toContain('Q3 summary');
    expect(host.querySelector('button')?.textContent).toContain('Export');
  });

  it('renders a table from columns and rows props', async () => {
    const fixture = await render({
      root: 'table',
      elements: {
        table: {
          type: 'Table',
          props: {
            columns: [
              { field: 'name', header: 'Name' },
              { field: 'total', header: 'Total', align: 'end' },
            ],
            rows: [
              { name: 'Acme', total: 120 },
              { name: 'Globex', total: 340 },
            ],
          },
          children: [],
        },
      },
    } as unknown as Spec);

    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelectorAll('th').length).toBe(2);
    expect(host.querySelectorAll('tbody tr').length).toBe(2);
    expect(host.textContent).toContain('Globex');
    expect(host.textContent).toContain('340');
  });

  it('writes a checkbox change back to the bound state path', async () => {
    const fixture = await render({
      root: 'checkbox',
      state: { done: false },
      elements: {
        checkbox: {
          type: 'Checkbox',
          props: { label: 'Done', checked: { $bindState: '/done' } },
          children: [],
        },
      },
    } as unknown as Spec);

    const input = fixture.nativeElement.querySelector(
      'mat-checkbox input',
    ) as HTMLInputElement;
    expect(input.checked).toBe(false);

    input.click();
    await settle(fixture);

    expect(
      (fixture.nativeElement.querySelector('mat-checkbox input') as HTMLInputElement)
        .checked,
    ).toBe(true);
  });

  it('renders each Tab child as a real tab in the group', async () => {
    const fixture = await render({
      root: 'tabs',
      elements: {
        tabs: { type: 'Tabs', props: {}, children: ['tab-a', 'tab-b'] },
        'tab-a': { type: 'Tab', props: { label: 'Overview' }, children: ['text-a'] },
        'tab-b': { type: 'Tab', props: { label: 'Details' }, children: [] },
        'text-a': { type: 'Text', props: { content: 'inside tab a' }, children: [] },
      },
    } as unknown as Spec);

    const host: HTMLElement = fixture.nativeElement;
    const labels = Array.from(host.querySelectorAll('.mat-mdc-tab')).map((tab) =>
      tab.textContent?.trim(),
    );
    expect(labels).toEqual(['Overview', 'Details']);
    expect(host.textContent).toContain('inside tab a');
  });

  it('only exposes a list row as a control when press is bound', async () => {
    const fixture = await render({
      root: 'list',
      elements: {
        list: { type: 'List', props: {}, children: ['plain', 'pressable'] },
        plain: { type: 'ListItem', props: { title: 'Plain' }, children: [] },
        pressable: {
          type: 'ListItem',
          props: { title: 'Pressable' },
          on: { press: { action: 'setState', params: { statePath: '/x', value: 1 } } },
          children: [],
        },
      },
    } as unknown as Spec);

    const rows = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('mat-list-item'),
    );
    expect(rows.length).toBe(2);
    expect(rows[0].getAttribute('role')).toBeNull();
    expect(rows[1].getAttribute('role')).toBe('button');
  });
});

describe('material form validation', () => {
  it('shows errors on blur and clears them once the value is valid', async () => {
    const fixture = await render({
      root: 'email',
      state: { email: '' },
      elements: {
        email: {
          type: 'Input',
          props: {
            label: 'Email',
            value: { $bindState: '/email' },
            validation: {
              checks: [
                { type: 'required', message: 'Email is required' },
                { type: 'email', message: 'That is not an email' },
              ],
            },
          },
          children: [],
        },
      },
    } as unknown as Spec);

    const host: HTMLElement = fixture.nativeElement;
    const input = host.querySelector('input') as HTMLInputElement;

    // Nothing is shown before the field has been interacted with.
    expect(errorTexts(fixture)).toEqual([]);

    input.dispatchEvent(new Event('blur'));
    await settle(fixture);

    expect(errorTexts(fixture)).toEqual([
      'Email is required',
      'That is not an email',
    ]);
    expect(host.querySelector('.mat-form-field-invalid')).toBeTruthy();

    input.value = 'ada@example.com';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await settle(fixture);

    expect(errorTexts(fixture)).toEqual([]);
    expect(host.querySelector('.mat-form-field-invalid')).toBeNull();
  });

  it('validateForm collects every bound field and writes the result to state', async () => {
    const fixture = await render({
      root: 'form',
      state: { email: '', terms: false },
      elements: {
        form: { type: 'Stack', props: {}, children: ['email', 'terms', 'save'] },
        email: {
          type: 'Input',
          props: {
            label: 'Email',
            value: { $bindState: '/email' },
            validation: {
              checks: [{ type: 'required', message: 'Email is required' }],
              validateOn: 'submit',
            },
          },
          children: [],
        },
        terms: {
          type: 'Checkbox',
          props: {
            label: 'Accept the terms',
            checked: { $bindState: '/terms' },
            validation: {
              // `required` passes for boolean false — it only rejects null,
              // undefined, empty strings and empty arrays — so a box that must
              // be ticked is expressed as equalTo true.
              checks: [
                {
                  type: 'equalTo',
                  args: { other: true },
                  message: 'You must accept the terms',
                },
              ],
            },
          },
          children: [],
        },
        save: {
          type: 'Button',
          props: { label: 'Save' },
          on: { press: { action: 'validateForm' } },
          children: [],
        },
      },
    } as unknown as Spec);

    const host: HTMLElement = fixture.nativeElement;
    expect(errorTexts(fixture)).toEqual([]);

    host.querySelector('button')!.click();
    await settle(fixture);

    expect(lastValueAt(fixture, '/formValidation')).toEqual({
      valid: false,
      errors: {
        '/email': ['Email is required'],
        '/terms': ['You must accept the terms'],
      },
    });
    // Both kinds of field surface their message: the input through the form
    // field's subscript, the checkbox through its own error line.
    expect(errorTexts(fixture)).toEqual([
      'Email is required',
      'You must accept the terms',
    ]);
  });

  it('leaves a validation config without a bound value inert', async () => {
    const fixture = await render({
      root: 'form',
      elements: {
        form: { type: 'Stack', props: {}, children: ['email', 'save'] },
        email: {
          type: 'Input',
          props: {
            label: 'Email',
            value: 'literal, not bound',
            validation: {
              checks: [{ type: 'email', message: 'That is not an email' }],
            },
          },
          children: [],
        },
        save: {
          type: 'Button',
          props: { label: 'Save' },
          on: { press: { action: 'validateForm' } },
          children: [],
        },
      },
    } as unknown as Spec);

    (fixture.nativeElement as HTMLElement).querySelector('button')!.click();
    await settle(fixture);

    expect(lastValueAt(fixture, '/formValidation')).toEqual({
      valid: true,
      errors: {},
    });
    expect(errorTexts(fixture)).toEqual([]);
  });

  it('marks a field required from its validation checks', async () => {
    const fixture = await render({
      root: 'email',
      state: { email: '' },
      elements: {
        email: {
          type: 'Input',
          props: {
            label: 'Email',
            value: { $bindState: '/email' },
            validation: {
              checks: [{ type: 'required', message: 'Email is required' }],
            },
          },
          children: [],
        },
      },
    } as unknown as Spec);

    const input = (fixture.nativeElement as HTMLElement).querySelector('input');
    expect(input?.getAttribute('required')).not.toBeNull();
  });
});
