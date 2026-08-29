import {
  ChangeDetectionStrategy,
  Component,
  type TemplateRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { JrChildren, injectRenderContext } from 'ngx-json-render';
import type { ThemeColor } from './theme';

/** Layout container that stacks children vertically or horizontally. */
@Component({
  selector: 'jrm-stack',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [JrChildren],
  template: `
    <div
      class="jrm-stack"
      [style.flex-direction]="direction()"
      [style.gap.px]="props().gap ?? 12"
      [style.padding.px]="props().padding ?? 0"
      [style.align-items]="align()"
      [style.justify-content]="justify()"
      [style.flex-wrap]="props().wrap ? 'wrap' : 'nowrap'"
    >
      <jr-children />
    </div>
  `,
  styles: `
    .jrm-stack { display: flex; }
  `,
})
export class JrmStack {
  private readonly ctx = injectRenderContext<{
    direction?: 'vertical' | 'horizontal';
    gap?: number;
    padding?: number;
    align?: 'start' | 'center' | 'end' | 'stretch';
    justify?: 'start' | 'center' | 'between' | 'end';
    wrap?: boolean;
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
    if (justify === 'between') return 'space-between';
    if (justify === 'center') return 'center';
    return 'flex-end';
  });
}

/** Responsive grid that collapses to a single column on narrow screens. */
@Component({
  selector: 'jrm-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [JrChildren],
  template: `
    <div
      class="jrm-grid"
      [style.grid-template-columns]="columns()"
      [style.gap.px]="props().gap ?? 16"
    >
      <jr-children />
    </div>
  `,
  styles: `
    .jrm-grid { display: grid; }
    @media (max-width: 720px) {
      .jrm-grid { grid-template-columns: 1fr !important; }
    }
  `,
})
export class JrmGrid {
  private readonly ctx = injectRenderContext<{
    columns?: number;
    gap?: number;
  }>();
  readonly props = this.ctx.props;
  readonly columns = computed(
    () => `repeat(${this.props().columns ?? 2}, minmax(0, 1fr))`,
  );
}

/** Material card with an optional header and an `actions` footer slot. */
@Component({
  selector: 'jrm-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [JrChildren, MatCardModule],
  template: `
    <mat-card [appearance]="props().appearance ?? 'outlined'">
      @if (props().title || props().subtitle) {
        <mat-card-header>
          @if (props().title) {
            <mat-card-title>{{ props().title }}</mat-card-title>
          }
          @if (props().subtitle) {
            <mat-card-subtitle>{{ props().subtitle }}</mat-card-subtitle>
          }
        </mat-card-header>
      }
      <mat-card-content><jr-children /></mat-card-content>
      <mat-card-actions align="end"><jr-children slot="actions" /></mat-card-actions>
    </mat-card>
  `,
})
export class JrmCard {
  private readonly ctx = injectRenderContext<{
    title?: string;
    subtitle?: string;
    appearance?: 'outlined' | 'raised' | 'filled';
  }>();
  readonly props = this.ctx.props;
}

/** Material toolbar for a page or section header. */
@Component({
  selector: 'jrm-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [JrChildren, MatToolbarModule],
  template: `
    <mat-toolbar [color]="props().color ?? null">
      @if (props().title) {
        <span>{{ props().title }}</span>
      }
      <span class="jrm-spacer"></span>
      <jr-children />
    </mat-toolbar>
  `,
  styles: `
    .jrm-spacer { flex: 1 1 auto; }
  `,
})
export class JrmToolbar {
  private readonly ctx = injectRenderContext<{
    title?: string;
    color?: ThemeColor;
  }>();
  readonly props = this.ctx.props;
}

/** Collapsible Material panel. */
@Component({
  selector: 'jrm-expansion-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [JrChildren, MatExpansionModule],
  template: `
    <mat-expansion-panel [expanded]="props().expanded ?? false">
      <mat-expansion-panel-header>
        <mat-panel-title>{{ props().title }}</mat-panel-title>
        @if (props().description) {
          <mat-panel-description>{{ props().description }}</mat-panel-description>
        }
      </mat-expansion-panel-header>
      <jr-children />
    </mat-expansion-panel>
  `,
})
export class JrmExpansionPanel {
  private readonly ctx = injectRenderContext<{
    title?: string;
    description?: string;
    expanded?: boolean;
  }>();
  readonly props = this.ctx.props;
}

/**
 * Collects the {@link JrmTab} children of a {@link JrmTabs}.
 *
 * `mat-tab-group` discovers its tabs with `@ContentChildren(MatTab)`, which a
 * spec-driven tree cannot satisfy — the tabs arrive as spec elements, not as
 * projected `<mat-tab>` nodes. Each `JrmTab` therefore hands its label and
 * body template to this registry, and `JrmTabs` replays them into real
 * `<mat-tab>` elements.
 */
export class JrmTabRegistry {
  readonly tabs = signal<
    ReadonlyArray<{ id: number; label: string; body: TemplateRef<unknown> }>
  >([]);
  private nextId = 0;

  register(label: string, body: TemplateRef<unknown>): void {
    const id = this.nextId++;
    this.tabs.update((tabs) => [...tabs, { id, label, body }]);
  }
}

/** Material tab group whose tabs come from `Tab` children in the spec. */
@Component({
  selector: 'jrm-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [JrChildren, MatTabsModule, NgTemplateOutlet],
  providers: [JrmTabRegistry],
  template: `
    <!-- Instantiates the Tab children so they can register themselves. Their
         own templates render through the outlets below, not here. -->
    <div class="jrm-tab-sources"><jr-children /></div>

    <mat-tab-group>
      @for (tab of registry.tabs(); track tab.id) {
        <mat-tab [label]="tab.label">
          <div class="jrm-tab-body">
            <ng-container *ngTemplateOutlet="tab.body" />
          </div>
        </mat-tab>
      }
    </mat-tab-group>
  `,
  styles: `
    .jrm-tab-sources { display: none; }
    .jrm-tab-body { padding: 16px 0; }
  `,
})
export class JrmTabs {
  readonly registry = inject(JrmTabRegistry);
}

/** A single tab; valid only as a direct child of `Tabs`. */
@Component({
  selector: 'jrm-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [JrChildren],
  template: `
    <ng-template #body><jr-children /></ng-template>
  `,
})
export class JrmTab {
  private readonly ctx = injectRenderContext<{ label?: string }>();
  private readonly registry = inject(JrmTabRegistry, { optional: true });
  private readonly body = viewChild.required<TemplateRef<unknown>>('body');

  constructor() {
    // Registering is a write to a signal the parent already read this cycle,
    // so it has to land outside change detection to avoid NG0100. The view
    // must also be created before `body()` resolves.
    afterNextRender(() => {
      this.registry?.register(this.ctx.props().label ?? '', this.body());
    });
  }
}

/** Horizontal Material divider. */
@Component({
  selector: 'jrm-divider',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDividerModule],
  template: `<mat-divider />`,
})
export class JrmDivider {}
