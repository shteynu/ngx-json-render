import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';

/**
 * Bundles one module script of the build, with everything it imports, into
 * a single ES module. The builder passes esbuild; tests can pass a stub.
 */
export type BundleScript = (entry: string) => Promise<string>;

/** What {@link inlineView} produced. */
export interface InlinedView {
  html: string;
  /** Files of the build the page does not reference, so the host never sees. */
  leftOut: string[];
}

const MIME: Record<string, string> = {
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/**
 * The browser output of an Angular application build as one HTML document.
 * MCP Apps hosts load a view's `ui://` resource as a single document with no
 * origin to fetch from, so every module script (main, polyfills, and the
 * chunks they import) is bundled and inlined, every local stylesheet is
 * inlined, and fonts and images the stylesheets point at become data URLs.
 * External URLs stay as they are; the view's CSP has to allow them.
 */
export async function inlineView(
  browserDir: string,
  bundle: BundleScript,
): Promise<InlinedView> {
  const indexPath = join(browserDir, 'index.html');
  if (!existsSync(indexPath)) {
    throw new Error(
      `No index.html in ${browserDir}. Is the build target an @angular/build:application build?`,
    );
  }
  let html = readFileSync(indexPath, 'utf8');
  const used = new Set<string>(['index.html']);

  // Preloads point at chunks that are about to be inlined.
  html = html.replace(/<link\b[^>]*\brel="modulepreload"[^>]*>/g, '');
  // A view lives in an iframe, which shows no icon; `ng new` links one.
  html = html.replace(
    /<link\b[^>]*\brel="(?:shortcut )?icon"[^>]*>\s*/g,
    (tag) => {
      const href = attribute(tag, 'href');
      const file = href && local(browserDir, href);
      if (!file) return tag;
      used.add(relative(browserDir, file));
      return '';
    },
  );

  for (const tag of html.match(
    /<script\b[^>]*\bsrc="[^"]*"[^>]*><\/script>/g,
  ) ?? []) {
    const src = attribute(tag, 'src');
    const file = src && local(browserDir, src);
    if (!file) continue;
    used.add(relative(browserDir, file));
    const isModule = attribute(tag, 'type') === 'module';
    const code = isModule ? await bundle(file) : readFileSync(file, 'utf8');
    html = html.replace(
      tag,
      () =>
        `<script${isModule ? ' type="module"' : ''}>${escapeTag(code, 'script')}</script>`,
    );
  }

  // Angular may load the stylesheet as `media="print" onload=…` with a
  // <noscript> fallback, so it does not block the first paint.
  const stylesheet =
    /<link\b[^>]*\brel="stylesheet"[^>]*>(\s*<noscript>[\s\S]*?<\/noscript>)?/g;
  for (const [match] of html.matchAll(stylesheet)) {
    const href = attribute(match, 'href');
    const file = href && local(browserDir, href);
    if (!file) continue;
    used.add(relative(browserDir, file));
    const css = inlineUrls(readFileSync(file, 'utf8'), file, browserDir, used);
    html = html.replace(
      match,
      () => `<style>${escapeTag(css, 'style')}</style>`,
    );
  }

  // Inline <style> blocks (critical CSS) can point at media files too.
  html = html.replace(
    /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/g,
    (_, open: string, css: string, close: string) =>
      open + inlineUrls(css, indexPath, browserDir, used) + close,
  );

  const leftOut = files(browserDir)
    .map((file) => relative(browserDir, file))
    .filter((file) => !used.has(file) && !isBuildArtifact(file));
  return { html, leftOut };
}

/** `url(...)` references to files of the build, as data URLs. */
function inlineUrls(
  css: string,
  from: string,
  browserDir: string,
  used: Set<string>,
): string {
  return css.replace(
    /url\(\s*(['"]?)([^'")]+)\1\s*\)/g,
    (match, quote: string, url: string) => {
      const base = join(from, '..');
      const file = local(base, url) ?? local(browserDir, url);
      const mime = file && MIME[extname(file).toLowerCase()];
      if (!file || !mime) return match;
      used.add(relative(browserDir, file));
      const data = readFileSync(file).toString('base64');
      return `url(${quote}data:${mime};base64,${data}${quote})`;
    },
  );
}

/** The file `url` names under `dir`, or undefined for anything external. */
function local(dir: string, url: string): string | undefined {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(url)) return undefined;
  const path = decodeURIComponent(url.split(/[?#]/)[0]).replace(/^\/+/, '');
  const file = resolve(dir, path);
  if (file !== resolve(dir) && !file.startsWith(resolve(dir) + sep)) {
    return undefined;
  }
  return existsSync(file) && statSync(file).isFile() ? file : undefined;
}

function attribute(tag: string, name: string): string | undefined {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
}

/** Keeps `</script>` or `</style>` inside the code from closing the tag. */
function escapeTag(code: string, tag: 'script' | 'style'): string {
  return code.replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`);
}

/** Chunks and maps the inlined scripts already carry, and build metadata. */
function isBuildArtifact(file: string): boolean {
  return (
    /\.(?:js|mjs|map)$/.test(file) ||
    file === '3rdpartylicenses.txt' ||
    file === 'prerendered-routes.json'
  );
}

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}
