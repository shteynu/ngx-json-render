// Builds the MCP App example into dist/mcp-app with `ng run mcp-app:mcp`,
// the `ngx-json-render:mcp-app` builder (taken from dist/, since this
// workspace does not install its own package):
//
//   view.html   the Angular view as one self-contained page — MCP hosts load a
//               `ui://` resource as a single HTML document, so scripts and
//               styles are inlined
//   server.mjs  the MCP server, for stdio or a local HTTP server, with its
//               dependencies bundled in
//
// With --cloudflare it also writes the hosted /mcp endpoint as a Cloudflare
// Worker, .cloudflare/worker.mjs, and the landing page under
// .cloudflare/static, which `wrangler.jsonc` deploys as static assets.
//
// Needs dist/ngx-json-render and dist/ngx-json-render-material, like the demo
// (`npm run build:lib && npm run build:material`).
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { build } from 'esbuild';

const out = join('dist', 'mcp-app');
const require = createRequire(import.meta.url);
const run = (bin, args) =>
  execFileSync(process.execPath, [require.resolve(bin), ...args], {
    stdio: 'inherit',
  });

// esbuild does not type-check; the server gets its own tsc pass.
run('typescript/bin/tsc', ['-p', 'projects/mcp-app/tsconfig.server.json']);
run('@angular/cli/bin/ng.js', ['run', 'mcp-app:mcp']);

// The hosted endpoint takes the catalog and the `render-ui` tool from the
// built packages' Angular-free entry points, as an app's server would from
// npm; they are not in node_modules.
const alias = {
  'ngx-json-render/schema':
    './dist/ngx-json-render/fesm2022/ngx-json-render-schema.mjs',
  'ngx-json-render/mcp/server':
    './dist/ngx-json-render/fesm2022/ngx-json-render-mcp-server.mjs',
  'ngx-json-render-material/catalog':
    './dist/ngx-json-render-material/fesm2022/ngx-json-render-material-catalog.mjs',
};

if (process.argv.includes('--cloudflare')) {
  const output = '.cloudflare';
  const statics = join(output, 'static');
  rmSync(output, { recursive: true, force: true });
  mkdirSync(statics, { recursive: true });

  await build({
    entryPoints: ['projects/mcp-app/server/worker.ts'],
    outfile: join(output, 'worker.mjs'),
    bundle: true,
    platform: 'browser',
    conditions: ['workerd', 'worker'],
    target: 'es2022',
    format: 'esm',
    minify: true,
    alias: { ...alias, 'mcp-app-view.html': `./${out}/view.html` },
    loader: { '.html': 'text' },
    // Left to the runtime's Node.js compatibility (`nodejs_compat`).
    external: ['node:*'],
    logLevel: 'warning',
  });
  writeFileSync(
    join(statics, 'index.html'),
    readFileSync('projects/mcp-app/server/landing.html', 'utf8'),
  );
  // OpenAI's domain check fetches its token as plain text; static assets
  // would serve a file without an extension as a download.
  const challenge = 'projects/mcp-app/server/openai-apps-challenge.txt';
  if (existsSync(challenge)) {
    mkdirSync(join(statics, '.well-known'));
    writeFileSync(
      join(statics, '.well-known', 'openai-apps-challenge'),
      readFileSync(challenge, 'utf8').trim(),
    );
    writeFileSync(
      join(statics, '_headers'),
      '/.well-known/openai-apps-challenge\n  Content-Type: text/plain; charset=utf-8\n',
    );
  }
  console.log(`Built ${output} for Cloudflare`);
}
