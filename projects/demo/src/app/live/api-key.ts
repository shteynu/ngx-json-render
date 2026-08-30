import { Injectable, computed, signal } from '@angular/core';

/**
 * Models offered to a visitor who brings a key. Opus 5 first, because it is
 * the default this library's own docs recommend; the other two are here so a
 * visitor can spend less of their own money to see the same thing.
 */
export const LIVE_MODELS = [
  { id: 'claude-opus-5', label: 'Opus 5' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
] as const;

export type LiveModel = (typeof LIVE_MODELS)[number]['id'];

/** What the live transport needs to make a call. */
export interface LiveSettings {
  readonly key: string;
  readonly model: LiveModel;
}

/**
 * `sessionStorage`, not `localStorage`: a key typed into a public demo page
 * should not outlive the tab it was typed into.
 */
const STORAGE_KEY = 'ngx-json-render-demo/anthropic-key';

/** Storage is absent or refused in enough browsers to be worth guarding. */
function read(): string {
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function write(key: string): void {
  try {
    if (key) sessionStorage.setItem(STORAGE_KEY, key);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // A visitor with storage disabled still gets a working session; the key
    // simply does not survive a reload.
  }
}

/**
 * The visitor's own API key, and the only place the demo keeps it.
 *
 * Nothing here is logged, sent to this site, or put in a URL: the key goes
 * from this store straight into the `x-api-key` header of a call the
 * visitor's own browser makes to `api.anthropic.com`.
 */
@Injectable({ providedIn: 'root' })
export class ApiKeyStore {
  private readonly _key = signal(read());

  readonly key = this._key.asReadonly();
  readonly model = signal<LiveModel>(LIVE_MODELS[0].id);

  /** True once a key is present — the flag both tabs switch their transport on. */
  readonly isLive = computed(() => this._key().length > 0);

  readonly settings = computed<LiveSettings | null>(() =>
    this.isLive() ? { key: this._key(), model: this.model() } : null,
  );

  set(key: string): void {
    const trimmed = key.trim();
    this._key.set(trimmed);
    write(trimmed);
  }

  clear(): void {
    this.set('');
  }
}
