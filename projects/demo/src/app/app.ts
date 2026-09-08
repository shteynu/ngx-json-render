import { Component, computed, signal } from '@angular/core';
import type {
  ActionHandler,
  JsonRenderStateService,
  Spec,
  StateChange,
} from 'ngx-json-render';
import { ChatTab } from './chat/chat';
import { InteractiveTab } from './interactive/interactive';
import { KeyPanel } from './live/key-panel';
import { Playground } from './playground/playground';
import { StreamTab } from './streaming/streaming';
import { dashboardSpec } from './specs/dashboard';

type Tab = 'playground' | 'interactive' | 'streaming' | 'chat';

@Component({
  selector: 'app-root',
  imports: [ChatTab, InteractiveTab, KeyPanel, Playground, StreamTab],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly tab = signal<Tab>('playground');

  // --- Interactive demo ------------------------------------------------------

  readonly spec = signal<Spec>(dashboardSpec);
  readonly log = signal<string[]>([]);

  /**
   * The store of the interactive tab's renderer, once that tab is on screen.
   * It arrives from the child rather than through a `viewChild` here: naming
   * `JsonRenderer` in this component would pull the library into the initial
   * bundle, which is the whole thing the `@defer` blocks below avoid.
   */
  private readonly store = signal<JsonRenderStateService | null>(null);

  readonly specJson = computed(() => JSON.stringify(this.spec(), null, 2));

  onRendererReady(store: JsonRenderStateService): void {
    this.store.set(store);
  }

  readonly handlers: Record<string, ActionHandler> = {
    increment: (params) => {
      const store = this.store();
      if (!store) return;
      const path = String(params['statePath'] ?? '/count');
      const by = Number(params['by'] ?? 1);
      store.set(path, Number(store.get(path) ?? 0) + by);
    },
    decrement: (params) => {
      const store = this.store();
      if (!store) return;
      const path = String(params['statePath'] ?? '/count');
      const by = Number(params['by'] ?? 1);
      const min = params['min'] == null ? -Infinity : Number(params['min']);
      store.set(path, Math.max(min, Number(store.get(path) ?? 0) - by));
    },
    syncTodoCount: () => {
      const store = this.store();
      if (!store) return;
      const todos = (store.get('/todos') as unknown[] | undefined) ?? [];
      store.set('/todoCount', todos.length);
    },
    clearTodos: () => {
      const store = this.store();
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
