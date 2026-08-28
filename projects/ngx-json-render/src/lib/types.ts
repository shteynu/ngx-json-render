import type { Signal, Type } from '@angular/core';
import type {
  Catalog,
  InferActionParams,
  InferCatalogActions,
  InferCatalogComponents,
  StateModel,
  UIElement,
} from '@json-render/core';

export type { StateModel };

// =============================================================================
// State Types
// =============================================================================

/**
 * State setter function for updating application state.
 * Matches the `SetState` contract of the other json-render renderers
 * (React/Vue/Solid): an updater receives the previous state object and
 * returns the next one.
 */
export type SetState = (
  updater: (prev: Record<string, unknown>) => Record<string, unknown>,
) => void;

/** A single state change notification (JSON Pointer path + new value). */
export interface StateChange {
  path: string;
  value: unknown;
}

// =============================================================================
// Component Types
// =============================================================================

/**
 * Handle returned by the `on()` function for a specific event.
 * Provides metadata about the event binding and a method to fire it.
 *
 * @example
 * ```ts
 * const press = ctx.on('press');
 * if (press.shouldPreventDefault) e.preventDefault();
 * press.emit();
 * ```
 */
export interface EventHandle {
  /** Fire the event (resolve action bindings) */
  emit: () => void;
  /** Whether any binding requested preventDefault */
  shouldPreventDefault: boolean;
  /** Whether any handler is bound to this event */
  bound: boolean;
}

/**
 * Context available to catalog components via `injectRenderContext()`.
 *
 * This is the Angular equivalent of the render props that the React/Vue/Solid
 * renderers pass to registered components: resolved props, event emitters,
 * two-way binding paths, and the loading flag — exposed as signals so catalog
 * components stay fine-grained reactive while the spec streams in.
 */
export interface RenderContext<P = Record<string, unknown>> {
  /** The element being rendered, with all prop expressions resolved. */
  element: Signal<UIElement<string, P>>;
  /** Resolved component props (shortcut for `element().props`). */
  props: Signal<P>;
  /**
   * Emit a named event. The renderer resolves the event to action binding(s)
   * from the element's `on` field.
   */
  emit: (event: string) => void;
  /** Get an event handle with metadata (shouldPreventDefault, bound). */
  on: (event: string) => EventHandle;
  /**
   * Two-way binding paths resolved from `$bindState` / `$bindItem`
   * expressions. Maps prop name → absolute state path for write-back.
   * `undefined` when no prop uses a binding expression.
   */
  bindings: Signal<Record<string, string> | undefined>;
  /** Whether the spec is currently loading/streaming. */
  loading: Signal<boolean>;
  /**
   * Write a value back to the state path bound to the given prop.
   * No-op (with a dev warning) when the prop has no `$bindState`/`$bindItem`
   * binding.
   */
  setBound: (prop: string, value: unknown) => void;
}

/**
 * A registry entry: the Angular component to render for a catalog component
 * type, plus optional slot metadata used for dev-mode warnings.
 */
export interface RegistryEntry {
  component: Type<unknown>;
  /** Slot names this component supports (from the catalog definition). */
  slots?: string[];
}

/**
 * Registry of component renderers: catalog type name → Angular component
 * (or a {@link RegistryEntry} carrying slot metadata).
 */
export type ComponentRegistry = Record<string, Type<unknown> | RegistryEntry>;

/**
 * Registry of all Angular components for a catalog. Keys are checked against
 * the catalog's component names.
 */
export type Components<C extends Catalog> = {
  [K in keyof InferCatalogComponents<C>]: Type<unknown>;
};

// =============================================================================
// Repeat scope
// =============================================================================

/**
 * The repeat scope available to elements rendered inside a `repeat` block.
 * Injected via {@link injectRepeatScope}.
 */
export interface RepeatScope {
  /** The current repeat item. */
  item: Signal<unknown>;
  /** The current repeat array index. */
  index: Signal<number>;
  /** Absolute state path of the current item (e.g. `/todos/0`). */
  basePath: Signal<string>;
}

// =============================================================================
// Action Types
// =============================================================================

/**
 * Action handler function type for {@link defineRegistry}.
 *
 * @example
 * ```ts
 * const viewCustomers: ActionFn<typeof catalog, 'viewCustomers'> = async (params, setState) => {
 *   const data = await fetch('/api/customers').then((r) => r.json());
 *   setState((prev) => ({ ...prev, customers: data }));
 * };
 * ```
 */
export type ActionFn<
  C extends Catalog,
  K extends keyof InferCatalogActions<C>,
> = (
  params: InferActionParams<C, K> | undefined,
  setState: SetState,
  state: StateModel,
) => Promise<void>;

/** Registry of all action handlers for a catalog. */
export type Actions<C extends Catalog> = {
  [K in keyof InferCatalogActions<C>]: ActionFn<C, K>;
};

/**
 * True when the catalog declares at least one action, false otherwise.
 * Used by defineRegistry to conditionally require the `actions` field.
 */
export type CatalogHasActions<C extends Catalog> = [
  InferCatalogActions<C>,
] extends [never]
  ? false
  : [keyof InferCatalogActions<C>] extends [never]
    ? false
    : true;
