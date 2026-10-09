import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { UIMessage } from 'ai';
import { JsonRenderer, jsonRenderMessage } from 'ngx-json-render';
import { materialRegistry } from 'ngx-json-render-material';

/** One chat turn: its prose, then the UI its spec parts describe. */
@Component({
  selector: 'app-chat-message',
  imports: [JsonRenderer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (content.text()) {
      <p>{{ content.text() }}</p>
    }
    @if (content.hasSpec()) {
      <json-render [spec]="content.spec()" [registry]="registry" [loading]="streaming()" />
    }
  `,
  styles: `
    :host {
      display: block;
    }
    :host(.user) p {
      margin-left: auto;
      width: fit-content;
      max-width: 80%;
      padding: 0.5rem 1rem;
      border-radius: 1rem;
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
    }
  `,
  host: { '[class.user]': 'message().role === "user"' },
})
export class ChatMessage {
  readonly message = input.required<UIMessage>();
  readonly streaming = input(false);

  /** The text and the spec of the message, rebuilt whenever its parts change. */
  readonly content = jsonRenderMessage(() => this.message().parts);
  readonly registry = materialRegistry;
}
