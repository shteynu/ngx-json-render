import { pipeJsonRender } from '@json-render/core';
import {
  convertToModelMessages,
  createUIMessageStream,
  pipeUIMessageStreamToResponse,
  streamText,
  type UIMessage,
} from 'ai';
import express from 'express';
// The catalog without its Angular components, so plain Node can load it. The
// client renders with `materialRegistry`, built from the same catalog.
import { materialCatalog } from 'ngx-json-render-material/catalog';
import { scriptedModel } from './scripted-model';

const gatewayKey = process.env['AI_GATEWAY_API_KEY'];
const model = gatewayKey
  ? (process.env['MODEL'] ?? 'anthropic/claude-sonnet-5.5')
  : scriptedModel();

// Prose plus ```spec fenced JSONL patches, in the vocabulary of the catalog.
const system = materialCatalog.prompt({ mode: 'inline' });

const app = express();
app.use(express.json());

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body as { messages: UIMessage[] };

  const result = streamText({
    model,
    system,
    messages: await convertToModelMessages(messages),
  });

  // pipeJsonRender passes the prose through as text parts and turns each
  // patch line of a ```spec fence into a `data-spec` part on the message.
  const stream = createUIMessageStream({
    execute: ({ writer }) =>
      writer.merge(pipeJsonRender(result.toUIMessageStream())),
  });
  pipeUIMessageStreamToResponse({ response: res, stream });
});

const port = Number(process.env['PORT'] ?? 3000);
app.listen(port, () => {
  const using = gatewayKey
    ? `model ${String(model)}`
    : 'the scripted model (no AI_GATEWAY_API_KEY)';
  console.log(
    `chat server on http://localhost:${port}/api/chat, using ${using}`,
  );
});
