import { Injectable, type Signal, type Type, signal } from '@angular/core';
import type {
  ActionHandler,
  ComputedFunction,
  DirectiveRegistry,
  Spec,
  StateModel,
  StateStore,
  ValidationFunction,
} from '@json-render/core';
import type { ComponentRegistry, RegistryEntry, StateChange } from './types';

const EMPTY = signal(undefined);

/**
 * Internal bridge between the `<json-render>` component's inputs and the
 * renderer services / element tree. The renderer component replaces these
 * signal references with its own input signals at construction time.
 *
 * @internal
 */
@Injectable()
export class JsonRenderRootContext {
  spec: Signal<Spec | null | undefined> = EMPTY;
  registry: Signal<ComponentRegistry | undefined> = EMPTY;
  loading: Signal<boolean> = signal(false);
  fallback: Signal<Type<unknown> | RegistryEntry | null | undefined> = EMPTY;

  /** External store (controlled mode). */
  store: Signal<StateStore | null | undefined> = EMPTY;
  /** Initial state (uncontrolled mode); falls back to `spec.state`. */
  initialState: Signal<StateModel> = signal({});

  handlers: Signal<Record<string, ActionHandler> | undefined> = EMPTY;
  onAction: Signal<
    | ((name: string, params?: Record<string, unknown>) => unknown)
    | null
    | undefined
  > = EMPTY;
  navigate: Signal<((path: string) => void) | null | undefined> = EMPTY;

  validationFunctions: Signal<Record<string, ValidationFunction> | undefined> =
    EMPTY;
  functions: Signal<Record<string, ComputedFunction> | undefined> = EMPTY;
  directiveRegistry: Signal<DirectiveRegistry | undefined> = EMPTY;

  /** Emits uncontrolled-mode state changes to the renderer output. */
  emitStateChange: (changes: StateChange[]) => void = () => {};

  /** Resolve a registry entry (component + slot metadata) for a type. */
  resolveEntry(type: string): RegistryEntry | undefined {
    const raw = this.registry()?.[type] ?? this.fallback() ?? undefined;
    if (!raw) return undefined;
    return typeof raw === 'function' ? { component: raw } : raw;
  }
}
