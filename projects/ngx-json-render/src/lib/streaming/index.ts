/**
 * Streaming: applying a model's output to a spec as it arrives.
 *
 * - `patch` — the immutable RFC 6902 engine every entry point applies through.
 * - `transport` — one streamed request lifecycle, shared by both hooks.
 * - `parts` — adapters for the AI SDK's message parts.
 * - `ui-stream` / `chat-ui` — the two hooks, composed from the above.
 */
export { applyPatch } from './patch';
export {
  buildSpecFromParts,
  flatToTree,
  getTextFromParts,
  jsonRenderMessage,
  type DataPart,
} from './parts';
export {
  injectUIStream,
  type TokenUsage,
  type UIStreamOptions,
  type UIStreamReturn,
  type UIStreamSendOptions,
} from './ui-stream';
export {
  injectChatUI,
  type ChatMessage,
  type ChatUIOptions,
  type ChatUIReturn,
} from './chat-ui';
