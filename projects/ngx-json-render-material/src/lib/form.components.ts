import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  computed,
  effect,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSliderModule } from '@angular/material/slider';
import { injectRenderContext } from 'ngx-json-render';
import type { ThemeColor } from './theme';

interface SelectOption {
  value: string;
  label: string;
}

/** Material button; emits `press`. */
@Component({
  selector: 'jrm-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  template: `
    <button
      [matButton]="props().variant ?? 'filled'"
      [color]="props().color ?? null"
      [disabled]="props().disabled ?? false"
      (click)="ctx.emit('press')"
    >
      @if (props().icon) {
        <mat-icon>{{ props().icon }}</mat-icon>
      }
      {{ props().label }}
    </button>
  `,
})
export class JrmButton {
  readonly ctx = injectRenderContext<{
    label?: string;
    variant?: 'text' | 'filled' | 'elevated' | 'outlined' | 'tonal';
    color?: ThemeColor;
    icon?: string;
    disabled?: boolean;
  }>();
  readonly props = this.ctx.props;
}

/** Icon-only Material button; emits `press`. */
@Component({
  selector: 'jrm-icon-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  template: `
    <button
      matIconButton
      [color]="props().color ?? null"
      [disabled]="props().disabled ?? false"
      [attr.aria-label]="props().label"
      (click)="ctx.emit('press')"
    >
      <mat-icon>{{ props().icon }}</mat-icon>
    </button>
  `,
})
export class JrmIconButton {
  readonly ctx = injectRenderContext<{
    icon?: string;
    label?: string;
    color?: ThemeColor;
    disabled?: boolean;
  }>();
  readonly props = this.ctx.props;
}

/** Material text field; two-way bindable via `$bindState`, emits `submit`. */
@Component({
  selector: 'jrm-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatInputModule],
  template: `
    <mat-form-field appearance="outline" class="jrm-field">
      @if (props().label) {
        <mat-label>{{ props().label }}</mat-label>
      }
      <input
        #el
        matInput
        [type]="props().type ?? 'text'"
        [placeholder]="props().placeholder ?? ''"
        [required]="props().required ?? false"
        [disabled]="props().disabled ?? false"
        (input)="onInput($event)"
        (keydown.enter)="ctx.emit('submit')"
      />
      @if (props().hint) {
        <mat-hint>{{ props().hint }}</mat-hint>
      }
    </mat-form-field>
  `,
  styles: `
    .jrm-field { width: 100%; }
  `,
})
export class JrmInput {
  readonly ctx = injectRenderContext<{
    label?: string;
    value?: string;
    placeholder?: string;
    hint?: string;
    type?: 'text' | 'number' | 'email' | 'password';
    required?: boolean;
    disabled?: boolean;
  }>();
  readonly props = this.ctx.props;
  private readonly el = viewChild.required<ElementRef<HTMLInputElement>>('el');

  constructor() {
    // Sync against the live DOM value rather than a [value] binding: state can
    // change while the user types (e.g. a clearStatePath after pushState), and
    // a one-way binding would skip a write back to an already-applied value.
    effect(() => {
      const value = String(this.props().value ?? '');
      const input = this.el().nativeElement;
      if (input.value !== value) input.value = value;
    });
  }

  onInput(event: Event): void {
    this.ctx.setBound('value', (event.target as HTMLInputElement).value);
  }
}

/** Multi-line Material text field; two-way bindable via `$bindState`. */
@Component({
  selector: 'jrm-textarea',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatInputModule],
  template: `
    <mat-form-field appearance="outline" class="jrm-field">
      @if (props().label) {
        <mat-label>{{ props().label }}</mat-label>
      }
      <textarea
        #el
        matInput
        [rows]="props().rows ?? 3"
        [placeholder]="props().placeholder ?? ''"
        [disabled]="props().disabled ?? false"
        (input)="onInput($event)"
      ></textarea>
    </mat-form-field>
  `,
  styles: `
    .jrm-field { width: 100%; }
  `,
})
export class JrmTextarea {
  readonly ctx = injectRenderContext<{
    label?: string;
    value?: string;
    placeholder?: string;
    rows?: number;
    disabled?: boolean;
  }>();
  readonly props = this.ctx.props;
  private readonly el = viewChild.required<ElementRef<HTMLTextAreaElement>>('el');

  constructor() {
    effect(() => {
      const value = String(this.props().value ?? '');
      const el = this.el().nativeElement;
      if (el.value !== value) el.value = value;
    });
  }

  onInput(event: Event): void {
    this.ctx.setBound('value', (event.target as HTMLTextAreaElement).value);
  }
}

/** Material select; two-way bindable via `$bindState`. */
@Component({
  selector: 'jrm-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatSelectModule],
  template: `
    <mat-form-field appearance="outline" class="jrm-field">
      @if (props().label) {
        <mat-label>{{ props().label }}</mat-label>
      }
      <mat-select
        [value]="props().value ?? null"
        [disabled]="props().disabled ?? false"
        (selectionChange)="ctx.setBound('value', $event.value)"
      >
        @for (option of options(); track option.value) {
          <mat-option [value]="option.value">{{ option.label }}</mat-option>
        }
      </mat-select>
    </mat-form-field>
  `,
  styles: `
    .jrm-field { width: 100%; }
  `,
})
export class JrmSelect {
  readonly ctx = injectRenderContext<{
    label?: string;
    value?: string;
    options?: SelectOption[];
    disabled?: boolean;
  }>();
  readonly props = this.ctx.props;
  readonly options = computed<SelectOption[]>(() => {
    const options = this.props().options;
    return Array.isArray(options) ? options : [];
  });
}

/** Material checkbox; two-way bindable via `$bindState` / `$bindItem`. */
@Component({
  selector: 'jrm-checkbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCheckboxModule],
  template: `
    <mat-checkbox
      [checked]="!!props().checked"
      [disabled]="props().disabled ?? false"
      (change)="ctx.setBound('checked', $event.checked)"
    >
      {{ props().label }}
    </mat-checkbox>
  `,
})
export class JrmCheckbox {
  readonly ctx = injectRenderContext<{
    label?: unknown;
    checked?: boolean;
    disabled?: boolean;
  }>();
  readonly props = this.ctx.props;
}

/** Material radio group; two-way bindable via `$bindState`. */
@Component({
  selector: 'jrm-radio-group',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatRadioModule],
  template: `
    @if (props().label) {
      <label class="mat-label-large jrm-radio-label">{{ props().label }}</label>
    }
    <mat-radio-group
      class="jrm-radio-group"
      [class.horizontal]="props().direction === 'horizontal'"
      [value]="props().value ?? null"
      (change)="ctx.setBound('value', $event.value)"
    >
      @for (option of options(); track option.value) {
        <mat-radio-button [value]="option.value">{{ option.label }}</mat-radio-button>
      }
    </mat-radio-group>
  `,
  styles: `
    .jrm-radio-label { display: block; margin-bottom: 4px; }
    .jrm-radio-group { display: flex; flex-direction: column; }
    .jrm-radio-group.horizontal { flex-direction: row; gap: 12px; }
  `,
})
export class JrmRadioGroup {
  readonly ctx = injectRenderContext<{
    label?: string;
    value?: string;
    options?: SelectOption[];
    direction?: 'vertical' | 'horizontal';
  }>();
  readonly props = this.ctx.props;
  readonly options = computed<SelectOption[]>(() => {
    const options = this.props().options;
    return Array.isArray(options) ? options : [];
  });
}

/** Material slide toggle; two-way bindable via `$bindState`. */
@Component({
  selector: 'jrm-slide-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatSlideToggleModule],
  template: `
    <mat-slide-toggle
      [checked]="!!props().checked"
      [disabled]="props().disabled ?? false"
      (change)="ctx.setBound('checked', $event.checked)"
    >
      {{ props().label }}
    </mat-slide-toggle>
  `,
})
export class JrmSlideToggle {
  readonly ctx = injectRenderContext<{
    label?: unknown;
    checked?: boolean;
    disabled?: boolean;
  }>();
  readonly props = this.ctx.props;
}

/** Material slider; two-way bindable via `$bindState`. */
@Component({
  selector: 'jrm-slider',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatSliderModule],
  template: `
    @if (props().label) {
      <label class="mat-label-large jrm-slider-label">{{ props().label }}</label>
    }
    <mat-slider
      class="jrm-slider"
      [min]="props().min ?? 0"
      [max]="props().max ?? 100"
      [step]="props().step ?? 1"
      discrete
    >
      <input
        matSliderThumb
        [value]="props().value ?? 0"
        (valueChange)="ctx.setBound('value', $event)"
      />
    </mat-slider>
  `,
  styles: `
    .jrm-slider-label { display: block; }
    .jrm-slider { width: 100%; }
  `,
})
export class JrmSlider {
  readonly ctx = injectRenderContext<{
    label?: string;
    value?: number;
    min?: number;
    max?: number;
    step?: number;
  }>();
  readonly props = this.ctx.props;
}
