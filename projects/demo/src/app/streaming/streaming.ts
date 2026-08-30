import { Component, computed, signal } from '@angular/core';
import { JsonRenderer, injectUIStream } from 'ngx-json-render';
import { registry } from '../catalog/registry';
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
  imports: [JsonRenderer],
  templateUrl: './streaming.html',
  styleUrl: './streaming.css',
})
export class StreamTab {
  readonly registry = registry;
  readonly recordings = RECORDINGS;

  readonly prompt = signal(RECORDINGS[0].prompt);
  readonly failNext = signal(false);

  readonly ui = injectUIStream({
    api: '/api/generate',
    fetch: recordedTransport({
      delayMs: LINE_DELAY_MS,
      fail: () => this.failNext(),
      find: (prompt) => RECORDINGS.find((r) => r.prompt === prompt),
    }),
  });

  readonly hasOutput = computed(() => this.ui.rawLines().length > 0);

  generate(prompt: string): void {
    this.prompt.set(prompt);
    void this.ui.send(prompt);
  }
}
