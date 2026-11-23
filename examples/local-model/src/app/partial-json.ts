interface Frame {
  kind: 'object' | 'array';
  /** In an object: the next string is a key, not a value. */
  key: boolean;
}

const closersOf = (stack: readonly Frame[]): string =>
  stack
    .map((frame) => (frame.kind === 'object' ? '}' : ']'))
    .reverse()
    .join('');

/**
 * Parses JSON that is still being written, as a model streams it: the value
 * the text describes so far, or `undefined` before there is one.
 *
 * It closes whatever is open. A string value being written is kept as far as
 * it goes, so text grows on screen a token at a time; a key, a colon or a
 * number still being written are cut back to the last complete value.
 */
export function parsePartialJson(text: string): unknown {
  const stack: Frame[] = [];
  let inString = false;
  let stringIsKey = false;
  let escaped = false;
  let scalar = false;
  let safe = -1;
  let safeClosers = '';

  const markSafe = (end: number): void => {
    safe = end;
    safeClosers = closersOf(stack);
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') {
        inString = false;
        if (!stringIsKey) markSafe(i + 1);
      }
      continue;
    }
    if (scalar) {
      if (!/[\s,\]}]/.test(ch)) continue;
      scalar = false;
      markSafe(i);
    }
    const top = stack.at(-1);
    switch (ch) {
      case '{':
        stack.push({ kind: 'object', key: true });
        markSafe(i + 1);
        break;
      case '[':
        stack.push({ kind: 'array', key: false });
        markSafe(i + 1);
        break;
      case '}':
      case ']':
        stack.pop();
        markSafe(i + 1);
        break;
      case '"':
        inString = true;
        stringIsKey = top?.kind === 'object' && top.key;
        break;
      case ':':
        if (top?.kind === 'object') top.key = false;
        break;
      case ',':
        if (top?.kind === 'object') top.key = true;
        break;
      default:
        if (!/\s/.test(ch)) scalar = true;
    }
  }

  const candidates: string[] = [];
  if (inString && !stringIsKey) {
    // Drop a half-written escape, `\` or `\u00`, before closing the string.
    const body = text.replace(/\\(u[0-9a-fA-F]{0,3})?$/, '');
    candidates.push(`${body}"${closersOf(stack)}`);
  } else if (scalar) {
    candidates.push(text + closersOf(stack));
  }
  if (safe >= 0) candidates.push(text.slice(0, safe) + safeClosers);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // A partial literal such as `tru`; try the last complete value.
    }
  }
  return undefined;
}
