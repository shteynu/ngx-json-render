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
  /** What to try once the UI is on screen, for an interactive recording. */
  readonly hint?: string;
}

/**
 * The demo's first screen: KPI tiles with sparklines, then a revenue line
 * that grows one point per patch while the region bars fill in beside it.
 */
const SALES_DASHBOARD: readonly string[] = [
  '{"op":"add","path":"/root","value":"root"}',
  '{"op":"add","path":"/elements/root","value":{"type":"Stack","props":{"gap":16},"children":["title","intro","kpis","charts","footer"]}}',
  '{"op":"add","path":"/elements/title","value":{"type":"Heading","props":{"content":"Q3 sales","level":1},"children":[]}}',
  '{"op":"add","path":"/elements/intro","value":{"type":"Text","props":{"content":"Revenue, orders and where they came from, week by week.","tone":"muted"},"children":[]}}',
  '{"op":"add","path":"/state","value":{"quarter":"Q3"}}',
  '{"op":"add","path":"/elements/kpis","value":{"type":"Grid","props":{"minColumnWidth":130,"gap":10},"children":["k-revenue","k-orders","k-conversion","k-aov"]}}',
  '{"op":"add","path":"/elements/k-revenue","value":{"type":"Metric","props":{"label":"Revenue","value":"$1.24M","delta":"+14.5%","trend":[82,88,85,91,94,90,97,99,96,103,101,108,106]},"children":[]}}',
  '{"op":"add","path":"/elements/k-orders","value":{"type":"Metric","props":{"label":"Orders","value":"8,412","delta":"+6%","trend":[590,612,605,640,655,630,668,681,660,702,690,735,724]},"children":[]}}',
  '{"op":"add","path":"/elements/k-conversion","value":{"type":"Metric","props":{"label":"Conversion","value":"3.4%","delta":"-0.2pt","trend":[3.7,3.6,3.6,3.5,3.6,3.5,3.4,3.5,3.4,3.3,3.4,3.4,3.4]},"children":[]}}',
  '{"op":"add","path":"/elements/k-aov","value":{"type":"Metric","props":{"label":"Avg. order","value":"$147","delta":"+7.7%","trend":[139,141,140,142,143,143,145,145,146,147,146,148,147]},"children":[]}}',
  '{"op":"add","path":"/elements/charts","value":{"type":"Grid","props":{"minColumnWidth":320,"gap":12},"children":["revenue-card","regions-card"]}}',
  '{"op":"add","path":"/elements/revenue-card","value":{"type":"Card","props":{"title":"Weekly revenue","subtitle":"This year against last"},"children":["revenue-chart"]}}',
  '{"op":"add","path":"/elements/revenue-chart","value":{"type":"LineChart","props":{"labels":["W1","W2","W3","W4","W5","W6","W7","W8","W9","W10","W11","W12","W13"],"series":[{"name":"This year","values":[82000,88000]},{"name":"Last year","values":[74000,77000,79000,76000,82000,84000,81000,86000,88000,85000,90000,92000,89000]}],"format":"currency"},"children":[]}}',
  '{"op":"add","path":"/elements/regions-card","value":{"type":"Card","props":{"title":"Revenue by region","subtitle":"Quarter to date"},"children":["regions-chart"]}}',
  '{"op":"add","path":"/elements/regions-chart","value":{"type":"BarChart","props":{"labels":["North America","Europe","Asia-Pacific","Latin America","Middle East"],"values":[],"format":"currency"},"children":[]}}',
  '{"op":"add","path":"/elements/revenue-chart/props/series/0/values/-","value":85000}',
  '{"op":"add","path":"/elements/regions-chart/props/values/-","value":512000}',
  '{"op":"add","path":"/elements/revenue-chart/props/series/0/values/-","value":91000}',
  '{"op":"add","path":"/elements/regions-chart/props/values/-","value":368000}',
  '{"op":"add","path":"/elements/revenue-chart/props/series/0/values/-","value":94000}',
  '{"op":"add","path":"/elements/regions-chart/props/values/-","value":214000}',
  '{"op":"add","path":"/elements/revenue-chart/props/series/0/values/-","value":90000}',
  '{"op":"add","path":"/elements/regions-chart/props/values/-","value":98000}',
  '{"op":"add","path":"/elements/revenue-chart/props/series/0/values/-","value":97000}',
  '{"op":"add","path":"/elements/regions-chart/props/values/-","value":48000}',
  '{"op":"add","path":"/elements/revenue-chart/props/series/0/values/-","value":99000}',
  '{"op":"add","path":"/elements/revenue-chart/props/series/0/values/-","value":96000}',
  '{"op":"add","path":"/elements/revenue-chart/props/series/0/values/-","value":103000}',
  '{"op":"add","path":"/elements/revenue-chart/props/series/0/values/-","value":101000}',
  '{"op":"add","path":"/elements/revenue-chart/props/series/0/values/-","value":108000}',
  '{"op":"add","path":"/elements/revenue-chart/props/series/0/values/-","value":106000}',
  '{"op":"add","path":"/elements/footer","value":{"type":"Text","props":{"content":{"$template":"${/quarter} figures, streamed as JSON patches and drawn by Angular components."},"tone":"muted"},"children":[]}}',
  '{"__meta":"usage","promptTokens":1512,"completionTokens":934,"totalTokens":2446}',
];

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
 * A form the model wires up end to end: bound fields with validation, and a
 * submit button that goes through `submitForm`, so `sendSupportRequest` only
 * runs once every field passes. Its `onSuccess` swaps the form for a
 * confirmation.
 */
const SUPPORT_FORM: readonly string[] = [
  '{"op":"add","path":"/root","value":"root"}',
  '{"op":"add","path":"/elements/root","value":{"type":"Stack","props":{"gap":16},"children":["title","intro","form-card","sent-card"]}}',
  '{"op":"add","path":"/elements/title","value":{"type":"Heading","props":{"content":"Contact support","level":1},"children":[]}}',
  '{"op":"add","path":"/elements/intro","value":{"type":"Text","props":{"content":"Tell us what went wrong. We reply within one business day.","tone":"muted"},"children":[]}}',
  '{"op":"add","path":"/state","value":{"form":{"name":"","email":"","message":""},"sent":false}}',
  '{"op":"add","path":"/elements/form-card","value":{"type":"Card","props":{"title":"Support request"},"visible":{"$state":"/sent","neq":true},"children":["f-name","f-email","f-message","f-actions"]}}',
  '{"op":"add","path":"/elements/f-name","value":{"type":"Input","props":{"label":"Name","placeholder":"Ada Lovelace","value":{"$bindState":"/form/name"},"validation":{"checks":[{"type":"required","message":"Tell us your name."}]}},"children":[]}}',
  '{"op":"add","path":"/elements/f-email","value":{"type":"Input","props":{"label":"Email","type":"email","placeholder":"ada@example.com","value":{"$bindState":"/form/email"},"validation":{"checks":[{"type":"required","message":"We need an email to reply to."},{"type":"email","message":"That does not look like an email address."}]}},"children":[]}}',
  '{"op":"add","path":"/elements/f-message","value":{"type":"Input","props":{"label":"What happened?","multiline":true,"placeholder":"What you did, what you expected, what you saw instead.","value":{"$bindState":"/form/message"},"validation":{"checks":[{"type":"required","message":"Describe the problem."},{"type":"minLength","args":{"min":20},"message":"A little more detail, please: at least 20 characters."}]}},"children":[]}}',
  '{"op":"add","path":"/elements/f-actions","value":{"type":"Stack","props":{"direction":"horizontal","justify":"end"},"children":["f-submit"]}}',
  '{"op":"add","path":"/elements/f-submit","value":{"type":"Button","props":{"label":"Send request","variant":"primary"},"on":{"press":{"action":"submitForm","params":{"action":"sendSupportRequest","params":{"name":{"$state":"/form/name"},"email":{"$state":"/form/email"},"message":{"$state":"/form/message"}}},"onSuccess":{"set":{"/sent":true}}}},"children":[]}}',
  '{"op":"add","path":"/elements/sent-card","value":{"type":"Card","props":{"title":"Request sent"},"visible":{"$state":"/sent","eq":true},"children":["sent-badge","sent-text"]}}',
  '{"op":"add","path":"/elements/sent-badge","value":{"type":"Badge","props":{"label":"Ticket opened","color":"green"},"children":[]}}',
  '{"op":"add","path":"/elements/sent-text","value":{"type":"Text","props":{"content":"Thanks. We will reply to your email within one business day."},"children":[]}}',
  '{"__meta":"usage","promptTokens":1342,"completionTokens":688,"totalTokens":2030}',
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
    prompt: 'A Q3 sales dashboard with revenue by week and by region',
    label: 'Sales dashboard',
    lines: SALES_DASHBOARD,
  },
  {
    prompt: 'A support request form with validation',
    label: 'Support form',
    lines: SUPPORT_FORM,
    hint:
      'Try it: send the form empty, then fill it in. The model wrote the ' +
      'checks and the submit; submitForm calls sendSupportRequest only once ' +
      'every field passes.',
  },
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
