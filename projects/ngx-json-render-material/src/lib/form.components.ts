import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  DateAdapter,
  MAT_DATE_FORMATS,
  MAT_NATIVE_DATE_FORMATS,
  NativeDateAdapter,
} from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInput, MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelect, MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSliderModule } from '@angular/material/slider';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { ValidationConfig } from '@json-render/core';
import { injectRenderContext } from 'ngx-json-render';
import { type JrmField, injectJrmField } from './field';
import type { MaterialProps } from 'ngx-json-render-material/catalog';

interface SelectOption {
  value: string;
  label: string;
}

/**
 * Push a field's error state into a Material form-field control.
 *
 * `MatInput` / `MatSelect` normally derive `errorState` from an `NgControl`.
 * These catalog components bind to the spec's state model instead of a
 * reactive form, so there is no control to derive it from — but both expose a
 * settable `errorState`, and `ngDoCheck` only recomputes it when an
 * `NgControl` is present, so a written value sticks. `stateChanges` is what
 * tells the (OnPush) form field to re-render its subscript.
 */
function syncErrorState(
  control: () => MatInput | MatSelect,
  invalid: () => boolean,
): void {
  effect(() => {
    const target = control();
    target.errorState = invalid();
    target.stateChanges.next();
  });
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
      [disabledInteractive]="props().disabled ?? false"
      (click)="onPress()"
    >
      @if (props().icon) {
        <mat-icon>{{ props().icon }}</mat-icon>
      }
      {{ props().label }}
    </button>
  `,
})
export class JrmButton {
  readonly ctx = injectRenderContext<MaterialProps<'Button'>>();
  readonly props = this.ctx.props;

  onPress(): void {
    if (this.props().disabled) return;
    this.ctx.emit('press');
  }
}

/** Icon-only Material button; emits `press`. `label` is also its tooltip. */
@Component({
  selector: 'jrm-icon-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  template: `
    <button
      matIconButton
      [color]="props().color ?? null"
      [disabled]="props().disabled ?? false"
      [disabledInteractive]="props().disabled ?? false"
      [attr.aria-label]="props().label"
      [matTooltip]="props().label"
      (click)="onPress()"
    >
      <mat-icon>{{ props().icon }}</mat-icon>
    </button>
  `,
})
export class JrmIconButton {
  readonly ctx = injectRenderContext<MaterialProps<'IconButton'>>();
  readonly props = this.ctx.props;

  onPress(): void {
    if (this.props().disabled) return;
    this.ctx.emit('press');
  }
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
        [required]="props().required || field.required()"
        [disabled]="props().disabled ?? false"
        (input)="onInput($event)"
        (blur)="field.blur()"
        (keydown.enter)="ctx.emit('submit')"
      />
      @if (props().hint) {
        <mat-hint>{{ props().hint }}</mat-hint>
      }
      @for (error of field.errors(); track error) {
        <mat-error>{{ error }}</mat-error>
      }
    </mat-form-field>
  `,
  styles: `
    .jrm-field { width: 100%; }
  `,
})
export class JrmInput {
  readonly ctx = injectRenderContext<MaterialProps<'Input'>>();
  readonly props = this.ctx.props;
  readonly field: JrmField = injectJrmField(this.ctx, 'value', 'blur');
  private readonly el = viewChild.required<ElementRef<HTMLInputElement>>('el');
  private readonly control = viewChild.required(MatInput);

  constructor() {
    // Sync against the live DOM value rather than a [value] binding: state can
    // change while the user types (e.g. a clearStatePath after pushState), and
    // a one-way binding would skip a write back to an already-applied value.
    effect(() => {
      const value = String(this.props().value ?? '');
      const input = this.el().nativeElement;
      if (input.value !== value) input.value = value;
    });
    syncErrorState(this.control, this.field.invalid);
  }

  onInput(event: Event): void {
    this.field.set((event.target as HTMLInputElement).value);
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
        [required]="field.required()"
        [disabled]="props().disabled ?? false"
        (input)="onInput($event)"
        (blur)="field.blur()"
      ></textarea>
      @for (error of field.errors(); track error) {
        <mat-error>{{ error }}</mat-error>
      }
    </mat-form-field>
  `,
  styles: `
    .jrm-field { width: 100%; }
  `,
})
export class JrmTextarea {
  readonly ctx = injectRenderContext<MaterialProps<'Textarea'>>();
  readonly props = this.ctx.props;
  readonly field: JrmField = injectJrmField(this.ctx, 'value', 'blur');
  private readonly el =
    viewChild.required<ElementRef<HTMLTextAreaElement>>('el');
  private readonly control = viewChild.required(MatInput);

  constructor() {
    effect(() => {
      const value = String(this.props().value ?? '');
      const el = this.el().nativeElement;
      if (el.value !== value) el.value = value;
    });
    syncErrorState(this.control, this.field.invalid);
  }

  onInput(event: Event): void {
    this.field.set((event.target as HTMLTextAreaElement).value);
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
        [required]="field.required()"
        [disabled]="props().disabled ?? false"
        (selectionChange)="field.set($event.value)"
        (closed)="field.blur()"
      >
        @for (option of options(); track option.value) {
          <mat-option [value]="option.value">{{ option.label }}</mat-option>
        }
      </mat-select>
      @for (error of field.errors(); track error) {
        <mat-error>{{ error }}</mat-error>
      }
    </mat-form-field>
  `,
  styles: `
    .jrm-field { width: 100%; }
  `,
})
export class JrmSelect {
  readonly ctx = injectRenderContext<MaterialProps<'Select'>>();
  readonly props = this.ctx.props;
  readonly field: JrmField = injectJrmField(this.ctx, 'value', 'change');
  private readonly control = viewChild.required(MatSelect);
  readonly options = computed<SelectOption[]>(() => {
    const options = this.props().options;
    return Array.isArray(options) ? options : [];
  });

  constructor() {
    syncErrorState(this.control, this.field.invalid);
  }
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/;

/**
 * Read a spec's `YYYY-MM-DD` string as a date of whatever type the adapter
 * works in. Anything else — another format, a non-string, an impossible day
 * such as 2026-02-31 — reads as no date. A datetime keeps its date part.
 */
function parseIsoDate<D>(adapter: DateAdapter<D>, value: unknown): D | null {
  if (typeof value !== 'string') return null;
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  let date: D;
  try {
    date = adapter.createDate(year, month, day);
  } catch {
    return null;
  }
  // Outside dev mode NativeDateAdapter rolls an overflowing day into the next
  // month instead of throwing, so check that the day survived.
  return adapter.getMonth(date) === month && adapter.getDate(date) === day
    ? date
    : null;
}

/** Write an adapter date back as the `YYYY-MM-DD` string state holds. */
function toIsoDate<D>(adapter: DateAdapter<D>, date: D): string {
  const pad = (n: number, width: number) => String(n).padStart(width, '0');
  return [
    pad(adapter.getYear(date), 4),
    pad(adapter.getMonth(date) + 1, 2),
    pad(adapter.getDate(date), 2),
  ].join('-');
}

/**
 * Material date field with a calendar popup; two-way bindable via
 * `$bindState`. State holds the date as a `YYYY-MM-DD` string, so it stays
 * JSON, and ISO dates compare correctly in `lessThan` / `greaterThan` checks.
 *
 * It uses the app's `DateAdapter` and `MAT_DATE_FORMATS` when the app provides
 * them (`provideLuxonDateAdapter()`, `provideDateFnsAdapter()`, a locale), and
 * falls back to the native `Date` adapter otherwise, so the registry renders
 * a date field with nothing extra to provide.
 */
@Component({
  selector: 'jrm-date-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDatepickerModule, MatFormFieldModule, MatInputModule],
  providers: [
    {
      provide: DateAdapter,
      useFactory: () =>
        inject(DateAdapter, { optional: true, skipSelf: true }) ??
        new NativeDateAdapter(),
    },
    {
      provide: MAT_DATE_FORMATS,
      useFactory: () =>
        inject(MAT_DATE_FORMATS, { optional: true, skipSelf: true }) ??
        MAT_NATIVE_DATE_FORMATS,
    },
  ],
  template: `
    <mat-form-field appearance="outline" class="jrm-field">
      @if (props().label) {
        <mat-label>{{ props().label }}</mat-label>
      }
      <input
        matInput
        [matDatepicker]="picker"
        [value]="date()"
        [min]="min()"
        [max]="max()"
        [required]="field.required()"
        [disabled]="props().disabled ?? false"
        (dateChange)="onDateChange($event.value)"
        (blur)="field.blur()"
      />
      <mat-datepicker-toggle matIconSuffix [for]="picker" />
      <mat-datepicker #picker (closed)="field.blur()" />
      @if (props().hint) {
        <mat-hint>{{ props().hint }}</mat-hint>
      }
      @for (error of field.errors(); track error) {
        <mat-error>{{ error }}</mat-error>
      }
    </mat-form-field>
  `,
  styles: `
    .jrm-field { width: 100%; }
  `,
})
export class JrmDatePicker {
  readonly ctx = injectRenderContext<MaterialProps<'DatePicker'>>();
  readonly props = this.ctx.props;
  readonly field: JrmField = injectJrmField(this.ctx, 'value', 'change');
  private readonly adapter = inject<DateAdapter<unknown>>(DateAdapter);
  private readonly control = viewChild.required(MatInput);

  readonly date = computed(() =>
    parseIsoDate(this.adapter, this.props().value),
  );
  readonly min = computed(() => parseIsoDate(this.adapter, this.props().min));
  readonly max = computed(() => parseIsoDate(this.adapter, this.props().max));

  constructor() {
    syncErrorState(this.control, this.field.invalid);
  }

  /** A cleared field, or text that is not a date, writes `""`. */
  onDateChange(value: unknown): void {
    this.field.set(value == null ? '' : toIsoDate(this.adapter, value));
  }
}

/** Material checkbox; two-way bindable via `$bindState` / `$bindItem`. */
@Component({
  selector: 'jrm-checkbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCheckboxModule],
  template: `
    <mat-checkbox
      [checked]="!!props().checked"
      [required]="field.required()"
      [disabled]="props().disabled ?? false"
      (change)="field.set($event.checked)"
    >
      {{ props().label }}
    </mat-checkbox>
    @for (error of field.errors(); track error) {
      <div class="jrm-error">{{ error }}</div>
    }
  `,
  // No mat-form-field to host <mat-error>, so the message is rendered here
  // with the same role and colour token Material uses for its subscript.
  styles: `
    .jrm-error {
      color: var(--mat-sys-error, #c62828);
      font-size: 12px;
      margin: 4px 0 0 16px;
    }
  `,
})
export class JrmCheckbox {
  readonly ctx = injectRenderContext<MaterialProps<'Checkbox'>>();
  readonly props = this.ctx.props;
  readonly field: JrmField = injectJrmField(this.ctx, 'checked', 'change');
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
      [required]="field.required()"
      (change)="field.set($event.value)"
    >
      @for (option of options(); track option.value) {
        <mat-radio-button [value]="option.value">{{ option.label }}</mat-radio-button>
      }
    </mat-radio-group>
    @for (error of field.errors(); track error) {
      <div class="jrm-error">{{ error }}</div>
    }
  `,
  styles: `
    .jrm-radio-label { display: block; margin-bottom: 4px; }
    .jrm-radio-group { display: flex; flex-direction: column; }
    .jrm-radio-group.horizontal { flex-direction: row; gap: 12px; }
    .jrm-error {
      color: var(--mat-sys-error, #c62828);
      font-size: 12px;
      margin-top: 4px;
    }
  `,
})
export class JrmRadioGroup {
  readonly ctx = injectRenderContext<MaterialProps<'RadioGroup'>>();
  readonly props = this.ctx.props;
  readonly field: JrmField = injectJrmField(this.ctx, 'value', 'change');
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
  readonly ctx = injectRenderContext<MaterialProps<'SlideToggle'>>();
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
  readonly ctx = injectRenderContext<MaterialProps<'Slider'>>();
  readonly props = this.ctx.props;
}
