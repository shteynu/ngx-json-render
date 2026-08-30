import {
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  type ActionHandler,
  JsonRenderer,
  type Spec,
  type StateChange,
} from 'ngx-json-render';
import { registry } from './catalog/registry';
import { Playground } from './playground/playground';
import { StreamTab } from './streaming/streaming';
import { dashboardSpec } from './specs/dashboard';

type Tab = 'playground' | 'interactive' | 'streaming';

@Component({
  selector: 'app-root',
  imports: [JsonRenderer, Playground, StreamTab],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly registry = registry;
  readonly tab = signal<Tab>('playground');

  // --- Interactive demo ------------------------------------------------------

  readonly spec = signal<Spec>(dashboardSpec);
  readonly log = signal<string[]>([]);

  private readonly renderer = viewChild<JsonRenderer>('interactive');

  readonly specJson = computed(() => JSON.stringify(this.spec(), null, 2));

  readonly handlers: Record<string, ActionHandler> = {
    increment: (params) => {
      const store = this.renderer()?.stateStore;
      if (!store) return;
      const path = String(params['statePath'] ?? '/count');
      const by = Number(params['by'] ?? 1);
      store.set(path, Number(store.get(path) ?? 0) + by);
    },
    decrement: (params) => {
      const store = this.renderer()?.stateStore;
      if (!store) return;
      const path = String(params['statePath'] ?? '/count');
      const by = Number(params['by'] ?? 1);
      const min = params['min'] == null ? -Infinity : Number(params['min']);
      store.set(path, Math.max(min, Number(store.get(path) ?? 0) - by));
    },
    syncTodoCount: () => {
      const store = this.renderer()?.stateStore;
      if (!store) return;
      const todos = (store.get('/todos') as unknown[] | undefined) ?? [];
      store.set('/todoCount', todos.length);
    },
    clearTodos: () => {
      const store = this.renderer()?.stateStore;
      store?.set('/todos', []);
      this.pushLog('action clearTodos');
    },
  };

  readonly onUnknownAction = (
    name: string,
    params?: Record<string, unknown>,
  ): void => {
    this.pushLog(`onAction ${name}(${JSON.stringify(params ?? {})})`);
  };

  onStateChange(changes: StateChange[]): void {
    for (const change of changes) {
      this.pushLog(`state ${change.path} ← ${JSON.stringify(change.value)}`);
    }
  }

  private pushLog(entry: string): void {
    this.log.update((prev) => [entry, ...prev].slice(0, 14));
  }
}
