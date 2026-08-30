import { Component, inject, signal } from '@angular/core';
import { ApiKeyStore, LIVE_MODELS, type LiveModel } from './api-key';

/**
 * Where a visitor puts their own Anthropic key, and the copy that tells them
 * what happens to it.
 *
 * The key is never rendered back: once accepted it lives in the store and is
 * only ever read by the live transport, on its way into a request header.
 */
@Component({
  selector: 'app-key-panel',
  templateUrl: './key-panel.html',
  styleUrl: './key-panel.css',
})
export class KeyPanel {
  readonly store = inject(ApiKeyStore);
  readonly models = LIVE_MODELS;

  /** The half-typed key, held only until it is accepted. */
  readonly draft = signal('');

  onDraft(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }

  onModel(event: Event): void {
    this.store.model.set(
      (event.target as HTMLSelectElement).value as LiveModel,
    );
  }

  save(event: Event): void {
    event.preventDefault();
    const key = this.draft().trim();
    if (!key) return;
    this.store.set(key);
    this.draft.set('');
  }

  clear(): void {
    this.store.clear();
    this.draft.set('');
  }
}
