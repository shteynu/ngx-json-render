/**
 * Fails when one published package's peer range on a sibling published
 * package excludes that sibling's current version.
 *
 * This is the one contract nothing else in the workspace evaluates.
 * `tsconfig.json` maps both package names to `dist/`, so everything that
 * ships is compiled and tested against the real build output — except the
 * manifest, whose peer ranges only npm ever resolves. That blind spot
 * published `ngx-json-render-material@0.2.0` with a peer of
 * `ngx-json-render: ^0.1.0`, and a 0.x caret stops below the next minor, so
 * installing the pair the way the catalog's own README documents it failed
 * with ERESOLVE on npm >= 7.
 *
 * Usage: node scripts/check-peer-ranges.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
// Not a direct dev dependency on purpose: semver is hoisted to the workspace
// root by @angular/cli and @angular/compiler-cli and pinned there by the
// lockfile, while every dev dependency added here has to be mirrored into
// scripts/angular-compat.mjs or the compat job breaks on an ERESOLVE that
// looks unrelated to the change that caused it.
import semver from 'semver';

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));

const manifests = Object.values(read('angular.json').projects)
  .filter((project) => project.projectType === 'library')
  .map((project) => `${project.root}/package.json`)
  .filter((path) => existsSync(path))
  .map((path) => ({ path, ...read(path) }));

const versions = new Map(manifests.map((pkg) => [pkg.name, pkg.version]));

const failures = [];
for (const pkg of manifests) {
  for (const [peer, range] of Object.entries(pkg.peerDependencies ?? {})) {
    const version = versions.get(peer);
    if (version === undefined) continue; // external peer, not ours to police
    if (!semver.satisfies(version, range)) {
      failures.push({ pkg, peer, range, version });
    }
  }
}

if (failures.length > 0) {
  for (const { pkg, peer, range, version } of failures) {
    console.error(
      `${pkg.path}: peer "${peer}": "${range}" excludes ${peer}@${version}, ` +
        `the version this workspace builds and publishes.`,
    );
  }
  console.error(
    '\nInstalling these packages together resolves both to latest, so a range ' +
      'that excludes the sibling is an ERESOLVE for every new user. Widen the ' +
      'range in the same commit that bumps the version, and release the ' +
      'dependent package after the one it points at.',
  );
  process.exit(1);
}

const checked = manifests.map((pkg) => `${pkg.name}@${pkg.version}`).join(', ');
console.log(`Peer ranges between workspace packages are coherent: ${checked}.`);
