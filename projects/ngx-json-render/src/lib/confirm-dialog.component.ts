import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import type { ActionConfirm } from '@json-render/core';
import { JR_CONFIRM_LABELS } from './confirm-tokens';

let dialogIdCounter = 0;

/**
 * Default confirmation dialog shown for action bindings with a `confirm`
 * field. Rendered automatically by `<json-render>`; can also be used
 * standalone with a custom action flow.
 *
 * It is a real dialog: `role="dialog"` with `aria-modal`, labelled by its own
 * title and described by its message, focus moved in on open and returned to
 * wherever it came from on close, Tab kept inside it and Escape cancelling.
 * A generated UI can ask for confirmation of something destructive, so a
 * keyboard or screen-reader user has to be able to answer it.
 *
 * Colours come from CSS custom properties with light and dark defaults, so an
 * app can theme it — `--jr-confirm-surface`, `--jr-confirm-ink`,
 * `--jr-confirm-muted`, `--jr-confirm-border`, `--jr-confirm-scrim`,
 * `--jr-confirm-accent`, `--jr-confirm-danger`, `--jr-confirm-on-accent`,
 * `--jr-confirm-radius` — and replace it outright through
 * {@link JR_CONFIRM_DIALOG} when that is not enough.
 */
@Component({
  selector: 'jr-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(keydown.escape)': 'cancelled.emit()',
  },
  template: `
    <div class="jr-confirm-scrim" (click)="cancelled.emit()">
      <div
        class="jr-confirm-panel"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="titleId"
        [attr.aria-describedby]="messageId"
        (click)="$event.stopPropagation()"
        (keydown)="onKeydown($event)"
      >
        <h3 class="jr-confirm-title" [id]="titleId">{{ config().title }}</h3>
        <p class="jr-confirm-message" [id]="messageId">{{ config().message }}</p>
        <div class="jr-confirm-actions">
          <button #cancel type="button" class="jr-confirm-cancel" (click)="cancelled.emit()">
            {{ config().cancelLabel ?? labels.cancel }}
          </button>
          <button
            #confirm
            type="button"
            class="jr-confirm-confirm"
            [class.jr-confirm-danger]="isDanger()"
            (click)="confirmed.emit()"
          >
            {{ config().confirmLabel ?? labels.confirm }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: `
    :host {
      --jr-confirm-scrim-default: rgba(0, 0, 0, 0.5);
      --jr-confirm-surface-default: #ffffff;
      --jr-confirm-ink-default: #111827;
      --jr-confirm-muted-default: #6b7280;
      --jr-confirm-border-default: #d1d5db;
      --jr-confirm-accent-default: #3b82f6;
      --jr-confirm-danger-default: #dc2626;
      --jr-confirm-on-accent-default: #ffffff;
    }

    @media (prefers-color-scheme: dark) {
      :host {
        --jr-confirm-scrim-default: rgba(0, 0, 0, 0.65);
        --jr-confirm-surface-default: #1f2937;
        --jr-confirm-ink-default: #f3f4f6;
        --jr-confirm-muted-default: #9ca3af;
        --jr-confirm-border-default: #4b5563;
        --jr-confirm-accent-default: #60a5fa;
        --jr-confirm-danger-default: #f87171;
        --jr-confirm-on-accent-default: #111827;
      }
    }

    .jr-confirm-scrim {
      position: fixed;
      inset: 0;
      z-index: 50;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: var(--jr-confirm-scrim, var(--jr-confirm-scrim-default));
    }

    .jr-confirm-panel {
      width: 100%;
      max-width: 400px;
      padding: 24px;
      border-radius: var(--jr-confirm-radius, 8px);
      background-color: var(--jr-confirm-surface, var(--jr-confirm-surface-default));
      color: var(--jr-confirm-ink, var(--jr-confirm-ink-default));
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.25);
    }

    .jr-confirm-title {
      margin: 0 0 8px 0;
      font-size: 18px;
      font-weight: 600;
    }

    .jr-confirm-message {
      margin: 0 0 24px 0;
      color: var(--jr-confirm-muted, var(--jr-confirm-muted-default));
    }

    .jr-confirm-actions {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }

    .jr-confirm-actions button {
      padding: 8px 16px;
      border-radius: 6px;
      font: inherit;
      cursor: pointer;
    }

    .jr-confirm-cancel {
      border: 1px solid var(--jr-confirm-border, var(--jr-confirm-border-default));
      background-color: transparent;
      color: inherit;
    }

    .jr-confirm-confirm {
      border: none;
      background-color: var(--jr-confirm-accent, var(--jr-confirm-accent-default));
      color: var(--jr-confirm-on-accent, var(--jr-confirm-on-accent-default));
    }

    .jr-confirm-confirm.jr-confirm-danger {
      background-color: var(--jr-confirm-danger, var(--jr-confirm-danger-default));
    }
  `,
})
export class JrConfirmDialog {
  readonly config = input.required<ActionConfirm>();
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  protected readonly labels = inject(JR_CONFIRM_LABELS);

  private readonly id = dialogIdCounter++;
  protected readonly titleId = `jr-confirm-title-${this.id}`;
  protected readonly messageId = `jr-confirm-message-${this.id}`;

  private readonly cancelButton =
    viewChild<ElementRef<HTMLButtonElement>>('cancel');
  private readonly confirmButton =
    viewChild<ElementRef<HTMLButtonElement>>('confirm');

  protected readonly isDanger = computed(
    () => this.config().variant === 'danger',
  );

  constructor() {
    // Whatever was focused when the action fired — usually the control that
    // dispatched it, which is still in the document behind the dialog.
    const previous =
      typeof document !== 'undefined'
        ? (document.activeElement as HTMLElement | null)
        : null;

    // Cancel takes focus rather than confirm: a dialog exists to interrupt,
    // and landing on the destructive answer makes a stray Enter destructive.
    afterNextRender(() => this.cancelButton()?.nativeElement.focus());

    inject(DestroyRef).onDestroy(() => previous?.focus?.());
  }

  /**
   * Keep Tab inside the dialog. With exactly two buttons the whole trap is
   * wrapping the ends; a modal that lets focus wander behind it is a modal
   * only for people using a mouse.
   */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const cancel = this.cancelButton()?.nativeElement;
    const confirm = this.confirmButton()?.nativeElement;
    if (!cancel || !confirm) return;

    const active = event.target;
    if (event.shiftKey && active === cancel) {
      event.preventDefault();
      confirm.focus();
    } else if (!event.shiftKey && active === confirm) {
      event.preventDefault();
      cancel.focus();
    }
  }
}
