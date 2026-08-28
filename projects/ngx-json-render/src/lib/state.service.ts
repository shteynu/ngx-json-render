import {
  Injectable,
  type Signal,
  computed,
  effect,
  inject,
  isDevMode,
  signal,
  untracked,
} from '@angular/core';
import {
  type StateModel,
  type StateStore,
  createStateStore,
  getByPath,
} from '@json-render/core';
import { flattenToPointers } from '@json-render/core/store-utils';
import { JsonRenderRootContext } from './root-context';
import type { StateChange } from './types';

/**
 * The state store of a `<json-render>` subtree.
 *
 * Wraps a core {@link StateStore} (either the internal in-memory store in
 * uncontrolled mode, or an external store passed via the `store` input) and
 * exposes the current state model as a signal.
 *
 * Inject it from catalog components or action handlers via
 * {@link injectStateStore}.
 */
@Injectable()
export class JsonRenderStateService {
  private readonly root = inject(JsonRenderRootContext);
  private readonly internalStore = createStateStore({});

  private readonly changeListeners = new Set<(changes: StateChange[]) => void>();

  private readonly _state = signal<StateModel>(
    {},
    // External stores may mutate snapshots in place — always propagate.
    { equal: () => false },
  );

  /** The current state model as a signal. */
  readonly state: Signal<StateModel> = this._state.asReadonly();

  private readonly currentStore = computed<StateStore>(
    () => this.root.store() ?? this.internalStore,
  );

  constructor() {
    const initialMode = untracked(this.currentStore) === this.internalStore
      ? 'uncontrolled'
      : 'controlled';
    let modeWarned = false;

    // Keep the state signal in sync with whichever store is active.
    effect((onCleanup) => {
      const store = this.currentStore();

      if (isDevMode() && !modeWarned) {
        const mode = store === this.internalStore ? 'uncontrolled' : 'controlled';
        if (mode !== initialMode) {
          modeWarned = true;
          console.warn(
            `[ngx-json-render] switching from ${initialMode} to ${mode} mode is not supported.`,
          );
        }
      }

      untracked(() => this._state.set(store.getSnapshot()));
      const unsubscribe = store.subscribe(() => {
        this._state.set(store.getSnapshot());
      });
      onCleanup(unsubscribe);
    });

    // Uncontrolled mode: when the (resolved) initial state changes — e.g.
    // `spec.state` grows while streaming — diff it against the previous
    // initial state and apply only the changed leaves to the store.
    let prevFlat: Record<string, unknown> = {};
    effect(() => {
      if (this.root.store()) return;
      const initialState = this.root.initialState() ?? {};
      const nextFlat =
        Object.keys(initialState).length > 0
          ? flattenToPointers(initialState)
          : {};
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
      prevFlat = nextFlat;
      if (Object.keys(updates).length > 0) {
        untracked(() => this.internalStore.update(updates));
      }
    });
  }

  /** Read a value by JSON Pointer path from the current state. */
  get(path: string): unknown {
    return untracked(this.currentStore).get(path);
  }

  /** Write a value by JSON Pointer path and notify subscribers. */
  set(path: string, value: unknown): void {
    const store = untracked(this.currentStore);
    const prev = store.getSnapshot();
    const prevValue = getByPath(prev, path);
    store.set(path, value);
    if (prevValue !== value) {
      const changes: StateChange[] = [{ path, value }];
      this.notifyChanges(changes);
      if (!untracked(this.root.store) && store.getSnapshot() !== prev) {
        this.root.emitStateChange(changes);
      }
    }
  }

  /** Write multiple values at once (single notification). */
  update(updates: Record<string, unknown>): void {
    const store = untracked(this.currentStore);
    const prev = store.getSnapshot();
    store.update(updates);
    const changes: StateChange[] = [];
    for (const [path, value] of Object.entries(updates)) {
      if (getByPath(prev, path) !== value) {
        changes.push({ path, value });
      }
    }
    if (changes.length > 0) {
      this.notifyChanges(changes);
      if (!untracked(this.root.store) && store.getSnapshot() !== prev) {
        this.root.emitStateChange(changes);
      }
    }
  }

  /** Return the full state object (non-reactive read). */
  getSnapshot(): StateModel {
    return untracked(this.currentStore).getSnapshot();
  }

  /**
   * Register a listener called with the list of changed paths whenever state
   * is written through this service (element `watch` fields rely on this).
   * Returns an unsubscribe function.
   */
  subscribeChanges(listener: (changes: StateChange[]) => void): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  private notifyChanges(changes: StateChange[]): void {
    for (const listener of this.changeListeners) {
      listener(changes);
    }
  }
}

/**
 * Inject the state store of the nearest `<json-render>` renderer.
 * Must be called from within the renderer's subtree (e.g. a catalog
 * component) or a component that provides {@link JsonRenderStateService}.
 */
export function injectStateStore(): JsonRenderStateService {
  return inject(JsonRenderStateService);
}

/** Reactive read of a state value by JSON Pointer path. */
export function injectStateValue<T>(
  path: string | (() => string),
): Signal<T | undefined> {
  const store = injectStateStore();
  const getPath = typeof path === 'function' ? path : () => path;
  return computed(() => getByPath(store.state(), getPath()) as T | undefined);
}

/**
 * Reactive two-way binding to a state path: a value signal plus a setter
 * that writes back to the same path.
 */
export function injectStateBinding<T>(path: string | (() => string)): {
  value: Signal<T | undefined>;
  set: (value: T) => void;
} {
  const store = injectStateStore();
  const getPath = typeof path === 'function' ? path : () => path;
  return {
    value: computed(() => getByPath(store.state(), getPath()) as T | undefined),
    set: (value: T) => store.set(getPath(), value),
  };
}

/**
 * Two-way bound prop helper for catalog components, mirroring `useBoundProp`
 * from the other renderers: the value comes from the already-resolved prop,
 * and the setter writes back to the bound state path (no-op if not bound).
 *
 * @example
 * ```ts
 * const ctx = injectRenderContext<{ value?: string }>();
 * const bound = injectBoundProp<string>(
 *   () => ctx.props().value,
 *   () => ctx.bindings()?.['value'],
 * );
 * // template: <input [value]="bound.value() ?? ''" (input)="bound.set($any($event.target).value)" />
 * ```
 */
export function injectBoundProp<T>(
  propValue: () => T | undefined,
  bindingPath: () => string | undefined,
): { value: Signal<T | undefined>; set: (value: T) => void } {
  const store = injectStateStore();
  return {
    value: computed(propValue),
    set: (value: T) => {
      const path = bindingPath();
      if (path) store.set(path, value);
    },
  };
}
