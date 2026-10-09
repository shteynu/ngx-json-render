import {
  Component,
  type ElementRef,
  afterNextRender,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { JrChildren, injectRenderContext } from 'ngx-json-render';

/**
 * Charts for the demo catalog, drawn in plain SVG so the demo carries no chart
 * library. They are written for a spec that is still streaming: every prop may
 * be missing, an array may be shorter than its labels, and a value may arrive
 * one patch at a time — the line then grows left to right instead of
 * rescaling its x axis on every point.
 */

export type ValueFormat = 'number' | 'currency' | 'percent';

const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** Short form of a value for axes, labels and tooltips. */
export function formatValue(value: number, format?: ValueFormat): string {
  if (format === 'percent') return `${compact.format(value)}%`;
  if (format === 'currency') return `$${compact.format(value)}`;
  return compact.format(value);
}

/**
 * Top of a y axis with four intervals: four times the smallest "round" step
 * that covers `max`, so every gridline lands on a readable value.
 */
export function axisTop(max: number): number {
  if (!(max > 0)) return 4;
  const quarter = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(quarter));
  const step = [1, 2, 2.5, 3, 5, 10].find((s) => s * magnitude >= quarter)!;
  return step * magnitude * 4;
}

/** The finite numbers in a prop that may still be streaming. */
export function finiteNumbers(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((v): v is number => typeof v === 'number' && isFinite(v))
    : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => String(v ?? '')) : [];
}

/**
 * Tracks the rendered width of an element, so text inside an SVG stays at its
 * real pixel size instead of scaling with a viewBox. Without ResizeObserver
 * (tests, SSR) it keeps the fallback width.
 */
function trackWidth(ref: () => ElementRef<HTMLElement> | undefined) {
  const width = signal(560);
  const destroyRef = inject(DestroyRef);
  afterNextRender(() => {
    const el = ref()?.nativeElement;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (w > 0) width.set(w);
    });
    observer.observe(el);
    destroyRef.onDestroy(() => observer.disconnect());
  });
  return width;
}

/** Responsive grid: as many columns as fit at `minColumnWidth`. */
@Component({
  selector: 'demo-grid',
  imports: [JrChildren],
  template: `
    <div
      class="grid"
      [style.gap.px]="props().gap ?? 12"
      [style.grid-template-columns]="columns()"
    >
      <jr-children />
    </div>
  `,
  styles: `
    .grid { display: grid; align-items: stretch; }
  `,
})
export class GridComponent {
  private readonly ctx = injectRenderContext<{
    minColumnWidth?: number;
    gap?: number;
  }>();
  readonly props = this.ctx.props;
  readonly columns = computed(() => {
    const min = Math.max(80, Number(this.props().minColumnWidth ?? 220));
    return `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))`;
  });
}

interface Series {
  readonly name: string;
  readonly values: readonly number[];
}

const PAD = { top: 12, right: 16, bottom: 26, left: 44 };
const SERIES_COUNT = 4;

/** Line chart over shared x labels, up to four series. */
@Component({
  selector: 'demo-line-chart',
  template: `
    <div class="chart" #box>
      @if (series().length > 1) {
        <ul class="legend">
          @for (s of series(); track $index) {
            <li><span class="swatch" [attr.data-slot]="$index"></span>{{ s.name }}</li>
          }
        </ul>
      }
      <svg
        [attr.width]="width()"
        [attr.height]="height()"
        [attr.viewBox]="'0 0 ' + width() + ' ' + height()"
        role="img"
        [attr.aria-label]="ariaLabel()"
        (pointermove)="hover($event)"
        (pointerleave)="active.set(null)"
      >
        @for (tick of ticks(); track tick.y) {
          <line class="grid-line" [attr.x1]="pad.left" [attr.x2]="width() - pad.right" [attr.y1]="tick.y" [attr.y2]="tick.y" />
          <text class="axis" [attr.x]="pad.left - 8" [attr.y]="tick.y" text-anchor="end" dominant-baseline="middle">{{ tick.label }}</text>
        }
        @for (label of xLabels(); track label.i) {
          <text class="axis" [attr.x]="label.x" [attr.y]="height() - 6" text-anchor="middle">{{ label.text }}</text>
        }
        @if (active(); as a) {
          <line class="crosshair" [attr.x1]="a.x" [attr.x2]="a.x" [attr.y1]="pad.top" [attr.y2]="height() - pad.bottom" />
        }
        @for (path of paths(); track $index) {
          <path class="line" [attr.data-slot]="$index" [attr.d]="path.d" />
          @if (path.end; as end) {
            <circle class="dot" [attr.data-slot]="$index" [attr.cx]="end.x" [attr.cy]="end.y" r="4" />
          }
        }
        @if (active(); as a) {
          @for (p of a.points; track p.slot) {
            <circle class="dot" [attr.data-slot]="p.slot" [attr.cx]="a.x" [attr.cy]="p.y" r="4" />
          }
        }
      </svg>
      @if (active(); as a) {
        <div class="tooltip" [style.left.px]="a.x" [class.flip]="a.x > width() / 2">
          <strong>{{ a.label }}</strong>
          @for (p of a.points; track p.slot) {
            <span><i class="swatch" [attr.data-slot]="p.slot"></i>{{ p.name }} {{ p.text }}</span>
          }
        </div>
      }
      <div class="visually-hidden">
        <table>
          <tr><th></th>@for (s of series(); track $index) { <th>{{ s.name }}</th> }</tr>
          @for (label of labels(); track $index; let i = $index) {
            <tr><th>{{ label }}</th>@for (s of series(); track $index) { <td>{{ s.values.at(i) ?? '' }}</td> }</tr>
          }
        </table>
      </div>
    </div>
  `,
  styleUrl: './charts.css',
})
export class LineChartComponent {
  private readonly ctx = injectRenderContext<{
    labels?: unknown;
    series?: unknown;
    format?: ValueFormat;
    height?: number;
  }>();
  readonly props = this.ctx.props;
  readonly pad = PAD;

  private readonly box = viewChild<ElementRef<HTMLElement>>('box');
  readonly width = trackWidth(() => this.box());
  readonly height = computed(() =>
    Math.min(480, Math.max(140, Number(this.props().height ?? 220))),
  );

  readonly labels = computed(() => strings(this.props().labels));
  readonly series = computed<Series[]>(() => {
    const raw = this.props().series;
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, SERIES_COUNT).map((s: unknown, i) => {
      const o = (s ?? {}) as { name?: unknown; values?: unknown };
      return {
        name: String(o.name ?? `Series ${i + 1}`),
        values: finiteNumbers(o.values),
      };
    });
  });

  /** Points along x: the labels if given, else the longest series. */
  private readonly count = computed(() =>
    Math.max(
      this.labels().length,
      ...this.series().map((s) => s.values.length),
      2,
    ),
  );
  private readonly max = computed(() =>
    axisTop(Math.max(0, ...this.series().flatMap((s) => s.values))),
  );

  private x(i: number): number {
    const inner = this.width() - PAD.left - PAD.right;
    return PAD.left + (inner * i) / (this.count() - 1);
  }
  private y(v: number): number {
    const inner = this.height() - PAD.top - PAD.bottom;
    return PAD.top + inner * (1 - v / this.max());
  }

  readonly ticks = computed(() =>
    [0, 0.25, 0.5, 0.75, 1].map((f) => ({
      y: this.y(this.max() * f),
      label: formatValue(this.max() * f, this.props().format),
    })),
  );

  /** Every k-th label, so they never overlap at narrow widths. */
  readonly xLabels = computed(() => {
    const labels = this.labels();
    const room = (this.width() - PAD.left - PAD.right) / 48;
    const step = Math.max(1, Math.ceil(labels.length / Math.max(1, room)));
    return labels
      .map((text, i) => ({ text, i, x: this.x(i) }))
      .filter(({ i }) => i % step === 0);
  });

  readonly paths = computed(() =>
    this.series().map((s) => {
      const points = s.values.map((v, i) => [this.x(i), this.y(v)] as const);
      const last = points.at(-1);
      return {
        d: points.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(''),
        end: last ? { x: last[0], y: last[1] } : null,
      };
    }),
  );

  readonly ariaLabel = computed(() => {
    const names = this.series()
      .map((s) => s.name)
      .join(', ');
    return `Line chart${names ? ` of ${names}` : ''}`;
  });

  readonly active = signal<{
    x: number;
    label: string;
    points: { slot: number; name: string; y: number; text: string }[];
  } | null>(null);

  hover(event: PointerEvent): void {
    const svg = event.currentTarget as SVGSVGElement;
    const left = event.clientX - svg.getBoundingClientRect().left;
    const inner = this.width() - PAD.left - PAD.right;
    const i = Math.round(((left - PAD.left) / inner) * (this.count() - 1));
    if (i < 0 || i >= this.count()) return this.active.set(null);
    const points = this.series().flatMap((s, slot) =>
      s.values[i] == null
        ? []
        : [
            {
              slot,
              name: s.name,
              y: this.y(s.values[i]),
              text: formatValue(s.values[i], this.props().format),
            },
          ],
    );
    if (!points.length) return this.active.set(null);
    this.active.set({
      x: this.x(i),
      label: this.labels()[i] ?? String(i + 1),
      points,
    });
  }
}

/** Horizontal bars, one per label, sorted as given — for rankings. */
@Component({
  selector: 'demo-bar-chart',
  template: `
    <div class="bars" role="list" [attr.aria-label]="'Bar chart'">
      @for (bar of bars(); track bar.label) {
        <div class="bar-row" role="listitem" [title]="bar.label + ': ' + bar.text">
          <span class="bar-label">{{ bar.label }}</span>
          <span class="bar-track">
            <span class="bar-fill" [style.transform]="'scaleX(' + bar.scale + ')'"></span>
          </span>
          <span class="bar-value">{{ bar.text }}</span>
        </div>
      }
    </div>
  `,
  styleUrl: './charts.css',
})
export class BarChartComponent {
  private readonly ctx = injectRenderContext<{
    labels?: unknown;
    values?: unknown;
    format?: ValueFormat;
  }>();
  readonly props = this.ctx.props;

  /** A bar appears once its value has streamed in, not just its label. */
  readonly bars = computed(() => {
    const labels = strings(this.props().labels);
    const values = finiteNumbers(this.props().values);
    const max = Math.max(0, ...values) || 1;
    return labels.slice(0, values.length).map((label, i) => ({
      label,
      scale: Math.max(0.02, values[i] / max),
      text: formatValue(values[i], this.props().format),
    }));
  });
}

/** Tiny trend line for a metric tile: no axes, just the shape. */
@Component({
  selector: 'demo-sparkline',
  template: `
    @if (d()) {
      <svg class="spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
        <path [attr.d]="d()" vector-effect="non-scaling-stroke" />
      </svg>
    }
  `,
  styleUrl: './charts.css',
})
export class SparklineComponent {
  readonly values = input<readonly number[]>([]);
  readonly d = computed(() => {
    const v = this.values();
    if (v.length < 2) return '';
    const min = Math.min(...v);
    const span = Math.max(...v) - min || 1;
    return v
      .map(
        (n, i) =>
          `${i ? 'L' : 'M'}${(i / (v.length - 1)) * 100},${26 - ((n - min) / span) * 24}`,
      )
      .join('');
  });
}
