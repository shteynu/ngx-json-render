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
  applyPatch,
} from 'ngx-json-render';
import { registry } from './catalog/registry';
import { dashboardSpec } from './specs/dashboard';
import { STREAM_LINES } from './specs/stream';

type Tab = 'interactive' | 'streaming';

@Component({
  selector: 'app-root',
  imports: [JsonRenderer],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly destroyRef = inject(DestroyRef);

  readonly registry = registry;
  readonly tab = signal<Tab>('interactive');

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

  // --- Streaming demo --------------------------------------------------------

  readonly streamSpec = signal<Spec>({ root: '', elements: {} });
  readonly streamedLines = signal<string[]>([]);
  readonly playing = signal(false);
  private streamTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.stopStream());
  }

  replayStream(): void {
    this.stopStream();
    this.streamSpec.set({ root: '', elements: {} });
    this.streamedLines.set([]);
    this.playing.set(true);

    let index = 0;
    const step = () => {
      if (index >= STREAM_LINES.length) {
        this.playing.set(false);
        this.streamTimer = null;
        return;
      }
      const line = STREAM_LINES[index++];
      this.streamedLines.update((prev) => [...prev, line]);
      this.streamSpec.update((spec) => applyPatch(spec, JSON.parse(line)));
      this.streamTimer = setTimeout(step, 300);
    };
    step();
  }

  private stopStream(): void {
    if (this.streamTimer !== null) {
      clearTimeout(this.streamTimer);
      this.streamTimer = null;
    }
    this.playing.set(false);
  }
}
