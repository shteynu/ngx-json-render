import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type StateModel, type StateStore, createStateStore } from '@json-render/core';
import { JsonRenderRootContext } from './root-context';
import {
  JsonRenderStateService,
  injectBoundProp,
  injectStateBinding,
  injectStateValue,
} from './state.service';
import type { StateChange } from './types';

/**
 * Provide the state service the way `<json-render>` does. `store` is a
 * writable signal so a test can swap modes after construction.
 */
function setup(
  options: { state?: StateModel; store?: StateStore | null } = {},
) {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      JsonRenderRootContext,
      JsonRenderStateService,
    ],
  });

  const root = TestBed.inject(JsonRenderRootContext);
  const initialState = signal<StateModel>(options.state ?? {});
  const store = signal<StateStore | null>(options.store ?? null);
  root.initialState = initialState;
  root.store = store;
  const emitted: StateChange[][] = [];
  root.emitStateChange = (changes) => emitted.push(changes);

  const state = TestBed.inject(JsonRenderStateService);
  TestBed.tick(); // run the sync + initial-state effects

  return { root, state, initialState, store, emitted };
}

describe('JsonRenderStateService — uncontrolled mode', () => {
  it('seeds the internal store from the initial state', () => {
    const { state } = setup({ state: { count: 1, user: { name: 'Ada' } } });

    expect(state.get('/count')).toBe(1);
    expect(state.get('/user/name')).toBe('Ada');
    expect(state.state()).toEqual({ count: 1, user: { name: 'Ada' } });
  });

  it('set writes through and emits the change to the host', () => {
    const { state, emitted } = setup({ state: { count: 1 } });

    state.set('/count', 2);

    expect(state.get('/count')).toBe(2);
    expect(state.state()['count']).toBe(2);
    expect(emitted).toEqual([[{ path: '/count', value: 2 }]]);
  });

  it('set of an unchanged value notifies nobody', () => {
    const { state, emitted } = setup({ state: { count: 1 } });
    const seen: StateChange[][] = [];
    state.subscribeChanges((changes) => seen.push(changes));

    state.set('/count', 1);

    expect(seen).toEqual([]);
    expect(emitted).toEqual([]);
  });

  it('update batches every changed path into one notification', () => {
    const { state, emitted } = setup({ state: { a: 1, b: 2 } });
    const seen: StateChange[][] = [];
    state.subscribeChanges((changes) => seen.push(changes));

    state.update({ '/a': 10, '/b': 2, '/c': 3 });

    expect(seen.length).toBe(1);
    // `/b` is written but unchanged, so it is not reported.
    expect(seen[0]).toEqual([
      { path: '/a', value: 10 },
      { path: '/c', value: 3 },
    ]);
    expect(emitted).toEqual(seen);
    expect(state.getSnapshot()).toEqual({ a: 10, b: 2, c: 3 });
  });

  it('subscribeChanges returns a working unsubscribe', () => {
    const { state } = setup({ state: { a: 1 } });
    const seen: StateChange[][] = [];
    const off = state.subscribeChanges((changes) => seen.push(changes));

    state.set('/a', 2);
    off();
    state.set('/a', 3);

    expect(seen.length).toBe(1);
    expect(state.get('/a')).toBe(3);
  });

  it('applies leaves added to the initial state while streaming', () => {
    const { state, initialState } = setup({ state: { title: 'Draft' } });
    // The user edits a field before the rest of `spec.state` has arrived.
    state.set('/title', 'Edited by the user');

    initialState.set({ title: 'Draft', count: 0 });
    TestBed.tick();

    // Only the leaf that actually changed between the two initial states is
    // applied; the untouched `/title` keeps the user's edit.
    expect(state.get('/count')).toBe(0);
    expect(state.get('/title')).toBe('Edited by the user');
  });

  it('applies a leaf whose value changed in the initial state', () => {
    const { state, initialState } = setup({ state: { title: 'Draft' } });

    initialState.set({ title: 'Final' });
    TestBed.tick();

    expect(state.get('/title')).toBe('Final');
  });
});

describe('JsonRenderStateService — controlled mode', () => {
  it('reads and writes through the external store', () => {
    const external = createStateStore({ count: 1 });
    const { state } = setup({ store: external });

    expect(state.get('/count')).toBe(1);

    state.set('/count', 2);

    expect(external.get('/count')).toBe(2);
  });

  it('does not emit stateChange — the host already owns the store', () => {
    const external = createStateStore({ count: 1 });
    const { state, emitted } = setup({ store: external });
    const seen: StateChange[][] = [];
    state.subscribeChanges((changes) => seen.push(changes));

    state.set('/count', 2);

    // Local watchers still fire; the renderer output stays silent.
    expect(seen).toEqual([[{ path: '/count', value: 2 }]]);
    expect(emitted).toEqual([]);
  });

  it('picks up writes made directly on the external store', () => {
    const external = createStateStore({ count: 1 });
    const { state } = setup({ store: external });

    external.set('/count', 42);

    expect(state.state()['count']).toBe(42);
    expect(state.get('/count')).toBe(42);
  });

  it('ignores the initial state input', () => {
    const external = createStateStore({ count: 1 });
    const { state } = setup({ state: { count: 99, extra: true }, store: external });

    expect(state.get('/count')).toBe(1);
    expect(state.get('/extra')).toBeUndefined();
  });

  it('warns once when the mode changes after construction', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { store } = setup({ state: { count: 1 } });

    store.set(createStateStore({ count: 7 }));
    TestBed.tick();
    store.set(createStateStore({ count: 8 }));
    TestBed.tick();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain(
      'switching from uncontrolled to controlled mode is not supported',
    );
    warn.mockRestore();
  });
});

describe('state helpers', () => {
  it('injectStateValue tracks a path reactively', () => {
    const { state } = setup({ state: { user: { name: 'Ada' } } });

    const name = TestBed.runInInjectionContext(() =>
      injectStateValue<string>('/user/name'),
    );
    expect(name()).toBe('Ada');

    state.set('/user/name', 'Grace');
    expect(name()).toBe('Grace');
  });

  it('injectStateBinding reads and writes the same path', () => {
    const { state } = setup({ state: { count: 1 } });

    const bound = TestBed.runInInjectionContext(() =>
      injectStateBinding<number>('/count'),
    );
    bound.set(5);

    expect(bound.value()).toBe(5);
    expect(state.get('/count')).toBe(5);
  });

  it('injectBoundProp writes to the bound path and no-ops when unbound', () => {
    const { state } = setup({ state: { count: 1 } });
    const path = signal<string | undefined>('/count');

    const bound = TestBed.runInInjectionContext(() =>
      injectBoundProp<number>(
        () => state.state()['count'] as number,
        () => path(),
      ),
    );
    bound.set(5);
    expect(bound.value()).toBe(5);

    path.set(undefined);
    bound.set(9);

    expect(state.get('/count')).toBe(5);
  });
});
