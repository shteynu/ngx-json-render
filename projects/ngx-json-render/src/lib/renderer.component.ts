import {
  ChangeDetectionStrategy,
  Component,
  type Type,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import type {
  ActionHandler,
  ComputedFunction,
  DirectiveDefinition,
  Spec,
  StateModel,
  StateStore,
  ValidationFunction,
} from '@json-render/core';
import { createDirectiveRegistry } from '@json-render/core';
import { JsonRenderActionsService } from './actions.service';
import { JrConfirmDialog } from './confirm-dialog.component';
import { JrElement } from './element.component';
import { JsonRenderRootContext } from './root-context';
import { JsonRenderStateService } from './state.service';
import type { ComponentRegistry, RegistryEntry, StateChange } from './types';
import { JsonRenderValidationService } from './validation.service';

/**
 * Renders a json-render {@link Spec} using a registry of Angular components.
 *
 * The renderer owns the state store, action dispatcher, and validation state
 * of its subtree (all injectable from catalog components). Pass an external
 * {@link StateStore} via `store` for controlled mode or to share state across
 * renderers.
 *
 * @example
 * ```html
 * <json-render
 *   [spec]="spec()"
 *   [registry]="registry"
 *   [handlers]="handlers"
 *   [loading]="isStreaming()"
 *   (stateChange)="onStateChange($event)"
 * />
 * ```
 */
@Component({
  selector: 'json-render',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [JrElement, JrConfirmDialog],
  providers: [
    JsonRenderRootContext,
    JsonRenderStateService,
    JsonRenderValidationService,
    JsonRenderActionsService,
  ],
  styles: `:host { display: contents; }`,
  template: `
    @if (rootKey(); as key) {
      <jr-element [elementKey]="key" />
    }
    @if (pendingConfirm(); as confirm) {
      <jr-confirm-dialog
        [config]="confirm"
        (confirmed)="actions.confirm()"
        (cancelled)="actions.cancel()"
      />
    }
  `,
})
export class JsonRenderer {
  /** The UI spec to render (may be partial while streaming). */
  readonly spec = input.required<Spec | null>();
  /** Component registry mapping catalog type names to Angular components. */
  readonly registry = input.required<ComponentRegistry>();
  /** Whether the spec is currently loading/streaming. */
  readonly loading = input(false);
  /** Fallback component for unknown types. */
  readonly fallback = input<Type<unknown> | RegistryEntry | null>(null);

  /**
   * Initial state model (uncontrolled mode). Defaults to `spec.state`.
   * Ignored when `store` is provided.
   */
  readonly state = input<StateModel | undefined>(undefined);
  /** External state store (controlled mode). */
  readonly store = input<StateStore | null>(null);

  /** Action handlers by action name. */
  readonly handlers = input<Record<string, ActionHandler> | undefined>(
    undefined,
  );
  /** Catch-all action handler for actions without a dedicated handler. */
  readonly onAction = input<
    ((name: string, params?: Record<string, unknown>) => unknown) | null
  >(null);
  /** Navigation function used by `onSuccess: { navigate }` handlers. */
  readonly navigate = input<((path: string) => void) | null>(null);

  /** Custom validation functions. */
  readonly validationFunctions = input<
    Record<string, ValidationFunction> | undefined
  >(undefined);
  /** Named functions for `$computed` expressions in props. */
  readonly functions = input<Record<string, ComputedFunction> | undefined>(
    undefined,
  );
  /** Custom directives for user-defined `$`-prefixed dynamic values. */
  readonly directives = input<DirectiveDefinition[] | undefined>(undefined);

  /** Emits state changes in uncontrolled mode. */
  readonly stateChange = output<StateChange[]>();

  /** The state store of this renderer (also injectable in the subtree). */
  readonly stateStore: JsonRenderStateService;
  /** The action dispatcher of this renderer. */
  protected readonly actions: JsonRenderActionsService;

  constructor() {
    const root = inject(JsonRenderRootContext);
    root.spec = this.spec;
    root.registry = this.registry;
    root.loading = this.loading;
    root.fallback = this.fallback;
    root.store = this.store;
    root.initialState = computed(
      () => this.state() ?? this.spec()?.state ?? {},
    );
    root.handlers = this.handlers;
    root.onAction = this.onAction;
    root.navigate = this.navigate;
    root.validationFunctions = this.validationFunctions;
    root.functions = this.functions;
    root.directiveRegistry = computed(() => {
      const definitions = this.directives();
      return definitions ? createDirectiveRegistry(definitions) : undefined;
    });
    root.emitStateChange = (changes) => this.stateChange.emit(changes);

    // Instantiate the subtree services now that the root context is wired.
    this.stateStore = inject(JsonRenderStateService);
    inject(JsonRenderValidationService);
    this.actions = inject(JsonRenderActionsService);
  }

  protected readonly rootKey = computed(() => {
    const spec = this.spec();
    return spec?.root && spec.elements?.[spec.root] ? spec.root : null;
  });

  protected readonly pendingConfirm = computed(
    () => this.actions.pendingConfirmation()?.action.confirm ?? null,
  );
}
