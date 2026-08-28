/**
 * A prerecorded SpecStream: the JSONL patch lines an LLM would emit while
 * generating a "weekly report" UI. The demo replays them with a delay to show
 * progressive rendering of a partial spec.
 */
export const STREAM_LINES: string[] = [
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
];
