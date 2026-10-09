import type { JsonPatch } from '@json-render/core';

/** Token usage as the AI SDK reports it in its usage line. */
export interface StreamObserverUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Hooks into every `injectUIStream` and `injectChatUI` generation in the app,
 * the counterpart of `registerActionObserver` in `@json-render/core`. This is
 * what `ngx-json-render/devtools` fills its Stream tab from, so it is private
 * API: the `ɵ` prefix says it may change in any release.
 */
export interface StreamObserver {
  /** A generation started. */
  onStart?(): void;
  /** A patch was applied to the spec, in arrival order. */
  onPatch?(patch: JsonPatch): void;
  /** A line of prose arrived (`injectChatUI` only). */
  onText?(text: string): void;
  /** The usage line arrived (`injectUIStream` only). */
  onUsage?(usage: StreamObserverUsage): void;
  /** The generation ended; `ok` is false on an error, true on a stop. */
  onEnd?(ok: boolean): void;
}

const observers = new Set<StreamObserver>();

/**
 * Register an observer for every stream in the app. Returns the function that
 * removes it. Private API for `ngx-json-render/devtools`.
 */
export function ɵregisterStreamObserver(observer: StreamObserver): () => void {
  observers.add(observer);
  return () => {
    observers.delete(observer);
  };
}

/**
 * Tell every observer. An observer that throws is a devtools bug, and it must
 * not become a failed generation in the app it is inspecting.
 */
export function notifyStreamObservers<K extends keyof StreamObserver>(
  event: K,
  ...args: Parameters<NonNullable<StreamObserver[K]>>
): void {
  if (observers.size === 0) return;
  for (const observer of observers) {
    try {
      (observer[event] as ((...a: typeof args) => void) | undefined)?.(...args);
    } catch (error) {
      console.error('[ngx-json-render] A stream observer threw:', error);
    }
  }
}
