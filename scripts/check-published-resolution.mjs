/**
 * Fails when the package just published does not actually install as itself.
 *
 * `check:peers` reads the manifests in this workspace, where both packages are
 * always bumped in the same commit and therefore always agree. It cannot see
 * the gap that matters at release time: the one between what this commit says
 * and what npm is serving. Publishing `ngx-json-render@0.2.1` while the
 * catalog on npm was still 0.2.0 — carrying its old `^0.1.0` peer — made
 * `npm install ngx-json-render ngx-json-render-material` resolve the renderer
 * down to 0.1.4. No ERESOLVE, no warning: npm satisfied the stale peer by
 * quietly choosing an older renderer, so the install looked clean and shipped
 * a version without any of the release's contents.
 *
 * Severity is deliberately asymmetric, because the lockstep in AGENTS.md means
 * an incoherent pair is *expected* halfway through it:
 *
 *   - the released package must resolve to its own new version — always fatal,
 *     since it means the publish did not take or is not installable;
 *   - the pair must resolve coherently — fatal only when the released package
 *     is the dependent one (the catalog, which declares the peer). Releasing
 *     the renderer first necessarily leaves the pair incoherent until the
 *     catalog follows, so there it is a warning naming the required follow-up.
 *
 * Usage: node scripts/check-published-resolution.mjs <package-name>
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REGISTRY = 'https://registry.npmjs.org/';
/** How long to let the registry catch up before calling a publish missing. */
const PROPAGATION_TRIES = 30;
const PROPAGATION_WAIT_MS = 10_000;

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));

const released = process.argv[2];
if (!released) {
  console.error('Usage: node scripts/check-published-resolution.mjs <package>');
  process.exit(2);
}

// Same derivation as check-peer-ranges.mjs: the libraries are whatever
// angular.json calls a library, so adding a third package needs no edit here.
const manifests = Object.values(read('angular.json').projects)
  .filter((project) => project.projectType === 'library')
  .map((project) => `${project.root}/package.json`)
  .filter((path) => existsSync(path))
  .map((path) => read(path));

const expected = new Map(manifests.map((pkg) => [pkg.name, pkg.version]));
if (!expected.has(released)) {
  console.error(
    `${released} is not a library in this workspace. Known: ${[...expected.keys()].join(', ')}.`,
  );
  process.exit(2);
}

/**
 * Whether this package points at a sibling. The dependent half of the lockstep
 * is the one that has to ship second, and the only one that can make the pair
 * coherent again.
 */
const dependsOnSibling = (name) => {
  const pkg = manifests.find((m) => m.name === name);
  return Object.keys(pkg.peerDependencies ?? {}).some(
    (peer) => expected.has(peer) && peer !== name,
  );
};

const npm = (args, opts = {}) =>
  execFileSync('npm', [...args, '--registry', REGISTRY], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  }).trim();

const sleep = (ms) =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// The registry can lag a publish by a few seconds; a missing version here is
// only news once it has stayed missing.
const target = expected.get(released);
let servedByRegistry = false;
for (let i = 0; i < PROPAGATION_TRIES; i++) {
  try {
    if (npm(['view', `${released}@${target}`, 'version']) === target) {
      servedByRegistry = true;
      break;
    }
  } catch {
    /* not published yet */
  }
  if (i === 0) {
    console.log(`Waiting for ${released}@${target} to appear on the registry…`);
  }
  sleep(PROPAGATION_WAIT_MS);
}

if (!servedByRegistry) {
  console.error(
    `${released}@${target} is still not on the registry after ` +
      `${(PROPAGATION_TRIES * PROPAGATION_WAIT_MS) / 1000}s. The publish did not take.`,
  );
  process.exit(1);
}

// Install the packages the way a new user would: by bare name, together, so
// npm resolves each to whatever it thinks `latest` should be.
const work = mkdtempSync(join(tmpdir(), 'ngx-resolution-'));
let resolved;
try {
  npm(['init', '-y'], { cwd: work });
  npm(
    [
      'install',
      ...expected.keys(),
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
    ],
    { cwd: work },
  );
  resolved = new Map(
    [...expected.keys()].map((name) => {
      const path = join(work, 'node_modules', name, 'package.json');
      return [name, existsSync(path) ? read(path).version : null];
    }),
  );
} catch (error) {
  console.error(
    `Installing ${[...expected.keys()].join(' ')} from ${REGISTRY} failed:\n` +
      `${error.stderr || error.message}`,
  );
  process.exit(1);
} finally {
  rmSync(work, { recursive: true, force: true });
}

const shown = [...resolved]
  .map(([name, version]) => `${name}@${version ?? 'MISSING'}`)
  .join(', ');
console.log(`Installing them together from ${REGISTRY} resolves: ${shown}.`);

// 1. The released package must be what a new user gets. Never negotiable: if
//    it is not, this release is invisible to everyone installing the pair.
if (resolved.get(released) !== target) {
  console.error(
    `\n${released} was published as ${target}, but installing the packages ` +
      `together resolves it to ${resolved.get(released) ?? 'nothing'}.\n` +
      'A stale peer range on npm makes npm satisfy it by choosing an older ' +
      'version instead of failing, so the install looks clean and silently ' +
      'omits everything this release contains.',
  );
  process.exit(1);
}

// 2. Every sibling should be current too. Mid-lockstep that is not yet true.
const stale = [...expected].filter(
  ([name, version]) => name !== released && resolved.get(name) !== version,
);

if (stale.length > 0) {
  const detail = stale
    .map(
      ([name, version]) =>
        `  ${name}: npm serves ${resolved.get(name) ?? 'nothing'}, this commit declares ${version}`,
    )
    .join('\n');

  if (dependsOnSibling(released)) {
    console.error(
      `\nThe dependent package was just released, so the pair should be ` +
        `coherent now, and is not:\n${detail}`,
    );
    process.exit(1);
  }

  console.warn(
    `\nHalfway through the lockstep — expected, but not finished:\n${detail}\n\n` +
      'Release the dependent package now; until it ships, its published peer ' +
      'range still points at an older sibling and installing the pair will ' +
      'quietly downgrade it.',
  );
}
