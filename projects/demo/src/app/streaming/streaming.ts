import { Component, computed, inject, signal } from '@angular/core';
import { JsonRenderer, injectUIStream } from 'ngx-json-render';
import { catalog } from '../catalog/catalog';
import { registry } from '../catalog/registry';
import { ApiKeyStore } from '../live/api-key';
import { liveOrRecorded, liveTransport } from '../live/live-transport';
import { SpecCheck } from '../spec-check/spec-check';
import { RECORDINGS } from '../specs/stream';
import { recordedTransport } from './recorded-transport';

/** Pace of the replay: slow enough to watch the UI assemble. */
const LINE_DELAY_MS = 220;

/**
 * The Streaming tab, driven by `injectUIStream` — the same client an app
 * writes.
 *
 * With no key it replays a recorded generation; with one it calls the model
 * directly. Both are the same seam: only the transport differs, and the
 * client never learns which one it got.
 */
@Component({
  selector: 'app-stream',
  imports: [JsonRenderer, SpecCheck],
  templateUrl: './streaming.html',
  styleUrl: './streaming.css',
})
export class StreamTab {
  readonly registry = registry;
  readonly recordings = RECORDINGS;
  readonly componentNames = catalog.componentNames;
  readonly keys = inject(ApiKeyStore);

  readonly prompt = signal(RECORDINGS[0].prompt);
  readonly draft = signal('');
  readonly failNext = signal(false);

  readonly ui = injectUIStream({
    api: '/api/generate',
    fetch: liveOrRecorded(
      () => this.keys.isLive(),
      liveTransport({
        settings: () => this.keys.settings(),
        // The default mode: patches only, no prose — which is exactly what
        // `injectUIStream` reads.
        system: () => catalog.prompt(),
        messagesOf: (body) => [
          { role: 'user', content: String(body['prompt'] ?? '') },
        ],
        usageLine: true,
      }),
      recordedTransport({
        delayMs: LINE_DELAY_MS,
        fail: () => this.failNext(),
        promptOf: (body) => String(body['prompt'] ?? ''),
        find: (prompt) => RECORDINGS.find((r) => r.prompt === prompt),
      }),
    ),
  });

  readonly hasOutput = computed(() => this.ui.rawLines().length > 0);

  /**
   * A spec that is still streaming is *supposed* to reference children that
   * have not arrived yet — that is what `loading` means to the renderer — so
   * checking it mid-stream reports gaps that are not defects.
   */
  readonly checkUnavailable = computed(() =>
    this.ui.isStreaming()
      ? 'Checking when the stream finishes — a partial spec is expected to have gaps.'
      : null,
  );

  /** The note attached to the running prompt, if it is a flawed recording. */
  readonly note = computed(
    () => RECORDINGS.find((r) => r.prompt === this.prompt())?.note ?? null,
  );

  generate(prompt: string): void {
    this.prompt.set(prompt);
    void this.ui.send(prompt);
  }

  /** Live mode takes any prompt; the recordings only answer their own. */
  generateDraft(event: Event): void {
    event.preventDefault();
    const prompt = this.draft().trim();
    if (prompt) this.generate(prompt);
  }

  onDraft(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }
}
