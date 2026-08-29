import { provideZonelessChangeDetection, signal } from '@angular/core';
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
    expect(Object.keys(validation.fieldStates()).sort()).toEqual(['/a', '/b']);
  });

  it('registers nothing without a config', () => {
    const { validation } = setup({ state: { email: '' } });

    TestBed.runInInjectionContext(() => injectFieldValidation('/email'));
    TestBed.tick();

    expect(validation.validateAll()).toBe(true);
    expect(validation.fieldStates()).toEqual({});
  });
});
