import type { Type } from '@angular/core';
import type { Catalog, StateStore } from '@json-render/core';
import { flattenToPointers } from '@json-render/core/store-utils';
import type {
  Actions,
  CatalogHasActions,
  ComponentRegistry,
  Components,
  RegistryEntry,
  SetState,
  StateModel,
} from './types';

/**
 * Result returned by {@link defineRegistry}.
 */
export interface DefineRegistryResult {
  /** Component registry for `<json-render [registry]="...">`. */
  registry: ComponentRegistry;
  /**
   * Create renderer-compatible handlers from the catalog actions.
   * Accepts getter functions so handlers always read the latest
   * state/setState.
   */
  handlers: (
    getSetState: () => SetState | undefined,
    getState: () => StateModel,
  ) => Record<string, (params: Record<string, unknown>) => Promise<void>>;
  /**
   * Execute an action by name imperatively
   * (for use outside the renderer tree, e.g. initial state loading).
   */
  executeAction: (
    actionName: string,
    params: Record<string, unknown> | undefined,
    setState: SetState,
    state?: StateModel,
  ) => Promise<void>;
}

/**
 * Options for defineRegistry.
 *
 * When the catalog declares actions, the `actions` field is required.
 * When the catalog has no actions (or `actions: {}`), the field is optional.
 */
type DefineRegistryOptions<C extends Catalog> = {
  components?: Components<C>;
} & (CatalogHasActions<C> extends true
  ? { actions: Actions<C> }
  : { actions?: Actions<C> });

/** @internal */
type DefineRegistryActionFn = (
  params: Record<string, unknown> | undefined,
  setState: SetState,
  state: StateModel,
) => Promise<void>;

/**
 * Create a registry from a catalog with components and/or actions.
 *
 * Component keys are type-checked against the catalog, and slot metadata from
 * the catalog is carried into the registry for dev-mode slot warnings.
 *
 * @example
 * ```ts
 * const { registry, handlers } = defineRegistry(catalog, {
 *   components: { Card: CardComponent, Button: ButtonComponent },
 *   actions: {
 *     refresh: async (params, setState) => {
 *       setState((prev) => ({ ...prev, refreshedAt: Date.now() }));
 *     },
 *   },
 * });
 * ```
 */
export function defineRegistry<C extends Catalog>(
  catalog: C,
  options: DefineRegistryOptions<C>,
): DefineRegistryResult {
  const catalogComponents = (
    catalog as unknown as {
      data?: { components?: Record<string, { slots?: string[] }> };
    }
  ).data?.components;

  // Build the component registry, attaching slot metadata from the catalog.
  const registry: ComponentRegistry = {};
  if (options.components) {
    for (const [name, component] of Object.entries(options.components) as Array<
      [string, Type<unknown>]
    >) {
      const entry: RegistryEntry = { component };
      const slots = catalogComponents?.[name]?.slots;
      if (slots) entry.slots = slots;
      registry[name] = entry;
    }
  }

  // Build action helpers.
  const actionMap = options.actions
    ? (Object.entries(options.actions) as Array<
        [string, DefineRegistryActionFn]
      >)
    : [];

  const handlers = (
    getSetState: () => SetState | undefined,
    getState: () => StateModel,
  ): Record<string, (params: Record<string, unknown>) => Promise<void>> => {
    const result: Record<
      string,
      (params: Record<string, unknown>) => Promise<void>
    > = {};
    for (const [name, actionFn] of actionMap) {
      result[name] = async (params) => {
        const setState = getSetState();
        const state = getState();
        if (setState) {
          await actionFn(params, setState, state);
        }
      };
    }
    return result;
  };

  const executeAction = async (
    actionName: string,
    params: Record<string, unknown> | undefined,
    setState: SetState,
    state: StateModel = {},
  ): Promise<void> => {
    const entry = actionMap.find(([name]) => name === actionName);
    if (entry) {
      await entry[1](params, setState, state);
    } else {
      console.warn(`Unknown action: ${actionName}`);
    }
  };

  return { registry, handlers, executeAction };
}

/**
 * Build a {@link SetState} (whole-state updater) on top of a path-based
 * store. The updater's result is diffed against the previous state and only
 * changed leaves are written, preserving fine-grained reactivity.
 *
 * Works with both a core {@link StateStore} and the renderer's injected
 * `JsonRenderStateService`.
 */
export function createStoreSetState(
  store: Pick<StateStore, 'getSnapshot' | 'update'>,
): SetState {
  return (updater) => {
    const prev = store.getSnapshot();
    const next = updater(prev);
    if (next === prev) return;
    const prevFlat = flattenToPointers(prev);
    const nextFlat = flattenToPointers(next);
    const allKeys = new Set([
      ...Object.keys(prevFlat),
      ...Object.keys(nextFlat),
    ]);
    const updates: Record<string, unknown> = {};
    for (const key of allKeys) {
      if (prevFlat[key] !== nextFlat[key]) {
        updates[key] = key in nextFlat ? nextFlat[key] : undefined;
      }
    }
    if (Object.keys(updates).length > 0) {
      store.update(updates);
    }
  };
}
