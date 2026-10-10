/*
 * Public API Surface of ngx-json-render/ag-ui
 */

export {
  JSON_RENDER_ACTIVITY_TYPE,
  applyAgUiEvent,
  isJsonRenderSpec,
  surfacesFromMessages,
  type AgUiEvent,
  type AgUiMessage,
  type AgUiSurface,
} from './events';
export {
  injectAgentUI,
  type AgUiAgent,
  type AgUiSubscriber,
  type AgentUIOptions,
  type AgentUIReturn,
} from './agent-ui';
export {
  JsonRenderActivity,
  jsonRenderActivityRenderer,
  type JsonRenderActivityRendererConfig,
  type JsonRenderActivityRendererOptions,
} from './json-render-activity';
