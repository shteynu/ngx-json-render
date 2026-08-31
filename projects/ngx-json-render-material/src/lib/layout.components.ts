import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injectable,
  type Signal,
  type TemplateRef,
  computed,
  effect,
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
import {
  JrChildren,
  injectElementKey,
  injectRenderContext,
} from 'ngx-json-render';
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

/** A {@link JrmTab} currently mounted under a {@link JrmTabs}. */
export interface RegisteredTab {
  /** Registration identity, stable for the lifetime of the `JrmTab`. */
  id: number;
  /** Spec key of the `Tab` element, which is what gives the tab its place. */
  key: Signal<string>;
  label: Signal<string>;
  body: TemplateRef<unknown>;
}

/**
 * Collects the {@link JrmTab} children of a {@link JrmTabs}.
 *
 * `mat-tab-group` discovers its tabs with `@ContentChildren(MatTab)`, which a
 * spec-driven tree cannot satisfy — the tabs arrive as spec elements, not as
 * projected `<mat-tab>` nodes. Each `JrmTab` therefore hands its label and
 * body template to this registry, and `JrmTabs` replays them into real
 * `<mat-tab>` elements.
 *
 * The registry is a projection of the tabs that are mounted right now, not a
 * log of the ones that ever registered: entries leave when their component is
 * destroyed, labels are held as signals so a label refined later in the
 * stream updates in place, and order comes from the `Tabs` element's
 * `children` array. A spec that keeps changing — the library's headline
 * scenario — therefore stays in sync.
 */
@Injectable()
export class JrmTabRegistry {
  private readonly ctx = injectRenderContext();
  private readonly entries = signal<ReadonlyArray<RegisteredTab>>([]);
  private nextId = 0;

  /** The `Tabs` element's ordered child keys. */
  private readonly order = computed<ReadonlyArray<string>>(
    () => this.ctx.element()?.children ?? [],
  );

  /**
   * The mounted tabs in spec order. Registration order only breaks ties —
   * between repeated keys, or for a tab whose key the `Tabs` element does not
   * list (a `Tab` reparented mid-stream, say).
   */
  readonly tabs = computed<ReadonlyArray<RegisteredTab>>(() => {
    const order = this.order();
    const rank = (tab: RegisteredTab): number => {
      const index = order.indexOf(tab.key());
      return index === -1 ? order.length : index;
    };
    return [...this.entries()].sort((a, b) => rank(a) - rank(b) || a.id - b.id);
  });

  /** Register a mounted tab. Returns the id that releases it again. */
  register(tab: Omit<RegisteredTab, 'id'>): number {
    const id = this.nextId++;
    this.entries.update((tabs) => [...tabs, { ...tab, id }]);
    return id;
  }

  /** Release a tab whose component has been destroyed. */
  unregister(id: number): void {
    this.entries.update((tabs) => tabs.filter((tab) => tab.id !== id));
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
        <mat-tab [label]="tab.label()">
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
  private readonly key = injectElementKey();
  private readonly body = viewChild<TemplateRef<unknown>>('body');
  private readonly label = computed(() => this.ctx.props().label ?? '');

  constructor() {
    let id: number | null = null;

    // Registering is a write to a signal the parent already read this cycle,
    // so it has to land outside change detection to avoid NG0100 — and the
    // view must be created before `body()` resolves. An effect satisfies
    // both and, unlike afterNextRender, also runs on the server. Only the
    // template is read here: the label travels as a signal, so a patched
    // label reaches the group without re-registering.
    effect(() => {
      const body = this.body();
      if (id !== null || !body) return;
      id =
        this.registry?.register({
          key: this.key,
          label: this.label,
          body,
        }) ?? null;
    });

    inject(DestroyRef).onDestroy(() => {
      if (id !== null) this.registry?.unregister(id);
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
