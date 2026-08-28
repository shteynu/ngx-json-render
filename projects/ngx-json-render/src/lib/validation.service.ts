import {
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
 * Form validation state of a `<json-render>` subtree. Fields register their
 * {@link ValidationConfig}; the built-in `validateForm` action validates all
 * registered fields and writes the result to state.
 */
@Injectable()
export class JsonRenderValidationService {
  private readonly root = inject(JsonRenderRootContext);
  private readonly state = inject(JsonRenderStateService);

  private readonly _fieldStates = signal<Record<string, FieldValidationState>>(
    {},
  );
  private readonly _fieldConfigs = signal<Record<string, ValidationConfig>>({});

  /** Validation state per registered field path. */
  readonly fieldStates: Signal<Record<string, FieldValidationState>> =
    this._fieldStates.asReadonly();

  get customFunctions(): Record<string, ValidationFunction> {
    return untracked(this.root.validationFunctions) ?? {};
  }

  /** Register (or update) a field's validation config. */
  registerField(path: string, config: ValidationConfig): void {
    const prev = untracked(this._fieldConfigs);
    const existing = prev[path];
    if (existing && validationConfigEqual(existing, config)) return;
    this._fieldConfigs.set({ ...prev, [path]: config });
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

  effect(() => {
    const p = getPath();
    const c = getConfig();
    if (p && c) {
      validation.registerField(p, c);
    }
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
