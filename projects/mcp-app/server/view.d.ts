// `vercel.ts` and `worker.ts` import the built view as text; esbuild resolves
// the alias.
declare module 'mcp-app-view.html' {
  const html: string;
  export default html;
}
