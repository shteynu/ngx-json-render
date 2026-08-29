import {
  Component,
  type ElementRef,
  computed,
  effect,
  viewChild,
} from '@angular/core';
import { JrChildren, injectRenderContext } from 'ngx-json-render';

/** Layout container that stacks children vertically or horizontally. */
@Component({
  selector: 'demo-stack',
  imports: [JrChildren],
  template: `
    <div
      class="stack"
      [style.flex-direction]="direction()"
      [style.gap.px]="props().gap ?? 12"
      [style.align-items]="align()"
      [style.justify-content]="justify()"
      [style.padding.px]="props().padding ?? 0"
    >
      <jr-children />
    </div>
  `,
  styles: `
    .stack { display: flex; }
  `,
})
export class StackComponent {
  private readonly ctx = injectRenderContext<{
    direction?: 'vertical' | 'horizontal';
    gap?: number;
    padding?: number;
    align?: 'start' | 'center' | 'end' | 'stretch';
    justify?: 'start' | 'between' | 'end';
  }>();
  readonly props = this.ctx.props;
  readonly direction = computed(() =>
    this.props().direction === 'horizontal' ? 'row' : 'column',
  );
  readonly align = computed(() => {
    const align = this.props().align;
    if (!align || align === 'stretch') return 'stretch';
    return align === 'center' ? 'center' : `flex-${align}`;
  });
  readonly justify = computed(() => {
    const justify = this.props().justify;
    if (!justify || justify === 'start') return 'flex-start';
    return justify === 'between' ? 'space-between' : 'flex-end';
  });
}

/** Card container with an optional title, subtitle, and header slot. */
@Component({
  selector: 'demo-card',
  imports: [JrChildren],
  template: `
    <section class="card">
      @if (props().title || props().subtitle) {
        <header class="card-header">
          <div>
            @if (props().title) {
              <h3>{{ props().title }}</h3>
            }
            @if (props().subtitle) {
              <p>{{ props().subtitle }}</p>
            }
          </div>
          <jr-children slot="actions" />
        </header>
      }
      <div class="card-body"><jr-children /></div>
    </section>
  `,
  styles: `
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
    }
    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 16px;
      border-bottom: 1px solid var(--border);
    }
    .card-header h3 { margin: 0; font-size: 15px; font-weight: 600; }
    .card-header p { margin: 2px 0 0; font-size: 13px; color: var(--muted); }
    .card-body { padding: 16px; }
  `,
})
export class CardComponent {
  private readonly ctx = injectRenderContext<{
    title?: string;
    subtitle?: string;
  }>();
  readonly props = this.ctx.props;
}

/** Section heading. */
@Component({
  selector: 'demo-heading',
  template: `
    @switch (props().level ?? 2) {
      @case (1) { <h1 class="heading">{{ props().content }}</h1> }
      @case (2) { <h2 class="heading">{{ props().content }}</h2> }
      @default { <h3 class="heading">{{ props().content }}</h3> }
    }
  `,
  styles: `
    .heading { margin: 0; letter-spacing: -0.02em; }
    h1.heading { font-size: 24px; }
    h2.heading { font-size: 19px; }
    h3.heading { font-size: 16px; }
  `,
})
export class HeadingComponent {
  private readonly ctx = injectRenderContext<{
    content?: string;
    level?: 1 | 2 | 3;
  }>();
  readonly props = this.ctx.props;
}

/** Plain text block. */
@Component({
  selector: 'demo-text',
  template: `<p
    class="text"
    [class.muted]="props().tone === 'muted'"
    [class.strong]="props().tone === 'strong'"
  >{{ props().content }}</p>`,
  styles: `
    .text { margin: 0; font-size: 14px; line-height: 1.5; }
    .text.muted { color: var(--muted); }
    .text.strong { font-weight: 600; }
  `,
})
export class TextComponent {
  private readonly ctx = injectRenderContext<{
    content?: unknown;
    tone?: 'default' | 'muted' | 'strong';
  }>();
  readonly props = this.ctx.props;
}

/** Clickable button; emits a `press` event. */
@Component({
  selector: 'demo-button',
  template: `
    <button
      class="btn"
      [class.primary]="variant() === 'primary'"
      [class.danger]="variant() === 'danger'"
      [disabled]="props().disabled ?? false"
      (click)="ctx.emit('press')"
    >
      {{ props().label }}
    </button>
  `,
  styles: `
    .btn {
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      padding: 7px 14px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: inherit;
      cursor: pointer;
      transition: filter 0.15s;
    }
    .btn:hover:not(:disabled) { filter: brightness(0.96); }
    .btn:disabled { opacity: 0.5; cursor: default; }
    .btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
    .btn.danger { background: transparent; border-color: #fca5a5; color: #dc2626; }
  `,
})
export class ButtonComponent {
  readonly ctx = injectRenderContext<{
    label?: string;
    variant?: 'primary' | 'secondary' | 'danger';
    disabled?: boolean;
  }>();
  readonly props = this.ctx.props;
  readonly variant = computed(() => this.props().variant ?? 'secondary');
}

/** Small status badge. */
@Component({
  selector: 'demo-badge',
  template: `<span class="badge" [class]="'badge ' + (props().color ?? 'gray')">{{
    props().label
  }}</span>`,
  styles: `
    .badge {
      display: inline-block;
      font-size: 12px;
      font-weight: 600;
      padding: 2px 10px;
      border-radius: 999px;
      white-space: nowrap;
    }
    .badge.gray { background: color-mix(in srgb, var(--muted) 14%, transparent); color: var(--muted); }
    .badge.green { background: #dcfce7; color: #15803d; }
    .badge.orange { background: #ffedd5; color: #c2410c; }
    .badge.blue { background: #dbeafe; color: #1d4ed8; }
  `,
})
export class BadgeComponent {
  private readonly ctx = injectRenderContext<{
    label?: unknown;
    color?: 'gray' | 'green' | 'orange' | 'blue';
  }>();
  readonly props = this.ctx.props;
}

/** Text input, two-way bindable via `$bindState`; emits `submit` on Enter. */
@Component({
  selector: 'demo-input',
  template: `
    <input
      #el
      class="input"
      [placeholder]="props().placeholder ?? ''"
      (input)="onInput($event)"
      (keydown.enter)="ctx.emit('submit')"
    />
  `,
  styles: `
    .input {
      font: inherit;
      font-size: 14px;
      width: 100%;
      box-sizing: border-box;
      padding: 8px 12px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: inherit;
      outline: none;
    }
    .input:focus { border-color: var(--accent); }
  `,
})
export class InputComponent {
  readonly ctx = injectRenderContext<{
    value?: string;
    placeholder?: string;
  }>();
  readonly props = this.ctx.props;
  private readonly el = viewChild.required<ElementRef<HTMLInputElement>>('el');

  constructor() {
    // Sync the DOM against the *actual* input value rather than using a
    // [value] binding: the state can change while the user is typing (e.g.
    // clearStatePath after pushState), and a one-way binding would skip the
    // write when the bound value returns to its previously-applied value.
    effect(() => {
      const value = String(this.props().value ?? '');
      const input = this.el().nativeElement;
      if (input.value !== value) {
        input.value = value;
      }
    });
  }

  onInput(event: Event): void {
    this.ctx.setBound('value', (event.target as HTMLInputElement).value);
  }
}

/** Checkbox with a label, two-way bindable via `$bindItem` / `$bindState`. */
@Component({
  selector: 'demo-checkbox',
  template: `
    <label class="checkbox" [class.done]="checked()">
      <input type="checkbox" [checked]="checked()" (change)="onChange($event)" />
      <span>{{ props().label }}</span>
    </label>
  `,
  styles: `
    .checkbox {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      cursor: pointer;
      user-select: none;
    }
    .checkbox.done span { text-decoration: line-through; color: var(--muted); }
    .checkbox input { accent-color: var(--accent); width: 15px; height: 15px; }
  `,
})
export class CheckboxComponent {
  readonly ctx = injectRenderContext<{ label?: unknown; checked?: boolean }>();
  readonly props = this.ctx.props;
  readonly checked = computed(() => this.props().checked ?? false);
  onChange(event: Event): void {
    this.ctx.setBound('checked', (event.target as HTMLInputElement).checked);
  }
}

/** Key metric tile. */
@Component({
  selector: 'demo-metric',
  template: `
    <div class="metric">
      <span class="metric-label">{{ props().label }}</span>
      <span class="metric-value">{{ props().value }}</span>
      @if (props().delta != null) {
        <span class="metric-delta" [class.down]="isDown()">{{ props().delta }}</span>
      }
    </div>
  `,
  styles: `
    .metric {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 12px 16px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--surface);
      min-width: 110px;
    }
    .metric-label { font-size: 12px; color: var(--muted); }
    .metric-value { font-size: 22px; font-weight: 650; letter-spacing: -0.02em; }
    .metric-delta { font-size: 12px; color: #15803d; }
    .metric-delta.down { color: #dc2626; }
  `,
})
export class MetricComponent {
  private readonly ctx = injectRenderContext<{
    label?: unknown;
    value?: unknown;
    delta?: string | null;
  }>();
  readonly props = this.ctx.props;
  readonly isDown = computed(() =>
    String(this.props().delta ?? '').startsWith('-'),
  );
}

/** Horizontal divider. */
@Component({
  selector: 'demo-divider',
  template: `<hr class="divider" />`,
  styles: `
    .divider { border: none; border-top: 1px solid var(--border); margin: 4px 0; }
  `,
})
export class DividerComponent {}

/** Progress bar (0–100). */
@Component({
  selector: 'demo-progress',
  template: `
    <div class="progress-row">
      @if (props().label) {
        <span class="progress-label">{{ props().label }}</span>
      }
      <div class="progress-track">
        <div
          class="progress-fill"
          [style.transform]="'scaleX(' + clamped() / 100 + ')'"
        ></div>
      </div>
      <span class="progress-pct">{{ clamped() }}%</span>
    </div>
  `,
  styles: `
    .progress-row { display: flex; align-items: center; gap: 10px; font-size: 13px; }
    .progress-label { min-width: 110px; color: var(--muted); }
    .progress-track {
      flex: 1;
      height: 7px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--muted) 14%, transparent);
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      width: 100%;
      border-radius: 999px;
      background: var(--accent);
      transform-origin: left;
      transition: transform 0.3s;
    }
    .progress-pct { min-width: 38px; text-align: right; font-variant-numeric: tabular-nums; }
  `,
})
export class ProgressComponent {
  private readonly ctx = injectRenderContext<{
    label?: unknown;
    value?: number;
  }>();
  readonly props = this.ctx.props;
  readonly clamped = computed(() =>
    Math.max(0, Math.min(100, Math.round(Number(this.props().value ?? 0)))),
  );
}
