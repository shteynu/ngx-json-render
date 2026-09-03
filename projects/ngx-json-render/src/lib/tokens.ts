import { InjectionToken, type Signal, inject } from '@angular/core';
import type { RenderContext, RenderPath, RepeatScope } from './types';

/**
 * The render context of the element currently being rendered.
 * Provided by the renderer for every catalog component instance.
 */
export const RENDER_CONTEXT = new InjectionToken<RenderContext>(
  'ngx-json-render RENDER_CONTEXT',
);

/**
 * The spec key of the element currently being rendered. Provided alongside
 * {@link RENDER_CONTEXT} for every catalog component instance.
 */
export const ELEMENT_KEY = new InjectionToken<Signal<string>>(
  'ngx-json-render ELEMENT_KEY',
);

/**
 * The current repeat scope. Present only for elements rendered inside a
 * `repeat` block.
 */
export const REPEAT_SCOPE = new InjectionToken<RepeatScope>(
  'ngx-json-render REPEAT_SCOPE',
);

/**
 * This element's position in the render tree. Provided by `<jr-element>` for
 * everything it renders below itself, so each element can see its own depth
 * and its own ancestry.
 *
 * @internal Not part of the public API: it exists so the renderer can refuse
 * to draw an element that is its own ancestor, and to enforce
 * `renderLimits.maxDepth`.
 */
export const RENDER_PATH = new InjectionToken<Signal<RenderPath>>(
  'ngx-json-render RENDER_PATH',
);

/**
 * Inject the render context inside a catalog component.
 *
 * @example
 * ```ts
 * @Component({
 *   selector: 'app-button',
 *   template: `<button (click)="ctx.emit('press')">{{ ctx.props().label }}</button>`,
 * })
 * export class ButtonComponent {
 *   readonly ctx = injectRenderContext<{ label: string }>();
 * }
 * ```
 */
export function injectRenderContext<
  P = Record<string, unknown>,
>(): RenderContext<P> {
  const ctx = inject(RENDER_CONTEXT, { optional: true });
  if (!ctx) {
    throw new Error(
      'injectRenderContext() must be used inside a component rendered by <json-render>',
    );
  }
  return ctx as RenderContext<P>;
}

/**
 * Inject the spec key of the element this component renders.
 *
 * Catalog components that collect their children — a tab group discovering
 * its tabs, for instance — need it to order registrations by the spec's
 * `children` array rather than by the order the children happened to
 * announce themselves in.
 *
 * @example
 * ```ts
 * const key = injectElementKey();
 * const index = computed(() => parent.element().children?.indexOf(key()) ?? -1);
 * ```
 */
export function injectElementKey(): Signal<string> {
  const key = inject(ELEMENT_KEY, { optional: true });
  if (!key) {
    throw new Error(
      'injectElementKey() must be used inside a component rendered by <json-render>',
    );
  }
  return key;
}

/**
 * Inject the current repeat scope, or `null` when the component is not
 * rendered inside a `repeat` block.
 */
export function injectRepeatScope(): RepeatScope | null {
  return inject(REPEAT_SCOPE, { optional: true });
}
