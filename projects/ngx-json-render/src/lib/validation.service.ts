import {
  DestroyRef,
  Injectable,
  type Signal,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import {
  type ValidationConfig,
  type ValidationFunction,
  type ValidationResult,
  runValidation,
} from '@json-render/core';
import { JsonRenderRootContext } from './root-context';
import { JsonRenderStateService } from './state.service';

export interface FieldValidationState {
  touched: boolean;
  validated: boolean;
  result: ValidationResult | null;
}

function dynamicArgsEqual(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    const va = a[key];
    const vb = b[key];
    if (va === vb) continue;
    if (
      typeof va === 'object' &&
      va !== null &&
      typeof vb === 'object' &&
      vb !== null
    ) {
      const sa = (va as Record<string, unknown>)['$state'];
      const sb = (vb as Record<string, unknown>)['$state'];
      if (typeof sa === 'string' && sa === sb) continue;
    }
    return false;
  }
  return true;
}

function validationConfigEqual(
  a: ValidationConfig,
  b: ValidationConfig,
): boolean {
  if (a === b) return true;

  if (a.validateOn !== b.validateOn) return false;

  const ac = a.checks ?? [];
  const bc = b.checks ?? [];
  if (ac.length !== bc.length) return false;

  for (let i = 0; i < ac.length; i++) {
    const ca = ac[i]!;
    const cb = bc[i]!;
    if (ca.type !== cb.type) return false;
    if (ca.message !== cb.message) return false;
    if (!dynamicArgsEqual(ca.args, cb.args)) return false;
  }

  return true;
}

/**
 * Owner of a registration made through the service's own API rather than by
 * a field component. Manual registrations release together, which is the
 * behaviour a caller of `registerField(path, config)` would expect.
 */
const MANUAL_OWNER: object = { manual: true };

/**
 * Form validation state of a `<json-render>` subtree. Fields register their
 * {@link ValidationConfig}; the built-in `validateForm` action validates all
 * registered fields and writes the result to state.
 *
 * Registrations are owner-scoped: a path stays registered while at least one
 * owner holds it, and its config and state are dropped when the last one
 * releases. A spec that swaps screens or hides fields therefore stops
 * validating what is no longer on screen.
 */
@Injectable()
export class JsonRenderValidationService {
  private readonly root = inject(JsonRenderRootContext);
  private readonly state = inject(JsonRenderStateService);

  private readonly _fieldStates = signal<Record<string, FieldValidationState>>(
    {},
  );
  private readonly _fieldConfigs = signal<Record<string, ValidationConfig>>({});
  /** Live owners per path — the reference count behind a registration. */
  private readonly fieldOwners = new Map<string, Set<object>>();

  /** Validation state per registered field path. */
  readonly fieldStates: Signal<Record<string, FieldValidationState>> =
    this._fieldStates.asReadonly();

  get customFunctions(): Record<string, ValidationFunction> {
    return untracked(this.root.validationFunctions) ?? {};
  }

  /**
   * Register (or update) a field's validation config.
   *
   * @param owner Identity holding the registration — pass the same value to
   * {@link unregisterField} to release it. Field components pass themselves,
   * so two components bound to one path each hold their own claim.
   */
  registerField(
    path: string,
    config: ValidationConfig,
    owner: object = MANUAL_OWNER,
  ): void {
    const owners = this.fieldOwners.get(path);
    if (owners) owners.add(owner);
    else this.fieldOwners.set(path, new Set([owner]));

    const prev = untracked(this._fieldConfigs);
    const existing = prev[path];
    if (existing && validationConfigEqual(existing, config)) return;
    this._fieldConfigs.set({ ...prev, [path]: config });
  }

  /**
   * Release one owner's registration of a field. The config and validation
   * state survive while another owner still holds the path; once the last
   * one lets go, `validateAll` stops seeing the field.
   */
  unregisterField(path: string, owner: object = MANUAL_OWNER): void {
    const owners = this.fieldOwners.get(path);
    if (!owners) return;
    owners.delete(owner);
    if (owners.size > 0) return;

    this.fieldOwners.delete(path);
    const prev = untracked(this._fieldConfigs);
    if (path in prev) {
      const { [path]: _removed, ...rest } = prev;
      this._fieldConfigs.set(rest);
    }
    this.clear(path);
  }

  /** Validate a single field and record the result. */
  validate(path: string, config: ValidationConfig): ValidationResult {
    const currentState = this.state.getSnapshot();
    const segments = path.split('/').filter(Boolean);
    let value: unknown = currentState;
    for (const seg of segments) {
      if (value != null && typeof value === 'object') {
        value = (value as Record<string, unknown>)[seg];
      } else {
        value = undefined;
        break;
      }
    }
    const result = runValidation(config, {
      value,
      stateModel: currentState,
      customFunctions: this.customFunctions,
    });

    const prev = untracked(this._fieldStates);
    this._fieldStates.set({
      ...prev,
      [path]: {
        touched: prev[path]?.touched ?? true,
        validated: true,
        result,
      },
    });

    return result;
  }

  /** Mark a field as touched. */
  touch(path: string): void {
    const prev = untracked(this._fieldStates);
    this._fieldStates.set({
      ...prev,
      [path]: {
        ...prev[path],
        touched: true,
        validated: prev[path]?.validated ?? false,
        result: prev[path]?.result ?? null,
      },
    });
  }

  /** Clear a field's validation state. */
  clear(path: string): void {
    const { [path]: _, ...rest } = untracked(this._fieldStates);
    this._fieldStates.set(rest);
  }

  /** Validate all registered fields. Returns whether all are valid. */
  validateAll(): boolean {
    let allValid = true;
    for (const [path, config] of Object.entries(
      untracked(this._fieldConfigs),
    )) {
      const result = this.validate(path, config);
      if (!result.valid) {
        allValid = false;
      }
    }
    return allValid;
  }
}

/** Inject the validation service of the nearest `<json-render>` renderer. */
export function injectValidation(): JsonRenderValidationService {
  return inject(JsonRenderValidationService);
}

/**
 * Field-level validation helper for catalog input components: registers the
 * config and exposes the field's validation state as signals.
 *
 * The registration follows the component: it moves when the bound path
 * changes and is released when the component is destroyed, so a field that
 * has left the screen no longer takes part in `validateForm`.
 */
export function injectFieldValidation(
  path: string | (() => string),
  config?: ValidationConfig | (() => ValidationConfig | undefined),
): {
  state: Signal<FieldValidationState>;
  validate: () => ValidationResult;
  touch: () => void;
  clear: () => void;
  errors: Signal<string[]>;
  isValid: Signal<boolean>;
} {
  const validation = injectValidation();
  const getPath = typeof path === 'function' ? path : () => path;
  const getConfig = typeof config === 'function' ? config : () => config;

  // Identity of this field's claim on a path. Two components bound to the
  // same path hold separate claims, so one being destroyed does not
  // deregister the other.
  const owner: object = {};
  let registeredPath: string | null = null;

  effect(() => {
    const p = getPath();
    const c = getConfig();
    const next = p && c ? p : null;
    if (registeredPath !== null && registeredPath !== next) {
      validation.unregisterField(registeredPath, owner);
      registeredPath = null;
    }
    if (next && c) {
      validation.registerField(next, c, owner);
      registeredPath = next;
    }
  });

  inject(DestroyRef).onDestroy(() => {
    if (registeredPath === null) return;
    validation.unregisterField(registeredPath, owner);
    registeredPath = null;
  });

  const state = computed<FieldValidationState>(() => {
    const current = validation.fieldStates()[getPath()];
    return current ?? { touched: false, validated: false, result: null };
  });

  return {
    state,
    validate: () =>
      validation.validate(getPath(), getConfig() ?? { checks: [] }),
    touch: () => validation.touch(getPath()),
    clear: () => validation.clear(getPath()),
    errors: computed(() => state().result?.errors ?? []),
    isValid: computed(() => state().result?.valid ?? true),
  };
}
