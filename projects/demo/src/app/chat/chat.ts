import { Component, signal } from '@angular/core';
import { JsonRenderer, injectChatUI } from 'ngx-json-render';
import { registry } from '../catalog/registry';
import { CHAT_EXCHANGES, type ChatExchange } from '../specs/chat';
import { recordedTransport } from '../streaming/recorded-transport';

/** Chat replies arrive faster than a generation: shorter lines, less prose. */
const LINE_DELAY_MS = 120;

/**
 * The Chat tab, on `injectChatUI` — the second agent API, for the case where a
 * model answers in prose and renders a UI in the same turn.
 *
 * Each assistant message carries its own spec, so earlier turns keep the UI
 * they generated. As in the Streaming tab, only the transport is recorded.
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

  readonly chat = injectChatUI({
    api: '/api/chat',
    fetch: recordedTransport({
      delayMs: LINE_DELAY_MS,
      fail: () => this.failNext(),
      promptOf: (body) => lastUserMessage(body),
      find: (ask) => CHAT_EXCHANGES.find((e) => e.ask === ask),
    }),
  });

  ask(exchange: ChatExchange): void {
    void this.chat.send(exchange.ask);
  }
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
