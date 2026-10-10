import { createServer } from 'node:http';
import { CopilotRuntime } from '@copilotkit/runtime/v2';
import { createCopilotNodeListener } from '@copilotkit/runtime/v2/node';
// The catalog without its Angular components, so plain Node can load it. The
// client renders with `materialRegistry`, built from the same catalog.
import { materialCatalog } from 'ngx-json-render-material/catalog';
import { JsonRenderAgent } from './json-render-agent';
import { scriptedModel } from './scripted-model';

const gatewayKey = process.env['AI_GATEWAY_API_KEY'];
const model = gatewayKey
  ? (process.env['MODEL'] ?? 'anthropic/claude-sonnet-5.5')
  : scriptedModel();

const runtime = new CopilotRuntime({
  agents: {
    default: new JsonRenderAgent({
      model,
      // Prose plus ```spec fenced JSONL patches, in the catalog's vocabulary.
      system: materialCatalog.prompt({ mode: 'inline' }),
    }),
  },
});

const listener = createCopilotNodeListener({
  runtime,
  basePath: '/api/copilotkit',
  // No managed Channels here: nothing to connect at startup.
  activateChannels: false,
});

const port = Number(process.env['PORT'] ?? 3000);
createServer(listener).listen(port, () => {
  const using = gatewayKey
    ? `model ${String(model)}`
    : 'the scripted model (no AI_GATEWAY_API_KEY)';
  console.log(
    `CopilotKit runtime on http://localhost:${port}/api/copilotkit, using ${using}`,
  );
});
