// Runs against the built schematic: `npm run build:lib`, then
// `npm run test:schematics`.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
// A CommonJS directory entry point, which ESM `import` cannot resolve.
const { SchematicTestRunner } = require('@angular-devkit/schematics/testing');
const collection =
  require.resolve('../../../../dist/ngx-json-render/schematics/collection.json');
const self = require('../../../../dist/ngx-json-render/package.json');
const runner = new SchematicTestRunner('ngx-json-render', collection);

const CATALOG = `import { schema } from 'ngx-json-render/schema';
export const shopCatalog = schema.createCatalog({ components: {}, actions: {} });
`;
const REGISTRY = `export const { registry } = defineRegistry(shopCatalog, {});
`;

async function workspace(dependencies = {}) {
  let tree = await runner.runExternalSchematic(
    '@schematics/angular',
    'workspace',
    { name: 'ws', newProjectRoot: 'projects', version: '21.0.0' },
  );
  tree = await runner.runExternalSchematic(
    '@schematics/angular',
    'application',
    { name: 'shop' },
    tree,
  );
  const manifest = tree.readJson('/package.json');
  Object.assign(manifest.dependencies, dependencies);
  tree.overwrite('/package.json', JSON.stringify(manifest));
  tree.create('/projects/shop/src/app/catalog.ts', CATALOG);
  tree.create('/projects/shop/src/app/registry.ts', REGISTRY);
  return tree;
}

const project = (tree, name) => tree.readJson('/angular.json').projects[name];

/** Runs the schematic and collects what it logged at `level`. */
async function generate(options, tree, level = 'warn') {
  const logged = [];
  const subscription = runner.logger.subscribe((entry) => {
    if (entry.level === level) logged.push(entry.message);
  });
  try {
    const result = await runner.runSchematic('mcp-app', options, tree);
    return { tree: result, logged };
  } finally {
    subscription.unsubscribe();
  }
}

test('generates a view, a server and an mcp target with a starter catalog', async () => {
  const { tree } = await generate({}, await workspace());

  const app = project(tree, 'mcp-app');
  assert.deepEqual(app.architect.mcp, {
    builder: 'ngx-json-render:mcp-app',
    options: {
      buildTarget: 'mcp-app:build:production',
      outputPath: 'dist/mcp-app',
      server: 'projects/mcp-app/server.ts',
    },
  });
  assert.ok(!app.architect.build.options.polyfills?.includes('zone.js'));
  assert.deepEqual(
    app.architect.build.configurations.production.budgets.find(
      (budget) => budget.type === 'initial',
    ),
    { type: 'initial', maximumWarning: '3MB', maximumError: '5MB' },
  );
  assert.ok(!tree.exists('/projects/mcp-app/public/favicon.ico'));
  assert.deepEqual(
    tree.getDir('/projects/mcp-app/src/app').subfiles.toSorted(),
    ['app.ts', 'catalog.ts', 'registry.ts'],
  );

  const view = tree.readText('/projects/mcp-app/src/app/app.ts');
  assert.match(view, /import \{ registry \} from '\.\/registry';/);
  assert.match(view, /\[handlers\]="mcp\.handlers"/);
  assert.match(view, /injectJsonRenderApp\(\{ name: 'mcp-app'/);
  const server = tree.readText('/projects/mcp-app/server.ts');
  assert.match(server, /import \{ catalog \} from '\.\/src\/app\/catalog';/);
  assert.match(server, /sendMessage: true,/);
  assert.match(
    tree.readText('/projects/mcp-app/src/main.ts'),
    /provideZonelessChangeDetection\(\)/,
  );
  assert.ok(tree.exists('/projects/mcp-app/src/styles.css'));

  const dependencies = tree.readJson('/package.json').dependencies;
  assert.equal(dependencies['zod'], '^4.3.6');
  for (const peer of [
    '@json-render/core',
    '@modelcontextprotocol/ext-apps',
    '@modelcontextprotocol/sdk',
  ]) {
    assert.equal(dependencies[peer], self.peerDependencies[peer], peer);
  }
});

test("imports the workspace's own catalog and registry", async () => {
  const { tree, logged } = await generate(
    {
      name: 'shop-mcp',
      catalog: 'projects/shop/src/app/catalog.ts#shopCatalog',
      registry: 'projects/shop/src/app/registry.ts',
    },
    await workspace(),
  );

  assert.deepEqual(logged, []);
  assert.deepEqual(tree.getDir('/projects/shop-mcp/src/app').subfiles, [
    'app.ts',
  ]);
  assert.match(
    tree.readText('/projects/shop-mcp/server.ts'),
    /import \{ shopCatalog as catalog \} from '\.\.\/shop\/src\/app\/catalog';/,
  );
  assert.match(
    tree.readText('/projects/shop-mcp/src/app/app.ts'),
    /import \{ registry \} from '\.\.\/\.\.\/\.\.\/shop\/src\/app\/registry';/,
  );
});

test('warns when the catalog would load Angular into the server', async () => {
  const before = await workspace();
  before.overwrite(
    '/projects/shop/src/app/catalog.ts',
    `import { Component } from '@angular/core';\n${CATALOG}`,
  );

  const { logged } = await generate(
    {
      catalog: 'projects/shop/src/app/catalog.ts#shopCatalog',
      registry: 'projects/shop/src/app/registry.ts#registry',
    },
    before,
  );

  assert.match(
    logged.join('\n'),
    /imports @angular\/core, which needs Angular/,
  );
});

test('uses the Material catalog when ngx-json-render-material is installed', async () => {
  const { tree } = await generate(
    {},
    await workspace({ 'ngx-json-render-material': '^0.9.0' }),
  );

  assert.deepEqual(tree.getDir('/projects/mcp-app/src/app').subfiles, [
    'app.ts',
  ]);
  assert.match(
    tree.readText('/projects/mcp-app/server.ts'),
    /import \{ materialCatalog as catalog \} from 'ngx-json-render-material\/catalog';[\s\S]*resourceDomains: \['https:\/\/fonts\.googleapis\.com'/,
  );
  assert.match(
    tree.readText('/projects/mcp-app/src/app/app.ts'),
    /import \{ materialRegistry as registry \} from 'ngx-json-render-material';/,
  );
  assert.match(
    tree.readText('/projects/mcp-app/src/styles.scss'),
    /@include mat\.theme/,
  );
  assert.match(
    tree.readText('/projects/mcp-app/src/main.ts'),
    /material-symbols-outlined/,
  );
});

test('refuses what it cannot generate', async () => {
  await assert.rejects(
    generate(
      { catalog: 'projects/shop/src/app/catalog.ts' },
      await workspace(),
    ),
    /Pass --catalog and --registry together/,
  );
  await assert.rejects(
    generate(
      {
        catalog: 'projects/shop/src/app/catalog.ts#nope',
        registry: 'projects/shop/src/app/registry.ts',
      },
      await workspace(),
    ),
    /exports no "nope"/,
  );
  await assert.rejects(
    generate({ name: 'shop' }, await workspace()),
    /already has a project named "shop"/,
  );
});
