/*
 * Public API Surface of ngx-json-render/mcp/server
 *
 * The server half of an MCP App for a json-render catalog: the `render-ui`
 * tool and the `ui://` view resource. Angular-free, so it runs in Node or on
 * an edge function; the view it serves is built with `ngx-json-render/mcp`.
 */

export { sendMessageAction, withSendMessage } from './actions';
export {
  createRenderUiServer,
  handleRenderUiRequest,
  type RenderUiServerOptions,
} from './server';
export {
  DESCRIPTION_LIMIT,
  renderUiDescription,
  specInputSchema,
  specOutputSchema,
  specProblems,
  type RenderUiDescriptionOptions,
} from './tool';
