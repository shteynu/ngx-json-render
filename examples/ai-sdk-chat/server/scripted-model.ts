import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';

/**
 * Stands in for a real model when no AI Gateway key is set, so the example
 * runs out of the box. It streams the shape `catalog.prompt({ mode: 'inline' })`
 * asks a model for: a sentence of prose, then JSONL patches in a ```spec fence.
 */
export function scriptedModel(): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    provider: 'scripted',
    modelId: 'q3-revenue',
    doStream: async () => ({
      stream: simulateReadableStream({
        initialDelayInMs: 300,
        chunkDelayInMs: 120,
        chunks: [
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 't' },
          ...lines().map((delta) => ({
            type: 'text-delta' as const,
            id: 't',
            delta,
          })),
          { type: 'text-end', id: 't' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: undefined },
            usage: {
              inputTokens: {
                total: 0,
                noCache: 0,
                cacheRead: 0,
                cacheWrite: 0,
              },
              outputTokens: { total: 0, text: 0, reasoning: 0 },
            },
          },
        ],
      }),
    }),
  });
}

/** The answer, one streamed chunk per line. */
function lines(): string[] {
  const el = (type: string, props: object, children: string[] = []) => ({
    type,
    props,
    children,
  });
  const add = (path: string, value: unknown) =>
    JSON.stringify({ op: 'add', path, value });
  return [
    'This is a scripted answer: set AI_GATEWAY_API_KEY to talk to a real model. ',
    'Here is Q3 revenue by region.\n\n',
    '```spec\n',
    ...[
      add('/root', 'main'),
      add(
        '/elements/main',
        el('Card', { title: 'Q3 revenue', subtitle: 'By region' }, [
          'grid',
          'note',
        ]),
      ),
      add(
        '/elements/grid',
        el('Grid', { columns: 3, gap: 16 }, ['emea', 'amer', 'apac']),
      ),
      add(
        '/elements/emea',
        el('Metric', {
          label: 'EMEA',
          value: '$1.24M',
          delta: '+8%',
          trend: 'up',
        }),
      ),
      add(
        '/elements/amer',
        el('Metric', {
          label: 'Americas',
          value: '$2.10M',
          delta: '+3%',
          trend: 'up',
        }),
      ),
      add(
        '/elements/apac',
        el('Metric', {
          label: 'APAC',
          value: '$0.86M',
          delta: '-2%',
          trend: 'down',
        }),
      ),
      add(
        '/elements/note',
        el('Callout', {
          severity: 'info',
          content: 'APAC dipped on a delayed enterprise renewal.',
        }),
      ),
    ].map((line) => `${line}\n`),
    '```\n',
  ];
}
