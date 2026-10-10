// Runs against the built schematic: `npm run build:lib && npm run
// build:material`, then `npm run test:schematics`.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
// A CommonJS directory entry point, which ESM `import` cannot resolve.
const { SchematicTestRunner } = require('@angular-devkit/schematics/testing');
const collection =
  require.resolve('../../../../dist/ngx-json-render-material/schematics/collection.json');
const self = require('../../../../dist/ngx-json-render-material/package.json');
const runner = new SchematicTestRunner('ngx-json-render-material', collection);

async function workspace(edit = () => {}) {
  let tree = await runner.runExternalSchematic(
    '@schematics/angular',
    'workspace',
    {
      name: 'ws',
      newProjectRoot: 'projects',
      version: '21.0.0',
    },
  );
  tree = await runner.runExternalSchematic(
    '@schematics/angular',
    'application',
    { name: 'app' },
    tree,
  );
  const manifest = tree.readJson('/package.json');
  edit(manifest);
  tree.overwrite('/package.json', JSON.stringify(manifest));
  return tree;
}

const dependencies = (tree) => tree.readJson('/package.json').dependencies;
const tasks = (name) => runner.tasks.filter((task) => task.name === name);

test('adds the renderer and its peers at the ranges the catalog admits', async () => {
  const tree = await runner.runSchematic(
    'ng-add',
    { project: 'app' },
    await workspace(),
  );
  for (const name of ['ngx-json-render', '@json-render/core']) {
    assert.equal(dependencies(tree)[name], self.peerDependencies[name], name);
  }
  // Core's own zod floor, so npm does not keep the CLI's older hoisted copy.
  assert.equal(dependencies(tree)['zod'], '^4.3.6');
});

test('without Material: adds it at the Angular range, installs, then runs its ng-add', async () => {
  const tree = await runner.runSchematic(
    'ng-add',
    { project: 'app' },
    await workspace(),
  );
  const angular = dependencies(tree)['@angular/core'];
  assert.equal(dependencies(tree)['@angular/material'], angular);

  const [install] = tasks('node-package');
  const [material] = tasks('run-schematic');
  assert.ok(install, 'an install task');
  assert.equal(material.options.collection, '@angular/material');
  assert.equal(material.options.name, 'ng-add');
  assert.deepEqual(material.options.options, { project: 'app' });
});

test('with Material already set up: keeps it and does not run its ng-add', async () => {
  const before = await workspace((manifest) => {
    manifest.dependencies['@angular/material'] = '~21.1.0';
    manifest.dependencies['@angular/cdk'] = '~21.1.0';
  });
  const tree = await runner.runSchematic('ng-add', { project: 'app' }, before);
  assert.equal(dependencies(tree)['@angular/material'], '~21.1.0');
  assert.equal(tasks('run-schematic').length, 0);
  assert.equal(tasks('node-package').length, 1);
});

test('with everything declared: changes nothing and installs nothing', async () => {
  const before = await workspace((manifest) => {
    for (const name of ['ngx-json-render', '@json-render/core', 'zod']) {
      manifest.dependencies[name] = self.peerDependencies[name];
    }
    manifest.dependencies['@angular/material'] = '~21.1.0';
  });
  const tree = await runner.runSchematic('ng-add', { project: 'app' }, before);
  assert.deepEqual(
    tree.readJson('/package.json'),
    before.readJson('/package.json'),
  );
  assert.equal(runner.tasks.length, 0);
});

test('refuses a workspace without Angular', async () => {
  const before = await workspace(
    (manifest) => delete manifest.dependencies['@angular/core'],
  );
  await assert.rejects(
    runner.runSchematic('ng-add', {}, before),
    /no @angular\/core/,
  );
});
