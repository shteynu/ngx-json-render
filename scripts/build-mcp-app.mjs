// Builds the MCP App example into dist/mcp-app:
//
//   view.html   the Angular view as one self-contained page — MCP hosts load a
//               `ui://` resource as a single HTML document, so scripts and
//               styles are inlined
//   server.mjs  the MCP server, for stdio or a local HTTP server
//
// With --vercel it also writes .vercel/output (Vercel's Build Output API): the
// hosted /mcp endpoint as one Node.js function with every dependency and the
// view bundled in, plus a landing page. `vercel.json` runs it that way.
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
const browser = join(out, 'angular', 'browser');
const require = createRequire(import.meta.url);
const run = (bin, args) =>
  execFileSync(process.execPath, [require.resolve(bin), ...args], {
    stdio: 'inherit',
  });

run('@angular/cli/bin/ng.js', ['build', 'mcp-app']);
// esbuild does not type-check; the server gets its own tsc pass.
run('typescript/bin/tsc', ['-p', 'projects/mcp-app/tsconfig.server.json']);

// Angular splits the app into chunks; fold them back into one module.
const bundled = await build({
  entryPoints: [join(browser, 'main.js')],
  bundle: true,
  format: 'esm',
  minify: true,
  write: false,
  logLevel: 'warning',
});
const js = bundled.outputFiles[0].text.replaceAll('</script', '<\\/script');
const css = readFileSync(join(browser, 'styles.css'), 'utf8').replaceAll(
  '</style',
  '<\\/style',
);

let html = readFileSync(join(browser, 'index.html'), 'utf8');
const replace = (pattern, value) => {
  if (!pattern.test(html)) {
    throw new Error(`build-mcp-app: ${pattern} not found in index.html`);
  }
  html = html.replace(pattern, () => value);
};
replace(/<link rel="modulepreload"[^>]*>/g, '');
replace(
  /<link rel="stylesheet" href="styles\.css"[^>]*>(<noscript>.*?<\/noscript>)?/,
  `<style>${css}</style>`,
);
replace(
  /<script src="main\.js" type="module"><\/script>/,
  `<script type="module">${js}</script>`,
);
writeFileSync(join(out, 'view.html'), html);

// The server takes the catalog and the `render-ui` tool from the built
// packages' Angular-free entry points, as an app's server would from npm; `packages: 'external'` would
// otherwise leave them for Node to resolve, and they are not in node_modules.
const alias = {
  'ngx-json-render/schema':
    './dist/ngx-json-render/fesm2022/ngx-json-render-schema.mjs',
  'ngx-json-render/mcp/server':
    './dist/ngx-json-render/fesm2022/ngx-json-render-mcp-server.mjs',
  'ngx-json-render-material/catalog':
    './dist/ngx-json-render-material/fesm2022/ngx-json-render-material-catalog.mjs',
};

await build({
  entryPoints: ['projects/mcp-app/server/server.ts'],
  outfile: join(out, 'server.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  alias,
  logLevel: 'warning',
});

if (process.argv.includes('--vercel')) {
  const output = join('.vercel', 'output');
  const func = join(output, 'functions', 'mcp.func');
  rmSync(output, { recursive: true, force: true });
  mkdirSync(func, { recursive: true });
  mkdirSync(join(output, 'static'), { recursive: true });

  await build({
    entryPoints: ['projects/mcp-app/server/vercel.ts'],
    outfile: join(func, 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    minify: true,
    alias: { ...alias, 'mcp-app-view.html': `./${out}/view.html` },
    loader: { '.html': 'text' },
    // Some CommonJS dependencies call require(); give the ESM bundle one.
    banner: {
      js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
    logLevel: 'warning',
  });
  writeFileSync(
    join(func, '.vc-config.json'),
    JSON.stringify({
      runtime: 'nodejs22.x',
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      shouldAddHelpers: false,
      maxDuration: 30,
    }),
  );
  writeFileSync(
    join(output, 'static', 'index.html'),
    readFileSync('projects/mcp-app/server/landing.html', 'utf8'),
  );
  // OpenAI's plugin portal verifies the domain by fetching a token it issues
  // from this exact path, as plain text. Served once the token is committed.
  const challenge = 'projects/mcp-app/server/openai-apps-challenge.txt';
  const routes = [];
  if (existsSync(challenge)) {
    mkdirSync(join(output, 'static', '.well-known'));
    writeFileSync(
      join(output, 'static', '.well-known', 'openai-apps-challenge'),
      readFileSync(challenge, 'utf8').trim(),
    );
    routes.push({
      src: '/.well-known/openai-apps-challenge',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      continue: true,
    });
  }
  writeFileSync(
    join(output, 'config.json'),
    JSON.stringify({
      version: 3,
      routes: [...routes, { handle: 'filesystem' }],
    }),
  );
  console.log(`Built ${output} for Vercel`);
}

console.log(
  `Built ${join(out, 'view.html')} (${Math.round(html.length / 1024)} kB) and ${join(out, 'server.mjs')}`,
);
