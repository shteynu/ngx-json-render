// The catalog the MCP server describes to the model: the Material catalog's
// components, plus actions that only make sense inside an MCP Apps host. The
// published catalog stays host-neutral; `withSendMessage` adds the action, and
// the view handles it with `injectJsonRenderApp().handlers` in `src/app/app.ts`.
import { defineCatalog } from '@json-render/core';
// The catalog-only entry point, so the server does not load Angular.
import { materialCatalog } from 'ngx-json-render-material/catalog';
import { withSendMessage } from 'ngx-json-render/mcp/server';

// Image is left out: `VIEW_CSP` in `app.ts` admits no image origin, so the
// host would block every picture a model put in the view.
const { Image: _image, ...components } = materialCatalog.data.components;

/** Material components plus the MCP Apps actions the view handles. */
export const mcpCatalog = withSendMessage(
  defineCatalog(materialCatalog.schema, {
    ...materialCatalog.data,
    components,
  }),
);
