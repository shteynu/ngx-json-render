import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatTableModule } from '@angular/material/table';
import { JrChildren, injectRenderContext } from 'ngx-json-render';
import type { ThemeColor } from './theme';

/** Section heading (level 1–3) on the Material type scale. */
@Component({
  selector: 'jrm-heading',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (props().level ?? 2) {
      @case (1) {
        <h1 class="mat-headline-medium jrm-heading">{{ props().content }}</h1>
      }
      @case (2) {
        <h2 class="mat-title-large jrm-heading">{{ props().content }}</h2>
      }
      @default {
        <h3 class="mat-title-medium jrm-heading">{{ props().content }}</h3>
      }
    }
  `,
  styles: `
    .jrm-heading { margin: 0; }
  `,
})
export class JrmHeading {
  private readonly ctx = injectRenderContext<{
    content?: unknown;
    level?: 1 | 2 | 3;
  }>();
  readonly props = this.ctx.props;
}

/** A paragraph of body text. */
@Component({
  selector: 'jrm-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p
      class="mat-body-medium jrm-text"
      [class.jrm-muted]="props().tone === 'muted'"
      [class.jrm-strong]="props().tone === 'strong'"
    >
      {{ props().content }}
    </p>
  `,
  styles: `
    .jrm-text { margin: 0; }
    .jrm-muted { opacity: 0.65; }
    .jrm-strong { font-weight: 600; }
  `,
})
export class JrmText {
  private readonly ctx = injectRenderContext<{
    content?: unknown;
    tone?: 'default' | 'muted' | 'strong';
  }>();
  readonly props = this.ctx.props;
}

/** Material Symbols icon. */
@Component({
  selector: 'jrm-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `<mat-icon [color]="props().color ?? null">{{ props().name }}</mat-icon>`,
})
export class JrmIcon {
  private readonly ctx = injectRenderContext<{
    name?: string;
    color?: ThemeColor;
  }>();
  readonly props = this.ctx.props;
}

/** Key metric tile with an optional delta and trend direction. */
@Component({
  selector: 'jrm-metric',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div class="jrm-metric">
      <span class="mat-label-medium jrm-metric-label">{{ props().label }}</span>
      <span class="mat-headline-small jrm-metric-value">{{ props().value }}</span>
      @if (props().delta) {
        <span class="mat-label-small jrm-metric-delta" [class]="'trend-' + trend()">
          @if (trendIcon(); as icon) {
            <mat-icon class="jrm-metric-icon">{{ icon }}</mat-icon>
          }
          {{ props().delta }}
        </span>
      }
    </div>
  `,
  styles: `
    .jrm-metric { display: flex; flex-direction: column; gap: 2px; }
    .jrm-metric-label { opacity: 0.65; }
    .jrm-metric-value { font-variant-numeric: tabular-nums; }
    .jrm-metric-delta { display: inline-flex; align-items: center; gap: 2px; }
    .jrm-metric-icon { font-size: 16px; width: 16px; height: 16px; }
    .trend-up { color: var(--mat-sys-primary, #2e7d32); }
    .trend-down { color: var(--mat-sys-error, #c62828); }
    .trend-flat { opacity: 0.65; }
  `,
})
export class JrmMetric {
  private readonly ctx = injectRenderContext<{
    label?: unknown;
    value?: unknown;
    delta?: string;
    trend?: 'up' | 'down' | 'flat';
  }>();
  readonly props = this.ctx.props;
  readonly trend = computed(() => this.props().trend ?? 'flat');
  readonly trendIcon = computed(() => {
    const trend = this.props().trend;
    if (trend === 'up') return 'trending_up';
    if (trend === 'down') return 'trending_down';
    return null;
  });
}

/** Material chip, for tags and status labels. */
@Component({
  selector: 'jrm-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatChipsModule, MatIconModule],
  template: `
    <mat-chip-set>
      <mat-chip [color]="props().color ?? null" [highlighted]="!!props().color">
        @if (props().icon) {
          <mat-icon matChipAvatar>{{ props().icon }}</mat-icon>
        }
        {{ props().label }}
      </mat-chip>
    </mat-chip-set>
  `,
})
export class JrmChip {
  private readonly ctx = injectRenderContext<{
    label?: unknown;
    color?: ThemeColor;
    icon?: string;
  }>();
  readonly props = this.ctx.props;
}

/** Material list container; children must be `ListItem`s. */
@Component({
  selector: 'jrm-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [JrChildren, MatListModule],
  template: `<mat-list><jr-children /></mat-list>`,
})
export class JrmList {}

/** Row inside a `List`; emits `press` when clicked. */
@Component({
  selector: 'jrm-list-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatListModule, MatIconModule],
  template: `
    <mat-list-item
      [attr.role]="pressBound() ? 'button' : null"
      [attr.tabindex]="pressBound() ? 0 : null"
      [class.jrm-pressable]="pressBound()"
      (click)="ctx.emit('press')"
      (keydown.enter)="ctx.emit('press')"
      (keydown.space)="ctx.emit('press')"
    >
      @if (props().icon) {
        <mat-icon matListItemIcon>{{ props().icon }}</mat-icon>
      }
      <span matListItemTitle>{{ props().title }}</span>
      @if (props().description) {
        <span matListItemLine>{{ props().description }}</span>
      }
    </mat-list-item>
  `,
  styles: `
    .jrm-pressable { cursor: pointer; }
  `,
})
export class JrmListItem {
  readonly ctx = injectRenderContext<{
    title?: unknown;
    description?: unknown;
    icon?: string;
  }>();
  readonly props = this.ctx.props;
  /** Only present the row as a control when the spec actually bound `press`. */
  readonly pressBound = computed(() => this.ctx.on('press').bound);
}

interface TableColumn {
  field: string;
  header: string;
  align?: 'start' | 'end';
}

/** Material table driven by `columns` and `rows` props. */
@Component({
  selector: 'jrm-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatTableModule],
  template: `
    <table mat-table [dataSource]="rows()" class="jrm-table">
      @for (column of columns(); track column.field) {
        <ng-container [matColumnDef]="column.field">
          <th
            mat-header-cell
            *matHeaderCellDef
            [style.text-align]="column.align ?? 'start'"
          >
            {{ column.header }}
          </th>
          <td
            mat-cell
            *matCellDef="let row"
            [style.text-align]="column.align ?? 'start'"
          >
            {{ row[column.field] }}
          </td>
        </ng-container>
      }
      <tr mat-header-row *matHeaderRowDef="fields()"></tr>
      <tr mat-row *matRowDef="let row; columns: fields()"></tr>
    </table>
  `,
  styles: `
    .jrm-table { width: 100%; }
  `,
})
export class JrmTable {
  private readonly ctx = injectRenderContext<{
    columns?: TableColumn[];
    rows?: Array<Record<string, unknown>>;
  }>();
  readonly props = this.ctx.props;

  readonly columns = computed<TableColumn[]>(() => {
    const columns = this.props().columns;
    return Array.isArray(columns) ? columns : [];
  });
  readonly fields = computed(() =>
    this.columns().map((column) => column.field),
  );
  readonly rows = computed<Array<Record<string, unknown>>>(() => {
    const rows = this.props().rows;
    return Array.isArray(rows) ? rows : [];
  });
}
