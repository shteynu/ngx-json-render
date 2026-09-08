import { Component, effect, input, output, viewChild } from '@angular/core';
import {
  type ActionHandler,
  JsonRenderer,
  type JsonRenderStateService,
  type Spec,
  type StateChange,
} from 'ngx-json-render';
import { registry } from '../catalog/registry';

/**
 * The interactive tab: one `<json-render>` and the panes that explain it.
 *
 * It exists as its own component so that `<app-root>` never names the
 * renderer or the catalog registry — the two together drag in the library,
 * `@json-render/core` and zod. Everything that decides *what* to render stays
 * up in `App`, which is why the demo's specs still address it there.
 */
@Component({
  selector: 'app-interactive',
  imports: [JsonRenderer],
  templateUrl: './interactive.html',
  styleUrl: './interactive.css',
})
export class InteractiveTab {
  readonly spec = input.required<Spec>();
  readonly specJson = input.required<string>();
  readonly log = input.required<string[]>();
  readonly handlers = input.required<Record<string, ActionHandler>>();
  readonly onAction =
    input.required<(name: string, params?: Record<string, unknown>) => void>();

  readonly stateChange = output<StateChange[]>();
  /** The renderer's store, handed up so `App`'s handlers can write to it. */
  readonly ready = output<JsonRenderStateService>();

  readonly registry = registry;

  private readonly renderer = viewChild<JsonRenderer>('renderer');

  constructor() {
    effect(() => {
      const renderer = this.renderer();
      if (renderer) this.ready.emit(renderer.stateStore);
    });
  }
}
