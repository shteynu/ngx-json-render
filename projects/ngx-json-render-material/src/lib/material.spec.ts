import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { Spec } from '@json-render/core';
import { JsonRenderer } from 'ngx-json-render';
import { materialCatalog } from './catalog';
import { materialComponents, materialRegistry } from './registry';

@Component({
  imports: [JsonRenderer],
  template: `<json-render [spec]="spec()" [registry]="registry" />`,
})
class Host {
  readonly spec = signal<Spec | null>(null);
  readonly registry = materialRegistry;
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
