import {
  DestroyRef,
  type Signal,
  computed,
  inject,
  signal,
} from '@angular/core';
import type { Spec } from '@json-render/core';
import {
  type RenderLimits,
  type SpecCatalog,
  type SpecCheckIssue,
  type SpecValidationMode,
  checkSpec,
  formatSpecCheckIssues,
} from 'ngx-json-render';
import {
  type AgUiEvent,
  type AgUiMessage,
  type AgUiSurface,
  JSON_RENDER_ACTIVITY_TYPE,
  applyAgUiEvent,
  surfacesFromMessages,
} from './events';

/**
 * The callbacks of an AG-UI subscriber this entry point uses — a subset of
 * `@ag-ui/client`'s `AgentSubscriber`.
 */
export interface AgUiSubscriber {
  onRunInitialized?(): void;
  onEvent?(params: { event: AgUiEvent }): void;
  onRunErrorEvent?(params: { event: { message: string } }): void;
  onRunFailed?(params: { error: Error }): void;
  onRunFinalized?(): void;
}

/**
 * What {@link injectAgentUI} needs of an agent. Any `@ag-ui/client` agent —
 * `HttpAgent`, a subclass of `AbstractAgent`, the agent CopilotKit hands out —
 * already has this shape.
 */
export interface AgUiAgent {
  readonly messages?: readonly AgUiMessage[];
  subscribe(subscriber: AgUiSubscriber): { unsubscribe(): void };
}

/** Options for {@link injectAgentUI}. */
export interface AgentUIOptions {
  /** The agent whose runs build the UI. The app runs it; the hook listens. */
  agent: AgUiAgent;
  /** Defaults to {@link JSON_RENDER_ACTIVITY_TYPE}. */
  activityType?: string;
  /**
   * Called once per surface a run touched, after the finished-spec check.
   * Skipped for a run that failed, and for a surface the check rejected.
   */
  onComplete?: (spec: Spec, messageId: string) => void;
  /** Called when a run fails or a finished surface fails the check. */
  onError?: (error: Error) => void;
  /** As for `injectUIStream`: checked once per surface, when the run ends. */
  validate?: SpecValidationMode;
  /** As for `injectUIStream`; enforced whatever `validate` is. */
  renderLimits?: RenderLimits | null;
  /** As for `injectUIStream`: lets `validate` check types and props. */
  catalog?: SpecCatalog | null;
}

/** Return type of {@link injectAgentUI}. */
export interface AgentUIReturn {
  /** Every json-render surface the agent has built, in order of appearance. */
  readonly surfaces: Signal<readonly AgUiSurface[]>;
  /** The most recently opened surface's spec — the one most apps render. */
  readonly spec: Signal<Spec | null>;
  /** Whether a run of the agent is in progress. */
  readonly isStreaming: Signal<boolean>;
  /** The last run's error, if any. */
  readonly error: Signal<Error | null>;
  /** What the check found in the surfaces the last run finished. */
  readonly issues: Signal<readonly SpecCheckIssue[]>;
}

/**
 * Render what an AG-UI agent streams. Subscribes to the agent, folds every
 * json-render activity it emits into signals, and checks each surface when
 * the run ends — the same contract as `injectUIStream`, with the agent in
 * place of the endpoint.
 *
 * The app keeps running the agent itself (`agent.runAgent()`, CopilotKit, a
 * reconnect); the hook only listens, so it sees every run, whoever starts it.
 * It starts from whatever surfaces are already in the agent's messages and
 * unsubscribes on destroy.
 *
 * @example
 * ```ts
 * export class AgentPage {
 *   readonly agent = new HttpAgent({ url: '/api/agent' });
 *   readonly ui = injectAgentUI({ agent: this.agent, catalog });
 *   ask(text: string) {
 *     this.agent.addMessage({ id: crypto.randomUUID(), role: 'user', content: text });
 *     this.agent.runAgent();
 *   }
 * }
 * // template:
 * // <json-render [spec]="ui.spec()" [registry]="registry" [loading]="ui.isStreaming()" />
 * ```
 */
export function injectAgentUI(options: AgentUIOptions): AgentUIReturn {
  const activityType = options.activityType ?? JSON_RENDER_ACTIVITY_TYPE;
  const validate = options.validate ?? 'off';
  const checkOptions = {
    limits: options.renderLimits ?? null,
    catalog: options.catalog ?? null,
  };

  const surfaces = signal<readonly AgUiSurface[]>(
    surfacesFromMessages(options.agent.messages ?? [], activityType),
  );
  const isStreaming = signal(false);
  const error = signal<Error | null>(null);
  const issues = signal<readonly SpecCheckIssue[]>([]);

  // Per run: which surfaces it changed, and whether it already failed.
  let touched = new Set<string>();
  let failed = false;

  const fail = (err: Error) => {
    failed = true;
    error.set(err);
    options.onError?.(err);
  };

  const finish = () => {
    const found: SpecCheckIssue[] = [];
    let next = surfaces();
    for (const messageId of touched) {
      const surface = next.find((s) => s.messageId === messageId);
      if (!surface) continue; // a later MESSAGES_SNAPSHOT dropped it
      const check = checkSpec(surface.spec, validate, checkOptions);
      found.push(...check.issues);
      if (check.spec && check.spec !== surface.spec) {
        const fixed = check.spec;
        next = next.map((s) =>
          s.messageId === messageId ? { messageId, spec: fixed } : s,
        );
      }
      if (check.blocked || (validate === 'strict' && check.hasErrors)) {
        fail(
          new Error(
            `Generated spec failed validation:\n${formatSpecCheckIssues(check.issues)}`,
          ),
        );
        continue;
      }
      options.onComplete?.(check.spec ?? surface.spec, messageId);
    }
    surfaces.set(next);
    issues.set(found);
  };

  const subscription = options.agent.subscribe({
    onRunInitialized() {
      touched = new Set();
      failed = false;
      isStreaming.set(true);
      error.set(null);
      issues.set([]);
    },
    onEvent({ event }) {
      const before = surfaces();
      const after = applyAgUiEvent(before, event, activityType);
      if (after === before) return;
      for (const surface of after) {
        if (!before.includes(surface)) touched.add(surface.messageId);
      }
      surfaces.set(after);
    },
    onRunErrorEvent({ event }) {
      fail(new Error(event.message));
    },
    onRunFailed({ error: err }) {
      // A RUN_ERROR event already reported this run; the client then fails
      // the run with the same message.
      if (!failed) fail(err instanceof Error ? err : new Error(String(err)));
    },
    onRunFinalized() {
      if (!failed) finish();
      isStreaming.set(false);
    },
  });

  inject(DestroyRef).onDestroy(() => subscription.unsubscribe());

  const spec = computed(() => surfaces().at(-1)?.spec ?? null);

  return {
    surfaces: surfaces.asReadonly(),
    spec,
    isStreaming: isStreaming.asReadonly(),
    error: error.asReadonly(),
    issues: issues.asReadonly(),
  };
}
