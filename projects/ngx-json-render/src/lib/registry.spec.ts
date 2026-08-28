import { Component } from '@angular/core';
import { createStateStore } from '@json-render/core';
import { z } from 'zod';
import { createStoreSetState, defineRegistry } from './registry';
import { schema } from './schema';
import type { RegistryEntry } from './types';

@Component({ template: '' })
class TCard {}

@Component({ template: '' })
class TButton {}

const catalog = schema.createCatalog({
  components: {
    Card: {
      props: z.object({ title: z.string().optional() }),
      slots: ['header'],
      description: 'A card',
    },
    Button: {
      props: z.object({ label: z.string() }),
      slots: [],
      description: 'A button',
    },
  },
  actions: {
    refresh: {
      params: z.object({ hard: z.boolean().optional() }),
      description: 'Refresh data',
    },
  },
});

describe('defineRegistry', () => {
  it('builds a registry with slot metadata from the catalog', () => {
    const { registry } = defineRegistry(catalog, {
      components: { Card: TCard, Button: TButton },
      actions: { refresh: async () => {} },
    });

    expect((registry['Card'] as RegistryEntry).component).toBe(TCard);
    expect((registry['Card'] as RegistryEntry).slots).toEqual(['header']);
    expect((registry['Button'] as RegistryEntry).component).toBe(TButton);
  });

  it('wires handlers through to catalog actions with live state', async () => {
    const calls: unknown[] = [];
    const { handlers } = defineRegistry(catalog, {
      components: { Card: TCard, Button: TButton },
      actions: {
        refresh: async (params, setState, state) => {
          calls.push([params, state]);
          setState((prev) => ({ ...prev, refreshed: true }));
        },
      },
    });

    let state: Record<string, unknown> = { refreshed: false };
    const setState = (
      updater: (prev: Record<string, unknown>) => Record<string, unknown>,
    ) => {
      state = updater(state);
    };

    const bound = handlers(
      () => setState,
      () => state,
    );
    await bound['refresh']({ hard: true });

    expect(calls).toEqual([[{ hard: true }, { refreshed: false }]]);
    expect(state['refreshed']).toBe(true);
  });

  it('executeAction runs a named action and warns on unknown ones', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { executeAction } = defineRegistry(catalog, {
      components: { Card: TCard, Button: TButton },
      actions: { refresh: async () => {} },
    });

    await executeAction('refresh', undefined, () => {});
    await executeAction('missing', undefined, () => {});
    expect(warn).toHaveBeenCalledWith('Unknown action: missing');
    warn.mockRestore();
  });
});

describe('createStoreSetState', () => {
  it('applies whole-state updates as fine-grained path writes', () => {
    const store = createStateStore({ user: { name: 'Ada' }, count: 1 });
    const setState = createStoreSetState(store);

    setState((prev) => ({ ...prev, count: 2 }));
    expect(store.get('/count')).toBe(2);
    expect(store.get('/user/name')).toBe('Ada');

    setState((prev) => {
      const { count: _, ...rest } = prev;
      return { ...rest, user: { name: 'Grace' } };
    });
    expect(store.get('/user/name')).toBe('Grace');
    expect(store.get('/count')).toBeUndefined();
  });
});
