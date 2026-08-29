import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { injectRenderContext } from 'ngx-json-render';
import type { ThemeColor } from './theme';

/** Material progress bar (0–100). */
@Component({
  selector: 'jrm-progress-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatProgressBarModule],
  template: `
    <mat-progress-bar
      [mode]="props().mode ?? 'determinate'"
      [value]="props().value ?? 0"
      [color]="props().color ?? null"
    />
  `,
})
export class JrmProgressBar {
  private readonly ctx = injectRenderContext<{
    value?: number;
    mode?: 'determinate' | 'indeterminate';
    color?: ThemeColor;
  }>();
  readonly props = this.ctx.props;
}

/** Material indeterminate spinner. */
@Component({
  selector: 'jrm-spinner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatProgressSpinnerModule],
  template: `
    <mat-progress-spinner
      mode="indeterminate"
      [diameter]="props().diameter ?? 36"
      [color]="props().color ?? null"
    />
  `,
})
export class JrmSpinner {
  private readonly ctx = injectRenderContext<{
    diameter?: number;
    color?: ThemeColor;
  }>();
  readonly props = this.ctx.props;
}

/** Inline informational / success / warning / error message block. */
@Component({
  selector: 'jrm-callout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div class="jrm-callout" [class]="'jrm-callout severity-' + severity()" role="note">
      <mat-icon class="jrm-callout-icon">{{ icon() }}</mat-icon>
      <div class="jrm-callout-body">
        @if (props().title) {
          <p class="mat-title-small jrm-callout-title">{{ props().title }}</p>
        }
        <p class="mat-body-medium jrm-callout-content">{{ props().content }}</p>
      </div>
    </div>
  `,
  styles: `
    .jrm-callout {
      display: flex;
      gap: 10px;
      padding: 12px 14px;
      border-radius: 8px;
      border: 1px solid currentColor;
      align-items: flex-start;
    }
    .jrm-callout-body { color: initial; }
    .jrm-callout-title { margin: 0 0 2px; }
    .jrm-callout-content { margin: 0; }
    .jrm-callout-icon { flex: none; }
    .severity-info { color: #1565c0; background: color-mix(in srgb, #1565c0 8%, transparent); }
    .severity-success { color: #2e7d32; background: color-mix(in srgb, #2e7d32 8%, transparent); }
    .severity-warning { color: #ef6c00; background: color-mix(in srgb, #ef6c00 8%, transparent); }
    .severity-error { color: #c62828; background: color-mix(in srgb, #c62828 8%, transparent); }
  `,
})
export class JrmCallout {
  private readonly ctx = injectRenderContext<{
    title?: string;
    content?: unknown;
    severity?: 'info' | 'success' | 'warning' | 'error';
  }>();
  readonly props = this.ctx.props;
  readonly severity = computed(() => this.props().severity ?? 'info');
  readonly icon = computed(() => {
    switch (this.severity()) {
      case 'success':
        return 'check_circle';
      case 'warning':
        return 'warning';
      case 'error':
        return 'error';
      default:
        return 'info';
    }
  });
}
