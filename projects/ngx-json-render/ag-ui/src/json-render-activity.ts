import {
  Component,
  type Type,
  computed,
  effect,
  input,
  signal,
  untracked,
} from '@angular/core';
import type { Spec } from '@json-render/core';
import { JsonRenderer } from 'ngx-json-render';
import type { AgUiAgent, AgUiSubscriber } from './agent-ui';
import { JSON_RENDER_ACTIVITY_TYPE, isJsonRenderSpec } from './events';

/**
 * What {@link JsonRenderActivity} reads of the agent CopilotKit hands it. An
 * `@ag-ui/client` `AbstractAgent` has this shape; anything else is ignored.
 */
interface ActivityAgent extends AgUiAgent {
  readonly isRunning?: boolean;
}

/** How often a streaming activity looks whether its run has ended. */
const RUN_END_POLL_MS = 250;

function isActivityAgent(agent: unknown): agent is ActivityAgent {
  return (
    typeof agent === 'object' &&
    agent !== null &&
    typeof (agent as { subscribe?: unknown }).subscribe === 'function'
  );
}

function messageIdOf(message: unknown): string | undefined {
  const id = (message as { id?: unknown } | null | undefined)?.id;
  return typeof id === 'string' ? id : undefined;
}

/**
 * Whether a message comes after the thread's last user message — that is,
 * belongs to the turn now being answered.
 */
function inLatestTurn(agent: ActivityAgent, messageId: string): boolean {
  const messages = agent.messages;
  if (!messages) return true;
  const index = messages.findIndex((m) => m.id === messageId);
  if (index === -1) return true;
  for (let i = messages.length - 1; i > index; i--) {
    if (messages[i]!.role === 'user') return false;
  }
  return true;
}

/**
 * Renders one json-render activity message. It takes the inputs every AG-UI
 * activity renderer is given — CopilotKit Angular's `ActivityRenderer`
 * contract — and draws `content` with `<json-render>`, which takes its
 * registry, catalog and handlers from the nearest `provideJsonRender`.
 *
 * While the agent's current run is still streaming into this activity, the
 * renderer is told it is loading, as `injectUIStream` tells it: the spec is
 * checked once the run ends, not at every patch, and the catalog holds back
 * elements whose props have not arrived yet. Streaming is tracked per
 * message — a run that sends this activity a snapshot or a delta — so an
 * activity already on screen stays checked while a later run builds another.
 * Without an `agent` input the renderer is never loading.
 *
 * Register it with {@link jsonRenderActivityRenderer} rather than by hand.
 */
@Component({
  selector: 'json-render-activity',
  imports: [JsonRenderer],
  template: `<json-render [spec]="spec()" [loading]="streaming()" />`,
})
export class JsonRenderActivity {
  readonly activityType = input<string>(JSON_RENDER_ACTIVITY_TYPE);
  readonly content = input.required<unknown>();
  /** The AG-UI activity message; its `id` matches the agent's events. */
  readonly message = input<unknown>();
  /** The agent that produced it; its runs decide when the spec is final. */
  readonly agent = input<unknown>();

  // CopilotKit hands every activity a fresh copy of its content on each event
  // of a run, its own or another's. An unchanged copy is the same spec: not
  // a reason to check it, and report what the check found, once more.
  protected readonly spec = computed<Spec | null>(
    () => {
      const content = this.content();
      return isJsonRenderSpec(content) ? content : null;
    },
    {
      equal: (a, b) =>
        a === b ||
        (a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b)),
    },
  );

  /** Whether the agent's current run is still streaming this activity. */
  protected readonly streaming = signal(false);

  constructor() {
    // `@ag-ui/client` fixes a run's subscribers when the run starts, and
    // CopilotKit mounts an activity at its first snapshot — mid-run — so the
    // subscription below never hears the end of the run that created it.
    // While streaming, the agent's `isRunning` flag is watched instead.
    effect((onCleanup) => {
      const agent = this.agent();
      if (
        !this.streaming() ||
        !isActivityAgent(agent) ||
        typeof agent.isRunning !== 'boolean'
      ) {
        return;
      }
      const timer = setInterval(() => {
        if (!agent.isRunning) this.streaming.set(false);
      }, RUN_END_POLL_MS);
      onCleanup(() => clearInterval(timer));
    });

    effect((onCleanup) => {
      const agent = this.agent();
      if (!isActivityAgent(agent)) {
        this.streaming.set(false);
        return;
      }
      const ownId = () => untracked(() => messageIdOf(this.message()));
      // CopilotKit mounts an activity when its first snapshot arrives, so a
      // run already in progress is, as a rule, the one streaming it — unless
      // the message belongs to an earlier turn and was mounted again.
      untracked(() => {
        const id = ownId();
        this.streaming.set(
          agent.isRunning === true &&
            (id === undefined || inLatestTurn(agent, id)),
        );
      });
      const subscriber: AgUiSubscriber = {
        onRunInitialized: () => this.streaming.set(false),
        onEvent: ({ event }) => {
          if (
            (event.type === 'ACTIVITY_SNAPSHOT' ||
              event.type === 'ACTIVITY_DELTA') &&
            (event as { messageId?: unknown }).messageId === ownId()
          ) {
            this.streaming.set(true);
          }
        },
        onRunFinalized: () => this.streaming.set(false),
      };
      const subscription = agent.subscribe(subscriber);
      onCleanup(() => subscription.unsubscribe());
    });
  }
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
