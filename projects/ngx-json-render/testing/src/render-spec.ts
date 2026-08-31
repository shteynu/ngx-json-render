import {
  ChangeDetectionStrategy,
  Component,
  type Provider,
  type Type,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  ActionHandler,
  ComputedFunction,
  DirectiveDefinition,
  Spec,
  StateStore,
  ValidationFunction,
} from '@json-render/core';
import {
  type ComponentRegistry,
  JsonRenderStateService,
  JsonRenderValidationService,
  JsonRenderer,
  type RegistryEntry,
  type StateChange,
  type StateModel,
} from 'ngx-json-render';

/** One action the spec asked for, in the order it was dispatched. */
export interface DispatchedAction {
  name: string;
  params?: Record<string, unknown>;
}

/** Options for {@link renderSpec}. Everything but `registry` is optional. */
export interface RenderSpecOptions {
  /** Catalog type name → Angular component. The one required option. */
  registry: ComponentRegistry;
  /** Initial state model. Defaults to the spec's own `state`. */
  state?: StateModel;
  /** External store, for controlled mode. */
  store?: StateStore | null;
  /** Action handlers by name. Dispatches are recorded either way. */
  handlers?: Record<string, ActionHandler>;
  /** Catch-all handler for actions with no dedicated handler. */
  onAction?: (name: string, params?: Record<string, unknown>) => unknown;
  /** Navigation function for `onSuccess: { navigate }`. */
  navigate?: (path: string) => void;
  /** Fallback component for unknown types. */
  fallback?: Type<unknown> | RegistryEntry | null;
  /** Named functions for `$computed` props. */
  functions?: Record<string, ComputedFunction>;
  /** Custom validation functions. */
  validationFunctions?: Record<string, ValidationFunction>;
  /** Custom directives for `$`-prefixed values. */
  directives?: DirectiveDefinition[];
  /** Render as if the spec were still streaming. */
  loading?: boolean;
  /** Extra TestBed providers, e.g. a `JR_CONFIRM_DIALOG` replacement. */
  providers?: Provider[];
}

/**
 * A rendered spec, and the handful of things a test does to one.
 *
 * `fixture` and `element` are there for everything this does not cover — the
 * harness is a shortcut, not a wall.
 */
export interface SpecHarness {
  /** The fixture of the host that owns the `<json-render>`. */
  readonly fixture: ComponentFixture<unknown>;
  /** The host element, the root of the rendered DOM. */
  readonly element: HTMLElement;
  /** The renderer instance. */
  readonly renderer: JsonRenderer;
  /** The renderer's state store. */
  readonly store: JsonRenderStateService;
  /** The renderer's validation service. */
  readonly validation: JsonRenderValidationService;
  /** Every action the spec dispatched, handled or not, in order. */
  readonly dispatched: readonly DispatchedAction[];
  /** Every state change the renderer emitted, flattened, in order. */
  readonly changes: readonly StateChange[];

  /** Render a different spec (a later streaming frame, say). */
  setSpec(spec: Spec | null): Promise<void>;
  /** Flip the loading flag catalog components see. */
  setLoading(loading: boolean): Promise<void>;
  /** Let effects, promises and change detection finish. */
  settle(): Promise<void>;

  /** Read a state path, e.g. `/form/email`. */
  read(path: string): unknown;
  /** Write a state path and settle. */
  write(path: string, value: unknown): Promise<void>;
  /** The whole state model. */
  state(): StateModel;

  /** Trimmed text of the first match, or of everything when given nothing. */
  text(selector?: string): string;
  /** Trimmed text of every match. */
  texts(selector: string): string[];
  /** The first match. Throws when there is none. */
  find<T extends HTMLElement>(selector: string): T;
  /** Every match, possibly none. */
  findAll<T extends HTMLElement>(selector: string): T[];
  /** Click an element (or the first match of a selector) and settle. */
  click(target: string | Element): Promise<void>;
  /** Set an input's value, fire `input`, and settle. */
  fill(target: string | Element, value: string): Promise<void>;

  /** Destroy the fixture. Rarely needed — TestBed resets between tests. */
  destroy(): void;
}

@Component({
  selector: 'jr-test-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [JsonRenderer],
  template: `
    <json-render
      [spec]="spec()"
      [registry]="registry()"
      [loading]="loading()"
      [state]="state()"
      [store]="store()"
      [handlers]="handlers()"
      [onAction]="onAction()"
      [navigate]="navigate()"
      [fallback]="fallback()"
      [functions]="functions()"
      [validationFunctions]="validationFunctions()"
      [directives]="directives()"
      (stateChange)="record($event)"
    />
  `,
})
class JrTestHost {
  readonly spec = signal<Spec | null>(null);
  readonly registry = signal<ComponentRegistry>({});
  readonly loading = signal(false);
  readonly state = signal<StateModel | undefined>(undefined);
  readonly store = signal<StateStore | null>(null);
  readonly handlers = signal<Record<string, ActionHandler> | undefined>(
    undefined,
  );
  readonly onAction = signal<
    ((name: string, params?: Record<string, unknown>) => unknown) | null
  >(null);
  readonly navigate = signal<((path: string) => void) | null>(null);
  readonly fallback = signal<Type<unknown> | RegistryEntry | null>(null);
  readonly functions = signal<Record<string, ComputedFunction> | undefined>(
    undefined,
  );
  readonly validationFunctions = signal<
    Record<string, ValidationFunction> | undefined
  >(undefined);
  readonly directives = signal<DirectiveDefinition[] | undefined>(undefined);

  record: (changes: StateChange[]) => void = () => {};
}

/**
 * Wrap every handler so a dispatch is recorded whether or not the action is
 * handled. Without this, `dispatched` would silently omit exactly the actions
 * a test bothered to wire up.
 */
function recordingHandlers(
  handlers: Record<string, ActionHandler> | undefined,
  dispatched: DispatchedAction[],
): Record<string, ActionHandler> | undefined {
  if (!handlers) return undefined;
  const wrapped: Record<string, ActionHandler> = {};
  for (const [name, handler] of Object.entries(handlers)) {
    wrapped[name] = (params: Record<string, unknown>) => {
      dispatched.push({ name, params });
      return handler(params);
    };
  }
  return wrapped;
}

/**
 * Configure the TestBed, unless the test already did.
 *
 * A test that called `TestBed.runInInjectionContext` first — or that renders
 * a second spec — has an instantiated module, and configuring it again
 * throws. Its own module stands; the only thing that cannot be salvaged is
 * this call's `providers`, so that is the one case worth failing over.
 */
function configureTestBed(providers: Provider[]): void {
  try {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), ...providers],
    });
  } catch {
    if (providers.length > 0) {
      throw new Error(
        'renderSpec: the TestBed was already instantiated, so `providers` cannot be applied. Pass them to your own TestBed.configureTestingModule() call instead.',
      );
    }
  }
}

/**
 * Render a spec against a registry and hand back the few things a test does
 * to it.
 *
 * Testing a catalog component otherwise means a host component, a TestBed
 * module, a zoneless provider, two settle passes and a `querySelector` — the
 * same twenty lines in every project that adopts this package, none of them
 * about the component under test.
 *
 * @example
 * ```ts
 * const ui = await renderSpec(
 *   {
 *     root: 'save',
 *     elements: {
 *       save: { type: 'Button', props: { label: 'Save' }, on: { press: { action: 'save' } } },
 *     },
 *   },
 *   { registry: { Button: MyButton } },
 * );
 *
 * expect(ui.text('button')).toBe('Save');
 * await ui.click('button');
 * expect(ui.dispatched).toEqual([{ name: 'save', params: {} }]);
 * ```
 */
export async function renderSpec(
  spec: Spec | null,
  options: RenderSpecOptions,
): Promise<SpecHarness> {
  const dispatched: DispatchedAction[] = [];
  const changes: StateChange[] = [];

  configureTestBed(options.providers ?? []);

  const fixture = TestBed.createComponent(JrTestHost);
  const host = fixture.componentInstance;

  host.registry.set(options.registry);
  host.loading.set(options.loading ?? false);
  host.state.set(options.state);
  host.store.set(options.store ?? null);
  host.handlers.set(recordingHandlers(options.handlers, dispatched));
  host.onAction.set((name, params) => {
    dispatched.push({ name, params });
    return options.onAction?.(name, params);
  });
  host.navigate.set(options.navigate ?? null);
  host.fallback.set(options.fallback ?? null);
  host.functions.set(options.functions);
  host.validationFunctions.set(options.validationFunctions);
  host.directives.set(options.directives);
  host.record = (batch) => changes.push(...batch);
  host.spec.set(spec);

  const settle = async () => {
    // Twice: the first pass runs the effects that a render schedules, the
    // second renders what those effects changed. One pass leaves a test
    // asserting against a frame that no browser would ever show.
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
  };
  await settle();

  const element = fixture.nativeElement as HTMLElement;
  // Found by predicate rather than with `By.directive`, which would make
  // @angular/platform-browser a dependency of this entry point for one line.
  const rendererElement = fixture.debugElement.query(
    (candidate) => candidate.componentInstance instanceof JsonRenderer,
  );
  const renderer = rendererElement.componentInstance as JsonRenderer;
  const store = renderer.stateStore;
  // From the renderer's own injector: these services are provided by the
  // component, so the root TestBed injector has never heard of them.
  const validation = rendererElement.injector.get(JsonRenderValidationService);

  const resolve = (target: string | Element): HTMLElement => {
    if (typeof target !== 'string') return target as HTMLElement;
    const found = element.querySelector<HTMLElement>(target);
    if (!found) {
      throw new Error(
        `renderSpec: nothing matches ${JSON.stringify(target)}. Rendered HTML:\n${element.innerHTML}`,
      );
    }
    return found;
  };

  return {
    fixture,
    element,
    renderer,
    store,
    validation,
    dispatched,
    changes,

    async setSpec(next) {
      host.spec.set(next);
      await settle();
    },
    async setLoading(loading) {
      host.loading.set(loading);
      await settle();
    },
    settle,

    read: (path) => store.get(path),
    async write(path, value) {
      store.set(path, value);
      await settle();
    },
    state: () => store.state(),

    text: (selector) =>
      ((selector ? resolve(selector) : element).textContent ?? '').trim(),
    texts: (selector) =>
      Array.from(element.querySelectorAll(selector)).map((el) =>
        (el.textContent ?? '').trim(),
      ),
    find: <T extends HTMLElement>(selector: string) => resolve(selector) as T,
    findAll: <T extends HTMLElement>(selector: string) =>
      Array.from(element.querySelectorAll<T>(selector)),
    async click(target) {
      resolve(target).click();
      await settle();
    },
    async fill(target, value) {
      const input = resolve(target) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await settle();
    },

    destroy: () => fixture.destroy(),
  };
}
