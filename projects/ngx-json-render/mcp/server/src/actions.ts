// Actions that only make sense inside an MCP Apps host. A catalog stays
// host-neutral; the server adds these to the catalog it describes to the
// model, and the view handles them (`injectJsonRenderApp().handlers` in
// `ngx-json-render/mcp`).
import { type Catalog, defineCatalog } from '@json-render/core';
import { z } from 'zod';

/**
 * `sendMessage`: post a message to the chat as the user, so the conversation
 * carries on from what was clicked in the view.
 */
export const sendMessageAction = {
  params: z.object({
    text: z.string(),
    data: z.record(z.string(), z.unknown()).optional(),
  }),
  description:
    'Send a message to you, the assistant, as the user, so the conversation continues from the UI. ' +
    'Params: { "text": "what the user chose or asks for", "data"?: { "$state": "/path" } }. `data` is optional and is attached as JSON; ' +
    'make it a single reference to a state object, because references nested inside `data` are not resolved. ' +
    'Use it for choices and follow-ups ("Approve", "Show more", a picked option). ' +
    'To send a form, gate it with submitForm: ' +
    '{ "action": "submitForm", "params": { "action": "sendMessage", "params": { "text": "Submit the sign-up form", "data": { "$state": "/form" } } } }. ' +
    "The host puts the message in the chat as the user's (Claude lets the user review it and send it), so write `text` in their voice.",
};

const withSendMessageCache = new WeakMap<Catalog, Catalog>();

/**
 * `catalog` plus the {@link sendMessageAction}, the same object for the same
 * catalog, so the input schema built from it is built once.
 */
export function withSendMessage<C extends Catalog>(catalog: C): C {
  let extended = withSendMessageCache.get(catalog);
  if (!extended) {
    const data = catalog.data as {
      actions?: Record<string, unknown>;
    } & Record<string, unknown>;
    extended = defineCatalog(catalog.schema, {
      ...data,
      actions: { ...data.actions, sendMessage: sendMessageAction },
    } as Parameters<typeof defineCatalog>[1]);
    withSendMessageCache.set(catalog, extended);
  }
  return extended as C;
}
