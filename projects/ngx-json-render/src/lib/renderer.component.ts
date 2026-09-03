import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  type Type,
  computed,
  effect,
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
import {
  CONFIRM_CONTEXT,
  type ConfirmContext,
  JR_CONFIRM_DIALOG,
} from './confirm-tokens';
import { JrElement } from './element.component';
import type { RenderLimits, SpecCatalog } from './render-limits';
import { JsonRenderRootContext } from './root-context';
import {
  type SpecValidationMode,
  checkSpec,
  reportSpecCheck,
} from './spec-validation';
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
  imports: [JrElement, JrConfirmDialog, NgComponentOutlet],
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
      @if (customDialog; as dialog) {
        <ng-container
          *ngComponentOutlet="dialog; injector: confirmInjector() ?? undefined"
        />
      } @else {
        <jr-confirm-dialog
          [config]="confirm"
          (confirmed)="actions.confirm()"
          (cancelled)="actions.cancel()"
        />
      }
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
   * Whether to check the spec's structure before rendering it, and what to do
   * about what turns up. Off by default.
   *
   * `'warn'` reports the issues and renders anyway; `'strict'` renders nothing
   * when the spec has errors. Both first apply the lossless fixes — `visible`,
   * `on` and `repeat` misplaced inside `props` are moved back to the element,
   * where they take effect instead of being ignored.
   *
   * The check is skipped while `loading` is true: a spec that is still
   * arriving is expected to reference children that have not streamed in yet.
   */
  readonly validate = input<SpecValidationMode>('off');

  /**
   * Caps on what the spec may cost the browser: `maxElements`, `maxDepth` and
   * `maxRepeatItems`. Unset by default, and each field is independently
   * optional.
   *
   * Unlike `validate`, these are enforced in every mode — a number the app
   * chose is a control, not a report. A spec over `maxElements` renders
   * nothing; `maxDepth` and `maxRepeatItems` truncate where they are hit.
   * They apply while `loading` too: a partial spec is a subset of the
   * finished one, so a cap can only ever fire early, never falsely.
   */
  readonly renderLimits = input<RenderLimits | null>(null);

  /**
   * The catalog the spec was generated for. Given one, `validate` also checks
   * what structure alone cannot: that every `type` is a component the catalog
   * defines, and that the props match its schema.
   *
   * Only read when `validate` is on, and — like the rest of the check —
   * skipped while `loading`.
   */
  readonly catalog = input<SpecCatalog | null>(null);

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

  /**
   * The spec as checked, and what the check found. While `loading`, the mode
   * is forced off: the spec is still arriving, and the missing children it
   * refers to are the normal state of a stream, not a defect.
   */
  private readonly checked = computed(() =>
    checkSpec(this.spec(), this.loading() ? 'off' : this.validate(), {
      limits: this.renderLimits(),
      catalog: this.catalog(),
    }),
  );

  constructor() {
    const root = inject(JsonRenderRootContext);
    // The fixed spec, not the input: a `visible` the check moved out of
    // `props` has to be the one the tree renders, or the fix is cosmetic.
    root.spec = computed(() => this.checked().spec);
    root.registry = this.registry;
    root.loading = this.loading;
    root.fallback = this.fallback;
    root.limits = this.renderLimits;
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

    // Reports once per distinct check rather than once per render: `checked`
    // only recomputes when the spec, the mode, the limits or the loading flag
    // change. Silent while loading — a limit can fire on a spec that is still
    // arriving, and reporting it on every patch would bury the one report
    // that describes the finished spec.
    effect(() => {
      if (this.loading()) return;
      reportSpecCheck(this.checked(), this.validate());
    });
  }

  protected readonly rootKey = computed(() => {
    const checked = this.checked();
    // A spec over an enforced cap does not render in any mode. Whether to
    // check was the app's decision; once it has made it, honouring the answer
    // is not also `validate`'s to decide.
    if (checked.blocked) return null;
    // A spec whose errors survived the fixes does not render under `strict`.
    // Reporting it and drawing half of it anyway is the behaviour the mode
    // exists to refuse.
    if (this.validate() === 'strict' && checked.hasErrors) return null;
    const spec = checked.spec;
    return spec?.root && spec.elements?.[spec.root] ? spec.root : null;
  });

  protected readonly pendingConfirm = computed(
    () => this.actions.pendingConfirmation()?.action.confirm ?? null,
  );

  /**
   * The app's own dialog, if it provided one. Read once: which component
   * answers a confirmation is an application decision, not something that
   * changes between two confirmations.
   */
  protected readonly customDialog = inject(JR_CONFIRM_DIALOG, {
    optional: true,
  });
  private readonly injector = inject(Injector);

  /**
   * A replacement dialog takes no inputs and emits no outputs — it injects
   * everything it needs, the way catalog components do. That keeps the seam
   * one token wide instead of a component contract the renderer would have to
   * bind to.
   */
  protected readonly confirmInjector = computed(() => {
    const config = this.pendingConfirm();
    if (!config) return null;
    const context: ConfirmContext = {
      config,
      confirm: () => this.actions.confirm(),
      cancel: () => this.actions.cancel(),
    };
    return Injector.create({
      providers: [{ provide: CONFIRM_CONTEXT, useValue: context }],
      parent: this.injector,
    });
  });
}
