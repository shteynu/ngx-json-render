import {
  inject,
  provideBrowserGlobalErrorListeners,
  provideEnvironmentInitializer,
} from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideCopilotKit } from '@copilotkit/angular';
import { provideJsonRender } from 'ngx-json-render';
import { jsonRenderActivityRenderer } from 'ngx-json-render/ag-ui';
import { materialRegistry } from 'ngx-json-render-material';
import { materialCatalog } from 'ngx-json-render-material/catalog';
import { App } from './app/app';

bootstrapApplication(App, {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // The Material catalog names icons as Material Symbols ligatures, so point
    // mat-icon at that font instead of the older Material Icons class.
    provideEnvironmentInitializer(() =>
      inject(MatIconRegistry).setDefaultFontSetClass(
        'material-symbols-outlined',
      ),
    ),
    // What every json-render activity draws with. The catalog lets the
    // renderer check each spec once its run ends, and hold back elements
    // whose props have not streamed in yet.
    provideJsonRender({
      registry: materialRegistry,
      catalog: materialCatalog,
      validate: 'warn',
    }),
    // `ng serve` proxies /api to the runtime on port 3000. The activity
    // renderer draws every `json-render-spec` activity the agent sends.
    provideCopilotKit({
      runtimeUrl: '/api/copilotkit',
      renderActivityMessages: [jsonRenderActivityRenderer()],
    }),
  ],
}).catch((err: unknown) => console.error(err));
