import {
  type ApplicationConfig,
  inject,
  provideBrowserGlobalErrorListeners,
  provideEnvironmentInitializer,
} from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // The Material catalog names icons as Material Symbols ligatures
    // ("trending_up", "check_circle"), so point mat-icon at that font — the
    // default font set is still the older Material Icons class.
    provideEnvironmentInitializer(() =>
      inject(MatIconRegistry).setDefaultFontSetClass(
        'material-symbols-outlined',
      ),
    ),
  ],
};
