import {
  Component,
  InjectionToken,
  computed,
  effect,
  inject,
} from '@angular/core';
import type { McpUiTheme } from '@modelcontextprotocol/ext-apps';
import { JsonRenderer } from 'ngx-json-render';
import { materialRegistry } from 'ngx-json-render-material';
import {
  type JsonRenderAppOptions,
  injectJsonRenderApp,
} from 'ngx-json-render/mcp';

/** Extra options for the app's connection — tests use it to supply a transport. */
export const JSON_RENDER_APP_OPTIONS = new InjectionToken<JsonRenderAppOptions>(
  'JSON_RENDER_APP_OPTIONS',
);

/**
 * The view an MCP host shows in its iframe: whatever spec the model passed
 * to the `render-ui` tool, rendered with the Material catalog.
 */
@Component({
  selector: 'app-root',
  imports: [JsonRenderer],
  template: `
    @if (mcp.error(); as error) {
      <p class="status error">Could not connect to the host: {{ error.message }}</p>
    } @else if (mcp.spec(); as spec) {
      <json-render
        [spec]="spec"
        [loading]="mcp.loading()"
        [registry]="registry"
        [handlers]="handlers"
      />
      @if (notice(); as notice) {
        <p
          class="status"
          [class.error]="notice.error"
          [attr.role]="notice.error ? 'alert' : 'status'"
        >
          {{ notice.text }}
        </p>
      }
    } @else {
      <p class="status">Waiting for the model's spec…</p>
    }
  `,
  styles: `
    :host {
      display: block;
      padding: 16px;
    }
    json-render + .status {
      margin-top: 12px;
    }
    .status {
      margin: 0;
      font: 14px/1.5 Roboto, system-ui, sans-serif;
      opacity: 0.7;
    }
    .error {
      color: #b3261e;
      opacity: 1;
    }
  `,
})
export class App {
  readonly mcp = injectJsonRenderApp({
    name: 'ngx-json-render',
    version: '0.0.0',
    ...inject(JSON_RENDER_APP_OPTIONS, { optional: true }),
  });
  readonly registry = materialRegistry;

  /**
   * The actions `server/catalog.ts` adds to the Material catalog. A spec's
   * built-in actions (setState, submitForm, …) never reach these.
   */
  readonly handlers = this.mcp.handlers;

  /**
   * What became of the last `sendMessage`. A host may decline it, or not take
   * messages at all, and without this a press would look like it did nothing.
   */
  readonly notice = computed(() => {
    const outcome = this.mcp.lastMessage();
    if (!outcome) return null;
    return outcome.ok
      ? { error: false, text: 'Message passed to the chat.' }
      : {
          error: true,
          text: `Could not send the message: ${outcome.error.message}`,
        };
  });

  constructor() {
    // Follow the host's light/dark theme: the Material theme is emitted under
    // `color-scheme: light dark`, so setting the scheme switches the palette.
    const applyTheme = (theme: McpUiTheme | undefined) => {
      if (theme) document.documentElement.style.colorScheme = theme;
    };
    this.mcp.app.addEventListener('hostcontextchanged', (context) =>
      applyTheme(context.theme),
    );
    effect(() => {
      if (this.mcp.connected())
        applyTheme(this.mcp.app.getHostContext()?.theme);
    });
  }
}
