import {
  EnvironmentInjector,
  createEnvironmentInjector,
  provideZonelessChangeDetection,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type {
  StateModel,
  ValidationConfig,
  ValidationFunction,
} from '@json-render/core';
import { JsonRenderRootContext } from './root-context';
import { JsonRenderStateService } from './state.service';
import {
  JsonRenderValidationService,
  injectFieldValidation,
} from './validation.service';

function setup(
  options: {
    state?: StateModel;
    validationFunctions?: Record<string, ValidationFunction>;
  } = {},
) {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      JsonRenderRootContext,
      JsonRenderStateService,
      JsonRenderValidationService,
    ],
  });

  const root = TestBed.inject(JsonRenderRootContext);
  root.initialState = signal(options.state ?? {});
  root.validationFunctions = signal(options.validationFunctions);

  TestBed.inject(JsonRenderStateService);
  const validation = TestBed.inject(JsonRenderValidationService);
  TestBed.tick();

  return { root, validation };
}

const REQUIRED: ValidationConfig = {
  checks: [{ type: 'required', message: 'Required' }],
};

describe('JsonRenderValidationService', () => {
  it('validates a field against the current state and records the result', () => {
    const { validation } = setup({ state: { email: '' } });

    const result = validation.validate('/email', REQUIRED);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(['Required']);
    expect(validation.fieldStates()['/email']).toEqual({
      touched: true,
      validated: true,
      result,
    });
  });

  it('reads nested paths', () => {
    const { validation } = setup({
      state: { user: { email: '', name: 'Ada' } },
    });

    expect(validation.validate('/user/email', REQUIRED).valid).toBe(false);
    expect(validation.validate('/user/name', REQUIRED).valid).toBe(true);
  });

  it('treats a path through a missing branch as undefined', () => {
    const { validation } = setup({ state: {} });

    expect(validation.validate('/nothing/here', REQUIRED).valid).toBe(false);
  });

  it('validateAll reports every registered field and fails if any does', () => {
    const { validation } = setup({ state: { a: 'set', b: '' } });
    validation.registerField('/a', REQUIRED);
    validation.registerField('/b', REQUIRED);

    expect(validation.validateAll()).toBe(false);
    expect(validation.fieldStates()['/a'].result?.valid).toBe(true);
    expect(validation.fieldStates()['/b'].result?.valid).toBe(false);
  });

  it('validateAll passes when every field is valid', () => {
    const { validation } = setup({ state: { a: 'set' } });
    validation.registerField('/a', REQUIRED);

    expect(validation.validateAll()).toBe(true);
  });

  it('validateAll on nothing registered is vacuously true', () => {
    const { validation } = setup();

    expect(validation.validateAll()).toBe(true);
    expect(validation.fieldStates()).toEqual({});
  });

  it('touch marks a field without validating it', () => {
    const { validation } = setup({ state: { email: '' } });

    validation.touch('/email');

    expect(validation.fieldStates()['/email']).toEqual({
      touched: true,
      validated: false,
      result: null,
    });
  });

  it('touch preserves an existing result', () => {
    const { validation } = setup({ state: { email: '' } });
    validation.validate('/email', REQUIRED);

    validation.touch('/email');

    expect(validation.fieldStates()['/email'].validated).toBe(true);
    expect(validation.fieldStates()['/email'].result?.errors).toEqual([
      'Required',
    ]);
  });

  it('clear forgets a field', () => {
    const { validation } = setup({ state: { email: '' } });
    validation.validate('/email', REQUIRED);

    validation.clear('/email');

    expect(validation.fieldStates()['/email']).toBeUndefined();
  });

  it('skips the checks when the config is disabled by a condition', () => {
    const { validation } = setup({ state: { email: '', wanted: false } });

    const result = validation.validate('/email', {
      ...REQUIRED,
      enabled: { $state: '/wanted' },
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('runs a custom validation function from the renderer input', () => {
    const evenLength: ValidationFunction = (value) =>
      typeof value === 'string' && value.length % 2 === 0;
    const { validation } = setup({
      state: { code: 'abc' },
      validationFunctions: { evenLength },
    });

    const result = validation.validate('/code', {
      checks: [{ type: 'evenLength', message: 'Needs an even length' }],
    });

    expect(result.errors).toEqual(['Needs an even length']);
  });

  it('resolves a check argument from state', () => {
    const { validation } = setup({
      state: { password: 'hunter2', repeat: 'x' },
    });

    const result = validation.validate('/repeat', {
      checks: [
        {
          type: 'equalTo',
          args: { other: { $state: '/password' } },
          message: 'Passwords must match',
        },
      ],
    });

    expect(result.errors).toEqual(['Passwords must match']);
  });
});

describe('injectFieldValidation', () => {
  it('registers the field so validateForm can see it', () => {
    const { validation } = setup({ state: { email: '' } });

    TestBed.runInInjectionContext(() =>
      injectFieldValidation('/email', REQUIRED),
    );
    TestBed.tick(); // the registering effect

    expect(validation.validateAll()).toBe(false);
  });

  it('exposes the field state as signals', () => {
    const { validation } = setup({ state: { email: '' } });

    const field = TestBed.runInInjectionContext(() =>
      injectFieldValidation('/email', REQUIRED),
    );
    TestBed.tick();

    expect(field.state().validated).toBe(false);
    expect(field.errors()).toEqual([]);
    expect(field.isValid()).toBe(true); // nothing has been checked yet

    field.validate();

    expect(field.errors()).toEqual(['Required']);
    expect(field.isValid()).toBe(false);
    expect(validation.fieldStates()['/email'].validated).toBe(true);

    field.clear();
    expect(field.state().validated).toBe(false);
  });

  it('follows a path that changes', () => {
    const { validation } = setup({ state: { a: '', b: 'set' } });
    const path = signal('/a');

    const field = TestBed.runInInjectionContext(() =>
      injectFieldValidation(() => path(), REQUIRED),
    );
    TestBed.tick();
    expect(field.validate().valid).toBe(false);

    path.set('/b');
    TestBed.tick();

    expect(field.validate().valid).toBe(true);
    // The registration moves with the path rather than piling up: the field
    // left behind stops being validated instead of failing `validateForm`
    // forever with an error that renders nowhere.
    expect(Object.keys(validation.fieldStates())).toEqual(['/b']);
    expect(validation.validateAll()).toBe(true);
  });

  it('releases the field when the component holding it is destroyed', () => {
    const { validation } = setup({ state: { a: 'set', gone: '' } });
    validation.registerField('/a', REQUIRED);

    // A field on a screen the spec is about to replace: push/pop navigation
    // and `visible` both destroy the component while the renderer lives on.
    const screen = createEnvironmentInjector(
      [],
      TestBed.inject(EnvironmentInjector),
    );
    runInInjectionContext(screen, () =>
      injectFieldValidation('/gone', REQUIRED),
    );
    TestBed.tick();

    expect(validation.validateAll()).toBe(false);

    screen.destroy();

    // Without this, a required field from a screen nobody can see keeps
    // failing validateForm, with an error that renders nowhere.
    expect(validation.validateAll()).toBe(true);
    expect(validation.fieldStates()['/gone']).toBeUndefined();
  });

  it('keeps a shared path registered until the last field lets go', () => {
    const { validation } = setup({ state: { email: '' } });
    const parent = TestBed.inject(EnvironmentInjector);

    // Two controls bound to one state path — a compact and a detailed
    // editor of the same field, say.
    const first = createEnvironmentInjector([], parent);
    const second = createEnvironmentInjector([], parent);
    runInInjectionContext(first, () =>
      injectFieldValidation('/email', REQUIRED),
    );
    runInInjectionContext(second, () =>
      injectFieldValidation('/email', REQUIRED),
    );
    TestBed.tick();

    first.destroy();

    expect(validation.validateAll()).toBe(false);

    second.destroy();

    expect(validation.validateAll()).toBe(true);
  });

  it('unregisterField drops the config and the recorded state', () => {
    const { validation } = setup({ state: { email: '' } });
    validation.registerField('/email', REQUIRED);
    validation.validate('/email', REQUIRED);

    validation.unregisterField('/email');

    expect(validation.validateAll()).toBe(true);
    expect(validation.fieldStates()).toEqual({});
  });

  it('registers nothing without a config', () => {
    const { validation } = setup({ state: { email: '' } });

    TestBed.runInInjectionContext(() => injectFieldValidation('/email'));
    TestBed.tick();

    expect(validation.validateAll()).toBe(true);
    expect(validation.fieldStates()).toEqual({});
  });

  it('marks the field touched through the returned handle', () => {
    const { validation } = setup({ state: { email: '' } });

    const field = TestBed.runInInjectionContext(() =>
      injectFieldValidation('/email', REQUIRED),
    );
    TestBed.tick();

    // This is the path a catalog field takes on blur, before anything has
    // decided whether the value is valid.
    field.touch();

    expect(field.state().touched).toBe(true);
    expect(field.state().validated).toBe(false);
    expect(field.errors()).toEqual([]);
  });

  it('validates against nothing when the field has no config', () => {
    const { validation } = setup({ state: { email: '' } });

    const field = TestBed.runInInjectionContext(() =>
      injectFieldValidation('/email'),
    );
    TestBed.tick();

    // Nothing registered it, but the field is still a control someone can
    // call validate() on; with no checks to run that is vacuously valid.
    expect(field.validate().valid).toBe(true);
    expect(validation.fieldStates()['/email'].validated).toBe(true);
  });

  it('follows a config that changes', () => {
    const { validation } = setup({ state: { email: 'not-an-email' } });
    // A catalog field passes its config as a getter over props, so this is
    // the shape the renderer actually runs with.
    const config = signal<ValidationConfig>({
      checks: [{ type: 'required', message: 'Required' }],
    });

    const field = TestBed.runInInjectionContext(() =>
      injectFieldValidation('/email', () => config()),
    );
    TestBed.tick();
    expect(field.validate().valid).toBe(true);

    config.set({
      checks: [{ type: 'email', message: 'Not an email' }],
    });
    TestBed.tick();

    expect(field.validate().valid).toBe(false);
    expect(field.errors()).toEqual(['Not an email']);
    // The re-registration has to reach validateForm too, not just the
    // field's own validate().
    expect(validation.validateAll()).toBe(false);
  });
});

describe('registerField config changes', () => {
  // registerField drops an incoming config it considers equal to the one it
  // already holds. A wrong "equal" verdict is silent — the field simply keeps
  // validating by the old rules — so each of these registers twice and then
  // asserts validateAll ran the *second* config.

  it('takes a new message for the same check', () => {
    const { validation } = setup({ state: { email: '' } });

    validation.registerField('/email', {
      checks: [{ type: 'required', message: 'Old message' }],
    });
    validation.registerField('/email', {
      checks: [{ type: 'required', message: 'New message' }],
    });

    expect(validation.validateAll()).toBe(false);
    expect(validation.fieldStates()['/email'].result?.errors).toEqual([
      'New message',
    ]);
  });

  it('takes a new check type', () => {
    const { validation } = setup({ state: { value: 'abc' } });

    validation.registerField('/value', {
      checks: [{ type: 'numeric', message: 'Not acceptable' }],
    });
    // 'abc' fails numeric but passes required: a stale config would still
    // report the field as invalid.
    validation.registerField('/value', {
      checks: [{ type: 'required', message: 'Not acceptable' }],
    });

    expect(validation.validateAll()).toBe(true);
  });

  it('takes an added check', () => {
    const { validation } = setup({ state: { email: 'not-an-email' } });

    validation.registerField('/email', {
      checks: [{ type: 'required', message: 'Required' }],
    });
    validation.registerField('/email', {
      checks: [
        { type: 'required', message: 'Required' },
        { type: 'email', message: 'Not an email' },
      ],
    });

    expect(validation.validateAll()).toBe(false);
    expect(validation.fieldStates()['/email'].result?.errors).toEqual([
      'Not an email',
    ]);
  });

  it('takes a changed check argument', () => {
    const { validation } = setup({ state: { pin: '1234' } });

    validation.registerField('/pin', {
      checks: [{ type: 'minLength', args: { min: 4 }, message: 'Too short' }],
    });
    // Only the argument moves; the type and the message are identical, so
    // nothing but dynamicArgsEqual can tell these two configs apart.
    validation.registerField('/pin', {
      checks: [{ type: 'minLength', args: { min: 6 }, message: 'Too short' }],
    });

    expect(validation.validateAll()).toBe(false);
    expect(validation.fieldStates()['/pin'].result?.errors).toEqual([
      'Too short',
    ]);
  });

  it('takes a changed state reference in a check argument', () => {
    const { validation } = setup({
      state: { password: 'secret', repeat: 'secret' },
    });

    validation.registerField('/repeat', {
      checks: [
        {
          type: 'equalTo',
          args: { other: { $state: '/password' } },
          message: 'Must match',
        },
      ],
    });
    // Same shape, different path: /missing resolves to undefined, so the
    // check that passed against /password now fails.
    validation.registerField('/repeat', {
      checks: [
        {
          type: 'equalTo',
          args: { other: { $state: '/missing' } },
          message: 'Must match',
        },
      ],
    });

    expect(validation.validateAll()).toBe(false);
  });

  it('keeps validating when the same config is registered again', () => {
    const { validation } = setup({
      state: { password: 'secret', repeat: 'nope' },
    });
    const config: ValidationConfig = {
      checks: [
        {
          type: 'equalTo',
          args: { other: { $state: '/password' } },
          message: 'Must match',
        },
      ],
    };

    validation.registerField('/repeat', config);
    validation.registerField('/repeat', config);

    expect(validation.validateAll()).toBe(false);
    expect(validation.fieldStates()['/repeat'].result?.errors).toEqual([
      'Must match',
    ]);
  });

  it('keeps validating when an equal config arrives as a fresh object', () => {
    const { validation } = setup({
      state: { password: 'secret', repeat: 'nope' },
    });
    // Props are recomputed into new objects on every pass, so a field
    // re-registers a structurally identical config constantly. That has to
    // stay a no-op rather than resetting anything.
    const build = (): ValidationConfig => ({
      validateOn: 'blur',
      checks: [
        {
          type: 'equalTo',
          args: { other: { $state: '/password' } },
          message: 'Must match',
        },
      ],
    });

    validation.registerField('/repeat', build());
    validation.registerField('/repeat', build());

    expect(validation.validateAll()).toBe(false);
    expect(validation.fieldStates()['/repeat'].result?.errors).toEqual([
      'Must match',
    ]);
  });

  it('takes a config that drops a check argument', () => {
    const { validation } = setup({ state: { repeat: 'secret' } });

    validation.registerField('/repeat', {
      checks: [
        { type: 'equalTo', args: { other: 'secret' }, message: 'Must match' },
      ],
    });
    // Losing `args` entirely leaves nothing to compare against, so the check
    // that passed must now fail.
    validation.registerField('/repeat', {
      checks: [{ type: 'equalTo', message: 'Must match' }],
    });

    expect(validation.validateAll()).toBe(false);
  });

  it('takes a config that adds a second check argument', () => {
    const { validation } = setup({ state: { size: 5 } });

    validation.registerField('/size', {
      checks: [{ type: 'max', args: { max: 3 }, message: 'Out of range' }],
    });
    // The type and the message hold still and only the argument count moves,
    // so the number of keys is the one thing that can separate these.
    validation.registerField('/size', {
      checks: [
        { type: 'max', args: { max: 9, min: 0 }, message: 'Out of range' },
      ],
    });

    expect(validation.validateAll()).toBe(true);
  });

  it('takes a changed argument that sits beside an unchanged one', () => {
    const { validation } = setup({ state: { size: 5 } });

    validation.registerField('/size', {
      checks: [
        { type: 'max', args: { min: 0, max: 3 }, message: 'Out of range' },
      ],
    });
    // `min` is identical in both and `max` is not: the comparison has to walk
    // past the first argument rather than stopping at it.
    validation.registerField('/size', {
      checks: [
        { type: 'max', args: { min: 0, max: 9 }, message: 'Out of range' },
      ],
    });

    expect(validation.validateAll()).toBe(true);
  });

  it('keeps validating when both configs share one arguments object', () => {
    const { validation } = setup({ state: { pin: '12' } });
    // Recomputed props can hand back a new check object wrapping the very
    // same nested args, which is the one case the identity shortcut covers.
    const args = { min: 4 };

    validation.registerField('/pin', {
      checks: [{ type: 'minLength', args, message: 'Too short' }],
    });
    validation.registerField('/pin', {
      checks: [{ type: 'minLength', args, message: 'Too short' }],
    });

    expect(validation.validateAll()).toBe(false);
    expect(validation.fieldStates()['/pin'].result?.errors).toEqual([
      'Too short',
    ]);
  });

  it('tells a state reference apart from a literal argument', () => {
    const { validation } = setup({
      state: { password: 'secret', repeat: 'secret' },
    });

    validation.registerField('/repeat', {
      checks: [
        {
          type: 'equalTo',
          args: { other: { $state: '/password' } },
          message: 'Must match',
        },
      ],
    });
    // An object arg and a literal arg are never equal, whatever the object
    // resolves to.
    validation.registerField('/repeat', {
      checks: [
        {
          type: 'equalTo',
          args: { other: 'something else' },
          message: 'Must match',
        },
      ],
    });

    expect(validation.validateAll()).toBe(false);
  });

  it('registers a config that has no checks at all', () => {
    const { validation } = setup({ state: { email: '' } });

    validation.registerField('/email', {});
    validation.registerField('/email', {
      checks: [{ type: 'required', message: 'Required' }],
    });

    expect(validation.validateAll()).toBe(false);
    expect(validation.fieldStates()['/email'].result?.errors).toEqual([
      'Required',
    ]);
  });

  it('takes a config that drops every check', () => {
    const { validation } = setup({ state: { email: '' } });

    validation.registerField('/email', {
      checks: [{ type: 'required', message: 'Required' }],
    });
    // Emptying the checks has to take effect, or a field goes on failing
    // against rules the spec no longer declares.
    validation.registerField('/email', {});

    expect(validation.validateAll()).toBe(true);
    expect(validation.fieldStates()['/email'].result?.errors).toEqual([]);
  });
});
