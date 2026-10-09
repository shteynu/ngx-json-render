import {
  inject,
  provideBrowserGlobalErrorListeners,
  provideEnvironmentInitializer,
} from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { bootstrapApplication } from '@angular/platform-browser';
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
  ],
}).catch((err: unknown) => console.error(err));
