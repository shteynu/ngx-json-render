/**
 * Keeps the Claude Code plugin in plugins/ngx-json-render in step with the
 * sources it repackages.
 *
 * Anthropic's plugin directory installs only the plugin folder and refuses
 * symbolic links, so the skills and the LICENSE are copied in rather than
 * linked. skills/<name>/SKILL.md stays the source: check:skills compiles it,
 * and `npx skills add` installs it. The plugin's version follows the
 * renderer's, because the skills describe the renderer's current API and the
 * directory wants the version raised on every release.
 *
 * Usage: node scripts/sync-plugin.mjs          # write the copies and version
 *        node scripts/sync-plugin.mjs --check  # fail on any drift (CI)
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const check = process.argv.includes('--check');
const plugin = 'plugins/ngx-json-render';
const manifestPath = join(plugin, '.claude-plugin', 'plugin.json');

const skills = readdirSync('skills', { withFileTypes: true })
  .filter(
    (d) => d.isDirectory() && existsSync(join('skills', d.name, 'SKILL.md')),
  )
  .map((d) => d.name);

// Every file the plugin should hold, with the content it should have.
const wanted = new Map([
  [join(plugin, 'LICENSE'), readFileSync('LICENSE', 'utf8')],
]);
for (const skill of skills) {
  const dir = join('skills', skill);
  for (const file of readdirSync(dir, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!file.isFile()) continue;
    const rel = join(file.parentPath ?? file.path, file.name).slice(
      dir.length + 1,
    );
    wanted.set(
      join(plugin, 'skills', skill, rel),
      readFileSync(join(dir, rel), 'utf8'),
    );
  }
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const version = JSON.parse(
  readFileSync('projects/ngx-json-render/package.json', 'utf8'),
).version;

// Skills deleted or renamed in skills/ must disappear from the plugin too.
const stale = existsSync(join(plugin, 'skills'))
  ? readdirSync(join(plugin, 'skills'), {
      recursive: true,
      withFileTypes: true,
    })
      .filter((f) => f.isFile())
      .map((f) => join(f.parentPath ?? f.path, f.name))
      .filter((path) => !wanted.has(path))
  : [];

const drift = [...wanted]
  .filter(
    ([path, content]) =>
      !existsSync(path) || readFileSync(path, 'utf8') !== content,
  )
  .map(([path]) => path);

if (check) {
  const problems = [
    ...drift.map((path) => `${path}: missing or differs from its source`),
    ...stale.map((path) => `${path}: has no source under skills/`),
  ];
  if (manifest.version !== version) {
    problems.push(
      `${manifestPath}: version ${manifest.version}, but ngx-json-render is ${version}`,
    );
  }
  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    console.error('\nRun `npm run sync:plugin` and commit the result.');
    process.exit(1);
  }
  console.log(`Plugin in step: ${skills.length} skills, version ${version}.`);
} else {
  for (const path of stale) rmSync(path);
  for (const path of drift) {
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, wanted.get(path));
  }
  if (manifest.version !== version) {
    manifest.version = version;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  console.log(
    `Synced ${drift.length} file(s), removed ${stale.length}; plugin version ${version}.`,
  );
}
