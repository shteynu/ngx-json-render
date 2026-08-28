import { DestroyRef, type Signal, inject, signal } from '@angular/core';
import { isDevtoolsActive, subscribeDevtoolsActive } from '@json-render/core';

/**
 * Reactive mirror of the json-render devtools-active flag. When active, the
 * renderer wraps each element with a `data-jr-key` attribute for the picker.
 */
export function injectDevtoolsActive(): Signal<boolean> {
  const active = signal(isDevtoolsActive());
  const unsubscribe = subscribeDevtoolsActive(() =>
    active.set(isDevtoolsActive()),
  );
  inject(DestroyRef).onDestroy(unsubscribe);
  return active.asReadonly();
}
