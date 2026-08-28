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

  protected readonly repeatItems = computed<unknown[]>(() => {
    const basePath = this.repeatBasePath();
    if (basePath === undefined) return [];
    return (
      (getByPath(this.state.state(), basePath) as unknown[] | undefined) ?? []
    );
  });

  constructor() {
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
