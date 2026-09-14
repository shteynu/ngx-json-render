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
import type {
  ActionBinding,
  PropResolutionContext,
  UIElement,
} from '@json-render/core';
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
import {
  ELEMENT_KEY,
  REPEAT_SCOPE,
  RENDER_CONTEXT,
  RENDER_PATH,
} from './tokens';
import type { EventHandle, RenderContext, RenderPath } from './types';

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
 * Whether `inner` reads strictly deeper into state than `outer` — the state
 * path of one repeat item nested inside another's.
 *
 * `null` is the world outside any repeat, so stepping into one is always
 * progress. Below that it is a prefix test on the resolved path, and the
 * trailing separator is what keeps `/tree/10` from counting as a step inside
 * `/tree/1`.
 */
function descendsInto(outer: string | null, inner: string | null): boolean {
  if (inner === null) return false;
  if (outer === null) return true;
  return inner.startsWith(`${outer}/`);
}

/**
 * Whether this element renders itself again without getting anywhere — the
 * one arrangement that cannot terminate.
 *
 * An element reaching itself is not by itself a defect. It is how a tree gets
 * drawn — a comment thread, a file browser, a nested menu — where each pass
 * repeats over a path relative to the item it is already inside and so reads
 * one level further into the data. That ends when the data does.
 *
 * What separates the two is whether the repeat descended. Compare against the
 * nearest occurrence above: `/tree/0` then `/tree/0/children/1` is a tree
 * walking down, while `/items/0` then `/items/1` is a spec repeating over a
 * fixed array inside itself, and `/items/0` twice is one with no repeat
 * between the passes at all. Only the first can run out.
 */
function repeatsItself(path: RenderPath): boolean {
  for (let step = path.parent; step !== null; step = step.parent) {
    if (step.key !== path.key) continue;
    return !descendsInto(step.scopePath, path.scopePath);
  }
  return false;
}

/** The chain from the root down to `path`, as a line a human can follow. */
function describePath(path: RenderPath): string {
  const keys: string[] = [];
  for (let step: RenderPath | null = path; step !== null; step = step.parent) {
    keys.push(step.key);
  }
  return keys.reverse().join(' \u2192 ');
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
    @if (!refusal() && rawElement() && visible() && component()) {
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
  private readonly parentPath = inject(RENDER_PATH, { optional: true });
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

  /**
   * Where this element sits in the tree. Passed down to everything it renders
   * below itself, which is what lets each element see its own ancestry
   * without the renderer holding a registry of who is drawing what.
   */
  private readonly path = computed<RenderPath>(() => {
    const parent = this.parentPath?.() ?? null;
    return {
      key: this.elementKey(),
      depth: (parent?.depth ?? 0) + 1,
      scopePath: this.repeatScope?.basePath() ?? null,
      parent,
    };
  });

  /**
   * Why this element is not drawn, or null when it is.
   *
   * The cycle half is unconditional — not something `validate` turns on. An
   * element that renders itself without reading any deeper renders forever,
   * and a spec that never stops rendering takes the tab with it; refusing to
   * draw the repetition is the only outcome that leaves anything on screen.
   * It costs one walk up a chain of parents, bounded by `maxDepth` where one
   * is set and by the spec's own nesting where it is not.
   */
  protected readonly refusal = computed<'cycle' | 'depth' | null>(() => {
    const path = this.path();
    if (repeatsItself(path)) return 'cycle';
    const maxDepth = this.root.limits()?.maxDepth;
    if (maxDepth !== undefined && path.depth > maxDepth) return 'depth';
    return null;
  });

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
    providers: [
      { provide: RENDER_CONTEXT, useValue: this.renderCtx },
      { provide: ELEMENT_KEY, useValue: this.elementKey },
      { provide: RENDER_PATH, useValue: this.path },
    ],
    parent: inject(Injector),
  });

  constructor() {
    // Warn (once) when this element is refused. Both reasons are silent
    // failures on screen — something the spec asked for is missing — so
    // neither should be silent in the console.
    let warnedRefusal = false;
    effect(() => {
      const reason = this.refusal();
      if (!reason || warnedRefusal) return;
      warnedRefusal = true;
      const path = untracked(this.path);
      if (reason === 'cycle') {
        console.warn(
          `[ngx-json-render] Cycle in the spec: ${describePath(path)}. "${path.key}" renders itself again without reading any deeper into state${path.scopePath === null ? '' : ` (still at "${path.scopePath}")`}, so it never ends. It is not rendered again; everything above it still is. A tree that recurses needs a repeat with a relative statePath, like {"$item": "children"}.`,
        );
      } else {
        console.warn(
          `[ngx-json-render] renderLimits.maxDepth (${untracked(this.root.limits)?.maxDepth}) reached at ${describePath(path)}. "${path.key}" and anything below it do not render.`,
        );
      }
    });

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
      // A refused element does not act, not just draw nothing. `watch` is the
      // one thing an element does without being on screen, so leaving it wired
      // would let the element past `maxDepth` — or the one that closes a cycle
      // — keep dispatching actions from behind a cap that was supposed to have
      // stopped it. Reading the signal here also unwires it if the refusal
      // arrives later, when the limits change.
      if (this.refusal()) return;
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
            if (binding) await this.dispatch(binding);
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
    const binding = untracked(this.rawElement)?.on?.[eventName];
    if (binding) await this.dispatch(binding);
  }

  /**
   * Run an `on` or `watch` binding's actions in order. Params are resolved
   * per action, just before it runs, so a `$state` read in a later action of
   * the chain sees what an earlier one wrote.
   */
  private async dispatch(
    binding: ActionBinding | ActionBinding[],
  ): Promise<void> {
    for (const b of Array.isArray(binding) ? binding : [binding]) {
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
