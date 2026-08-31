/**
 * Fails when anything in this workspace reintroduces a dependency on Zone.js.
 *
 * "Zoneless-friendly" is a claim the README makes and the whole design rests
 * on — signals plus `OnPush` everywhere, no `NgZone` anywhere — but nothing
 * enforced it. Angular does not fail a build for injecting `NgZone`, and a
 * suite that forgets `provideZonelessChangeDetection()` still passes, so the
 * guarantee could erode one import at a time with every check green.
 *
 * Four invariants, cheapest first:
 *
 * 1. No manifest depends on `zone.js` — not the workspace, not either
 *    published package, in any dependency kind.
 * 2. No source file mentions `NgZone` or imports `zone.js`.
 * 3. Every spec that configures a TestBed provides
 *    `provideZonelessChangeDetection()`, so every green suite is evidence
 *    rather than an accident of the default.
 * 4. The built bundles carry no reference to either — the check that speaks
 *    for what actually ships. Skipped with a note when `dist/` is empty, so
 *    the script stays runnable before a build; CI runs it after one.
 *
 * Usage: node scripts/check-zoneless.mjs
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));

const NG_ZONE = /\bNgZone\b/;
const ZONE_JS = /['"`]zone\.js/;

/** Every file under `dir` matching `test`, depth-first. */
function walk(dir, test) {
  if (!existsSync(dir)) return [];
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(path, test));
    else if (test(entry.name)) found.push(path);
  }
  return found;
}

const projects = Object.values(read('angular.json').projects);
const libraries = projects.filter(
  (project) => project.projectType === 'library',
);

const failures = [];

// 1. Manifests.
const manifests = [
  'package.json',
  ...libraries
    .map((project) => `${project.root}/package.json`)
    .filter((path) => existsSync(path)),
];
for (const path of manifests) {
  const manifest = read(path);
  for (const kind of [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ]) {
    const range = manifest[kind]?.['zone.js'];
    if (range !== undefined) {
      failures.push(`${path}: ${kind} declares zone.js@${range}.`);
    }
  }
}

// 2 and 3. Sources.
const sources = projects.flatMap((project) =>
  walk(join(project.root, 'src'), (name) => name.endsWith('.ts')),
);
let specsChecked = 0;
for (const path of sources) {
  const source = readFileSync(path, 'utf8');
  if (NG_ZONE.test(source)) {
    failures.push(`${path}: mentions NgZone.`);
  }
  if (ZONE_JS.test(source)) {
    failures.push(`${path}: imports zone.js.`);
  }
  if (!path.endsWith('.spec.ts')) continue;
  // A spec with no TestBed runs no change detection and has nothing to say
  // about zones either way.
  if (!source.includes('configureTestingModule')) continue;
  specsChecked++;
  if (!source.includes('provideZonelessChangeDetection')) {
    failures.push(
      `${path}: configures a TestBed without provideZonelessChangeDetection().`,
    );
  }
}

// 4. Build output.
const bundles = libraries.flatMap((project) => {
  const dist = read(`${project.root}/ng-package.json`).dest.replace(
    /^\.\.\/\.\.\//,
    '',
  );
  return walk(dist, (name) => name.endsWith('.mjs'));
});
for (const path of bundles) {
  const bundle = readFileSync(path, 'utf8');
  if (NG_ZONE.test(bundle) || ZONE_JS.test(bundle)) {
    failures.push(`${path}: the published bundle references Zone.js.`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  console.error(
    '\nThis package is zoneless by construction: signals and OnPush ' +
      'everywhere, no NgZone. A dependency on Zone.js would break that for ' +
      'every zoneless app — the default for new applications since Angular ' +
      '21 — so it is a defect rather than a preference.',
  );
  process.exit(1);
}

const built =
  bundles.length > 0
    ? `${bundles.length} built bundle(s)`
    : 'no built bundles (dist/ is empty — run the builds first to include them)';
console.log(
  `Zoneless: ${manifests.length} manifest(s) free of zone.js, ` +
    `${sources.length} source file(s) free of NgZone, ` +
    `${specsChecked} TestBed suite(s) explicitly zoneless, ${built}.`,
);
