import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import type { ActionConfirm } from '@json-render/core';

/**
 * Default confirmation dialog shown for action bindings with a `confirm`
 * field. Rendered automatically by `<json-render>`; can also be used
 * standalone with a custom action flow.
 */
@Component({
  selector: 'jr-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      style="position: fixed; inset: 0; background-color: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 50"
      (click)="cancelled.emit()"
    >
      <div
        style="background-color: white; border-radius: 8px; padding: 24px; max-width: 400px; width: 100%; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1)"
        (click)="$event.stopPropagation()"
      >
        <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600">
          {{ config().title }}
        </h3>
        <p style="margin: 0 0 24px 0; color: #6b7280">{{ config().message }}</p>
        <div style="display: flex; gap: 12px; justify-content: flex-end">
          <button
            type="button"
            (click)="cancelled.emit()"
            style="padding: 8px 16px; border-radius: 6px; border: 1px solid #d1d5db; background-color: white; cursor: pointer"
          >
            {{ config().cancelLabel ?? 'Cancel' }}
          </button>
          <button
            type="button"
            (click)="confirmed.emit()"
            [style.background-color]="isDanger() ? '#dc2626' : '#3b82f6'"
            style="padding: 8px 16px; border-radius: 6px; border: none; color: white; cursor: pointer"
          >
            {{ config().confirmLabel ?? 'Confirm' }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class JrConfirmDialog {
  readonly config = input.required<ActionConfirm>();
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  protected readonly isDanger = computed(
    () => this.config().variant === 'danger',
  );
}
