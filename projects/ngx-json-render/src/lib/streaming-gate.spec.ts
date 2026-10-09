import {
  Component,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { Spec, UIElement } from '@json-render/core';
import { z } from 'zod';
import { schema } from 'ngx-json-render/schema';
import { JrChildren } from './children.component';
import { defineRegistry } from './registry';
import { type SpecCatalog, propsArrived } from './render-limits';
import { JsonRenderer } from './renderer.component';
import { injectRenderContext } from './tokens';
import type { ComponentRegistry, RegistryEntry } from './types';

/**
 * The mount gate: while a spec streams, an element whose props do not yet
 * pass its component's catalog schema shows its entry's fallback instead of
 * the component.
 */

@Component({
  selector: 'g-text',
  template: `<span class="g-text">{{ ctx.props().content }}</span>`,
})
class GText {
  readonly ctx = injectRenderContext<{ content: string }>();
}

@Component({
  selector: 'g-text-skeleton',
  template: `<span class="g-text-skeleton"></span>`,
})
class GTextSkeleton {}

@Component({
  selector: 'g-box',
  imports: [JrChildren],
  template: `<div class="g-box">{{ ctx.props().title }}<jr-children /></div>`,
})
class GBox {
  readonly ctx = injectRenderContext<{ title: string }>();
}

/** A placeholder that still lays out what has arrived beneath it. */
@Component({
  selector: 'g-box-skeleton',
  imports: [JrChildren],
  template: `<div class="g-box-skeleton"><jr-children /></div>`,
})
class GBoxSkeleton {}

const CATALOG = schema.createCatalog({
  components: {
    Text: {
      props: z.object({ content: z.string() }),
      slots: [],
      description: 'A line of text',
    },
    Box: {
      props: z.object({ title: z.string() }),
      slots: ['default'],
      description: 'A titled container',
    },
  },
  actions: {},
});

const REGISTRY: ComponentRegistry = {
  Text: { component: GText, fallback: GTextSkeleton },
  Box: { component: GBox, fallback: GBoxSkeleton },
};

@Component({
  imports: [JsonRenderer],
  template: `<json-render
    [spec]="spec()"
    [registry]="registry()"
    [loading]="loading()"
    [catalog]="catalog()"
    [state]="{ title: 'From state' }"
  />`,
})
class Host {
  readonly spec = signal<Spec | null>(null);
  readonly registry = signal<ComponentRegistry>(REGISTRY);
  readonly loading = signal(true);
  readonly catalog = signal<SpecCatalog | null>(CATALOG);
}

async function settle(fixture: ComponentFixture<unknown>) {
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
}

async function setup(spec: Spec, configure?: (host: Host) => void) {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  });
  const fixture = TestBed.createComponent(Host);
  configure?.(fixture.componentInstance);
  fixture.componentInstance.spec.set(spec);
  await settle(fixture);
  return fixture;
}

/** A spec whose root is a single Text with these props. */
function text(props: Record<string, unknown>): Spec {
  return {
    root: 't',
    elements: { t: { type: 'Text', props, children: [] } },
  } as unknown as Spec;
}

function find(fixture: ComponentFixture<unknown>, selector: string) {
  return (fixture.nativeElement as HTMLElement).querySelector(selector);
}

describe('mount gate while streaming', () => {
  it('shows the entry fallback until the props pass, then the component', async () => {
    const fixture = await setup(text({}));

    expect(find(fixture, '.g-text-skeleton')).not.toBeNull();
    expect(find(fixture, '.g-text')).toBeNull();

    fixture.componentInstance.spec.set(text({ content: 'Hello' }));
    await settle(fixture);

    expect(find(fixture, '.g-text-skeleton')).toBeNull();
    expect(find(fixture, '.g-text')?.textContent).toBe('Hello');
  });

  it('renders nothing for an entry without a fallback', async () => {
    const fixture = await setup(text({}), (host) =>
      host.registry.set({ Text: GText, Box: GBox }),
    );

    expect(find(fixture, '.g-text')).toBeNull();

    fixture.componentInstance.spec.set(text({ content: 'Hello' }));
    await settle(fixture);

    expect(find(fixture, '.g-text')?.textContent).toBe('Hello');
  });

  it('mounts with partial props when there is no catalog, as before', async () => {
    const fixture = await setup(text({}), (host) => host.catalog.set(null));

    expect(find(fixture, '.g-text')).not.toBeNull();
    expect(find(fixture, '.g-text-skeleton')).toBeNull();
  });

  it('mounts whatever the props once loading ends', async () => {
    const fixture = await setup(text({}));
    expect(find(fixture, '.g-text')).toBeNull();

    fixture.componentInstance.loading.set(false);
    await settle(fixture);

    expect(find(fixture, '.g-text')).not.toBeNull();
    expect(find(fixture, '.g-text-skeleton')).toBeNull();
  });

  it('does not hold anything back when the spec is not loading', async () => {
    const fixture = await setup(text({}), (host) => host.loading.set(false));

    expect(find(fixture, '.g-text')).not.toBeNull();
  });

  it('takes an expression as an arrived value, whatever it resolves to', async () => {
    // `{ $state }` is not a string, and the schema wants one. It is checked
    // as written in the spec, so it counts as there.
    const fixture = await setup(text({ content: { $state: '/title' } }));

    expect(find(fixture, '.g-text')?.textContent).toBe('From state');
  });

  it('never goes back to the fallback once the component is mounted', async () => {
    const fixture = await setup(text({ content: 'Hello' }));
    expect(find(fixture, '.g-text')).not.toBeNull();

    // A later patch takes the required prop away again mid-stream.
    fixture.componentInstance.spec.set(text({}));
    await settle(fixture);

    expect(find(fixture, '.g-text')).not.toBeNull();
    expect(find(fixture, '.g-text-skeleton')).toBeNull();
  });

  it('lets a fallback lay out the children that have arrived', async () => {
    const fixture = await setup({
      root: 'b',
      elements: {
        b: { type: 'Box', props: {}, children: ['t'] },
        t: { type: 'Text', props: { content: 'Inside' }, children: [] },
      },
    } as unknown as Spec);

    expect(find(fixture, '.g-box')).toBeNull();
    expect(find(fixture, '.g-box-skeleton .g-text')?.textContent).toBe(
      'Inside',
    );
  });

  it('leaves a type the catalog has no schema for alone', async () => {
    const fixture = await setup(
      {
        root: 'x',
        elements: { x: { type: 'Extra', props: {}, children: [] } },
      } as unknown as Spec,
      (host) => host.registry.set({ ...REGISTRY, Extra: GText }),
    );

    expect(find(fixture, '.g-text')).not.toBeNull();
  });
});

describe('propsArrived', () => {
  /** A catalog whose only component has the given props schema. */
  const withSchema = (props: unknown): SpecCatalog => ({
    componentNames: ['C'],
    validate: () => ({ success: true }),
    data: { components: { C: { props } } },
  });
  const element = (props?: Record<string, unknown>) =>
    ({ type: 'C', props, children: [] }) as unknown as UIElement;

  it('waits on a schema that throws', () => {
    const throwing = withSchema({
      safeParse: () => {
        throw new RangeError('Maximum call stack size exceeded');
      },
    });

    expect(propsArrived(element({}), throwing)).toBe(false);
  });

  it('waits on a failure that does not say where', () => {
    const vague = withSchema({
      safeParse: () => ({ success: false, error: new Error('no') }),
    });

    expect(propsArrived(element({}), vague)).toBe(false);
  });

  it('counts a nested expression as arrived', () => {
    const catalog = withSchema(
      z.object({ user: z.object({ name: z.string() }) }),
    );

    expect(propsArrived(element({ user: { $state: '/user' } }), catalog)).toBe(
      true,
    );
    expect(propsArrived(element({ user: {} }), catalog)).toBe(false);
  });

  it('reads an element with no props as empty props', () => {
    const catalog = withSchema(z.object({ label: z.string().optional() }));

    expect(propsArrived(element(), catalog)).toBe(true);
  });
});

describe('defineRegistry with fallbacks', () => {
  it('carries a fallback next to the component and the slots', () => {
    const { registry } = defineRegistry(CATALOG, {
      components: {
        Text: { component: GText, fallback: GTextSkeleton },
        Box: GBox,
      },
    });

    expect(registry['Text']).toEqual({
      component: GText,
      fallback: GTextSkeleton,
      slots: [],
    } satisfies RegistryEntry);
    expect(registry['Box']).toEqual({
      component: GBox,
      slots: ['default'],
    } satisfies RegistryEntry);
  });
});
