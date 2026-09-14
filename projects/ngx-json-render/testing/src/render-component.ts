import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  type Provider,
  type Type,
  computed,
  inject,
  isDevMode,
  signal,
} from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { UIElement } from '@json-render/core';
import {
  ELEMENT_KEY,
  type EventHandle,
  RENDER_CONTEXT,
  type RenderContext,
} from 'ngx-json-render';
import {
  type DomQueries,
  configureTestBed,
  domQueries,
  settler,
} from './fixture-helpers';

/** One `setBound` call that reached a bound prop, in order. */
export interface BoundWrite {
  prop: string;
  value: unknown;
}

/** Options for {@link renderComponent}. Everything is optional. */
export interface RenderComponentOptions<P extends object> {
  /** The resolved props the component sees. Defaults to `{}`. */
  props?: P;
  /**
   * Which props are two-way bound, as `prop → state path` — what
   * `$bindState` / `$bindItem` would have resolved to. A `setBound` on a prop
   * listed here is recorded and written back into `props`; on any other prop
   * it is a no-op, exactly as under the renderer.
   */
  bindings?: Record<string, string>;
  /**
   * The events the spec would bind in `on`. Only affects what `ctx.on(event)`
   * reports as `bound` — `emitted` records every event regardless.
   */
  on?: readonly string[];
  /** The loading flag the component sees. */
  loading?: boolean;
  /** The spec key, for components that `injectElementKey()`. */
  key?: string;
  /** The element's catalog type name. */
  type?: string;
  /** Extra TestBed providers for anything else the component injects. */
  providers?: Provider[];
}

/**
 * A catalog component mounted on its own, and what it said to the renderer
 * it thinks it is inside.
 */
export interface ComponentHarness<T, P extends object> extends DomQueries {
  /** The fixture of the host the component is mounted in. */
  readonly fixture: ComponentFixture<unknown>;
  /** The host element, the root of the rendered DOM. */
  readonly element: HTMLElement;
  /** The component instance. */
  readonly component: T;
  /** The render context the component injected. */
  readonly context: RenderContext<P>;
  /** Every event the component emitted, bound or not, in order. */
  readonly emitted: readonly string[];
  /** Every `setBound` that reached a bound prop, in order. */
  readonly writes: readonly BoundWrite[];

  /** The props as the component currently sees them. */
  props(): P;
  /** Replace the props and settle. */
  setProps(props: P): Promise<void>;
  /** Merge into the props and settle. */
  patchProps(patch: Partial<P>): Promise<void>;
  /** Flip the loading flag and settle. */
  setLoading(loading: boolean): Promise<void>;
  /** Let effects, promises and change detection finish. */
  settle(): Promise<void>;
  /** Destroy the fixture. Rarely needed — TestBed resets between tests. */
  destroy(): void;
}

/**
 * Mounted through `NgComponentOutlet` with an element injector, the way
 * `<jr-element>` mounts a catalog component — so the context is the
 * component's own, not the TestBed module's, and a test can mount twice.
 */
@Component({
  selector: 'jr-component-test-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `
    @if (component(); as type) {
      <ng-container *ngComponentOutlet="type; injector: injector()" />
    }
  `,
})
class JrComponentTestHost {
  readonly parent = inject(Injector);
  readonly component = signal<Type<unknown> | null>(null);
  readonly injector = signal<Injector>(this.parent);
}

/** The renderer-owned services a component can only have from a renderer. */
const RENDERER_ONLY =
  /JsonRender(RootContext|StateService|ValidationService|ActionsService)/;

/**
 * Turn "no provider for the renderer's services" into what to do about it.
 * `<jr-children>`, `injectFieldValidation` and `injectActions` all need a
 * real renderer behind them; there is no honest fake for a subtree.
 */
function explainMissingRenderer(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (RENDERER_ONLY.test(message)) {
    throw new Error(
      `renderComponent: this component needs a real <json-render> — it renders <jr-children>, validates a field or dispatches actions itself. Test it with renderSpec instead.\n\n${message}`,
    );
  }
  throw error;
}

/**
 * Mount a catalog component with no renderer and no spec: hand it props, and
 * read back the events it emitted and the values it wrote to bound props.
 *
 * This is the test of a component as a presentational one — what it draws
 * for these props, and what it says when used. What the spec then does with
 * that is the renderer's business, and `renderSpec` is where to test it.
 *
 * `props` is not inferred from the first value, so a later `patchProps` can
 * set a prop the first render left out. Pass `P` to have the props typed.
 *
 * A component that renders `<jr-children>`, registers field validation or
 * dispatches actions directly needs the renderer's services and fails with a
 * message pointing at `renderSpec`.
 *
 * @example
 * ```ts
 * const button = await renderComponent(MyButton, { props: { label: 'Save' } });
 *
 * expect(button.text('button')).toBe('Save');
 * await button.click('button');
 * expect(button.emitted).toEqual(['press']);
 *
 * await button.patchProps({ disabled: true });
 * expect(button.find<HTMLButtonElement>('button').disabled).toBe(true);
 * ```
 */
export async function renderComponent<
  T,
  P extends object = Record<string, unknown>,
>(
  component: Type<T>,
  options: RenderComponentOptions<NoInfer<P>> = {},
): Promise<ComponentHarness<T, P>> {
  const emitted: string[] = [];
  const writes: BoundWrite[] = [];

  const props = signal<P>(options.props ?? ({} as P));
  const loading = signal(options.loading ?? false);
  const bindings = options.bindings;
  const boundEvents = new Set(options.on ?? []);
  const key = signal(options.key ?? 'element');

  const element = computed(
    () =>
      ({
        type: options.type ?? component.name,
        props: props(),
        children: [],
      }) as UIElement<string, P>,
  );

  const emit = (event: string) => {
    emitted.push(event);
  };

  const context: RenderContext<P> = {
    element,
    props: props.asReadonly(),
    emit,
    on: (event): EventHandle => ({
      emit: () => emit(event),
      shouldPreventDefault: false,
      bound: boundEvents.has(event),
    }),
    bindings: signal(bindings).asReadonly(),
    loading: loading.asReadonly(),
    setBound: (prop, value) => {
      if (!bindings?.[prop]) {
        if (isDevMode()) {
          console.warn(
            `[ngx-json-render] setBound("${prop}"): prop has no $bindState/$bindItem binding`,
          );
        }
        return;
      }
      writes.push({ prop, value });
      // What the renderer's round trip amounts to: the write lands in state,
      // and the bound prop resolves to it on the next read.
      props.update((current) => ({ ...current, [prop]: value }));
    },
  };

  configureTestBed('renderComponent', options.providers ?? []);

  const fixture = TestBed.createComponent(JrComponentTestHost);
  const host = fixture.componentInstance;
  host.injector.set(
    Injector.create({
      providers: [
        { provide: RENDER_CONTEXT, useValue: context },
        { provide: ELEMENT_KEY, useValue: key.asReadonly() },
      ],
      parent: host.parent,
    }),
  );
  host.component.set(component);

  const settle = settler(fixture);
  try {
    await settle();
  } catch (error) {
    explainMissingRenderer(error);
  }

  const mounted = fixture.debugElement.query(
    (candidate) => candidate.componentInstance instanceof component,
  );
  if (!mounted) {
    throw new Error(
      `renderComponent: ${component.name} did not mount. Is it a component?`,
    );
  }

  const root = fixture.nativeElement as HTMLElement;

  return {
    fixture,
    element: root,
    component: mounted.componentInstance as T,
    context,
    emitted,
    writes,

    props: () => props(),
    async setProps(next) {
      props.set(next);
      await settle();
    },
    async patchProps(patch) {
      props.update((current) => ({ ...current, ...patch }));
      await settle();
    },
    async setLoading(next) {
      loading.set(next);
      await settle();
    },
    settle,

    ...domQueries('renderComponent', root, settle),

    destroy: () => fixture.destroy(),
  };
}
