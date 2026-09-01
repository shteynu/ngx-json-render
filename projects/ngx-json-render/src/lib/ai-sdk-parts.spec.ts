import { SPEC_DATA_PART, type SpecDataPart } from '@json-render/core';
import {
  type UIMessage,
  type UIMessageStreamWriterWithOutcome,
  createUIMessageStream,
  readUIMessageStream,
} from 'ai';
import { buildSpecFromParts, getTextFromParts } from './streaming';

/**
 * What the AI SDK actually delivers, checked against what this package reads.
 *
 * `buildSpecFromParts` takes a structural `DataPart[]` so the library does not
 * depend on the AI SDK — which is also how it could drift from the SDK's real
 * `UIMessage.parts` without anyone noticing. These tests run the SDK for real:
 * they write chunks the way a server route would, read the message the way a
 * client would, and hand the parts straight over. Passing `message.parts` with
 * no cast is half the assertion; the other half is what comes out.
 */

/** A message whose only data part is the spec part `@json-render/core` names. */
type JrMessage = UIMessage<unknown, { [SPEC_DATA_PART]: SpecDataPart }>;
type JrWriter = UIMessageStreamWriterWithOutcome<JrMessage>;

/** Run a server-side write and return the message a client would end up with. */
async function collect(
  write: (writer: JrWriter) => void,
): Promise<JrMessage | null> {
  const stream = createUIMessageStream<JrMessage>({
    execute: ({ writer }) => write(writer),
  });
  let last: JrMessage | null = null;
  for await (const message of readUIMessageStream<JrMessage>({ stream })) {
    last = message;
  }
  return last;
}

const patch = (op: 'add', path: string, value: unknown): SpecDataPart => ({
  type: 'patch',
  patch: { op, path, value },
});

describe('AI SDK message parts', () => {
  it('builds the spec and the prose from one streamed message', async () => {
    const message = await collect((writer) => {
      writer.write({
        type: 'data-spec',
        data: patch('add', '/root', 'main'),
      });
      writer.write({
        type: 'data-spec',
        data: patch('add', '/elements/main', {
          type: 'Text',
          props: { content: 'hi' },
        }),
      });
      writer.write({ type: 'text-start', id: 't1' });
      writer.write({ type: 'text-delta', id: 't1', delta: 'Here you go.' });
      writer.write({ type: 'text-end', id: 't1' });
    });

    // Handed over with no cast: `UIMessage['parts']` is a `DataPart[]`.
    const parts = message?.parts ?? [];
    expect(buildSpecFromParts(parts)).toEqual({
      root: 'main',
      elements: { main: { type: 'Text', props: { content: 'hi' } } },
    });
    expect(getTextFromParts(parts)).toBe('Here you go.');
  });

  it('reads a whole-spec part, flat or nested', async () => {
    const flat = await collect((writer) => {
      writer.write({
        type: 'data-spec',
        data: {
          type: 'flat',
          spec: {
            root: 'main',
            elements: { main: { type: 'Text', props: { content: 'hi' } } },
          },
        },
      });
    });

    expect(buildSpecFromParts(flat?.parts ?? [])).toEqual({
      root: 'main',
      elements: { main: { type: 'Text', props: { content: 'hi' } } },
    });

    const nested = await collect((writer) => {
      // A tree, not a `{ root, elements }` map: core's `nestedToFlat` walks it
      // and mints the keys itself (`el-0`, `el-1`, …).
      writer.write({
        type: 'data-spec',
        data: {
          type: 'nested',
          spec: {
            type: 'Box',
            props: {},
            children: [{ type: 'Text', props: { content: 'hi' } }],
          },
        },
      });
    });

    const spec = buildSpecFromParts(nested?.parts ?? []);
    expect(spec?.root).toBe('el-0');
    expect(spec?.elements['el-0']?.children).toEqual(['el-1']);
    expect(spec?.elements['el-1']?.props).toEqual({ content: 'hi' });
  });

  it('drops every patch but the last when they share an id', async () => {
    const message = await collect((writer) => {
      writer.write({
        type: 'data-spec',
        id: 'spec',
        data: patch('add', '/root', 'main'),
      });
      writer.write({
        type: 'data-spec',
        id: 'spec',
        data: patch('add', '/elements/main', { type: 'Text', props: {} }),
      });
    });

    // Not this package's doing: an `id` makes the SDK reconcile the part in
    // place, so the second write replaces the first instead of following it.
    // Patch parts must be written without one — an id is for a part that is
    // a snapshot of itself, not a step in a sequence.
    expect(message?.parts.length).toBe(1);
    expect(buildSpecFromParts(message?.parts ?? [])).toEqual({
      root: '',
      elements: { main: { type: 'Text', props: {} } },
    });
  });

  it('never sees a transient part', async () => {
    const message = await collect((writer) => {
      writer.write({ type: 'text-start', id: 't1' });
      writer.write({ type: 'text-delta', id: 't1', delta: 'thinking' });
      writer.write({ type: 'text-end', id: 't1' });
      writer.write({
        type: 'data-spec',
        data: patch('add', '/root', 'main'),
        transient: true,
      });
    });

    // A transient part reaches `onData` and nothing else, so a spec written
    // that way cannot be rebuilt from the message. It is for progress, not
    // for the UI the message carries.
    expect(message?.parts.map((part) => part.type)).toEqual(['text']);
    expect(buildSpecFromParts(message?.parts ?? [])).toBeNull();
  });
});
