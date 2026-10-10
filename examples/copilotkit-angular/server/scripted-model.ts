import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';

/**
 * Stands in for a real model when no AI Gateway key is set, so the example
 * runs out of the box. It streams the shape `catalog.prompt({ mode: 'inline' })`
 * asks a model for: a sentence of prose, then JSONL patches in a ```spec fence.
 */
export function scriptedModel(): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    provider: 'scripted',
    modelId: 'q3-dashboard',
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
  const el = (
    type: string,
    props: object,
    children: string[] = [],
    extra: object = {},
  ) => ({ type, props, children, ...extra });
  const add = (path: string, value: unknown) =>
    JSON.stringify({ op: 'add', path, value });
  return [
    'This is a scripted answer: add an AI Gateway key to .env to talk to a real model. ',
    'Here is Q3 at a glance.\n\n',
    '```spec\n',
    ...[
      add('/root', 'main'),
      add(
        '/elements/main',
        el('Card', { title: 'Q3 sales', subtitle: 'July to September' }, [
          'grid',
          'note',
          'echo',
        ]),
      ),
      add('/state', { note: '' }),
      add(
        '/elements/grid',
        el('Grid', { columns: 3, gap: 16 }, ['revenue', 'orders', 'churn']),
      ),
      add(
        '/elements/revenue',
        el('Metric', {
          label: 'Revenue',
          value: '$1.84M',
          delta: '+12%',
          trend: 'up',
        }),
      ),
      add(
        '/elements/orders',
        el('Metric', {
          label: 'Orders',
          value: 4210,
          delta: '+4%',
          trend: 'up',
        }),
      ),
      add(
        '/elements/churn',
        el('Metric', {
          label: 'Churn',
          value: '2.1%',
          delta: '-0.3 pt',
          trend: 'down',
        }),
      ),
      add(
        '/elements/note',
        el('Input', {
          label: 'Note for the team',
          value: { $bindState: '/note' },
        }),
      ),
      add(
        '/elements/echo',
        el('Text', { content: { $template: 'You wrote: ${/note}' } }, [], {
          visible: { $state: '/note', neq: '' },
        }),
      ),
    ].map((line) => `${line}\n`),
    '```\n',
  ];
}
