/**
 * Prerecorded generations: the JSONL a server would stream back for a prompt,
 * one RFC 6902 patch per line, ending with the usage line the AI SDK emits.
 *
 * These are replayed through `injectUIStream` — the same client an app uses —
 * so the demo exercises the shipped code path rather than a stand-in for it.
 */
export interface Recording {
  /** The prompt this was recorded for. */
  readonly prompt: string;
  /** Short label for the prompt picker. */
  readonly label: string;
  /** Response body, one line at a time. */
  readonly lines: readonly string[];
  /** Shown alongside the run when the recording is deliberately flawed. */
  readonly note?: string;
}

const WEEKLY_REPORT: readonly string[] = [
  '{"op":"add","path":"/root","value":"root"}',
  '{"op":"add","path":"/elements/root","value":{"type":"Stack","props":{"gap":16},"children":["title","intro","metrics-card","progress-card","footer"]}}',
  '{"op":"add","path":"/elements/title","value":{"type":"Heading","props":{"content":"Weekly report","level":1},"children":[]}}',
  '{"op":"add","path":"/elements/intro","value":{"type":"Text","props":{"content":"Here is how the platform team did this week.","tone":"muted"},"children":[]}}',
  '{"op":"add","path":"/state","value":{"team":"Platform"}}',
  '{"op":"add","path":"/elements/metrics-card","value":{"type":"Card","props":{"title":"Key metrics"},"children":["metrics-row"]}}',
  '{"op":"add","path":"/elements/metrics-row","value":{"type":"Stack","props":{"direction":"horizontal","gap":10},"children":["m-deploys","m-uptime","m-latency"]}}',
  '{"op":"add","path":"/elements/m-deploys","value":{"type":"Metric","props":{"label":"Deploys","value":42,"delta":"+8"},"children":[]}}',
  '{"op":"add","path":"/elements/m-uptime","value":{"type":"Metric","props":{"label":"Uptime","value":"99.98%","delta":"+0.01%"},"children":[]}}',
  '{"op":"add","path":"/elements/m-latency","value":{"type":"Metric","props":{"label":"p95 latency","value":"184ms","delta":"-12ms"},"children":[]}}',
  '{"op":"add","path":"/elements/progress-card","value":{"type":"Card","props":{"title":"Quarterly goals","subtitle":"OKR progress"},"children":["p-1","p-2","p-3"]}}',
  '{"op":"add","path":"/elements/p-1","value":{"type":"Progress","props":{"label":"Zero-downtime deploys","value":80},"children":[]}}',
  '{"op":"add","path":"/elements/p-2","value":{"type":"Progress","props":{"label":"Signals migration","value":64},"children":[]}}',
  '{"op":"add","path":"/elements/p-3","value":{"type":"Progress","props":{"label":"Docs refresh","value":35},"children":[]}}',
  '{"op":"replace","path":"/elements/m-deploys/props/value","value":43}',
  '{"op":"add","path":"/elements/footer","value":{"type":"Text","props":{"content":{"$template":"Generated for the ${/team} team — streamed line by line."},"tone":"muted"},"children":[]}}',
  '{"__meta":"usage","promptTokens":1284,"completionTokens":612,"totalTokens":1896}',
];

const ONBOARDING: readonly string[] = [
  '{"op":"add","path":"/root","value":"root"}',
  '{"op":"add","path":"/elements/root","value":{"type":"Stack","props":{"gap":16},"children":["title","status","checklist","progress-card"]}}',
  '{"op":"add","path":"/elements/title","value":{"type":"Heading","props":{"content":"Getting started","level":1},"children":[]}}',
  '{"op":"add","path":"/state","value":{"done":1,"steps":[{"id":"1","label":"Install the package","completed":true},{"id":"2","label":"Define a catalog","completed":false},{"id":"3","label":"Render your first spec","completed":false}]}}',
  '{"op":"add","path":"/elements/status","value":{"type":"Badge","props":{"label":"3 steps","color":"blue"},"children":[]}}',
  '{"op":"add","path":"/elements/checklist","value":{"type":"Card","props":{"title":"Checklist"},"children":["step-list"]}}',
  '{"op":"add","path":"/elements/step-list","value":{"type":"Stack","props":{"gap":8},"repeat":{"statePath":"/steps","key":"id"},"children":["step"]}}',
  '{"op":"add","path":"/elements/step","value":{"type":"Checkbox","props":{"label":{"$item":"label"},"checked":{"$bindItem":"completed"}},"children":[]}}',
  '{"op":"add","path":"/elements/progress-card","value":{"type":"Card","props":{"title":"Progress"},"children":["bar","note"]}}',
  '{"op":"add","path":"/elements/bar","value":{"type":"Progress","props":{"label":"Setup","value":33},"children":[]}}',
  '{"op":"add","path":"/elements/note","value":{"type":"Text","props":{"content":"Tick a box — the state model updates, and this UI was never written by hand.","tone":"muted"},"children":[]}}',
  '{"__meta":"usage","promptTokens":1284,"completionTokens":388,"totalTokens":1672}',
];

/**
 * A generation that went wrong, in the ways `schema.ts` spends its rules
 * warning models about. Most of the page still renders — that is the point.
 */
const BROKEN_PRICING: readonly string[] = [
  '{"op":"add","path":"/root","value":"root"}',
  '{"op":"add","path":"/elements/root","value":{"type":"Stack","props":{"gap":16},"children":["title","intro","plans","note-card"]}}',
  '{"op":"add","path":"/elements/title","value":{"type":"Heading","props":{"content":"Pricing","level":1},"children":[]}}',
  '{"op":"add","path":"/elements/intro","value":{"type":"Text","props":{"content":"Three plans. The two on the left came out fine.","tone":"muted"},"children":[]}}',
  '{"op":"add","path":"/elements/plans","value":{"type":"Stack","props":{"direction":"horizontal","gap":10},"children":["plan-free","plan-pro","plan-team"]}}',
  '{"op":"add","path":"/elements/plan-free","value":{"type":"Card","props":{"title":"Free"},"children":["free-price","free-cta"]}}',
  '{"op":"add","path":"/elements/free-price","value":{"type":"Metric","props":{"label":"Monthly","value":"$0"},"children":[]}}',
  '{"op":"add","path":"/elements/free-cta","value":{"type":"Button","props":{"label":"Choose Free","variant":"secondary"},"children":[]}}',
  '{"op":"add","path":"/elements/plan-pro","value":{"type":"Card","props":{"title":"Pro"},"children":["pro-price","pro-badge","pro-cta"]}}',
  '{"op":"add","path":"/elements/pro-price","value":{"type":"Metric","props":{"label":"Monthly","value":"$19"},"children":[]}}',
  // The model put `visible` inside props, where the renderer never looks.
  '{"op":"add","path":"/elements/pro-badge","value":{"type":"Badge","props":{"label":"Most popular","color":"green","visible":true},"children":[]}}',
  '{"op":"add","path":"/elements/pro-cta","value":{"type":"Button","props":{"label":"Choose Pro","variant":"primary"},"children":[]}}',
  // A line that got truncated in transit: parseLine skips it and reads on.
  '{"op":"add","path":"/elements/plan-team","value":{"type":"Card","props":{"ti',
  // The Team card promises a child the model never emitted.
  '{"op":"add","path":"/elements/plan-team","value":{"type":"Card","props":{"title":"Team"},"children":["team-price","team-note"]}}',
  '{"op":"add","path":"/elements/team-price","value":{"type":"Metric","props":{"label":"Monthly","value":"$49"},"children":[]}}',
  '{"op":"add","path":"/elements/note-card","value":{"type":"Card","props":{"title":"Compare plans"},"children":["comparison"]}}',
  // PricingTable is not in this catalog; the renderer skips it and warns.
  '{"op":"add","path":"/elements/comparison","value":{"type":"PricingTable","props":{"plans":3},"children":[]}}',
  '{"__meta":"usage","promptTokens":1284,"completionTokens":501,"totalTokens":1785}',
];

export const RECORDINGS: readonly Recording[] = [
  {
    prompt: 'A weekly report for the platform team',
    label: 'Weekly report',
    lines: WEEKLY_REPORT,
  },
  {
    prompt: 'An onboarding checklist for a new user',
    label: 'Onboarding checklist',
    lines: ONBOARDING,
  },
  {
    prompt: 'A pricing page with three plans',
    label: 'A bad generation',
    lines: BROKEN_PRICING,
    note:
      'This recording is deliberately flawed: one card asks for a child that ' +
      'was never emitted, a badge puts `visible` inside `props`, a component ' +
      'is not in the catalog, and one line arrived truncated. Nothing throws — ' +
      'the rest of the page renders and the check names the damage.',
  },
];
