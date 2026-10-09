import {
  chain,
  SchematicsException,
  type Rule,
  type Tree,
} from '@angular-devkit/schematics';
import { addDependency } from '@schematics/angular/utility';

// The schematic runs from the published package, so this is the manifest that
// ships next to it: dist/ngx-json-render/package.json, or
// node_modules/ngx-json-render/package.json in the user's workspace.
declare const require: (id: string) => unknown;

interface Manifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const self = require('../../package.json') as Manifest;

/** Peers a workspace has to declare itself; `@angular/*` is already there. */
const PEERS = ['@json-render/core', 'zod'];

const README =
  'https://github.com/shteynu/ngx-json-render/tree/main/projects/ngx-json-render#readme';

/**
 * `ng add ngx-json-render`: declares the peers the renderer needs, at the
 * ranges its own manifest admits, and leaves any the workspace already has
 * untouched. The CLI installs the package itself; npm would install the peers
 * too, but without a `package.json` entry nothing pins them.
 */
export function ngAdd(): Rule {
  return (tree, context) => {
    const workspace = readManifest(tree);
    warnOnOldAngular(workspace, (message) => context.logger.warn(message));

    const rules: Rule[] = [];
    for (const name of PEERS) {
      if (declares(workspace, name)) continue;
      const range = self.peerDependencies?.[name];
      if (!range)
        throw new SchematicsException(
          `ngx-json-render declares no peer range for ${name}.`,
        );
      rules.push(addDependency(name, range));
      context.logger.info(`Adding ${name}@${range}`);
    }

    context.logger.info(
      [
        '',
        'ngx-json-render is ready. Next: describe your components in a catalog,',
        `register them, and render a spec with <json-render> — see ${README}`,
        'No components of your own yet? `ng add ngx-json-render-material` adds',
        '29 ready-made Angular Material ones.',
      ].join('\n'),
    );
    return chain(rules);
  };
}

function readManifest(tree: Tree): Manifest {
  if (!tree.exists('/package.json')) {
    throw new SchematicsException('No package.json at the workspace root.');
  }
  return tree.readJson('/package.json') as Manifest;
}

function declares(manifest: Manifest, name: string): boolean {
  return !!(manifest.dependencies?.[name] ?? manifest.devDependencies?.[name]);
}

function warnOnOldAngular(
  manifest: Manifest,
  warn: (message: string) => void,
): void {
  const range = manifest.dependencies?.['@angular/core'];
  const major = range ? Number(/\d+/.exec(range)?.[0]) : NaN;
  if (major < 20) {
    warn(
      `ngx-json-render needs Angular 20 or newer; this workspace has @angular/core ${range}.`,
    );
  }
}
