import { Component, inject, signal } from '@angular/core';
import { JsonRenderer, injectChatUI } from 'ngx-json-render';
import { catalog } from '../catalog/catalog';
import { registry } from '../catalog/registry';
import { ApiKeyStore } from '../live/api-key';
import {
  type LiveMessage,
  liveOrRecorded,
  liveTransport,
} from '../live/live-transport';
import { CHAT_EXCHANGES, type ChatExchange } from '../specs/chat';
import { recordedTransport } from '../streaming/recorded-transport';

/** Chat replies arrive faster than a generation: shorter lines, less prose. */
const LINE_DELAY_MS = 120;

/**
 * The Chat tab, on `injectChatUI` — the second agent API, for the case where a
 * model answers in prose and renders a UI in the same turn.
 *
 * Each assistant message carries its own spec, so earlier turns keep the UI
 * they generated. As in the Streaming tab, a key swaps the transport for a
 * live one and nothing else changes.
 */
@Component({
  selector: 'app-chat',
  imports: [JsonRenderer],
  templateUrl: './chat.html',
  styleUrl: './chat.css',
})
export class ChatTab {
  readonly registry = registry;
  readonly exchanges = CHAT_EXCHANGES;
  readonly failNext = signal(false);
  readonly keys = inject(ApiKeyStore);

  readonly draft = signal('');

  readonly chat = injectChatUI({
    api: '/api/chat',
    fetch: liveOrRecorded(
      () => this.keys.isLive(),
      liveTransport({
        settings: () => this.keys.settings(),
        // `inline`, not the default: this tab wants prose and patches in the
        // same reply, which is what the mixed parser splits back apart.
        system: () => catalog.prompt({ mode: 'inline' }),
        messagesOf: (body) => conversation(body),
        usageLine: false,
      }),
      recordedTransport({
        delayMs: LINE_DELAY_MS,
        fail: () => this.failNext(),
        promptOf: (body) => lastUserMessage(body),
        find: (ask) => CHAT_EXCHANGES.find((e) => e.ask === ask),
      }),
    ),
  });

  ask(exchange: ChatExchange): void {
    void this.chat.send(exchange.ask);
  }

  /** Live mode takes anything; the recordings only answer their own asks. */
  send(event: Event): void {
    event.preventDefault();
    const text = this.draft().trim();
    if (!text) return;
    this.draft.set('');
    void this.chat.send(text);
  }

  onDraft(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }
}

/**
 * The whole conversation, as the Messages API wants it. `injectChatUI` already
 * posts `{ role, content }` pairs, so this is a filter rather than a mapping:
 * a turn with no text left after the patches were split out would be an empty
 * message, which the API rejects.
 */
function conversation(body: Record<string, unknown>): LiveMessage[] {
  const messages = body['messages'];
  if (!Array.isArray(messages)) return [];
  return (messages as { role?: string; content?: string }[])
    .filter((m) => m.content?.trim())
    .map((m) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: String(m.content),
    }));
}

/**
 * `injectChatUI` posts the whole conversation; the recording answers the last
 * thing the user said.
 */
function lastUserMessage(body: Record<string, unknown>): string {
  const messages = body['messages'];
  if (!Array.isArray(messages)) return '';
  const last = [...messages]
    .reverse()
    .find((m: { role?: string }) => m.role === 'user') as
    { content?: string } | undefined;
  return last?.content ?? '';
}
