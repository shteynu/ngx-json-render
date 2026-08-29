/**
 * Prepares the workspace to build and test the library against an older
 * Angular line than the one `package.json` pins, so CI can prove the
 * `>=20` peer range in `projects/ngx-json-render/package.json` still holds.
 *
 * Usage: node scripts/angular-compat.mjs 20
 */
import { readFileSync, writeFileSync } from 'node:fs';

const major = process.argv[2];
if (!/^\d+$/.test(major ?? '')) {
  console.error('usage: node scripts/angular-compat.mjs <angular-major>');
  process.exit(1);
}

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const write = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + '\n');

const pkg = read('package.json');
for (const name of Object.keys(pkg.dependencies)) {
  if (name.startsWith('@angular/')) pkg.dependencies[name] = `^${major}.0.0`;
}
for (const name of Object.keys(pkg.devDependencies)) {
  if (name.startsWith('@angular/') || name === 'ng-packagr') {
    pkg.devDependencies[name] = `^${major}.0.0`;
  }
}
if (major === '20') {
  // @angular/build@20 declares a peer of vitest ^3.1.1; vitest 4 fails ERESOLVE.
  pkg.devDependencies.vitest = '^3.2.0';
  pkg.devDependencies.typescript = '~5.8.0';
}
write('package.json', pkg);

if (major === '20') {
  // The v20 unit-test builder requires `buildTarget` and `runner`; v21 infers both.
  const ng = read('angular.json');
  for (const project of Object.values(ng.projects)) {
    const test = project.architect?.test;
    if (!test) continue;
    test.options = { ...test.options, buildTarget: 'demo:build', runner: 'vitest' };
  }
  write('angular.json', ng);
}

console.log(`Workspace retargeted to Angular ${major}.`);
