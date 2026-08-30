import { Component, computed, signal } from '@angular/core';
import { JsonRenderer, injectUIStream } from 'ngx-json-render';
import { catalog } from '../catalog/catalog';
import { registry } from '../catalog/registry';
import { SpecCheck } from '../spec-check/spec-check';
import { RECORDINGS } from '../specs/stream';
import { recordedTransport } from './recorded-transport';

/** Pace of the replay: slow enough to watch the UI assemble. */
const LINE_DELAY_MS = 220;

/**
 * The Streaming tab, driven by `injectUIStream` — the same client an app
 * writes — against a transport that replays a recorded generation.
 *
 * Nothing here reaches a model: the recordings are fixed, and the only thing
 * standing in for a server is the transport.
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

  readonly prompt = signal(RECORDINGS[0].prompt);
  readonly failNext = signal(false);

  readonly ui = injectUIStream({
    api: '/api/generate',
    fetch: recordedTransport({
      delayMs: LINE_DELAY_MS,
      fail: () => this.failNext(),
      promptOf: (body) => String(body['prompt'] ?? ''),
      find: (prompt) => RECORDINGS.find((r) => r.prompt === prompt),
    }),
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
}
