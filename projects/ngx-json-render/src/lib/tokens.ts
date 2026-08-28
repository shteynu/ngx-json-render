import { InjectionToken, inject } from '@angular/core';
import type { RenderContext, RepeatScope } from './types';

/**
 * The render context of the element currently being rendered.
 * Provided by the renderer for every catalog component instance.
 */
export const RENDER_CONTEXT = new InjectionToken<RenderContext>(
  'ngx-json-render RENDER_CONTEXT',
);

/**
 * The current repeat scope. Present only for elements rendered inside a
 * `repeat` block.
 */
export const REPEAT_SCOPE = new InjectionToken<RepeatScope>(
  'ngx-json-render REPEAT_SCOPE',
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
 * Inject the current repeat scope, or `null` when the component is not
 * rendered inside a `repeat` block.
 */
export function injectRepeatScope(): RepeatScope | null {
  return inject(REPEAT_SCOPE, { optional: true });
}
