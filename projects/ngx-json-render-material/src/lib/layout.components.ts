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
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import {
  MatStep,
  MatStepper,
  MatStepperModule,
} from '@angular/material/stepper';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import {
  JrChildren,
  injectElementKey,
  injectRenderContext,
} from 'ngx-json-render';
import type { MaterialProps } from 'ngx-json-render-material/catalog';
import { JrmStepFields } from './field';

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
  private readonly ctx = injectRenderContext<MaterialProps<'Stack'>>();
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
  private readonly ctx = injectRenderContext<MaterialProps<'Grid'>>();
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
      @if (hasActions()) {
        <mat-card-actions align="end"><jr-children slot="actions" /></mat-card-actions>
      }
    </mat-card>
  `,
})
export class JrmCard {
  private readonly ctx = injectRenderContext<MaterialProps<'Card'>>();
  readonly props = this.ctx.props;
  /**
   * Material gives the actions row a min-height, so rendering it empty left
   * a blank strip under every card without buttons.
   */
  readonly hasActions = computed(
    () => (this.ctx.element().slots?.['actions']?.length ?? 0) > 0,
  );
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
  private readonly ctx = injectRenderContext<MaterialProps<'Toolbar'>>();
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
  private readonly ctx = injectRenderContext<MaterialProps<'ExpansionPanel'>>();
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

/**
 * Hand a panel's label and body to the registry of the `Tabs` or `Stepper`
 * above it, and take it back when the component is destroyed. Returns the
 * registration id, `null` until the body exists or outside any registry.
 */
function injectPanelRegistration(
  label: Signal<string>,
  body: Signal<TemplateRef<unknown> | undefined>,
): Signal<number | null> {
  const registry = inject(JrmTabRegistry, { optional: true });
  const key = injectElementKey();
  const id = signal<number | null>(null);

  // Registering is a write to a signal the parent already read this cycle,
  // so it has to land outside change detection to avoid NG0100 — and the
  // view must be created before `body()` resolves. An effect satisfies
  // both and, unlike afterNextRender, also runs on the server. Only the
  // template is read here: the label travels as a signal, so a patched
  // label reaches the parent without re-registering.
  effect(() => {
    const template = body();
    if (untracked(id) !== null || !template || !registry) return;
    id.set(registry.register({ key, label, body: template }));
  });

  inject(DestroyRef).onDestroy(() => {
    const registered = id();
    if (registered !== null) registry?.unregister(registered);
  });

  return id.asReadonly();
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
  private readonly ctx = injectRenderContext<MaterialProps<'Tab'>>();
  private readonly body = viewChild<TemplateRef<unknown>>('body');
  private readonly label = computed(() => this.ctx.props().label ?? '');

  constructor() {
    injectPanelRegistration(this.label, this.body);
  }
}

/**
 * Material stepper whose steps come from `Step` children in the spec.
 *
 * It works the way {@link JrmTabs} does — each `JrmStep` hands its label and
 * body to a {@link JrmTabRegistry}, and this component replays them into real
 * `<mat-step>` elements — plus Back/Next buttons that the steps render, Next
 * validating the step's own fields first.
 */
@Component({
  selector: 'jrm-stepper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [JrChildren, MatStepperModule, NgTemplateOutlet],
  providers: [JrmTabRegistry],
  template: `
    <!-- Instantiates the Step children so they can register themselves. -->
    <div class="jrm-tab-sources"><jr-children /></div>

    <!-- MatStepper throws on an index outside its steps, so it waits for the
         first one rather than start empty. -->
    @if (registry.tabs().length > 0) {
      <mat-stepper
        [orientation]="props().orientation ?? 'horizontal'"
        [linear]="props().linear ?? false"
        [selectedIndex]="selected()"
        (selectionChange)="onSelect($event.selectedIndex)"
      >
        @for (step of registry.tabs(); track step.id) {
          <mat-step [label]="step.label()" [completed]="passed().has(step.id)">
            <ng-container *ngTemplateOutlet="step.body" />
          </mat-step>
        }
      </mat-stepper>
    }
  `,
  styles: `
    .jrm-tab-sources { display: none; }
  `,
})
export class JrmStepper {
  readonly ctx = injectRenderContext<MaterialProps<'Stepper'>>();
  readonly props = this.ctx.props;
  readonly registry = inject(JrmTabRegistry);
  private readonly stepper = viewChild(MatStepper);
  private readonly steps = viewChildren(MatStep);

  /** Steps whose Next has passed validation; in linear mode only these unlock the next header. */
  readonly passed = signal<ReadonlySet<number>>(new Set());

  /**
   * The open step, clamped to the steps that exist: the index can arrive in
   * a patch before the steps it points at do.
   */
  readonly selected = computed(() => {
    const last = Math.max(this.registry.tabs().length - 1, 0);
    const index = Math.trunc(Number(this.props().selected ?? 0));
    return Number.isNaN(index) ? 0 : Math.min(Math.max(index, 0), last);
  });

  /** Position of a registered step, -1 when it is not mounted. */
  indexOf(id: number | null): number {
    return this.registry.tabs().findIndex((step) => step.id === id);
  }

  /** Mark a step passed and open the one after it. */
  next(id: number | null): void {
    const step = this.steps()[this.indexOf(id)];
    if (!step || id === null) return;
    // Set directly as well as through the [completed] binding: the binding
    // only lands on the next change detection, and linear mode checks
    // completion inside next() itself.
    step.completed = true;
    this.passed.update((passed) => new Set(passed).add(id));
    this.stepper()?.next();
  }

  previous(): void {
    this.stepper()?.previous();
  }

  onSelect(index: number): void {
    if (this.ctx.bindings()?.['selected']) {
      this.ctx.setBound('selected', index);
    }
  }
}

/**
 * A single step; valid only as a direct child of `Stepper`. It renders its
 * children and the step's Back/Next buttons, and provides the scope its
 * fields register in, so Next validates only what this step shows.
 */
@Component({
  selector: 'jrm-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [JrChildren, MatButtonModule],
  providers: [JrmStepFields],
  template: `
    <ng-template #body>
      <div class="jrm-step-body"><jr-children /></div>
      @if (count() > 1) {
        <div class="jrm-step-nav">
          @if (index() > 0) {
            <button matButton="text" type="button" (click)="back()">
              {{ stepper?.props()?.backLabel ?? 'Back' }}
            </button>
          }
          @if (index() < count() - 1) {
            <button matButton="filled" type="button" (click)="next()">
              {{ stepper?.props()?.nextLabel ?? 'Next' }}
            </button>
          }
        </div>
      }
    </ng-template>
  `,
  styles: `
    .jrm-step-body { padding: 16px 0 8px; }
    .jrm-step-nav { display: flex; gap: 8px; }
  `,
})
export class JrmStep {
  private readonly ctx = injectRenderContext<MaterialProps<'Step'>>();
  readonly stepper = inject(JrmStepper, { optional: true });
  private readonly fields = inject(JrmStepFields);
  private readonly body = viewChild<TemplateRef<unknown>>('body');
  private readonly label = computed(() => this.ctx.props().label ?? '');
  private readonly id = injectPanelRegistration(this.label, this.body);

  readonly index = computed(() => this.stepper?.indexOf(this.id()) ?? -1);
  readonly count = computed(() => this.stepper?.registry.tabs().length ?? 0);

  back(): void {
    this.stepper?.previous();
  }

  /** Validate this step's fields, and move on only when they all pass. */
  next(): void {
    if (!this.fields.validate()) return;
    this.stepper?.next(this.id());
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
