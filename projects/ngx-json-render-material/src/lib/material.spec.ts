import {
  Component,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
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
    expect(typeof card === 'object' && card.slots).toEqual([
      'default',
      'actions',
    ]);
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
      (
        fixture.nativeElement.querySelector(
          'mat-checkbox input',
        ) as HTMLInputElement
      ).checked,
    ).toBe(true);
  });

  it('renders each Tab child as a real tab in the group', async () => {
    const fixture = await render({
      root: 'tabs',
      elements: {
        tabs: { type: 'Tabs', props: {}, children: ['tab-a', 'tab-b'] },
        'tab-a': {
          type: 'Tab',
          props: { label: 'Overview' },
          children: ['text-a'],
        },
        'tab-b': { type: 'Tab', props: { label: 'Details' }, children: [] },
        'text-a': {
          type: 'Text',
          props: { content: 'inside tab a' },
          children: [],
        },
      },
    } as unknown as Spec);

    const host: HTMLElement = fixture.nativeElement;
    const labels = Array.from(host.querySelectorAll('.mat-mdc-tab')).map(
      (tab) => tab.textContent?.trim(),
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
          on: {
            press: {
              action: 'setState',
              params: { statePath: '/x', value: 1 },
            },
          },
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
        form: {
          type: 'Stack',
          props: {},
          children: ['email', 'terms', 'save'],
        },
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

describe('material layout components', () => {
  it('maps Stack align and justify onto flexbox values', async () => {
    const fixture = await render({
      root: 'stack',
      elements: {
        stack: {
          type: 'Stack',
          props: {
            direction: 'horizontal',
            align: 'end',
            justify: 'between',
            gap: 4,
            padding: 8,
            wrap: true,
          },
          children: [],
        },
      },
    } as unknown as Spec);

    const stack = (fixture.nativeElement as HTMLElement).querySelector(
      '.jrm-stack',
    ) as HTMLElement;
    expect(stack.style.flexDirection).toBe('row');
    // 'end' becomes flex-end, 'between' becomes space-between: the catalog's
    // vocabulary is renderer-neutral, so the mapping is ours to get right.
    expect(stack.style.alignItems).toBe('flex-end');
    expect(stack.style.justifyContent).toBe('space-between');
    expect(stack.style.gap).toBe('4px');
    expect(stack.style.padding).toBe('8px');
    expect(stack.style.flexWrap).toBe('wrap');
  });

  it('defaults a Stack to a stretched vertical column', async () => {
    const fixture = await render({
      root: 'stack',
      elements: { stack: { type: 'Stack', props: {}, children: [] } },
    } as unknown as Spec);

    const stack = (fixture.nativeElement as HTMLElement).querySelector(
      '.jrm-stack',
    ) as HTMLElement;
    expect(stack.style.flexDirection).toBe('column');
    expect(stack.style.alignItems).toBe('stretch');
    expect(stack.style.justifyContent).toBe('flex-start');
    expect(stack.style.gap).toBe('12px');
    expect(stack.style.flexWrap).toBe('nowrap');
  });

  it('centres a Stack on both axes', async () => {
    const fixture = await render({
      root: 'stack',
      elements: {
        stack: {
          type: 'Stack',
          props: { align: 'center', justify: 'center' },
          children: [],
        },
      },
    } as unknown as Spec);

    const stack = (fixture.nativeElement as HTMLElement).querySelector(
      '.jrm-stack',
    ) as HTMLElement;
    expect(stack.style.alignItems).toBe('center');
    expect(stack.style.justifyContent).toBe('center');
  });

  it('gives a Grid one equal track per column', async () => {
    const fixture = await render({
      root: 'grid',
      elements: {
        grid: { type: 'Grid', props: { columns: 3, gap: 20 }, children: [] },
      },
    } as unknown as Spec);

    const grid = (fixture.nativeElement as HTMLElement).querySelector(
      '.jrm-grid',
    ) as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))');
    expect(grid.style.gap).toBe('20px');
  });

  it('defaults a Grid to two columns', async () => {
    const fixture = await render({
      root: 'grid',
      elements: { grid: { type: 'Grid', props: {}, children: [] } },
    } as unknown as Spec);

    const grid = (fixture.nativeElement as HTMLElement).querySelector(
      '.jrm-grid',
    ) as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))');
  });

  it('renders Card children into the default and actions slots', async () => {
    const fixture = await render({
      root: 'card',
      elements: {
        card: {
          type: 'Card',
          props: { title: 'Invoice', subtitle: 'March' },
          children: ['body'],
          slots: { actions: ['save'] },
        },
        body: { type: 'Text', props: { content: 'Body copy' }, children: [] },
        save: { type: 'Button', props: { label: 'Save' }, children: [] },
      },
    } as unknown as Spec);

    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('mat-card-title')?.textContent).toContain(
      'Invoice',
    );
    expect(host.querySelector('mat-card-subtitle')?.textContent).toContain(
      'March',
    );
    expect(host.querySelector('mat-card-content')?.textContent).toContain(
      'Body copy',
    );
    // The actions slot is a footer, not part of the default flow.
    const actions = host.querySelector('mat-card-actions') as HTMLElement;
    expect(actions.textContent).toContain('Save');
    expect(host.querySelector('mat-card-content')?.textContent).not.toContain(
      'Save',
    );
  });

  it('omits the Card header when it has neither title nor subtitle', async () => {
    const fixture = await render({
      root: 'card',
      elements: { card: { type: 'Card', props: {}, children: [] } },
    } as unknown as Spec);

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('mat-card-header'),
    ).toBeNull();
  });

  it('places Toolbar children after its title', async () => {
    const fixture = await render({
      root: 'toolbar',
      elements: {
        toolbar: {
          type: 'Toolbar',
          props: { title: 'Reports', color: 'primary' },
          children: ['action'],
        },
        action: {
          type: 'Button',
          props: { label: 'New' },
          children: [],
        },
      },
    } as unknown as Spec);

    const toolbar = (fixture.nativeElement as HTMLElement).querySelector(
      'mat-toolbar',
    ) as HTMLElement;
    expect(toolbar.textContent).toContain('Reports');
    expect(toolbar.querySelector('button')?.textContent).toContain('New');
  });

  it('renders an ExpansionPanel expanded when the spec says so', async () => {
    const fixture = await render({
      root: 'panel',
      elements: {
        panel: {
          type: 'ExpansionPanel',
          props: {
            title: 'Advanced',
            description: 'Rarely needed',
            expanded: true,
          },
          children: ['text'],
        },
        text: {
          type: 'Text',
          props: { content: 'Hidden detail' },
          children: [],
        },
      },
    } as unknown as Spec);

    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('mat-panel-title')?.textContent).toContain(
      'Advanced',
    );
    expect(host.querySelector('mat-panel-description')?.textContent).toContain(
      'Rarely needed',
    );
    expect(
      host
        .querySelector('mat-expansion-panel-header')
        ?.getAttribute('aria-expanded'),
    ).toBe('true');
    expect(host.textContent).toContain('Hidden detail');
  });

  it('leaves an ExpansionPanel collapsed by default and drops its description', async () => {
    const fixture = await render({
      root: 'panel',
      elements: {
        panel: {
          type: 'ExpansionPanel',
          props: { title: 'Advanced' },
          children: [],
        },
      },
    } as unknown as Spec);

    const host: HTMLElement = fixture.nativeElement;
    expect(
      host
        .querySelector('mat-expansion-panel-header')
        ?.getAttribute('aria-expanded'),
    ).toBe('false');
    expect(host.querySelector('mat-panel-description')).toBeNull();
  });

  it('renders a Divider', async () => {
    const fixture = await render({
      root: 'divider',
      elements: { divider: { type: 'Divider', props: {}, children: [] } },
    } as unknown as Spec);

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('mat-divider'),
    ).toBeTruthy();
  });
});

describe('material content components', () => {
  it('renders each Heading level as the matching tag', async () => {
    for (const [level, tag] of [
      [1, 'h1'],
      [2, 'h2'],
      [3, 'h3'],
    ] as const) {
      const fixture = await render({
        root: 'heading',
        elements: {
          heading: {
            type: 'Heading',
            props: { content: `Level ${level}`, level },
            children: [],
          },
        },
      } as unknown as Spec);

      const host: HTMLElement = fixture.nativeElement;
      expect(host.querySelector(tag)?.textContent).toContain(`Level ${level}`);
      TestBed.resetTestingModule();
    }
  });

  it('falls back to an h2 when Heading omits its level', async () => {
    const fixture = await render({
      root: 'heading',
      elements: {
        heading: {
          type: 'Heading',
          props: { content: 'Unlevelled' },
          children: [],
        },
      },
    } as unknown as Spec);

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('h2')?.textContent,
    ).toContain('Unlevelled');
  });

  it('marks Text tone with a class and leaves the default bare', async () => {
    for (const [tone, className] of [
      ['muted', 'jrm-muted'],
      ['strong', 'jrm-strong'],
    ] as const) {
      const fixture = await render({
        root: 'text',
        elements: {
          text: {
            type: 'Text',
            props: { content: 'Body', tone },
            children: [],
          },
        },
      } as unknown as Spec);

      const p = (fixture.nativeElement as HTMLElement).querySelector(
        '.jrm-text',
      ) as HTMLElement;
      expect(p.classList.contains(className)).toBe(true);
      TestBed.resetTestingModule();
    }

    const plain = await render({
      root: 'text',
      elements: {
        text: {
          type: 'Text',
          props: { content: 'Body', tone: 'default' },
          children: [],
        },
      },
    } as unknown as Spec);

    const p = (plain.nativeElement as HTMLElement).querySelector(
      '.jrm-text',
    ) as HTMLElement;
    expect(p.classList.contains('jrm-muted')).toBe(false);
    expect(p.classList.contains('jrm-strong')).toBe(false);
  });

  it('renders an Icon ligature', async () => {
    const fixture = await render({
      root: 'icon',
      elements: {
        icon: {
          type: 'Icon',
          props: { name: 'check_circle' },
          children: [],
        },
      },
    } as unknown as Spec);

    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('mat-icon')
        ?.textContent?.trim(),
    ).toBe('check_circle');
  });

  it('gives a Metric an arrow that matches its trend', async () => {
    for (const [trend, icon] of [
      ['up', 'trending_up'],
      ['down', 'trending_down'],
    ] as const) {
      const fixture = await render({
        root: 'metric',
        elements: {
          metric: {
            type: 'Metric',
            props: { label: 'MRR', value: '$12k', delta: '+8%', trend },
            children: [],
          },
        },
      } as unknown as Spec);

      const host: HTMLElement = fixture.nativeElement;
      const delta = host.querySelector('.jrm-metric-delta') as HTMLElement;
      expect(host.textContent).toContain('MRR');
      expect(host.textContent).toContain('$12k');
      expect(delta.textContent).toContain('+8%');
      expect(delta.classList.contains(`trend-${trend}`)).toBe(true);
      expect(host.querySelector('.jrm-metric-icon')?.textContent?.trim()).toBe(
        icon,
      );
      TestBed.resetTestingModule();
    }
  });

  it('gives a flat Metric its delta but no arrow', async () => {
    const fixture = await render({
      root: 'metric',
      elements: {
        metric: {
          type: 'Metric',
          props: { label: 'Churn', value: 3, delta: '0%', trend: 'flat' },
          children: [],
        },
      },
    } as unknown as Spec);

    const host: HTMLElement = fixture.nativeElement;
    const delta = host.querySelector('.jrm-metric-delta') as HTMLElement;
    expect(delta.classList.contains('trend-flat')).toBe(true);
    expect(host.querySelector('.jrm-metric-icon')).toBeNull();
  });

  it('omits the delta line from a Metric that has no delta', async () => {
    const fixture = await render({
      root: 'metric',
      elements: {
        metric: {
          type: 'Metric',
          props: { label: 'Users', value: 4200 },
          children: [],
        },
      },
    } as unknown as Spec);

    const host: HTMLElement = fixture.nativeElement;
    expect(host.textContent).toContain('4200');
    expect(host.querySelector('.jrm-metric-delta')).toBeNull();
  });

  it('renders a Chip, with an avatar icon only when one is given', async () => {
    const withIcon = await render({
      root: 'chip',
      elements: {
        chip: {
          type: 'Chip',
          props: { label: 'Active', color: 'primary', icon: 'bolt' },
          children: [],
        },
      },
    } as unknown as Spec);

    const host: HTMLElement = withIcon.nativeElement;
    expect(host.querySelector('mat-chip')?.textContent).toContain('Active');
    expect(host.querySelector('mat-icon')?.textContent?.trim()).toBe('bolt');
    TestBed.resetTestingModule();

    const bare = await render({
      root: 'chip',
      elements: {
        chip: { type: 'Chip', props: { label: 'Draft' }, children: [] },
      },
    } as unknown as Spec);

    expect(
      (bare.nativeElement as HTMLElement).querySelector('mat-icon'),
    ).toBeNull();
  });

  it('renders a ListItem description and icon when present', async () => {
    const fixture = await render({
      root: 'list',
      elements: {
        list: { type: 'List', props: {}, children: ['row'] },
        row: {
          type: 'ListItem',
          props: {
            title: 'Invoices',
            description: '3 unpaid',
            icon: 'receipt',
          },
          children: [],
        },
      },
    } as unknown as Spec);

    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('[matListItemTitle]')?.textContent).toContain(
      'Invoices',
    );
    expect(host.textContent).toContain('3 unpaid');
    expect(host.querySelector('mat-icon')?.textContent?.trim()).toBe('receipt');
  });

  it('emits press from a bound ListItem', async () => {
    const fixture = await render({
      root: 'list',
      state: { picked: '' },
      elements: {
        list: { type: 'List', props: {}, children: ['row'] },
        row: {
          type: 'ListItem',
          props: { title: 'Pick me' },
          on: {
            press: {
              action: 'setState',
              params: { statePath: '/picked', value: 'row' },
            },
          },
          children: [],
        },
      },
    } as unknown as Spec);

    (
      (fixture.nativeElement as HTMLElement).querySelector(
        'mat-list-item',
      ) as HTMLElement
    ).click();
    await settle(fixture);

    expect(lastValueAt(fixture, '/picked')).toBe('row');
  });

  it('renders an empty Table rather than failing on absent columns', async () => {
    const fixture = await render({
      root: 'table',
      elements: { table: { type: 'Table', props: {}, children: [] } },
    } as unknown as Spec);

    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('table')).toBeTruthy();
    expect(host.querySelectorAll('th').length).toBe(0);
    expect(host.querySelectorAll('tbody tr').length).toBe(0);
  });

  it('aligns a Table column that asks for it', async () => {
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
            rows: [{ name: 'Acme', total: 120 }],
          },
          children: [],
        },
      },
    } as unknown as Spec);

    const headers = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('th'),
    ) as HTMLElement[];
    expect(headers[0].style.textAlign).toBe('start');
    expect(headers[1].style.textAlign).toBe('end');
  });
});

describe('material feedback components', () => {
  it('reports a determinate ProgressBar value to assistive tech', async () => {
    const fixture = await render({
      root: 'bar',
      elements: {
        bar: {
          type: 'ProgressBar',
          props: { value: 60, color: 'primary' },
          children: [],
        },
      },
    } as unknown as Spec);

    const bar = (fixture.nativeElement as HTMLElement).querySelector(
      '[role="progressbar"]',
    ) as HTMLElement;
    expect(bar.getAttribute('aria-valuenow')).toBe('60');
  });

  it('drops the value from an indeterminate ProgressBar', async () => {
    const fixture = await render({
      root: 'bar',
      elements: {
        bar: {
          type: 'ProgressBar',
          props: { mode: 'indeterminate' },
          children: [],
        },
      },
    } as unknown as Spec);

    const bar = (fixture.nativeElement as HTMLElement).querySelector(
      '[role="progressbar"]',
    ) as HTMLElement;
    expect(bar.getAttribute('aria-valuenow')).toBeNull();
  });

  it('sizes a Spinner from its diameter, defaulting to 36', async () => {
    const sized = await render({
      root: 'spinner',
      elements: {
        spinner: {
          type: 'Spinner',
          props: { diameter: 64 },
          children: [],
        },
      },
    } as unknown as Spec);

    expect(
      (
        (sized.nativeElement as HTMLElement).querySelector(
          'mat-progress-spinner',
        ) as HTMLElement
      ).style.width,
    ).toBe('64px');
    TestBed.resetTestingModule();

    const fallback = await render({
      root: 'spinner',
      elements: {
        spinner: { type: 'Spinner', props: {}, children: [] },
      },
    } as unknown as Spec);

    expect(
      (
        (fallback.nativeElement as HTMLElement).querySelector(
          'mat-progress-spinner',
        ) as HTMLElement
      ).style.width,
    ).toBe('36px');
  });

  it('picks a Callout icon from its severity', async () => {
    for (const [severity, icon] of [
      ['info', 'info'],
      ['success', 'check_circle'],
      ['warning', 'warning'],
      ['error', 'error'],
    ] as const) {
      const fixture = await render({
        root: 'callout',
        elements: {
          callout: {
            type: 'Callout',
            props: { content: 'Something happened', severity },
            children: [],
          },
        },
      } as unknown as Spec);

      const host: HTMLElement = fixture.nativeElement;
      expect(host.querySelector('.jrm-callout-icon')?.textContent?.trim()).toBe(
        icon,
      );
      expect(
        (host.querySelector('.jrm-callout') as HTMLElement).classList.contains(
          `severity-${severity}`,
        ),
      ).toBe(true);
      TestBed.resetTestingModule();
    }
  });

  it('treats a Callout without a severity as info, and skips an absent title', async () => {
    const fixture = await render({
      root: 'callout',
      elements: {
        callout: {
          type: 'Callout',
          props: { content: 'Just so you know' },
          children: [],
        },
      },
    } as unknown as Spec);

    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('.jrm-callout-icon')?.textContent?.trim()).toBe(
      'info',
    );
    expect(host.querySelector('.jrm-callout-title')).toBeNull();
    expect(host.querySelector('.jrm-callout-content')?.textContent).toContain(
      'Just so you know',
    );
  });

  it('renders a Callout title when one is given', async () => {
    const fixture = await render({
      root: 'callout',
      elements: {
        callout: {
          type: 'Callout',
          props: {
            title: 'Heads up',
            content: 'Disk is nearly full',
            severity: 'warning',
          },
          children: [],
        },
      },
    } as unknown as Spec);

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.jrm-callout-title')
        ?.textContent,
    ).toContain('Heads up');
  });
});

describe('material form controls', () => {
  it('carries Button variant, icon and disabled through to the button', async () => {
    const fixture = await render({
      root: 'stack',
      state: { pressed: false },
      elements: {
        stack: { type: 'Stack', props: {}, children: ['enabled', 'disabled'] },
        enabled: {
          type: 'Button',
          props: { label: 'Go', icon: 'send', variant: 'outlined' },
          on: {
            press: {
              action: 'setState',
              params: { statePath: '/pressed', value: true },
            },
          },
          children: [],
        },
        disabled: {
          type: 'Button',
          props: { label: 'Nope', disabled: true },
          on: {
            press: {
              action: 'setState',
              params: { statePath: '/pressed', value: 'from-disabled' },
            },
          },
          children: [],
        },
      },
    } as unknown as Spec);

    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ) as HTMLButtonElement[];
    expect(buttons[0].querySelector('mat-icon')?.textContent?.trim()).toBe(
      'send',
    );
    expect(buttons[1].disabled).toBe(true);

    buttons[0].click();
    buttons[1].click();
    await settle(fixture);

    // The disabled button must not have fired: a click on it is inert.
    expect(lastValueAt(fixture, '/pressed')).toBe(true);
  });

  it('gives an IconButton its accessible name from label', async () => {
    const fixture = await render({
      root: 'icon-button',
      state: { closed: false },
      elements: {
        'icon-button': {
          type: 'IconButton',
          props: { icon: 'close', label: 'Close dialog' },
          on: {
            press: {
              action: 'setState',
              params: { statePath: '/closed', value: true },
            },
          },
          children: [],
        },
      },
    } as unknown as Spec);

    const button = (fixture.nativeElement as HTMLElement).querySelector(
      'button',
    ) as HTMLButtonElement;
    // The icon is the only content, so the label has to reach aria-label or
    // the control is unnameable to a screen reader.
    expect(button.getAttribute('aria-label')).toBe('Close dialog');
    expect(button.querySelector('mat-icon')?.textContent?.trim()).toBe('close');

    button.click();
    await settle(fixture);
    expect(lastValueAt(fixture, '/closed')).toBe(true);
  });

  it('renders Input hint and type, and emits submit on Enter', async () => {
    const fixture = await render({
      root: 'input',
      state: { query: '', submitted: false },
      elements: {
        input: {
          type: 'Input',
          props: {
            label: 'Search',
            hint: 'Press Enter to run',
            type: 'email',
            placeholder: 'you@example.com',
            value: { $bindState: '/query' },
          },
          on: {
            submit: {
              action: 'setState',
              params: { statePath: '/submitted', value: true },
            },
          },
          children: [],
        },
      },
    } as unknown as Spec);

    const host: HTMLElement = fixture.nativeElement;
    const input = host.querySelector('input') as HTMLInputElement;
    expect(input.type).toBe('email');
    expect(input.placeholder).toBe('you@example.com');
    expect(host.querySelector('mat-hint')?.textContent).toContain(
      'Press Enter to run',
    );

    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    await settle(fixture);
    expect(lastValueAt(fixture, '/submitted')).toBe(true);
  });

  it('pushes an Input value into state as it is typed', async () => {
    const fixture = await render({
      root: 'input',
      state: { name: '' },
      elements: {
        input: {
          type: 'Input',
          props: { label: 'Name', value: { $bindState: '/name' } },
          children: [],
        },
      },
    } as unknown as Spec);

    const input = (fixture.nativeElement as HTMLElement).querySelector(
      'input',
    ) as HTMLInputElement;
    input.value = 'Ada';
    input.dispatchEvent(new Event('input'));
    await settle(fixture);

    expect(lastValueAt(fixture, '/name')).toBe('Ada');
  });

  it('mirrors a state change back into the Input element', async () => {
    const fixture = await render({
      root: 'stack',
      state: { name: 'Ada' },
      elements: {
        stack: { type: 'Stack', props: {}, children: ['input', 'clear'] },
        input: {
          type: 'Input',
          props: { label: 'Name', value: { $bindState: '/name' } },
          children: [],
        },
        clear: {
          type: 'Button',
          props: { label: 'Clear' },
          on: {
            press: {
              action: 'setState',
              params: { statePath: '/name', value: '' },
            },
          },
          children: [],
        },
      },
    } as unknown as Spec);

    const host: HTMLElement = fixture.nativeElement;
    const input = host.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('Ada');

    host.querySelector('button')!.click();
    await settle(fixture);

    expect((host.querySelector('input') as HTMLInputElement).value).toBe('');
  });

  it('binds a Textarea and honours its rows prop', async () => {
    const fixture = await render({
      root: 'textarea',
      state: { notes: 'first' },
      elements: {
        textarea: {
          type: 'Textarea',
          props: {
            label: 'Notes',
            rows: 6,
            value: { $bindState: '/notes' },
          },
          children: [],
        },
      },
    } as unknown as Spec);

    const area = (fixture.nativeElement as HTMLElement).querySelector(
      'textarea',
    ) as HTMLTextAreaElement;
    expect(area.rows).toBe(6);
    expect(area.value).toBe('first');

    area.value = 'second';
    area.dispatchEvent(new Event('input'));
    await settle(fixture);

    expect(lastValueAt(fixture, '/notes')).toBe('second');
  });

  it('shows a Textarea validation error on blur', async () => {
    const fixture = await render({
      root: 'textarea',
      state: { notes: '' },
      elements: {
        textarea: {
          type: 'Textarea',
          props: {
            label: 'Notes',
            value: { $bindState: '/notes' },
            validation: {
              checks: [{ type: 'required', message: 'Notes are required' }],
            },
          },
          children: [],
        },
      },
    } as unknown as Spec);

    const area = (fixture.nativeElement as HTMLElement).querySelector(
      'textarea',
    ) as HTMLTextAreaElement;
    expect(errorTexts(fixture)).toEqual([]);

    area.dispatchEvent(new Event('blur'));
    await settle(fixture);

    expect(errorTexts(fixture)).toEqual(['Notes are required']);
  });

  it('writes a Select choice back to state', async () => {
    const fixture = await render({
      root: 'select',
      state: { size: 'm' },
      elements: {
        select: {
          type: 'Select',
          props: {
            label: 'Size',
            value: { $bindState: '/size' },
            options: [
              { value: 's', label: 'Small' },
              { value: 'm', label: 'Medium' },
              { value: 'l', label: 'Large' },
            ],
          },
          children: [],
        },
      },
    } as unknown as Spec);

    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('mat-select')?.textContent).toContain('Medium');

    // The panel renders into the CDK overlay, outside the fixture element.
    (host.querySelector('.mat-mdc-select-trigger') as HTMLElement).click();
    await settle(fixture);

    const options = Array.from(
      document.querySelectorAll('mat-option'),
    ) as HTMLElement[];
    expect(options.map((option) => option.textContent?.trim())).toEqual([
      'Small',
      'Medium',
      'Large',
    ]);

    options[2].click();
    await settle(fixture);

    expect(lastValueAt(fixture, '/size')).toBe('l');
  });

  it('renders a Select with no options rather than failing', async () => {
    const fixture = await render({
      root: 'select',
      elements: {
        select: {
          type: 'Select',
          props: { label: 'Empty' },
          children: [],
        },
      },
    } as unknown as Spec);

    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('mat-select')).toBeTruthy();
    expect(host.querySelectorAll('mat-option').length).toBe(0);
  });

  it('writes a RadioGroup choice back to state', async () => {
    const fixture = await render({
      root: 'radio',
      state: { plan: 'free' },
      elements: {
        radio: {
          type: 'RadioGroup',
          props: {
            label: 'Plan',
            direction: 'horizontal',
            value: { $bindState: '/plan' },
            options: [
              { value: 'free', label: 'Free' },
              { value: 'pro', label: 'Pro' },
            ],
          },
          children: [],
        },
      },
    } as unknown as Spec);

    const host: HTMLElement = fixture.nativeElement;
    expect(
      (
        host.querySelector('.jrm-radio-group') as HTMLElement
      ).classList.contains('horizontal'),
    ).toBe(true);

    const radios = Array.from(
      host.querySelectorAll('mat-radio-button input'),
    ) as HTMLInputElement[];
    expect(radios.length).toBe(2);
    expect(radios[0].checked).toBe(true);

    radios[1].click();
    await settle(fixture);

    expect(lastValueAt(fixture, '/plan')).toBe('pro');
  });

  it('shows a RadioGroup error through its own error line', async () => {
    const fixture = await render({
      root: 'form',
      state: { plan: '' },
      elements: {
        form: { type: 'Stack', props: {}, children: ['radio', 'save'] },
        radio: {
          type: 'RadioGroup',
          props: {
            label: 'Plan',
            value: { $bindState: '/plan' },
            options: [{ value: 'pro', label: 'Pro' }],
            validation: {
              checks: [{ type: 'required', message: 'Pick a plan' }],
              validateOn: 'submit',
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

    // A radio group has no mat-form-field to host a mat-error, so the message
    // has to come out of the component's own .jrm-error line.
    expect(host.querySelectorAll('.jrm-error').length).toBe(1);
    expect(errorTexts(fixture)).toEqual(['Pick a plan']);

    const radio = host.querySelector(
      'mat-radio-button input',
    ) as HTMLInputElement;
    radio.click();
    await settle(fixture);

    // validateOn 'submit' means exactly that: picking a plan does not clear
    // the message, because nothing has re-validated the field yet.
    expect(lastValueAt(fixture, '/plan')).toBe('pro');
    expect(errorTexts(fixture)).toEqual(['Pick a plan']);

    host.querySelector('button')!.click();
    await settle(fixture);

    expect(errorTexts(fixture)).toEqual([]);
  });

  it('writes a SlideToggle change back to state', async () => {
    const fixture = await render({
      root: 'toggle',
      state: { dark: false },
      elements: {
        toggle: {
          type: 'SlideToggle',
          props: { label: 'Dark mode', checked: { $bindState: '/dark' } },
          children: [],
        },
      },
    } as unknown as Spec);

    const host: HTMLElement = fixture.nativeElement;
    expect(host.textContent).toContain('Dark mode');

    const toggle = host.querySelector(
      'mat-slide-toggle button',
    ) as HTMLButtonElement;
    expect(toggle.getAttribute('aria-checked')).toBe('false');

    toggle.click();
    await settle(fixture);

    expect(lastValueAt(fixture, '/dark')).toBe(true);
  });

  it('carries Slider bounds onto its thumb input', async () => {
    const fixture = await render({
      root: 'slider',
      state: { volume: 30 },
      elements: {
        slider: {
          type: 'Slider',
          props: {
            label: 'Volume',
            min: 10,
            max: 90,
            step: 5,
            value: { $bindState: '/volume' },
          },
          children: [],
        },
      },
    } as unknown as Spec);

    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('.jrm-slider-label')?.textContent).toContain(
      'Volume',
    );

    const thumb = host.querySelector(
      'input[matSliderThumb]',
    ) as HTMLInputElement;
    expect(thumb.min).toBe('10');
    expect(thumb.max).toBe('90');
    expect(thumb.step).toBe('5');
    expect(thumb.value).toBe('30');
  });

  it('gives a Slider default bounds when the spec omits them', async () => {
    const fixture = await render({
      root: 'slider',
      elements: {
        slider: { type: 'Slider', props: {}, children: [] },
      },
    } as unknown as Spec);

    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('.jrm-slider-label')).toBeNull();

    const thumb = host.querySelector(
      'input[matSliderThumb]',
    ) as HTMLInputElement;
    expect(thumb.min).toBe('0');
    expect(thumb.max).toBe('100');
    expect(thumb.step).toBe('1');
  });

  it('validates a Select on change once it is bound', async () => {
    const fixture = await render({
      root: 'form',
      state: { size: '' },
      elements: {
        form: { type: 'Stack', props: {}, children: ['select', 'save'] },
        select: {
          type: 'Select',
          props: {
            label: 'Size',
            value: { $bindState: '/size' },
            options: [{ value: 's', label: 'Small' }],
            validation: {
              checks: [{ type: 'required', message: 'Pick a size' }],
              validateOn: 'submit',
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
      valid: false,
      errors: { '/size': ['Pick a size'] },
    });
    expect(errorTexts(fixture)).toEqual(['Pick a size']);
  });
});

describe('material catalog edge cases', () => {
  it('activates a bound ListItem from the keyboard', async () => {
    const fixture = await render({
      root: 'list',
      state: { hits: 0 },
      elements: {
        list: { type: 'List', props: {}, children: ['row'] },
        row: {
          type: 'ListItem',
          props: { title: 'Press me' },
          on: {
            press: {
              action: 'setState',
              params: { statePath: '/hits', value: 1 },
            },
          },
          children: [],
        },
      },
    } as unknown as Spec);

    // The row advertises role=button and tabindex=0, so Enter and Space have
    // to work or it is a control only a mouse can reach.
    const row = (fixture.nativeElement as HTMLElement).querySelector(
      'mat-list-item',
    ) as HTMLElement;
    expect(row.getAttribute('tabindex')).toBe('0');

    for (const key of ['Enter', ' ']) {
      row.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      await settle(fixture);
      expect(lastValueAt(fixture, '/hits')).toBe(1);
    }
  });

  it('validates a Checkbox as soon as it changes', async () => {
    const fixture = await render({
      root: 'terms',
      state: { terms: true },
      elements: {
        terms: {
          type: 'Checkbox',
          props: {
            label: 'Accept the terms',
            checked: { $bindState: '/terms' },
            validation: {
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
      },
    } as unknown as Spec);

    // A checkbox defaults to validateOn 'change', so unticking it must
    // surface the message without any blur or submit.
    expect(errorTexts(fixture)).toEqual([]);

    const input = (fixture.nativeElement as HTMLElement).querySelector(
      'mat-checkbox input',
    ) as HTMLInputElement;
    input.click();
    await settle(fixture);

    expect(lastValueAt(fixture, '/terms')).toBe(false);
    expect(errorTexts(fixture)).toEqual(['You must accept the terms']);

    input.click();
    await settle(fixture);

    expect(errorTexts(fixture)).toEqual([]);
  });

  it('pushes a Stack to the end of its main axis', async () => {
    const fixture = await render({
      root: 'stack',
      elements: {
        stack: {
          type: 'Stack',
          props: { justify: 'end', align: 'start' },
          children: [],
        },
      },
    } as unknown as Spec);

    const stack = (fixture.nativeElement as HTMLElement).querySelector(
      '.jrm-stack',
    ) as HTMLElement;
    expect(stack.style.justifyContent).toBe('flex-end');
    expect(stack.style.alignItems).toBe('flex-start');
  });

  it('renders a Tab outside a Tabs group without failing', async () => {
    // The catalog says Tab is valid only inside Tabs, but a generated spec
    // will get that wrong; the registry lookup is optional so that a stray
    // Tab degrades to nothing instead of throwing.
    const fixture = await render({
      root: 'tab',
      elements: {
        tab: { type: 'Tab', props: { label: 'Orphan' }, children: ['text'] },
        text: { type: 'Text', props: { content: 'Body' }, children: [] },
      },
    } as unknown as Spec);

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('mat-tab-group'),
    ).toBeNull();
  });

  it('writes a Slider drag back to state', async () => {
    const fixture = await render({
      root: 'slider',
      state: { volume: 30 },
      elements: {
        slider: {
          type: 'Slider',
          props: {
            min: 0,
            max: 100,
            step: 1,
            value: { $bindState: '/volume' },
          },
          children: [],
        },
      },
    } as unknown as Spec);

    const thumb = (fixture.nativeElement as HTMLElement).querySelector(
      'input[matSliderThumb]',
    ) as HTMLInputElement;
    thumb.value = '70';
    thumb.dispatchEvent(new Event('input', { bubbles: true }));
    thumb.dispatchEvent(new Event('change', { bubbles: true }));
    await settle(fixture);

    expect(lastValueAt(fixture, '/volume')).toBe(70);
  });
});
