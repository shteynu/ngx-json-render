import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import {
  getByPath,
  resolveRepeatItemStatePath,
  resolveRepeatStatePath,
} from '@json-render/core';
import { JrElement } from './element.component';
import { JrRepeatScope } from './repeat-scope.component';
import { JsonRenderRootContext } from './root-context';
import { JsonRenderStateService } from './state.service';
import { REPEAT_SCOPE, injectRenderContext } from './tokens';

/**
 * Renders the children of the current element. Place it inside a catalog
 * component's template where nested content should appear — like a
 * `<router-outlet>` for the spec tree.
 *
 * - Default (no `slot`): renders `element.children`, honoring the element's
 *   `repeat` field (one pass per item of the referenced state array, with the
 *   proper repeat scope for `$item` / `$index` / `$bindItem` expressions).
 * - With `slot`: renders the element keys of `element.slots[slot]`.
 *
 * @example
 * ```html
 * <div class="card">
 *   <h3>{{ ctx.props().title }}</h3>
 *   <jr-children />
 * </div>
 * ```
 */
@Component({
  selector: 'jr-children',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [JrElement, JrRepeatScope],
  styles: `:host { display: contents; }`,
  template: `
    @if (repeat()) {
      @for (item of repeatItems(); track trackItem($index, item)) {
        <jr-repeat-scope
          [item]="item"
          [index]="$index"
          [basePath]="itemPath($index)"
        >
          @for (key of childKeys(); track key) {
            <jr-element [elementKey]="key" />
          }
        </jr-repeat-scope>
      }
    } @else {
      @for (key of childKeys(); track key) {
        <jr-element [elementKey]="key" />
      }
    }
  `,
})
export class JrChildren {
  /** Named slot to render instead of the default children. */
  readonly slot = input<string | null>(null);

  private readonly ctx = injectRenderContext();
  private readonly root = inject(JsonRenderRootContext);
  private readonly state = inject(JsonRenderStateService);
  // The repeat scope enclosing the host element (scopes created by this
  // element's own repeat live below, in the template).
  private readonly parentScope = inject(REPEAT_SCOPE, { optional: true });

  protected readonly childKeys = computed<string[]>(() => {
    const el = this.ctx.element();
    if (!el) return [];
    const slot = this.slot();
    if (slot) return el.slots?.[slot] ?? [];
    return el.children ?? [];
  });

  protected readonly repeat = computed(() => {
    if (this.slot()) return undefined;
    return this.ctx.element()?.repeat;
  });

  private readonly repeatBasePath = computed<string | undefined>(() => {
    const rep = this.repeat();
    if (!rep) return undefined;
    const resolved = resolveRepeatStatePath(
      rep.statePath,
      this.parentScope?.basePath(),
    );
    if (resolved === undefined) {
      console.warn(
        '[ngx-json-render] $item in repeat.statePath used outside of a repeat scope',
      );
    }
    return resolved;
  });

  /** Every item the repeat's state array holds, before any cap. */
  private readonly allRepeatItems = computed<unknown[]>(() => {
    const basePath = this.repeatBasePath();
    if (basePath === undefined) return [];
    return (
      (getByPath(this.state.state(), basePath) as unknown[] | undefined) ?? []
    );
  });

  /**
   * The items this repeat actually renders.
   *
   * `repeat` iterates a state array the spec may itself have supplied, which
   * is the one place a spec sizes the render tree out of data rather than out
   * of its own structure — so the cap has to be applied here, as it expands,
   * rather than anywhere a spec can be inspected up front.
   */
  protected readonly repeatItems = computed<unknown[]>(() => {
    const items = this.allRepeatItems();
    const max = this.root.limits()?.maxRepeatItems;
    return max !== undefined && items.length > max
      ? items.slice(0, max)
      : items;
  });

  constructor() {
    // Warn (once) when the cap holds items back. Reading the count only after
    // the two cheap guards keeps the effect from tracking the state array at
    // all once there is nothing left to say.
    let warnedRepeatCap = false;
    effect(() => {
      const max = this.root.limits()?.maxRepeatItems;
      if (max === undefined || warnedRepeatCap) return;
      const total = this.allRepeatItems().length;
      if (total <= max) return;
      warnedRepeatCap = true;
      console.warn(
        `[ngx-json-render] renderLimits.maxRepeatItems (${max}) reached: "${untracked(this.repeatBasePath)}" holds ${total} items, so ${total - max} of them do not render.`,
      );
    });

    // Warn (once per key) about children referencing missing elements.
    const warned = new Set<string>();
    effect(() => {
      if (this.root.loading()) return;
      const spec = this.root.spec();
      if (!spec) return;
      for (const key of this.childKeys()) {
        if (!spec.elements?.[key] && !warned.has(key)) {
          warned.add(key);
          console.warn(
            `[json-render] Missing element "${key}" referenced as child of "${untracked(this.ctx.element)?.type}". This element will not render.`,
          );
        }
      }
    });
  }

  protected itemPath(index: number): string {
    return resolveRepeatItemStatePath(this.repeatBasePath()!, index);
  }

  protected trackItem(index: number, item: unknown): unknown {
    const rep = untracked(this.repeat);
    if (rep?.key && typeof item === 'object' && item !== null) {
      return (item as Record<string, unknown>)[rep.key] ?? index;
    }
    return index;
  }
}
