import {
  InjectionToken,
  type Provider,
  type Type,
  inject,
} from '@angular/core';
import type {
  ActionHandler,
  ComputedFunction,
  DirectiveDefinition,
  ValidationFunction,
} from '@json-render/core';
import type { RenderLimits, SpecCatalog } from './render-limits';
import type { SpecValidationMode } from './spec-validation';
import type { ComponentRegistry, RegistryEntry } from './types';

/**
 * Renderer defaults for every `<json-render>` below a provider: each field is
 * the input of the same name.
 *
 * An input bound on the element wins over the provided value, and a value
 * left `null` or `undefined` on the element falls through to it. Named
 * vocabularies — `handlers`, `functions`, `validationFunctions` and
 * `directives` — merge by name instead, the element's entry winning a name
 * both define. Everything else replaces: a `registry` belongs to its catalog,
 * so two are never mixed behind your back (spread them yourself to combine).
 */
export interface JsonRenderConfig {
  registry?: ComponentRegistry;
  fallback?: Type<unknown> | RegistryEntry | null;
  validate?: SpecValidationMode;
  renderLimits?: RenderLimits | null;
  catalog?: SpecCatalog | null;
  handlers?: Record<string, ActionHandler>;
  onAction?:
    ((name: string, params?: Record<string, unknown>) => unknown) | null;
  navigate?: ((path: string) => void) | null;
  validationFunctions?: Record<string, ValidationFunction>;
  functions?: Record<string, ComputedFunction>;
  directives?: DirectiveDefinition<any>[];
}

/**
 * The defaults the nearest {@link provideJsonRender} supplies, already merged
 * with any provider above it.
 */
export const JSON_RENDER_CONFIG = new InjectionToken<JsonRenderConfig>(
  'JSON_RENDER_CONFIG',
);

/**
 * Set renderer defaults once instead of on every `<json-render>`:
 *
 * ```ts
 * bootstrapApplication(App, { providers: [provideJsonRender({ registry })] });
 * ```
 *
 * ```html
 * <json-render [spec]="m.spec" />
 * ```
 *
 * Pass a function to build the defaults with `inject()`, for handlers that
 * call your services:
 *
 * ```ts
 * provideJsonRender(() => {
 *   const orders = inject(OrderService);
 *   return { registry, handlers: { cancelOrder: (p) => orders.cancel(p['id']) } };
 * });
 * ```
 *
 * Works in application, route and component `providers`. A provider below
 * another extends it with the same rules an element input does: its own
 * values replace, its named vocabularies merge.
 */
export function provideJsonRender(
  config: JsonRenderConfig | (() => JsonRenderConfig),
): Provider[] {
  return [
    {
      provide: JSON_RENDER_CONFIG,
      useFactory: (): JsonRenderConfig => {
        const outer = inject(JSON_RENDER_CONFIG, {
          optional: true,
          skipSelf: true,
        });
        const own = typeof config === 'function' ? config() : config;
        return outer ? mergeJsonRenderConfig(outer, own) : own;
      },
    },
  ];
}

/** `inner` over `outer`, by the rules {@link JsonRenderConfig} describes. */
function mergeJsonRenderConfig(
  outer: JsonRenderConfig,
  inner: JsonRenderConfig,
): JsonRenderConfig {
  const merged: JsonRenderConfig = { ...outer };
  for (const [key, value] of Object.entries(inner) as [
    keyof JsonRenderConfig,
    unknown,
  ][]) {
    if (value !== undefined && value !== null) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  merged.handlers = mergeByName(outer.handlers, inner.handlers);
  merged.functions = mergeByName(outer.functions, inner.functions);
  merged.validationFunctions = mergeByName(
    outer.validationFunctions,
    inner.validationFunctions,
  );
  merged.directives = mergeDirectives(outer.directives, inner.directives);
  return merged;
}

/**
 * Two name → value maps as one, `inner` winning a name both define. Returns
 * whichever is given when only one is, so an unmerged map keeps its identity.
 *
 * @internal
 */
export function mergeByName<T>(
  outer: Record<string, T> | null | undefined,
  inner: Record<string, T> | null | undefined,
): Record<string, T> | undefined {
  if (!outer) return inner ?? undefined;
  if (!inner) return outer;
  return { ...outer, ...inner };
}

/**
 * Two directive lists as one, `inner` winning a name both define — the
 * directive registry keeps the last definition of a name.
 *
 * @internal
 */
export function mergeDirectives(
  outer: DirectiveDefinition<any>[] | null | undefined,
  inner: DirectiveDefinition<any>[] | null | undefined,
): DirectiveDefinition<any>[] | undefined {
  if (!outer) return inner ?? undefined;
  if (!inner) return outer;
  return [...outer, ...inner];
}
