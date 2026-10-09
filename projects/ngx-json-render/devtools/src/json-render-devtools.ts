import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  effect,
  inject,
  input,
  isDevMode,
  output,
  untracked,
} from '@angular/core';
import {
  type Catalog,
  type Spec,
  type StateStore,
  markDevtoolsActive,
  registerActionObserver,
} from '@json-render/core';
import type {
  DevtoolsEvent,
  EventStore,
  PanelHandle,
  PanelPosition,
  SpecEntry,
} from '@json-render/devtools';
import {
  type ChatUIReturn,
  type JsonRenderer,
  ɵregisterStreamObserver,
} from 'ngx-json-render';

/**
 * A floating json-render devtools panel for an Angular app — the counterpart
 * of `<JsonRenderDevtools />` in `@json-render/devtools-react`, `-vue`,
 * `-svelte` and `-solid`, with the same tabs (Spec, State, Actions, Stream,
 * Catalog) and the same element picker.
 *
 * Angular has no provider above `<json-render>` to read the renderer from, so
 * the renderer is passed in by template reference. Streams need no wiring:
 * every `injectUIStream` and `injectChatUI` generation in the app reaches the
 * Stream tab.
 *
 * Renders nothing outside dev mode, and loads the panel itself
 * (`@json-render/devtools`) with a dynamic `import()`, so a production build
 * never fetches it.
 *
 * @example
 * ```html
 * <json-render #renderer [spec]="ui.spec()" [registry]="registry" />
 * <json-render-devtools [renderer]="renderer" [catalog]="catalog" />
 * ```
 */
@Component({
  selector: 'json-render-devtools',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JsonRenderDevtools {
  /** The renderer to inspect: its spec, state store and catalog. */
  readonly renderer = input<JsonRenderer | null>(null);
  /** Spec to show instead of the renderer's. */
  readonly spec = input<Spec | null | undefined>(undefined);
  /** Catalog for the Catalog tab, if the renderer was not given one. */
  readonly catalog = input<Catalog | null | undefined>(undefined);
  /**
   * A chat from `injectChatUI`: every assistant reply with a spec becomes a
   * generation in the Spec tab's switcher.
   */
  readonly chat = input<ChatUIReturn | null>(null);
  readonly initialOpen = input(false);
  readonly position = input<PanelPosition>('bottom-right');
  /** Toggle shortcut; `false` disables it. */
  readonly hotkey = input<string | false>('mod+shift+j');
  /** Events kept in the ring buffer. Read once, at creation. */
  readonly bufferSize = input(500);
  /** Pad the page while the panel is open instead of overlaying it. */
  readonly reserveSpace = input(true);
  /** Let the viewer flip the panel between bottom and right dock. */
  readonly allowDockToggle = input(true);
  /** Every event the panel records, for an app's own logging. */
  readonly event = output<DevtoolsEvent>();

  private readonly destroyRef = inject(DestroyRef);
  private events: EventStore | null = null;
  private panel: PanelHandle | null = null;
  private destroyed = false;

  constructor() {
    if (!isDevMode()) return;

    this.destroyRef.onDestroy(() => (this.destroyed = true));
    afterNextRender(() => {
      void this.mount();
    });

    // The panel reads everything through getters, so it only needs telling
    // when to re-read: whenever the spec, the chat or the renderer changes.
    effect(() => {
      this.currentSpec();
      this.chat()?.messages();
      this.renderer();
      untracked(() => this.panel?.refresh());
    });

    // A state write becomes an event, which redraws the State tab — the
    // store has no subscribe of the shape the panel's StateStore expects.
    effect((onCleanup) => {
      const store = this.renderer()?.stateStore;
      if (!store) return;
      onCleanup(
        store.subscribeChanges((changes) => {
          for (const change of changes) {
            this.events?.push({
              kind: 'state-set',
              at: Date.now(),
              path: change.path,
              prev: undefined,
              next: change.value,
            });
          }
        }),
      );
    });
  }

  private currentSpec(): Spec | null {
    const override = this.spec();
    if (override !== undefined) return override;
    const chat = this.chat();
    if (chat) {
      const replies = chat.messages().filter((m) => m.spec);
      return replies.at(-1)?.spec ?? null;
    }
    return this.renderer()?.spec() ?? null;
  }

  private currentCatalog(): Catalog | null {
    const own = this.catalog();
    if (own !== undefined) return own;
    // The renderer's catalog input is typed structurally; a catalog made with
    // `schema.createCatalog` is a core Catalog, which is what the tab reads.
    const fromRenderer = this.renderer()?.catalog();
    return fromRenderer && 'data' in fromRenderer
      ? (fromRenderer as unknown as Catalog)
      : null;
  }

  private generations(): SpecEntry[] {
    const chat = this.chat();
    if (!chat) {
      const spec = this.currentSpec();
      return spec ? [{ id: 'current', label: 'Current', spec }] : [];
    }
    return chat
      .messages()
      .filter((m) => m.role === 'assistant' && m.spec)
      .map((m, i) => ({
        id: m.id,
        label: `Generation ${i + 1}`,
        spec: m.spec as Spec,
      }));
  }

  private stateStore(): StateStore | null {
    const store = this.renderer()?.stateStore;
    if (!store) return null;
    return {
      get: (path) => store.get(path),
      set: (path, value) => store.set(path, value),
      update: (updates) => store.update(updates),
      getSnapshot: () => store.getSnapshot(),
      subscribe: () => () => {},
    };
  }

  private async mount(): Promise<void> {
    // A production build defines `ngDevMode` as false, so the bundler drops
    // the import below: nothing references the panel chunk, even if esbuild
    // still writes it to disk.
    if (typeof ngDevMode !== 'undefined' && !ngDevMode) return;
    const devtools = await import('@json-render/devtools');
    if (this.destroyed) return;

    const events = devtools.createEventStore({
      bufferSize: this.bufferSize(),
    });
    this.events = events;

    const unsubscribeEvents = events.subscribe(() => {
      const last = events.snapshot().at(-1);
      if (last) this.event.emit(last);
    });

    // Both observers come from the app's own `@json-render/core` and
    // `ngx-json-render`, never through `@json-render/devtools`: the registries
    // are module singletons, and devtools may carry a nested copy of core.
    const unsubscribeActions = registerActionObserver({
      onDispatch: (e) =>
        events.push({
          kind: 'action-dispatched',
          at: e.at,
          id: e.id,
          name: e.name,
          params: e.params,
        }),
      onSettle: (e) =>
        events.push({
          kind: 'action-settled',
          at: e.at,
          id: e.id,
          ok: e.ok,
          durationMs: e.durationMs,
          result: e.result,
          error: e.error !== undefined ? String(e.error) : undefined,
        }),
    });

    const unsubscribeStreams = ɵregisterStreamObserver({
      onStart: () =>
        events.push({
          kind: 'stream-lifecycle',
          at: Date.now(),
          phase: 'start',
        }),
      onPatch: (patch) =>
        events.push({
          kind: 'stream-patch',
          at: Date.now(),
          patch,
          source: 'json',
        }),
      onText: (text) =>
        events.push({ kind: 'stream-text', at: Date.now(), text }),
      onUsage: (usage) => devtools.recordUsage(events, usage),
      onEnd: (ok) =>
        events.push({
          kind: 'stream-lifecycle',
          at: Date.now(),
          phase: 'end',
          ok,
        }),
    });

    const selection = devtools.createSelectionBus();
    this.panel = devtools.createPanel({
      context: {
        events,
        getSpec: () => this.currentSpec(),
        getSpecs: () => this.generations(),
        getCatalog: () => this.currentCatalog(),
        getStateStore: () => this.stateStore(),
        startPicker: (options) => devtools.startPicker(options),
        selection,
        activateTab: () => {},
      },
      tabs: [
        devtools.specTab(),
        devtools.stateTab(),
        devtools.actionsTab(),
        devtools.streamTab(),
        devtools.catalogTab(),
      ],
      initialOpen: this.initialOpen(),
      position: this.position(),
      hotkey: this.hotkey(),
      reserveSpace: this.reserveSpace(),
      allowDockToggle: this.allowDockToggle(),
    });

    const unsubscribeSelection = selection.subscribe((key) => {
      if (key) devtools.highlightElement(key);
    });
    // Makes every renderer wrap its elements in `data-jr-key` spans, which is
    // what the picker and the highlight look for.
    const releaseActive = markDevtoolsActive();

    this.destroyRef.onDestroy(() => {
      releaseActive();
      unsubscribeSelection();
      this.panel?.destroy();
      this.panel = null;
      unsubscribeStreams();
      unsubscribeActions();
      unsubscribeEvents();
      this.events = null;
    });
  }
}
