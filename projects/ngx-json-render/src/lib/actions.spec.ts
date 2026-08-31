import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ActionHandler, StateModel } from '@json-render/core';
import { JsonRenderActionsService } from './actions.service';
import { JsonRenderRootContext } from './root-context';
import { JsonRenderStateService } from './state.service';
import { JsonRenderValidationService } from './validation.service';

interface SetupOptions {
  state?: StateModel;
  handlers?: Record<string, ActionHandler>;
  onAction?: (name: string, params?: Record<string, unknown>) => unknown;
  navigate?: (path: string) => void;
}

/**
 * Provide the renderer's subtree services directly, the way `<json-render>`
 * does: the root context is wired first, then the services are created.
 */
function setup(options: SetupOptions = {}) {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      JsonRenderRootContext,
      JsonRenderStateService,
      JsonRenderValidationService,
      JsonRenderActionsService,
    ],
  });

  const root = TestBed.inject(JsonRenderRootContext);
  root.initialState = signal(options.state ?? {});
  root.handlers = signal(options.handlers);
  root.onAction = signal(options.onAction ?? null);
  root.navigate = signal(options.navigate ?? null);

  const state = TestBed.inject(JsonRenderStateService);
  const validation = TestBed.inject(JsonRenderValidationService);
  const actions = TestBed.inject(JsonRenderActionsService);
  TestBed.tick(); // let the initial state reach the store

  return { root, state, validation, actions };
}

describe('built-in actions', () => {
  it('pushState appends, resolving $state refs and $id', async () => {
    const { state, actions } = setup({
      state: { todos: [], draft: 'Buy milk' },
    });

    await actions.execute({
      action: 'pushState',
      params: {
        statePath: '/todos',
        value: { id: '$id', title: { $state: '/draft' }, done: false },
        clearStatePath: '/draft',
      },
    });

    const todos = state.get('/todos') as Record<string, unknown>[];
    expect(todos.length).toBe(1);
    expect(todos[0]['title']).toBe('Buy milk');
    expect(todos[0]['done']).toBe(false);
    expect(typeof todos[0]['id']).toBe('string');
    expect(todos[0]['id']).not.toBe('$id');
    // clearStatePath empties the field the draft came from.
    expect(state.get('/draft')).toBe('');
  });

  it('pushState gives each appended item a distinct $id', async () => {
    const { state, actions } = setup({ state: { rows: [] } });
    const push = () =>
      actions.execute({
        action: 'pushState',
        params: { statePath: '/rows', value: { id: '$id' } },
      });

    await push();
    await push();

    const rows = state.get('/rows') as Record<string, unknown>[];
    expect(rows.length).toBe(2);
    expect(rows[0]['id']).not.toBe(rows[1]['id']);
  });

  it('pushState treats a missing array as empty', async () => {
    const { state, actions } = setup();

    await actions.execute({
      action: 'pushState',
      params: { statePath: '/fresh', value: 'first' },
    });

    expect(state.get('/fresh')).toEqual(['first']);
  });

  it('removeState drops the item at the given index', async () => {
    const { state, actions } = setup({ state: { items: ['a', 'b', 'c'] } });

    await actions.execute({
      action: 'removeState',
      params: { statePath: '/items', index: 1 },
    });

    expect(state.get('/items')).toEqual(['a', 'c']);
  });

  it('push and pop move between screens through the nav stack', async () => {
    const { state, actions } = setup({ state: { currentScreen: 'home' } });

    await actions.execute({ action: 'push', params: { screen: 'details' } });
    expect(state.get('/currentScreen')).toBe('details');
    expect(state.get('/navStack')).toEqual(['home']);

    await actions.execute({ action: 'push', params: { screen: 'edit' } });
    expect(state.get('/currentScreen')).toBe('edit');
    expect(state.get('/navStack')).toEqual(['home', 'details']);

    await actions.execute({ action: 'pop' });
    expect(state.get('/currentScreen')).toBe('details');
    expect(state.get('/navStack')).toEqual(['home']);

    await actions.execute({ action: 'pop' });
    expect(state.get('/currentScreen')).toBe('home');
    expect(state.get('/navStack')).toEqual([]);
  });

  it('pop on an empty stack leaves the current screen alone', async () => {
    const { state, actions } = setup({ state: { currentScreen: 'home' } });

    await actions.execute({ action: 'pop' });

    expect(state.get('/currentScreen')).toBe('home');
  });

  it('validateForm writes the outcome of every registered field', async () => {
    const { state, validation, actions } = setup({
      state: { email: '', name: 'Ada' },
    });
    validation.registerField('/email', {
      checks: [{ type: 'required', message: 'Email is required' }],
    });
    validation.registerField('/name', {
      checks: [{ type: 'required', message: 'Name is required' }],
    });

    await actions.execute({ action: 'validateForm' });

    expect(state.get('/formValidation')).toEqual({
      valid: false,
      errors: { '/email': ['Email is required'] },
    });
  });

  it('validateForm honours a custom statePath', async () => {
    const { state, validation, actions } = setup({
      state: { email: 'a@b.co' },
    });
    validation.registerField('/email', {
      checks: [{ type: 'email', message: 'Not an email' }],
    });

    await actions.execute({
      action: 'validateForm',
      params: { statePath: '/signup/validity' },
    });

    expect(state.get('/signup/validity')).toEqual({ valid: true, errors: {} });
    expect(state.get('/formValidation')).toBeUndefined();
  });

  it('submitForm submits once every field passes', async () => {
    const submitted: unknown[] = [];
    const { state, validation, actions } = setup({
      state: { email: 'ada@example.com', draft: 'hello' },
      handlers: {
        saveUser: (params) => {
          submitted.push(params);
        },
      },
    });
    validation.registerField('/email', {
      checks: [{ type: 'email', message: 'Not an email' }],
    });

    await actions.execute({
      action: 'submitForm',
      params: {
        action: 'saveUser',
        // Nested one level down, so it needs the same deep resolution
        // pushState does — `resolveAction` only reaches the top level.
        params: { email: { $state: '/email' }, note: { $state: '/draft' } },
      },
    });

    expect(submitted).toEqual([{ email: 'ada@example.com', note: 'hello' }]);
    expect(state.get('/formValidation')).toEqual({ valid: true, errors: {} });
  });

  it('submitForm submits nothing when a field fails, and says why', async () => {
    const submitted: unknown[] = [];
    const { state, validation, actions } = setup({
      state: { email: '' },
      handlers: {
        saveUser: () => {
          submitted.push('called');
        },
      },
    });
    validation.registerField('/email', {
      checks: [{ type: 'required', message: 'Email is required' }],
    });

    await actions.execute({
      action: 'submitForm',
      params: { action: 'saveUser', statePath: '/signup/validity' },
    });

    expect(submitted).toEqual([]);
    expect(state.get('/signup/validity')).toEqual({
      valid: false,
      errors: { '/email': ['Email is required'] },
    });
    // The field is marked validated, so its message is on screen rather than
    // waiting for a blur the user has already done.
    expect(validation.fieldStates()['/email']?.validated).toBe(true);
  });

  it('submitForm asks first when the binding carries a confirm', async () => {
    const submitted: unknown[] = [];
    const { actions } = setup({
      handlers: {
        saveUser: () => {
          submitted.push('called');
        },
      },
    });

    const cancelled = actions.execute({
      action: 'submitForm',
      params: { action: 'saveUser' },
      confirm: { title: 'Send it?', message: 'This emails the customer.' },
    });
    // Validation runs before the question: no point asking about a form that
    // cannot be submitted.
    expect(actions.pendingConfirmation()?.action.action).toBe('saveUser');
    actions.cancel();
    await expect(cancelled).rejects.toThrowError('Action cancelled');
    expect(submitted).toEqual([]);

    const confirmed = actions.execute({
      action: 'submitForm',
      params: { action: 'saveUser' },
      confirm: { title: 'Send it?', message: 'This emails the customer.' },
    });
    actions.confirm();
    await confirmed;
    expect(submitted).toEqual(['called']);
  });

  it('submitForm hands onSuccess to the action it submitted', async () => {
    const routes: string[] = [];
    const { state, actions } = setup({
      handlers: { saveUser: () => undefined },
      navigate: (path) => routes.push(path),
    });

    await actions.execute({
      action: 'submitForm',
      params: { action: 'saveUser' },
      onSuccess: { navigate: '/thanks' },
    });

    expect(routes).toEqual(['/thanks']);
    expect(state.get('/formValidation')).toEqual({ valid: true, errors: {} });
  });

  it('submitForm warns when it is not told what to submit', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { actions } = setup();

    await actions.execute({ action: 'submitForm' });

    expect(warn).toHaveBeenCalledWith(
      'submitForm needs the action to submit to: { "action": "submitForm", "params": { "action": "saveUser" } }.',
    );
    warn.mockRestore();
  });
});

describe('action dispatch', () => {
  it('warns and does nothing when no handler is registered', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { actions } = setup();

    await actions.execute({ action: 'mystery' });

    expect(warn).toHaveBeenCalledWith(
      'No handler registered for action: mystery',
    );
    warn.mockRestore();
  });

  it('registerHandler adds a handler after construction', async () => {
    const { actions } = setup();
    const calls: unknown[] = [];
    actions.registerHandler('late', (params) => {
      calls.push(params);
    });

    await actions.execute({ action: 'late', params: { x: 1 } });

    expect(calls).toEqual([{ x: 1 }]);
  });

  it('a runtime handler takes precedence over a host handler', async () => {
    const order: string[] = [];
    const { actions } = setup({
      handlers: {
        save: () => {
          order.push('host');
        },
      },
    });
    actions.registerHandler('save', () => {
      order.push('runtime');
    });

    await actions.execute({ action: 'save' });

    expect(order).toEqual(['runtime']);
  });

  it('tracks an action as loading while its handler runs', async () => {
    let release!: () => void;
    const running = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { actions } = setup({ handlers: { slow: () => running } });

    const dispatched = actions.execute({ action: 'slow' });
    await Promise.resolve();
    expect(actions.loadingActions().has('slow')).toBe(true);

    release();
    await dispatched;
    expect(actions.loadingActions().has('slow')).toBe(false);
  });

  it('clears the loading flag when the handler rejects', async () => {
    const { actions } = setup({
      handlers: {
        boom: async () => {
          throw new Error('nope');
        },
      },
    });

    await expect(actions.execute({ action: 'boom' })).rejects.toThrow('nope');
    expect(actions.loadingActions().has('boom')).toBe(false);
  });
});
