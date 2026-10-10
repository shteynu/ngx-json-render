import {
  chain,
  SchematicsException,
  type Rule,
  type Tree,
} from '@angular-devkit/schematics';
import {
  NodePackageInstallTask,
  RunSchematicTask,
} from '@angular-devkit/schematics/tasks';
import { addDependency, InstallBehavior } from '@schematics/angular/utility';

// The schematic runs from the published package, so this is the manifest that
// ships next to it: dist/ngx-json-render-material/package.json, or
// node_modules/ngx-json-render-material/package.json in the user's workspace.
declare const require: (id: string) => unknown;

interface Manifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export interface NgAddOptions {
  project?: string;
}

const self = require('../../package.json') as Manifest;

/** Peers taken at the range this package's own manifest admits. */
const PEERS = ['ngx-json-render', '@json-render/core', 'zod'];

/**
 * Ranges to write that are narrower than the peer range. `@json-render/core`
 * depends on zod ^4.3.6 itself; with a looser app range npm keeps whatever zod
 * the Angular CLI hoisted (4.1.13 on Angular 20) and nests core's own copy,
 * and the catalog's schemas then fail to type-check against core's.
 */
const INSTALL_RANGES: Record<string, string> = { zod: '^4.3.6' };

const README =
  'https://github.com/shteynu/ngx-json-render/tree/main/projects/ngx-json-render-material#readme';

/**
 * `ng add ngx-json-render-material`: declares the renderer and its peers, and
 * `@angular/forms` at the workspace's own Angular range. A workspace without
 * Angular Material gets it at that same range, then Material's own `ng-add`
 * runs once it is installed, so the theme, typography and icon font the
 * catalog's components need are set up the way Material sets them up. A
 * workspace that already has Material keeps its setup as it is.
 */
export function ngAdd(options: NgAddOptions = {}): Rule {
  return (tree, context) => {
    const workspace = readManifest(tree);
    const angular = workspace.dependencies?.['@angular/core'];
    if (!angular) {
      throw new SchematicsException(
        'ngx-json-render-material needs an Angular workspace: no @angular/core in package.json.',
      );
    }

    const wanted: [string, string][] = [];
    for (const name of PEERS) {
      const range = INSTALL_RANGES[name] ?? self.peerDependencies?.[name];
      if (!range)
        throw new SchematicsException(
          `ngx-json-render-material declares no peer range for ${name}.`,
        );
      wanted.push([name, range]);
    }
    wanted.push(['@angular/forms', angular]);
    const setUpMaterial = !declares(workspace, '@angular/material');
    if (setUpMaterial) wanted.push(['@angular/material', angular]);

    const rules: Rule[] = [];
    for (const [name, range] of wanted) {
      if (declares(workspace, name)) continue;
      rules.push(addDependency(name, range, { install: InstallBehavior.None }));
      context.logger.info(`Adding ${name}@${range}`);
    }

    if (rules.length > 0) {
      const install = context.addTask(new NodePackageInstallTask());
      // Material's ng-add adds @angular/cdk at the Material version it finds,
      // then applies a theme, typography and the Material Icons font.
      if (setUpMaterial) {
        context.addTask(
          new RunSchematicTask('@angular/material', 'ng-add', {
            project: options.project,
          }),
          [install],
        );
      }
    }

    context.logger.info(
      [
        '',
        'ngx-json-render-material is ready: pass `materialRegistry` to <json-render>',
        `and give your model \`materialCatalog.prompt()\` — see ${README}`,
        '',
        'Note: Angular Material and zod put the initial bundle at about 1.3 MB raw',
        '(250 kB transferred), over the 1 MB error budget `ng new` writes into',
        'angular.json. Raise that budget, or lazy-load the route that renders specs.',
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
