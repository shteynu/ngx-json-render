/*
 * Public API Surface of ngx-json-render/mcp
 *
 * Render json-render specs inside an MCP Apps host (Claude, ChatGPT, VS Code).
 * A separate entry point so `@modelcontextprotocol/ext-apps`, an optional
 * peer, is only needed by apps that import it.
 */

export {
  injectJsonRenderApp,
  messageText,
  parseSpecFromToolResult,
  type JsonRenderApp,
  type JsonRenderAppOptions,
} from './json-render-app';
