import { InjectionToken, type Type, inject } from '@angular/core';
import type { ActionConfirm } from '@json-render/core';

/** The two words the confirmation dialog says on its own. */
export interface ConfirmLabels {
  confirm: string;
  cancel: string;
}

/**
 * Labels for the default confirmation dialog's buttons, when the spec does not
 * supply `confirmLabel` / `cancelLabel` of its own.
 *
 * They are the only strings this package puts on screen, and they were English
 * with no way to change them. Override once, in an app's providers:
 *
 * ```ts
 * { provide: JR_CONFIRM_LABELS, useValue: { confirm: 'Подтвердить', cancel: 'Отмена' } }
 * ```
 */
export const JR_CONFIRM_LABELS = new InjectionToken<ConfirmLabels>(
  'ngx-json-render JR_CONFIRM_LABELS',
  {
    providedIn: 'root',
    factory: () => ({ confirm: 'Confirm', cancel: 'Cancel' }),
  },
);

/**
 * Everything a replacement confirmation dialog is given: the config the spec
 * asked for, and the two ways to answer it. Inject it with
 * {@link injectConfirmContext}.
 */
export interface ConfirmContext {
  /** Title, message, labels and variant, straight from the action binding. */
  readonly config: ActionConfirm;
  /** Let the action proceed. */
  readonly confirm: () => void;
  /** Dismiss it — a normal answer, not a failure. */
  readonly cancel: () => void;
}

/** The confirmation a replacement dialog component is rendered for. */
export const CONFIRM_CONTEXT = new InjectionToken<ConfirmContext>(
  'ngx-json-render CONFIRM_CONTEXT',
);

/**
 * The component `<json-render>` should render for a `confirm` on an action.
 * Unset means the packaged {@link JrConfirmDialog}.
 *
 * The component is rendered with a {@link CONFIRM_CONTEXT} in its injector, so
 * it takes no inputs and emits no outputs:
 *
 * ```ts
 * @Component({ template: `<my-modal (ok)="ctx.confirm()" (dismiss)="ctx.cancel()">…` })
 * export class AppConfirm {
 *   readonly ctx = injectConfirmContext();
 * }
 * // providers: [{ provide: JR_CONFIRM_DIALOG, useValue: AppConfirm }]
 * ```
 */
export const JR_CONFIRM_DIALOG = new InjectionToken<Type<unknown>>(
  'ngx-json-render JR_CONFIRM_DIALOG',
);

/** Inject the confirmation a replacement dialog component is rendering for. */
export function injectConfirmContext(): ConfirmContext {
  const ctx = inject(CONFIRM_CONTEXT, { optional: true });
  if (!ctx) {
    throw new Error(
      'injectConfirmContext() must be used inside a component provided through JR_CONFIRM_DIALOG',
    );
  }
  return ctx;
}
