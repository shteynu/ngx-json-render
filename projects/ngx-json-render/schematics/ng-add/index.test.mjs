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

async function workspace() {
  const tree = await runner.runExternalSchematic(
    '@schematics/angular',
    'workspace',
    {
      name: 'ws',
      newProjectRoot: 'projects',
      version: '21.0.0',
    },
  );
  return runner.runExternalSchematic(
    '@schematics/angular',
    'application',
    { name: 'app' },
    tree,
  );
}

const dependencies = (tree) => tree.readJson('/package.json').dependencies;
const installs = () =>
  runner.tasks.filter((task) => task.name === 'node-package');

test('adds the peers at the ranges the package admits, and installs them', async () => {
  const tree = await runner.runSchematic('ng-add', {}, await workspace());
  assert.equal(
    dependencies(tree)['@json-render/core'],
    self.peerDependencies['@json-render/core'],
  );
  // Core's own zod floor, so npm does not keep the CLI's older hoisted copy.
  assert.equal(dependencies(tree)['zod'], '^4.3.6');
  assert.equal(installs().length, 1);
});

test('leaves a peer the workspace already declares as it is', async () => {
  const before = await workspace();
  const manifest = before.readJson('/package.json');
  manifest.devDependencies = { ...manifest.devDependencies, zod: '4.1.0' };
  before.overwrite('/package.json', JSON.stringify(manifest));

  const tree = await runner.runSchematic('ng-add', {}, before);
  assert.equal(dependencies(tree)['zod'], undefined);
  assert.equal(tree.readJson('/package.json').devDependencies['zod'], '4.1.0');
  assert.ok(dependencies(tree)['@json-render/core']);
});

test('warns on an Angular older than the package supports', async () => {
  const before = await workspace();
  const manifest = before.readJson('/package.json');
  manifest.dependencies['@angular/core'] = '^19.2.0';
  before.overwrite('/package.json', JSON.stringify(manifest));

  const warnings = [];
  const subscription = runner.logger.subscribe((entry) => {
    if (entry.level === 'warn') warnings.push(entry.message);
  });
  await runner.runSchematic('ng-add', {}, before);
  subscription.unsubscribe();
  assert.match(warnings.join('\n'), /Angular 20 or newer/);
});
