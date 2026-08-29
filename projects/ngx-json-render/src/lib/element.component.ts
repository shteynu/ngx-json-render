import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  type Signal,
  computed,
  effect,
  inject,
  input,
  isDevMode,
  untracked,
} from '@angular/core';
import type { PropResolutionContext, UIElement } from '@json-render/core';
import {
  evaluateVisibility,
  resolveActionParam,
  resolveBindings,
  resolveElementProps,
} from '@json-render/core';
import { JsonRenderActionsService, isActionCancelled } from './actions.service';
import { injectDevtoolsActive } from './devtools';
import { JsonRenderRootContext } from './root-context';
import { JsonRenderStateService } from './state.service';
import { REPEAT_SCOPE, RENDER_CONTEXT } from './tokens';
import type { EventHandle, RenderContext } from './types';

const warnedSlots = new Set<string>();

/**
 * Report a failure from a fire-and-forget action dispatch. Cancelling a
 * confirmation dialog is a normal outcome, not an error, so it stays silent.
 */
function reportActionError(error: unknown): void {
  if (isActionCancelled(error)) return;
  console.error(error);
}

/**
 * Renders a single spec element: evaluates visibility, resolves prop
 * expressions against the state model, wires event/watch bindings, and
 * instantiates the catalog component with a {@link RenderContext} injector.
 *
 * @internal Used by `<json-render>` and `<jr-children>`.
 */
@Component({
  selector: 'jr-element',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  styles: `:host { display: contents; }`,
  template: `
    @if (rawElement() && visible() && component()) {
      @if (devtoolsKey(); as dk) {
        <span [attr.data-jr-key]="dk" style="display: contents">
          <ng-container *ngComponentOutlet="component(); injector: outletInjector" />
        </span>
      } @else {
        <ng-container *ngComponentOutlet="component(); injector: outletInjector" />
      }
    }
  `,
})
export class JrElement {
  readonly elementKey = input.required<string>();

  private readonly root = inject(JsonRenderRootContext);
  private readonly state = inject(JsonRenderStateService);
  private readonly actions = inject(JsonRenderActionsService);
  private readonly repeatScope = inject(REPEAT_SCOPE, { optional: true });
  private readonly devtoolsActive = injectDevtoolsActive();

  /** The raw (unresolved) element from the spec. */
  readonly rawElement = computed<UIElement | undefined>(
    () => this.root.spec()?.elements?.[this.elementKey()],
  );

  /** Prop/visibility resolution context (state + repeat scope + extensions). */
  private readonly resolutionCtx = computed<PropResolutionContext>(() => {
    const scope = this.repeatScope;
    return {
      stateModel: this.state.state(),
      ...(scope
        ? {
            repeatItem: scope.item(),
            repeatIndex: scope.index(),
            repeatBasePath: scope.basePath(),
          }
        : {}),
      functions: this.root.functions() ?? {},
      directives: this.root.directiveRegistry(),
    };
  });

  protected readonly visible = computed(() => {
    const el = this.rawElement();
    if (!el || el.visible === undefined) return true;
    return evaluateVisibility(el.visible, this.resolutionCtx());
  });

  /** The element with all prop expressions resolved. */
  readonly resolvedElement = computed<UIElement | undefined>(() => {
    const el = this.rawElement();
    if (!el) return undefined;
    return {
      ...el,
      props: resolveElementProps(el.props ?? {}, this.resolutionCtx()),
    };
  });

  /** Two-way binding paths ($bindState / $bindItem) by prop name. */
  readonly bindings = computed<Record<string, string> | undefined>(() => {
    const el = this.rawElement();
    return el
      ? resolveBindings(el.props ?? {}, this.resolutionCtx())
      : undefined;
  });

  private readonly entry = computed(() => {
    const el = this.rawElement();
    return el ? this.root.resolveEntry(el.type) : undefined;
  });

  protected readonly component = computed(
    () => this.entry()?.component ?? null,
  );

  protected readonly devtoolsKey = computed(() =>
    this.devtoolsActive() ? this.elementKey() : null,
  );

  private readonly renderCtx: RenderContext = {
    element: this.resolvedElement as Signal<UIElement>,
    props: computed(() => this.resolvedElement()?.props ?? {}),
    emit: (event) => this.fireEvent(event),
    on: (event) => this.eventHandle(event),
    bindings: this.bindings,
    loading: computed(() => this.root.loading()),
    setBound: (prop, value) => {
      const path = untracked(this.bindings)?.[prop];
      if (path) {
        this.state.set(path, value);
      } else if (isDevMode()) {
        console.warn(
          `[ngx-json-render] setBound("${prop}"): prop has no $bindState/$bindItem binding`,
        );
      }
    },
  };

  protected readonly outletInjector = Injector.create({
    providers: [{ provide: RENDER_CONTEXT, useValue: this.renderCtx }],
    parent: inject(Injector),
  });

  constructor() {
    // Warn (once per type) about unknown component types.
    const warnedTypes = new Set<string>();
    effect(() => {
      const el = this.rawElement();
      if (!el || this.entry() || warnedTypes.has(el.type)) return;
      warnedTypes.add(el.type);
      console.warn(`No renderer for component type: ${el.type}`);
    });

    // Warn about unknown / default slots when the registry carries metadata.
    effect(() => {
      const el = this.rawElement();
      const meta = this.entry();
      if (!el?.slots || !meta?.slots) return;
      const available = new Set(meta.slots);
      for (const slotName of Object.keys(el.slots)) {
        const warnKey = `${el.type}:${slotName}`;
        if (warnedSlots.has(warnKey)) continue;
        if (slotName === 'default') {
          warnedSlots.add(warnKey);
          console.warn(
            `[json-render] Component "${el.type}" uses slots.default. Use "children" for default slot content.`,
          );
        } else if (!available.has(slotName)) {
          warnedSlots.add(warnKey);
          console.warn(
            `[json-render] Unknown slot "${slotName}" on component "${el.type}". Available slots: ${meta.slots.join(', ')}`,
          );
        }
      }
    });

    // Watch effect: fire actions when watched state paths change.
    effect((onCleanup) => {
      const watchConfig = this.rawElement()?.watch;
      if (!watchConfig) return;
      const paths = Object.keys(watchConfig);
      if (paths.length === 0) return;

      const unsubscribe = this.state.subscribeChanges((changes) => {
        const changedPaths = new Set(changes.map((change) => change.path));

        void (async () => {
          for (const path of paths) {
            if (!changedPaths.has(path)) continue;

            const binding = watchConfig[path];
            if (!binding) continue;
            const bindings = Array.isArray(binding) ? binding : [binding];

            for (const b of bindings) {
              if (!b.params) {
                await this.actions.execute(b);
                continue;
              }
              const liveCtx = this.liveResolutionCtx();
              const resolved: Record<string, unknown> = {};
              for (const [key, val] of Object.entries(b.params)) {
                resolved[key] = resolveActionParam(val, liveCtx);
              }
              await this.actions.execute({ ...b, params: resolved });
            }
          }
        })().catch(reportActionError);
      });

      onCleanup(unsubscribe);
    });
  }

  /**
   * Resolution context with a live state snapshot, so `$state` references in
   * later actions of a chain see mutations from earlier ones.
   */
  private liveResolutionCtx(): PropResolutionContext {
    return {
      ...untracked(this.resolutionCtx),
      stateModel: this.state.getSnapshot(),
    };
  }

  /**
   * Fire-and-forget entry point for event emission: dispatching is async, but
   * a template listener has nowhere to await it, so the failure must be
   * handled here rather than escaping as an unhandled rejection.
   */
  private fireEvent(eventName: string): void {
    this.emitEvent(eventName).catch(reportActionError);
  }

  private async emitEvent(eventName: string): Promise<void> {
    const el = untracked(this.rawElement);
    const binding = el?.on?.[eventName];
    if (!binding) return;
    const actionBindings = Array.isArray(binding) ? binding : [binding];
    for (const b of actionBindings) {
      if (!b.params) {
        await this.actions.execute(b);
        continue;
      }
      const liveCtx = this.liveResolutionCtx();
      const resolved: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(b.params)) {
        resolved[key] = resolveActionParam(val, liveCtx);
      }
      await this.actions.execute({ ...b, params: resolved });
    }
  }

  private eventHandle(eventName: string): EventHandle {
    const el = this.rawElement();
    const binding = el?.on?.[eventName];
    if (!binding) {
      return { emit: () => {}, shouldPreventDefault: false, bound: false };
    }
    const actionBindings = Array.isArray(binding) ? binding : [binding];
    return {
      emit: () => this.fireEvent(eventName),
      shouldPreventDefault: actionBindings.some((b) => b.preventDefault),
      bound: true,
    };
  }
}
