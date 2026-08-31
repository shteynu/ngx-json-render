import {
  Injectable,
  type Signal,
  computed,
  inject,
  signal,
  untracked,
} from '@angular/core';
import {
  type ActionBinding,
  type ActionHandler,
  type ResolvedAction,
  executeAction,
  nextActionDispatchId,
  notifyActionDispatch,
  notifyActionSettle,
  resolveAction,
} from '@json-render/core';
import { JsonRenderRootContext } from './root-context';
import { JsonRenderStateService } from './state.service';
import { JsonRenderValidationService } from './validation.service';

let idCounter = 0;
function generateUniqueId(): string {
  idCounter += 1;
  return `${Date.now()}-${idCounter}`;
}

function deepResolveValue(
  value: unknown,
  get: (path: string) => unknown,
): unknown {
  if (value === null || value === undefined) return value;

  if (value === '$id') {
    return generateUniqueId();
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);

    if (keys.length === 1 && typeof obj['$state'] === 'string') {
      return get(obj['$state'] as string);
    }

    if (keys.length === 1 && '$id' in obj) {
      return generateUniqueId();
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => deepResolveValue(item, get));
  }

  if (typeof value === 'object') {
    const resolved: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      resolved[key] = deepResolveValue(val, get);
    }
    return resolved;
  }

  return value;
}

export interface PendingConfirmation {
  action: ResolvedAction;
  handler: ActionHandler;
  resolve: () => void;
  reject: () => void;
}

/**
 * Rejection produced when the user dismisses an action's confirmation dialog.
 * Carries a stable `name` so callers can tell a cancellation apart from a
 * handler failure without matching on the message.
 *
 * @internal Not part of the public API; use {@link isActionCancelled}.
 */
export class ActionCancelledError extends Error {
  constructor() {
    super('Action cancelled');
    this.name = 'ActionCancelledError';
  }
}

/** True for the rejection produced by cancelling a confirmation dialog. */
export function isActionCancelled(error: unknown): boolean {
  return error instanceof Error && error.name === 'ActionCancelledError';
}

/**
 * Action dispatcher of a `<json-render>` subtree.
 *
 * Executes {@link ActionBinding}s: built-in actions (`setState`, `pushState`,
 * `removeState`, `push`, `pop`, `validateForm`, `submitForm`) are handled
 * internally; everything else is routed to the host-provided `handlers` (or
 * the `onAction` catch-all), honoring `confirm`, `onSuccess`, and `onError`.
 */
@Injectable()
export class JsonRenderActionsService {
  private readonly root = inject(JsonRenderRootContext);
  private readonly state = inject(JsonRenderStateService);
  private readonly validation = inject(JsonRenderValidationService, {
    optional: true,
  });

  private readonly extraHandlers = signal<Record<string, ActionHandler>>({});
  private readonly _loadingActions = signal<ReadonlySet<string>>(new Set());
  private readonly _pendingConfirmation = signal<PendingConfirmation | null>(
    null,
  );

  /** Names of actions currently executing. */
  readonly loadingActions: Signal<ReadonlySet<string>> =
    this._loadingActions.asReadonly();

  /** The confirmation currently awaiting user input, if any. */
  readonly pendingConfirmation: Signal<PendingConfirmation | null> =
    this._pendingConfirmation.asReadonly();

  /** All registered handlers (host handlers + runtime registrations). */
  get handlers(): Record<string, ActionHandler> {
    return {
      ...(untracked(this.root.handlers) ?? {}),
      ...untracked(this.extraHandlers),
    };
  }

  /** Register an additional action handler at runtime. */
  registerHandler(name: string, handler: ActionHandler): void {
    this.extraHandlers.set({
      ...untracked(this.extraHandlers),
      [name]: handler,
    });
  }

  /** Execute an action binding. */
  async execute(binding: ActionBinding): Promise<void> {
    const resolved = resolveAction(binding, this.state.getSnapshot());
    const get = (path: string) => this.state.get(path);
    const set = (path: string, value: unknown) => this.state.set(path, value);

    // --- devtools / observer hooks ---
    const dispatchId = nextActionDispatchId();
    const dispatchedAt = Date.now();
    notifyActionDispatch({
      id: dispatchId,
      name: resolved.action,
      params: resolved.params,
      at: dispatchedAt,
    });
    let ok = true;
    let error: unknown = undefined;

    try {
      if (resolved.action === 'setState' && resolved.params) {
        const statePath = resolved.params['statePath'] as string;
        const value = resolved.params['value'];
        if (statePath) {
          set(statePath, value);
        }
        return;
      }

      if (resolved.action === 'pushState' && resolved.params) {
        const statePath = resolved.params['statePath'] as string;
        const rawValue = resolved.params['value'];
        if (statePath) {
          const resolvedValue = deepResolveValue(rawValue, get);
          const arr = (get(statePath) as unknown[] | undefined) ?? [];
          set(statePath, [...arr, resolvedValue]);
          const clearStatePath = resolved.params['clearStatePath'] as
            string | undefined;
          if (clearStatePath) {
            set(clearStatePath, '');
          }
        }
        return;
      }

      if (resolved.action === 'removeState' && resolved.params) {
        const statePath = resolved.params['statePath'] as string;
        const index = resolved.params['index'] as number;
        if (statePath !== undefined && index !== undefined) {
          const arr = (get(statePath) as unknown[] | undefined) ?? [];
          set(
            statePath,
            arr.filter((_, i) => i !== index),
          );
        }
        return;
      }

      if (resolved.action === 'push' && resolved.params) {
        const screen = resolved.params['screen'] as string;
        if (screen) {
          const currentScreen = get('/currentScreen') as string | undefined;
          const navStack = (get('/navStack') as string[] | undefined) ?? [];
          if (currentScreen) {
            set('/navStack', [...navStack, currentScreen]);
          } else {
            set('/navStack', [...navStack, '']);
          }
          set('/currentScreen', screen);
        }
        return;
      }

      if (resolved.action === 'pop') {
        const navStack = (get('/navStack') as string[] | undefined) ?? [];
        if (navStack.length > 0) {
          const previousScreen = navStack[navStack.length - 1];
          set('/navStack', navStack.slice(0, -1));
          if (previousScreen) {
            set('/currentScreen', previousScreen);
          } else {
            set('/currentScreen', undefined);
          }
        }
        return;
      }

      if (resolved.action === 'validateForm') {
        if (this.checkForm(resolved) === null) {
          console.warn(
            'validateForm action was dispatched but no JsonRenderValidationService is available.',
          );
        }
        return;
      }

      if (resolved.action === 'submitForm') {
        const valid = this.checkForm(resolved);
        if (valid === null) {
          console.warn(
            'submitForm action was dispatched but no JsonRenderValidationService is available; nothing was submitted.',
          );
          return;
        }
        // An invalid form stops here, with the errors already written to
        // state and every field marked validated, so they are on screen.
        if (!valid) return;

        const target = resolved.params?.['action'];
        if (typeof target !== 'string' || !target) {
          console.warn(
            'submitForm needs the action to submit to: { "action": "submitForm", "params": { "action": "saveUser" } }.',
          );
          return;
        }

        // Dispatched, not called directly, so the submitted action goes
        // through the same lookup, confirmation, loading state and observers
        // as any other — submitForm gates it, it does not replace it.
        await this.execute({
          action: target,
          params: deepResolveValue(resolved.params?.['params'], get) as
            Record<string, unknown> | undefined,
          confirm: resolved.confirm,
          onSuccess: resolved.onSuccess,
          onError: resolved.onError,
        });
        return;
      }

      const handler = this.lookupHandler(resolved.action);

      if (!handler) {
        console.warn(`No handler registered for action: ${resolved.action}`);
        return;
      }

      if (resolved.confirm) {
        // Awaited, not returned: a returned promise would let the `finally`
        // below settle the observers before the user has even answered.
        await new Promise<void>((resolve, reject) => {
          this._pendingConfirmation.set({
            action: resolved,
            handler,
            resolve: () => {
              this._pendingConfirmation.set(null);
              resolve();
            },
            reject: () => {
              this._pendingConfirmation.set(null);
              reject(new ActionCancelledError());
            },
          });
        });
      }

      await this.runHandler(resolved, handler);
    } catch (err) {
      ok = false;
      error = err;
      throw err;
    } finally {
      const now = Date.now();
      notifyActionSettle({
        id: dispatchId,
        name: resolved.action,
        ok,
        at: now,
        durationMs: now - dispatchedAt,
        error,
      });
    }
  }

  /** Confirm the pending confirmation dialog. */
  confirm(): void {
    untracked(this._pendingConfirmation)?.resolve();
  }

  /** Cancel the pending confirmation dialog. */
  cancel(): void {
    untracked(this._pendingConfirmation)?.reject();
  }

  /**
   * Validate every registered field and write `{ valid, errors }` to the
   * action's `statePath` (default `/formValidation`). Returns null when there
   * is no validation service to ask.
   *
   * Shared by `validateForm` and `submitForm`: the two must report the same
   * thing about the same form, and one implementation is how that stays true.
   */
  private checkForm(resolved: ResolvedAction): boolean | null {
    if (!this.validation) return null;

    const valid = this.validation.validateAll();
    const errors: Record<string, string[]> = {};
    for (const [path, fieldState] of Object.entries(
      untracked(this.validation.fieldStates),
    )) {
      if (fieldState.result && !fieldState.result.valid) {
        errors[path] = fieldState.result.errors;
      }
    }
    const statePath =
      (resolved.params?.['statePath'] as string) || '/formValidation';
    this.state.set(statePath, { valid, errors });
    return valid;
  }

  private lookupHandler(name: string): ActionHandler | undefined {
    const direct = this.handlers[name];
    if (direct) return direct;
    // Catch-all: route unknown actions to the `onAction` input when provided.
    const onAction = untracked(this.root.onAction);
    if (onAction) {
      return (params) => onAction(name, params);
    }
    return undefined;
  }

  private async runHandler(
    resolved: ResolvedAction,
    handler: ActionHandler,
  ): Promise<void> {
    this._loadingActions.set(
      new Set(untracked(this._loadingActions)).add(resolved.action),
    );
    try {
      await executeAction({
        action: resolved,
        handler,
        setState: (path, value) => this.state.set(path, value),
        navigate: untracked(this.root.navigate) ?? undefined,
        executeAction: async (binding) => {
          await this.execute(binding);
        },
      });
    } finally {
      const next = new Set(untracked(this._loadingActions));
      next.delete(resolved.action);
      this._loadingActions.set(next);
    }
  }
}

/** Inject the actions service of the nearest `<json-render>` renderer. */
export function injectActions(): JsonRenderActionsService {
  return inject(JsonRenderActionsService);
}

/**
 * Convenience helper for executing a fixed action binding, mirroring
 * `useAction` from the other renderers.
 */
export function injectAction(binding: ActionBinding): {
  execute: () => Promise<void>;
  isLoading: Signal<boolean>;
} {
  const actions = injectActions();
  return {
    execute: () => actions.execute(binding),
    isLoading: computed(() => actions.loadingActions().has(binding.action)),
  };
}
