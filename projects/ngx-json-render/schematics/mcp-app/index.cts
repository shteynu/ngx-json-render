import {
  chain,
  externalSchematic,
  SchematicsException,
  type Rule,
  type Tree,
} from '@angular-devkit/schematics';
import {
  addDependency,
  readWorkspace,
  updateWorkspace,
} from '@schematics/angular/utility';
import { posix } from 'node:path';

// The schematic runs from the published package, so this is the manifest that
// ships next to it (see ng-add).
declare const require: (id: string) => unknown;

interface Manifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const self = require('../../package.json') as Manifest;

export interface McpAppOptions {
  name?: string;
  catalog?: string;
  registry?: string;
}

/** Where the view and the server take the catalog and the registry from. */
interface Source {
  kind: 'own' | 'material' | 'starter';
  /** Module specifier, relative to the workspace root for `own` and `starter`. */
  catalogFile: string;
  catalogExport: string;
  registryFile: string;
  registryExport: string;
}

/** Peers the view and the server need. */
const PEERS = [
  '@json-render/core',
  'zod',
  '@modelcontextprotocol/ext-apps',
  '@modelcontextprotocol/sdk',
];

/** Origins the Material view loads its fonts from. */
const MATERIAL_FONTS = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
];

/**
 * `ng generate ngx-json-render:mcp-app`: an MCP App for a catalog in one go.
 * Adds an application project for the view, a `server.ts` with the
 * `render-ui` tool next to it, and an `mcp` target that builds both with the
 * `ngx-json-render:mcp-app` builder.
 */
export function mcpApp(options: McpAppOptions): Rule {
  return async (tree, context) => {
    const name = options.name || 'mcp-app';
    const manifest = readManifest(tree);
    const workspace = await readWorkspace(tree);
    if (workspace.projects.has(name)) {
      throw new SchematicsException(
        `The workspace already has a project named "${name}". Pass another --name.`,
      );
    }
    const material = declares(manifest, 'ngx-json-render-material');
    const source = resolveSource(tree, options, material);
    for (const warning of nodeUnsafeImports(tree, source)) {
      context.logger.warn(warning);
    }

    const rules: Rule[] = [
      externalSchematic('@schematics/angular', 'application', {
        name,
        routing: false,
        style: source.kind === 'material' ? 'scss' : 'css',
        skipTests: true,
        ssr: false,
        inlineStyle: true,
        inlineTemplate: true,
      }),
      writeFiles(name, source),
      updateWorkspace((workspace) => {
        const project = workspace.projects.get(name)!;
        for (const target of ['build', 'test']) {
          dropZone(project.targets.get(target)?.options);
        }
        widenBudget(
          project.targets.get('build')?.configurations?.['production'],
        );
        project.targets.set('mcp', {
          builder: 'ngx-json-render:mcp-app',
          options: {
            buildTarget: `${name}:build:production`,
            outputPath: `dist/${name}`,
            server: posix.join(project.root, 'server.ts'),
          },
        });
      }),
    ];
    for (const peer of PEERS) {
      if (declares(manifest, peer)) continue;
      const range = self.peerDependencies?.[peer];
      if (!range) {
        throw new SchematicsException(
          `ngx-json-render declares no peer range for ${peer}.`,
        );
      }
      rules.push(addDependency(peer, range));
      context.logger.info(`Adding ${peer}@${range}`);
    }
    rules.push(() => {
      context.logger.info(
        [
          '',
          `The MCP App is in project "${name}". Build it, then run its server:`,
          `  ng run ${name}:mcp`,
          `  node dist/${name}/server.mjs          # stdio, for Claude Desktop or Claude Code`,
          `  node dist/${name}/server.mjs --http   # http://localhost:3001/mcp`,
        ].join('\n'),
      );
    });
    return chain(rules);
  };
}

function resolveSource(
  tree: Tree,
  options: McpAppOptions,
  material: boolean,
): Source {
  if (!options.catalog !== !options.registry) {
    throw new SchematicsException(
      'Pass --catalog and --registry together: the server describes the catalog to the model, and the view renders it with the registry.',
    );
  }
  if (options.catalog && options.registry) {
    const catalog = reference(tree, options.catalog, 'catalog');
    const registry = reference(tree, options.registry, 'registry');
    return {
      kind: 'own',
      catalogFile: catalog.file,
      catalogExport: catalog.name,
      registryFile: registry.file,
      registryExport: registry.name,
    };
  }
  if (material) {
    return {
      kind: 'material',
      catalogFile: 'ngx-json-render-material/catalog',
      catalogExport: 'materialCatalog',
      registryFile: 'ngx-json-render-material',
      registryExport: 'materialRegistry',
    };
  }
  return {
    kind: 'starter',
    catalogFile: '',
    catalogExport: 'catalog',
    registryFile: '',
    registryExport: 'registry',
  };
}

/** `<file>#<export>`, checked against the tree. */
function reference(tree: Tree, value: string, fallback: string) {
  const [path, name = fallback] = value.split('#');
  const file = '/' + posix.normalize(path).replace(/^\/+/, '');
  if (!tree.exists(file)) {
    throw new SchematicsException(`No file at ${path} (from "${value}").`);
  }
  const content = tree.readText(file);
  const exported = new RegExp(
    `export\\s+(?:const|let|var|function)\\s+(?:\\{[^}]*\\b${name}\\b[^}]*\\}|${name}\\b)|export\\s*\\{[^}]*\\b${name}\\b`,
  );
  if (!exported.test(content)) {
    throw new SchematicsException(`${path} exports no "${name}".`);
  }
  return { file, name };
}

/**
 * The server imports the catalog in Node, where Angular components cannot
 * load. Flags the imports that would pull them in.
 */
function nodeUnsafeImports(tree: Tree, source: Source): string[] {
  if (source.kind !== 'own') return [];
  const content = tree.readText(source.catalogFile);
  const unsafe = [...content.matchAll(/from\s+['"]([^'"]+)['"]/g)]
    .map((match) => match[1])
    .filter(
      (specifier) =>
        specifier.startsWith('@angular/') ||
        specifier === 'ngx-json-render' ||
        specifier === 'ngx-json-render-material',
    );
  return unsafe.map(
    (specifier) =>
      `${source.catalogFile.slice(1)} imports ${specifier}, which needs Angular, and the MCP server loads the catalog in Node. ` +
      'Keep the catalog in a file that imports only ngx-json-render/schema (or ngx-json-render-material/catalog), zod and @json-render/core.',
  );
}

/** Replaces the application's generated sources with the view and adds the server. */
function writeFiles(name: string, source: Source): Rule {
  return async (tree) => {
    const workspace = await readWorkspace(tree);
    const project = workspace.projects.get(name);
    if (!project) {
      throw new SchematicsException(`The project "${name}" was not created.`);
    }
    const root = '/' + project.root.replace(/^\/+/, '');
    const src = '/' + (project.sourceRoot ?? posix.join(project.root, 'src'));
    const appDir = posix.join(src, 'app');

    tree.getDir(appDir).visit((file) => tree.delete(file));
    // A view lives in an iframe, which shows no icon.
    const favicon = posix.join(root, 'public', 'favicon.ico');
    if (tree.exists(favicon)) tree.delete(favicon);
    for (const style of ['styles.css', 'styles.scss']) {
      const file = posix.join(src, style);
      if (tree.exists(file)) tree.delete(file);
    }

    let catalog = source.catalogFile;
    let registry = source.registryFile;
    if (source.kind === 'starter') {
      catalog = posix.join(appDir, 'catalog.ts');
      registry = posix.join(appDir, 'registry.ts');
      tree.create(catalog, STARTER_CATALOG);
      tree.create(registry, STARTER_REGISTRY);
    }
    const material = source.kind === 'material';
    const from = (file: string, specifier: string) =>
      source.kind === 'material' ? specifier : relativeImport(file, specifier);

    const appFile = posix.join(appDir, 'app.ts');
    tree.create(
      appFile,
      viewComponent(name, source.registryExport, from(appFile, registry)),
    );
    overwrite(tree, posix.join(src, 'main.ts'), mainFile(material));
    overwrite(tree, posix.join(src, 'index.html'), indexFile(name, material));
    tree.create(
      posix.join(src, material ? 'styles.scss' : 'styles.css'),
      material ? MATERIAL_STYLES : PLAIN_STYLES,
    );
    const serverFile = posix.join(root, 'server.ts');
    tree.create(
      serverFile,
      serverModule(
        name,
        source.catalogExport,
        from(serverFile, catalog),
        material,
      ),
    );
  };
}

function overwrite(tree: Tree, file: string, content: string) {
  if (tree.exists(file)) tree.overwrite(file, content);
  else tree.create(file, content);
}

/** An import specifier for `target` (a tree path) from `file`, without `.ts`. */
function relativeImport(file: string, target: string): string {
  const path = posix
    .relative(posix.dirname(file), target)
    .replace(/\.(?:m|c)?ts$/, '');
  return path.startsWith('.') ? path : `./${path}`;
}

/** The view is zoneless; `ng generate application` may still add zone.js. */
function dropZone(options: Record<string, unknown> | undefined) {
  const polyfills = options?.['polyfills'];
  if (!options || !Array.isArray(polyfills)) return;
  const kept = polyfills.filter(
    (entry) => entry !== 'zone.js' && entry !== 'zone.js/testing',
  );
  if (kept.length) options['polyfills'] = kept;
  else delete options['polyfills'];
}

/**
 * The view carries the MCP Apps SDK and zod (about 750 kB, 1.6 MB with
 * Material) and loads from the host as one inlined page, so the 500 kB
 * initial budget of a web app would fail the build.
 */
function widenBudget(configuration: Record<string, unknown> | undefined) {
  const budgets = configuration?.['budgets'];
  if (!configuration || !Array.isArray(budgets)) return;
  // A new array: the workspace writer cannot follow edits inside one.
  configuration['budgets'] = budgets.map((budget: Record<string, unknown>) =>
    budget['type'] === 'initial'
      ? { ...budget, maximumWarning: '3MB', maximumError: '5MB' }
      : budget,
  );
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

function viewComponent(
  name: string,
  registryExport: string,
  registryModule: string,
): string {
  const registry =
    registryExport === 'registry'
      ? `import { registry } from '${registryModule}';`
      : `import { ${registryExport} as registry } from '${registryModule}';`;
  return `import { Component, effect } from '@angular/core';
import type { McpUiTheme } from '@modelcontextprotocol/ext-apps';
import { JsonRenderer } from 'ngx-json-render';
import { injectJsonRenderApp } from 'ngx-json-render/mcp';
${registry}

/**
 * The view an MCP host shows in its iframe: the spec the model passed to the
 * \`render-ui\` tool, rendered with the registry. \`mcp.handlers\` handles the
 * \`sendMessage\` action the server describes to the model.
 */
@Component({
  selector: 'app-root',
  imports: [JsonRenderer],
  template: \`
    @if (mcp.error(); as error) {
      <p class="status error">Could not connect to the host: {{ error.message }}</p>
    } @else if (mcp.spec(); as spec) {
      <json-render
        [spec]="spec"
        [loading]="mcp.loading()"
        [registry]="registry"
        [handlers]="mcp.handlers"
      />
      @if (mcp.lastMessage(); as outcome) {
        @if (outcome.ok) {
          <p class="status" role="status">Message passed to the chat.</p>
        } @else {
          <p class="status error" role="alert">
            Could not send the message: {{ outcome.error.message }}
          </p>
        }
      }
    } @else {
      <p class="status">Waiting for the model's spec…</p>
    }
  \`,
  styles: \`
    :host {
      display: block;
      padding: 16px;
    }
    json-render + .status {
      margin-top: 12px;
    }
    .status {
      margin: 0;
      opacity: 0.7;
    }
    .error {
      color: #b3261e;
      opacity: 1;
    }
  \`,
})
export class App {
  readonly mcp = injectJsonRenderApp({ name: '${name}', version: '0.0.0' });
  readonly registry = registry;

  constructor() {
    // Follow the host's light or dark theme.
    const applyTheme = (theme: McpUiTheme | undefined) => {
      if (theme) document.documentElement.style.colorScheme = theme;
    };
    this.mcp.app.addEventListener('hostcontextchanged', (context) =>
      applyTheme(context.theme),
    );
    effect(() => {
      if (this.mcp.connected()) applyTheme(this.mcp.app.getHostContext()?.theme);
    });
  }
}
`;
}

function mainFile(material: boolean): string {
  if (!material) {
    return `import { provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';

bootstrapApplication(App, {
  providers: [provideZonelessChangeDetection()],
}).catch((err) => console.error(err));
`;
  }
  return `import {
  inject,
  provideEnvironmentInitializer,
  provideZonelessChangeDetection,
} from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';

bootstrapApplication(App, {
  providers: [
    provideZonelessChangeDetection(),
    // The Material catalog names icons as Material Symbols ligatures.
    provideEnvironmentInitializer(() =>
      inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-outlined'),
    ),
  ],
}).catch((err) => console.error(err));
`;
}

function indexFile(name: string, material: boolean): string {
  const fonts = material
    ? `
    <link
      href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined&family=Roboto:wght@400;500&display=swap"
      rel="stylesheet"
    />`
    : '';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${name}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />${fonts}
  </head>
  <body>
    <app-root></app-root>
  </body>
</html>
`;
}

const PLAIN_STYLES = `html {
  color-scheme: light dark;
}

body {
  margin: 0;
  background: transparent;
  font: 14px/1.5 system-ui, sans-serif;
}
`;

const MATERIAL_STYLES = `@use '@angular/material' as mat;

// Both palettes in one pass; the view sets \`color-scheme\` from the host's
// theme, which picks one.
html {
  color-scheme: light dark;

  @include mat.theme(
    (
      color: mat.$azure-palette,
      typography: Roboto,
      density: 0,
    )
  );
}

body {
  margin: 0;
  background: transparent;
  color: var(--mat-sys-on-surface);
  font-family: Roboto, system-ui, sans-serif;
}
`;

function serverModule(
  name: string,
  catalogExport: string,
  catalogModule: string,
  material: boolean,
): string {
  const catalog =
    catalogExport === 'catalog'
      ? `import { catalog } from '${catalogModule}';`
      : `import { ${catalogExport} as catalog } from '${catalogModule}';`;
  const csp = material
    ? `
  // The Material view loads its fonts from Google Fonts.
  csp: {
    resourceDomains: [${MATERIAL_FONTS.map((origin) => `'${origin}'`).join(', ')}],
  },`
    : `
  // Origins the view may load from or connect to; the host allows none
  // without them: csp: { resourceDomains: [...], connectDomains: [...] }.`;
  return `// The MCP server for the view: one \`render-ui\` tool for the catalog, and
// the view as its \`ui://\` resource. \`ng run ${name}:mcp\` bundles it into
// dist/${name}/server.mjs, next to view.html.
//
//   node dist/${name}/server.mjs          stdio, for Claude Desktop or Claude Code
//   node dist/${name}/server.mjs --http   http://localhost:3001/mcp (PORT to change)
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  type RenderUiServerOptions,
  createRenderUiServer,
  handleRenderUiRequest,
} from 'ngx-json-render/mcp/server';
${catalog}

const options: RenderUiServerOptions = {
  catalog,
  html: readFileSync(new URL('./view.html', import.meta.url), 'utf8'),
  name: '${name}',
  version: '0.0.0',
  // Lets a button in the view post a message to the chat as the user.
  sendMessage: true,${csp}
};

if (process.argv.includes('--http')) {
  const port = Number(process.env['PORT'] ?? 3001);
  createServer(async (req, res) => {
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    const request = new Request(\`http://localhost\${req.url}\`, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
      duplex: 'half',
    } as RequestInit);
    const response = await handleRenderUiRequest(options, request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  }).listen(port, () => console.error(\`MCP on http://localhost:\${port}/mcp\`));
} else {
  await createRenderUiServer(options).connect(new StdioServerTransport());
}
`;
}

const STARTER_CATALOG = `// The components the model may use in the view. The MCP server imports this
// file in Node, so it imports no Angular: components live in registry.ts.
import { schema } from 'ngx-json-render/schema';
import { z } from 'zod';

export const catalog = schema.createCatalog({
  components: {
    Card: {
      props: z.object({ title: z.string().optional() }),
      slots: ['default'],
      description: 'A card that groups its children under an optional title.',
    },
    Text: {
      props: z.object({ content: z.string() }),
      slots: [],
      description: 'A paragraph of text.',
    },
    Button: {
      props: z.object({ label: z.string() }),
      slots: [],
      description: "A button that emits 'press'.",
    },
  },
  actions: {},
});
`;

const STARTER_REGISTRY = `import { Component } from '@angular/core';
import {
  type InferComponentProps,
  JrChildren,
  defineRegistry,
  injectRenderContext,
} from 'ngx-json-render';
import { catalog } from './catalog';

@Component({
  selector: 'app-card',
  imports: [JrChildren],
  template: \`
    <section class="card">
      @if (ctx.props().title; as title) {
        <h3>{{ title }}</h3>
      }
      <jr-children />
    </section>
  \`,
  styles: \`
    .card {
      display: grid;
      gap: 8px;
      padding: 16px;
      border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
      border-radius: 12px;
    }
    h3 {
      margin: 0;
    }
  \`,
})
export class CardComponent {
  readonly ctx =
    injectRenderContext<InferComponentProps<typeof catalog, 'Card'>>();
}

@Component({
  selector: 'app-text',
  template: \`<p>{{ ctx.props().content }}</p>\`,
  styles: \`
    p {
      margin: 0;
    }
  \`,
})
export class TextComponent {
  readonly ctx =
    injectRenderContext<InferComponentProps<typeof catalog, 'Text'>>();
}

@Component({
  selector: 'app-button',
  template: \`<button (click)="ctx.emit('press')">{{ ctx.props().label }}</button>\`,
})
export class ButtonComponent {
  readonly ctx =
    injectRenderContext<InferComponentProps<typeof catalog, 'Button'>>();
}

export const { registry } = defineRegistry(catalog, {
  components: {
    Card: CardComponent,
    Text: TextComponent,
    Button: ButtonComponent,
  },
});
`;
