import {
  type BuilderContext,
  type BuilderOutput,
  createBuilder,
  targetFromTargetString,
} from '@angular-devkit/architect';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { inlineView } from './inline.cjs';

/** Options of `ngx-json-render:mcp-app`; see `schema.json`. */
export interface McpAppBuilderOptions {
  buildTarget: string;
  outputPath: string;
  server?: string;
  tsConfig?: string;
  externalPackages?: boolean;
}

type Esbuild = typeof import('esbuild');

/**
 * `ngx-json-render:mcp-app`: runs the view's application build, folds its
 * browser output into one `view.html` (an MCP Apps host loads the view as a
 * single document), and bundles the server entry, if there is one, into
 * `server.mjs` next to it.
 */
export async function buildMcpApp(
  options: McpAppBuilderOptions,
  context: BuilderContext,
): Promise<BuilderOutput> {
  const root = context.workspaceRoot;
  const target = targetFromTargetString(
    options.buildTarget,
    context.target?.project,
  );
  const run = await context.scheduleTarget(target);
  const result = await run.result;
  await run.stop();
  if (!result.success) return result;

  const esbuild = loadEsbuild(root);
  const browserDir = await browserOutput(context, target);
  const view = await inlineView(browserDir, async (entry) => {
    const { outputFiles } = await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      format: 'esm',
      minify: true,
      write: false,
      logLevel: 'warning',
    });
    return outputFiles[0].text;
  });

  const out = resolve(root, options.outputPath);
  mkdirSync(out, { recursive: true });
  const viewPath = join(out, 'view.html');
  writeFileSync(viewPath, view.html);
  context.logger.info(
    `Built ${relative(root, viewPath)} (${Math.round(view.html.length / 1024)} kB)`,
  );
  if (view.leftOut.length > 0) {
    context.logger.warn(
      `Not in view.html, so the host cannot load them: ${view.leftOut.join(', ')}. ` +
        'Reference assets from a stylesheet (they are inlined) or from an https: URL the view CSP allows.',
    );
  }

  if (options.server) {
    const serverPath = join(out, 'server.mjs');
    await esbuild.build({
      entryPoints: [resolve(root, options.server)],
      outfile: serverPath,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node20',
      tsconfig: options.tsConfig ? resolve(root, options.tsConfig) : undefined,
      packages: options.externalPackages ? 'external' : undefined,
      // The view as text, for a server that imports it rather than reading
      // the file next to it.
      loader: { '.html': 'text' },
      // Bundled CommonJS dependencies may call require(); give the ES module
      // one.
      banner: options.externalPackages
        ? undefined
        : {
            js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
          },
      logLevel: 'warning',
    });
    context.logger.info(`Built ${relative(root, serverPath)}`);
  }
  return { success: true, outputPath: out };
}

/** Where the application build wrote its browser files. */
async function browserOutput(
  context: BuilderContext,
  target: ReturnType<typeof targetFromTargetString>,
): Promise<string> {
  const options = await context.getTargetOptions(target);
  const outputPath = options['outputPath'] as
    string | { base: string; browser?: string } | undefined;
  const base =
    typeof outputPath === 'string'
      ? outputPath
      : (outputPath?.base ?? join('dist', target.project));
  const browser =
    typeof outputPath === 'object' && outputPath.browser !== undefined
      ? outputPath.browser
      : 'browser';
  return resolve(context.workspaceRoot, base, browser);
}

/**
 * esbuild, from `@angular/build` (which every application build already
 * installs at a version it was tested with), or else from the workspace.
 */
function loadEsbuild(root: string): Esbuild {
  const workspace = createRequire(join(root, 'package.json'));
  try {
    const build = dirname(workspace.resolve('@angular/build/package.json'));
    return createRequire(join(build, 'package.json'))('esbuild') as Esbuild;
  } catch {
    return workspace('esbuild') as Esbuild;
  }
}

export default createBuilder<McpAppBuilderOptions>(buildMcpApp);
