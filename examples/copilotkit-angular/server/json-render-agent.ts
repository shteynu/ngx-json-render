import { AbstractAgent, type AgentConfig } from '@ag-ui/client';
import {
  type BaseEvent,
  EventType,
  type Message,
  type RunAgentInput,
} from '@ag-ui/core';
import { createMixedStreamParser } from '@json-render/core';
import { type LanguageModel, type ModelMessage, streamText } from 'ai';
import { Observable } from 'rxjs';

/**
 * The activity type `jsonRenderActivityRenderer()` draws. It is
 * `JSON_RENDER_ACTIVITY_TYPE` from `ngx-json-render/ag-ui`, written out here
 * because that entry point is Angular code and this file runs in plain Node.
 */
const ACTIVITY_TYPE = 'json-render-spec';

export interface JsonRenderAgentOptions {
  model: LanguageModel;
  /** The system prompt: `catalog.prompt({ mode: 'inline' })`. */
  system: string;
}

/**
 * An AG-UI agent that answers with prose and a json-render spec. The model
 * writes prose, then a ```spec fence of JSONL patches, as the catalog's
 * inline prompt asks. Prose goes out as a text message. The patches go out
 * as one activity: an `ACTIVITY_SNAPSHOT` with an empty spec, then one
 * `ACTIVITY_DELTA` per patch, which CopilotKit hands to the activity
 * renderer registered for `json-render-spec`.
 */
export class JsonRenderAgent extends AbstractAgent {
  constructor(
    private readonly options: JsonRenderAgentOptions,
    config: AgentConfig = {},
  ) {
    super(config);
  }

  override run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable<BaseEvent>((subscriber) => {
      const { threadId, runId } = input;
      const abort = new AbortController();
      const emit = (event: object) => subscriber.next(event as BaseEvent);
      const textId = crypto.randomUUID();
      const uiId = crypto.randomUUID();
      let textOpen = false;
      let uiOpen = false;

      const parser = createMixedStreamParser({
        onText: (line) => {
          // The parser hands over whole lines, without their line break.
          // Put the break between lines, not after the last one.
          const delta = textOpen ? `\n${line}` : line;
          if (!textOpen) {
            textOpen = true;
            emit({
              type: EventType.TEXT_MESSAGE_START,
              messageId: textId,
              role: 'assistant',
            });
          }
          emit({
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId: textId,
            delta,
          });
        },
        onPatch: (patch) => {
          if (!uiOpen) {
            uiOpen = true;
            emit({
              type: EventType.ACTIVITY_SNAPSHOT,
              messageId: uiId,
              activityType: ACTIVITY_TYPE,
              content: { root: '', elements: {} },
            });
          }
          emit({
            type: EventType.ACTIVITY_DELTA,
            messageId: uiId,
            activityType: ACTIVITY_TYPE,
            patch: [patch],
          });
        },
      });

      const answer = async () => {
        emit({ type: EventType.RUN_STARTED, threadId, runId });
        const result = streamText({
          model: this.options.model,
          system: this.options.system,
          messages: toModelMessages(input.messages),
          abortSignal: abort.signal,
        });
        for await (const chunk of result.textStream) parser.push(chunk);
        parser.flush();
        if (textOpen) {
          emit({ type: EventType.TEXT_MESSAGE_END, messageId: textId });
        }
        emit({ type: EventType.RUN_FINISHED, threadId, runId });
        subscriber.complete();
      };

      answer().catch((error: unknown) => {
        if (abort.signal.aborted) return;
        emit({
          type: EventType.RUN_ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        subscriber.complete();
      });

      return () => abort.abort();
    });
  }

  override clone(): JsonRenderAgent {
    return new JsonRenderAgent(this.options, {
      agentId: this.agentId,
      description: this.description,
    });
  }
}

/**
 * The thread as the model reads it: what the user asked and the prose it
 * answered. The specs it drew are activity messages, which are left out.
 */
function toModelMessages(messages: Message[]): ModelMessage[] {
  return messages.flatMap((message): ModelMessage[] => {
    if (message.role !== 'user' && message.role !== 'assistant') return [];
    const text = textOf(message.content);
    return text ? [{ role: message.role, content: text }] : [];
  });
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part: { type?: unknown; text?: unknown }) =>
      part.type === 'text' && typeof part.text === 'string' ? part.text : '',
    )
    .join('');
}
