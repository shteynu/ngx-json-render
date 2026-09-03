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
 * an incoherent pair is *expected* halfway through it. Three questions, in
 * order, because only the first is unconditional:
 *
 *   - does the released package install as itself *on its own*? Always fatal
 *     when it does not: the publish did not take, or what landed is not
 *     installable, and no later release fixes either.
 *   - does it still install as itself *alongside its siblings*? A downgrade
 *     here is the 0.2.1 failure — npm satisfying a stale peer by quietly
 *     choosing an older version — and it is fatal unless this very commit
 *     already carries the sibling that repairs it. Publishing the renderer
 *     first *necessarily* produces this state, so calling it fatal there
 *     painted correct releases red twice running, once in each direction,
 *     which is how a check stops being believed.
 *   - are the siblings current? Fatal only when the released package is the
 *     dependent one (the catalog, which declares the peer), since it ships
 *     second and is what makes the pair coherent again.
 *
 * "This commit repairs it" is not a guess: the sibling's manifest here has to
 * be ahead of what npm serves *and* declare a peer range admitting the version
 * just published. When the sibling on disk is as stale as the one on npm,
 * nothing is pending and the release is broken for good — which is exactly the
 * case the first check must keep catching.
 *
 * Usage: node scripts/check-published-resolution.mjs <package-name>
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyPairResolution } from './lib/resolution-verdict.mjs';

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

/**
 * Install by bare name, the way a new user would, and report what npm chose.
 * Installing one package alone and the set together answer different
 * questions: whether the publish is installable at all, and whether a stale
 * peer elsewhere drags it back down.
 */
const installAndResolve = (names) => {
  const work = mkdtempSync(join(tmpdir(), 'ngx-resolution-'));
  try {
    npm(['init', '-y'], { cwd: work });
    npm(['install', ...names, '--ignore-scripts', '--no-audit', '--no-fund'], {
      cwd: work,
    });
    return new Map(
      names.map((name) => {
        const path = join(work, 'node_modules', name, 'package.json');
        return [name, existsSync(path) ? read(path).version : null];
      }),
    );
  } catch (error) {
    console.error(
      `Installing ${names.join(' ')} from ${REGISTRY} failed:\n` +
        `${error.stderr || error.message}`,
    );
    process.exit(1);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
};

// On its own first. No later release changes this answer, so a wrong one is
// always fatal — and separating it means a downgrade in the pair below is
// unambiguously about a sibling rather than about the publish.
const solo = installAndResolve([released]).get(released);
if (solo !== target) {
  console.error(
    `\n${released} was published as ${target}, but installing it on its own ` +
      `from ${REGISTRY} gives ${solo ?? 'nothing'}.\n` +
      'The publish did not take, or what landed is not installable.',
  );
  process.exit(1);
}
console.log(`On its own, ${released} resolves to ${solo}.`);

const resolved = installAndResolve([...expected.keys()]);
console.log(
  `Installing them together from ${REGISTRY} resolves: ` +
    `${[...resolved].map(([n, v]) => `${n}@${v ?? 'MISSING'}`).join(', ')}.`,
);

const siblings = [...expected]
  .filter(([name]) => name !== released)
  .map(([name, declared]) => ({
    name,
    declared,
    onNpm: resolved.get(name),
    peerOnReleased: manifests.find((m) => m.name === name)?.peerDependencies?.[
      released
    ],
  }));

const verdict = classifyPairResolution({
  target,
  resolvedReleased: resolved.get(released),
  dependent: dependsOnSibling(released),
  siblings,
});

const detail = siblings
  .filter((s) => s.onNpm !== s.declared)
  .map(
    (s) =>
      `  ${s.name}: npm serves ${s.onNpm ?? 'nothing'}, this commit declares ${s.declared}`,
  )
  .join('\n');

switch (verdict.reason) {
  case 'coherent':
    break;

  case 'lockstep-pending':
    console.warn(
      `\n${released}@${target} installs correctly on its own, but installing ` +
        `the pair resolves it to ${resolved.get(released) ?? 'nothing'}: the ` +
        `sibling on npm still carries the peer range it had before this ` +
        `release, and npm satisfies that by choosing an older version rather ` +
        `than failing.\n${detail}\n\n` +
        'This is the middle of the lockstep, not a broken release — the ' +
        'sibling that widens the range is in this commit. Release it now; ' +
        'until it ships, installing the pair silently omits everything this ' +
        'release contains.',
    );
    break;

  case 'downgraded-unrepaired':
    console.error(
      `\n${released} was published as ${target}, but installing the packages ` +
        `together resolves it to ${resolved.get(released) ?? 'nothing'}.\n` +
        'A stale peer range on npm makes npm satisfy it by choosing an older ' +
        'version instead of failing, so the install looks clean and silently ' +
        'omits everything this release contains.\n' +
        (detail ? `${detail}\n` : '') +
        '\nNothing in this commit repairs it: releasing the sibling as it ' +
        'stands here would leave the pair exactly as it is.',
    );
    process.exit(1);
    break;

  case 'dependent-incoherent':
    console.error(
      `\nThe dependent package was just released, so the pair should be ` +
        `coherent now, and is not:\n${detail}`,
    );
    process.exit(1);
    break;

  case 'siblings-behind':
    console.warn(
      `\nHalfway through the lockstep — expected, but not finished:\n${detail}\n\n` +
        'Release the dependent package now; until it ships, its published ' +
        'peer range still points at an older sibling and installing the pair ' +
        'will quietly downgrade it.',
    );
    break;
}
