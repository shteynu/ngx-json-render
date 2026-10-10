import { Component, type Type, computed, input } from '@angular/core';
import type { Spec } from '@json-render/core';
import { JsonRenderer } from 'ngx-json-render';
import { JSON_RENDER_ACTIVITY_TYPE, isJsonRenderSpec } from './events';

/**
 * Renders one json-render activity message. It takes the inputs every AG-UI
 * activity renderer is given — CopilotKit Angular's `ActivityRenderer`
 * contract — and draws `content` with `<json-render>`, which takes its
 * registry, catalog and handlers from the nearest `provideJsonRender`.
 *
 * Register it with {@link jsonRenderActivityRenderer} rather than by hand.
 */
@Component({
  selector: 'json-render-activity',
  imports: [JsonRenderer],
  template: `<json-render [spec]="spec()" />`,
})
export class JsonRenderActivity {
  readonly activityType = input<string>(JSON_RENDER_ACTIVITY_TYPE);
  readonly content = input.required<unknown>();
  /** The AG-UI activity message; unused, accepted for the contract. */
  readonly message = input<unknown>();
  /** The agent that produced it; unused, accepted for the contract. */
  readonly agent = input<unknown>();

  protected readonly spec = computed<Spec | null>(() => {
    const content = this.content();
    return isJsonRenderSpec(content) ? content : null;
  });
}

/** Options for {@link jsonRenderActivityRenderer}. */
export interface JsonRenderActivityRendererOptions {
  /** Defaults to {@link JSON_RENDER_ACTIVITY_TYPE}. */
  activityType?: string;
  /** Limit the renderer to one agent's activities. */
  agentId?: string;
  /** A component of your own in place of {@link JsonRenderActivity}. */
  component?: Type<unknown>;
}

/**
 * An activity renderer config in the shape CopilotKit Angular's
 * `renderActivityMessages` takes, matched structurally so this package does
 * not depend on CopilotKit.
 */
export interface JsonRenderActivityRendererConfig {
  activityType: string;
  agentId?: string;
  content: {
    safeParse(
      content: unknown,
    ): { success: true; data: Spec } | { success: false; error?: unknown };
  };
  component: Type<any>;
}

/**
 * Teach a CopilotKit Angular app to render json-render activities:
 *
 * ```ts
 * providers: [
 *   provideJsonRender({ registry }),
 *   provideCopilotKit({
 *     runtimeUrl: '/api/copilotkit',
 *     renderActivityMessages: [jsonRenderActivityRenderer()],
 *   }),
 * ]
 * ```
 *
 * Content that is not a spec is rejected by the config's schema, so CopilotKit
 * skips the message with a warning instead of mounting an empty renderer.
 */
export function jsonRenderActivityRenderer(
  options: JsonRenderActivityRendererOptions = {},
): JsonRenderActivityRendererConfig {
  return {
    activityType: options.activityType ?? JSON_RENDER_ACTIVITY_TYPE,
    ...(options.agentId !== undefined ? { agentId: options.agentId } : {}),
    content: {
      safeParse: (content) =>
        isJsonRenderSpec(content)
          ? { success: true, data: content }
          : {
              success: false,
              error: new Error(
                'Activity content is not a json-render spec: expected { root: string, elements: object }.',
              ),
            },
    },
    component: options.component ?? JsonRenderActivity,
  };
}
