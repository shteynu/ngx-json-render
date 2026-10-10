import { defineCatalog } from '@json-render/core';
import { schema } from 'ngx-json-render/schema';
import { z } from 'zod';
import { sendMessageAction, withSendMessage } from './actions';

const catalog = defineCatalog(schema, {
  components: {
    Text: {
      props: z.object({ content: z.string() }),
      description: 'A line of text.',
    },
  },
  actions: {
    refresh: { params: z.object({}), description: 'Reload the data.' },
  },
});

describe('withSendMessage', () => {
  it('adds sendMessage next to the actions the catalog has', () => {
    const extended = withSendMessage(catalog);

    expect(extended.actionNames).toEqual(['refresh', 'sendMessage']);
    expect(extended.componentNames).toEqual(['Text']);
    expect(extended.prompt()).toContain(
      `- sendMessage: ${sendMessageAction.description}`,
    );
    expect(catalog.actionNames).toEqual(['refresh']);
  });

  it('returns the same catalog for the same input', () => {
    expect(withSendMessage(catalog)).toBe(withSendMessage(catalog));
  });

  it('takes { text, data? } params', () => {
    const { params } = sendMessageAction;

    expect(params.safeParse({ text: 'Go', data: { a: 1 } }).success).toBe(true);
    expect(params.safeParse({ data: {} }).success).toBe(false);
  });
});
