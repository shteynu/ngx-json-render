/**
 * Prerecorded chat turns: what a server would stream back for one user
 * message — conversational prose and JSONL patches in the same response.
 *
 * `createMixedStreamParser` classifies each line, and it consumes the ```spec
 * fences itself: the markers never reach the message text.
 */
export interface ChatExchange {
  /** The message the user sends. */
  readonly ask: string;
  /** Short label for the suggestion button. */
  readonly label: string;
  /** Response body, one line at a time. */
  readonly lines: readonly string[];
}

const NUMBERS: readonly string[] = [
  'Last week is below — deploys are up, latency is down.',
  '```spec',
  '{"op":"add","path":"/root","value":"root"}',
  '{"op":"add","path":"/elements/root","value":{"type":"Card","props":{"title":"Last week"},"children":["row"]}}',
  '{"op":"add","path":"/elements/row","value":{"type":"Stack","props":{"direction":"horizontal","gap":10},"children":["m-deploys","m-latency"]}}',
  '{"op":"add","path":"/elements/m-deploys","value":{"type":"Metric","props":{"label":"Deploys","value":43,"delta":"+8"},"children":[]}}',
  '{"op":"add","path":"/elements/m-latency","value":{"type":"Metric","props":{"label":"p95 latency","value":"184ms","delta":"-12ms"},"children":[]}}',
  '```',
  'Ask for a different cut and I will rebuild it.',
];

const SIGNUP: readonly string[] = [
  'Here is a beta signup form. The card above is still yours to compare against.',
  '```spec',
  '{"op":"add","path":"/root","value":"root"}',
  '{"op":"add","path":"/state","value":{"email":"","terms":false}}',
  '{"op":"add","path":"/elements/root","value":{"type":"Card","props":{"title":"Join the beta"},"children":["fields"]}}',
  '{"op":"add","path":"/elements/fields","value":{"type":"Stack","props":{"gap":10},"children":["email","terms","submit"]}}',
  '{"op":"add","path":"/elements/email","value":{"type":"Input","props":{"placeholder":"you@example.com","value":{"$bindState":"/email"}},"children":[]}}',
  '{"op":"add","path":"/elements/terms","value":{"type":"Checkbox","props":{"label":"I accept the terms","checked":{"$bindState":"/terms"}},"children":[]}}',
  '{"op":"add","path":"/elements/submit","value":{"type":"Button","props":{"label":"Request access","variant":"primary"},"children":[]}}',
  '```',
  'Both messages keep their own UI — the spec lives on the message, not the tab.',
];

export const CHAT_EXCHANGES: readonly ChatExchange[] = [
  {
    ask: "Show me last week's numbers",
    label: "Last week's numbers",
    lines: NUMBERS,
  },
  {
    ask: 'Add a signup form for the beta',
    label: 'A signup form',
    lines: SIGNUP,
  },
];
