/**
 * Sets the renderer up the way the README tells a new user to: `ng new` on
 * the given Angular line, `ng add` of the packed `dist/ngx-json-render`, then
 * `ng generate ngx-json-render:mcp-app` and its `mcp` target. Finally it runs
 * the generated server over stdio and lists its tools.
 *
 * `consumer-smoke` writes the consumer's package.json itself, so it never sees
 * what `ng add` installs next to what the CLI brought. That is where Angular
 * 20 broke: the CLI hoists zod 4.1.13, a `zod@^4.0.0` from `ng add` kept it,
 * and `@json-render/core` nested its own zod, so catalog schemas no longer
 * type-checked. This path catches that class of failure.
 *
 * Usage: npm run build:lib
 *        node scripts/ng-add-smoke.mjs 20
 *
 * The app is created in a temporary directory, printed first and removed only
 * when every check passed, so a failure leaves it behind to inspect.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const major = process.argv[2];
if (!/^\d+$/.test(major ?? '')) {
  console.error('usage: node scripts/ng-add-smoke.mjs <angular-major>');
  process.exit(1);
}

const lib = resolve('dist/ngx-json-render');
if (!existsSync(join(lib, 'schematics', 'collection.json'))) {
  console.error(
    'dist/ngx-json-render is missing; run `npm run build:lib` first.',
  );
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), `ngx-json-render-ng-add-${major}-`));
const app = join(dir, 'app');
console.log(`ng add on Angular ${major}: ${app}`);

const env = { ...process.env, NG_CLI_ANALYTICS: 'false' };
/** Runs a command with its output passed through, exiting on failure. */
const step = (cwd, cmd, args) => {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  try {
    execFileSync(cmd, args, { cwd, env, stdio: 'inherit' });
  } catch {
    console.error(`\n\`${cmd} ${args.join(' ')}\` failed; app left in ${dir}`);
    process.exit(1);
  }
};

const tarball = execFileSync(
  'npm',
  ['pack', lib, '--pack-destination', dir, '--silent'],
  { env },
)
  .toString()
  .trim()
  .split('\n')
  .pop();

step(dir, 'npx', [
  '-y',
  `@angular/cli@${major}`,
  'new',
  'app',
  '--defaults',
  '--skip-git',
  '--skip-install',
  '--ssr=false',
  '--package-manager=npm',
]);
// npm 10 trips over jsdom's optional `canvas` peer in some `ng new` trees
// (`Cannot read properties of null (reading 'edgesOut')`); unrelated to us.
step(app, 'npm', ['install', '--legacy-peer-deps', '--no-audit', '--no-fund']);
step(app, 'npx', ['ng', 'add', join(dir, tarball), '--skip-confirmation']);
step(app, 'npx', ['ng', 'generate', 'ngx-json-render:mcp-app']);
// Builds the view with strict templates and its catalog with the app's zod.
step(app, 'npx', ['ng', 'run', 'mcp-app:mcp']);

const client = new Client({ name: 'ng-add-smoke', version: '0.0.0' });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [join(app, 'dist', 'mcp-app', 'server.mjs')],
    cwd: dir,
  }),
);
const { tools } = await client.listTools();
const tool = tools.find((t) => t.name === 'render-ui');
const result = tool
  ? await client.callTool({
      name: 'render-ui',
      arguments: {
        spec: {
          root: 'card',
          elements: {
            card: { type: 'Card', props: { title: 'Hi' }, children: [] },
          },
        },
      },
    })
  : undefined;
await client.close();

const problems = [];
if (!tool) problems.push('the server lists no render-ui tool');
else {
  if (!tool._meta?.ui?.resourceUri)
    problems.push('render-ui is not linked to its view');
  if (!tool.description?.includes('sendMessage'))
    problems.push('render-ui does not describe sendMessage');
  if (result?.isError)
    problems.push(
      `render-ui refused a starter spec: ${JSON.stringify(result)}`,
    );
}
if (problems.length) {
  console.error(`\n${problems.join('\n')}\napp left in ${dir}`);
  process.exit(1);
}

console.log(
  `\nAngular ${major}: ng add, ng generate ngx-json-render:mcp-app and its build passed; the server lists render-ui.`,
);
rmSync(dir, { recursive: true, force: true });
