// Runs against the built builder: `npm run build:lib`, then
// `npm run test:schematics`. The builder as a whole runs in
// `npm run build:mcp-app`, which builds the example with it.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const {
  inlineView,
} = require('../../../../dist/ngx-json-render/schematics/mcp-app-builder/inline.cjs');

/** A browser output directory with `files`, keyed by relative path. */
function build(files) {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-app-view-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

/** Stands in for esbuild: names the entry, and tries to close the tag. */
const bundle = async (entry) =>
  `/* bundled ${entry.split(/[\\/]/).pop()} */ "</script>";`;

const INDEX = `<!doctype html>
<html>
<head>
  <base href="/">
  <style>@font-face{src:url(media/inline.woff2)}</style>
  <link rel="stylesheet" href="styles-H2.css" media="print" onload="this.media='all'"><noscript><link rel="stylesheet" href="styles-H2.css"></noscript>
  <link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons">
  <link rel="modulepreload" href="chunk-A.js">
</head>
<body>
  <app-root></app-root>
  <script src="polyfills-H1.js" type="module"></script>
  <script src="main-H3.js" type="module"></script>
</body>
</html>`;

test('folds hashed scripts and stylesheets into one page', async () => {
  const dir = build({
    'index.html': INDEX,
    'main-H3.js': 'import "./chunk-A.js";',
    'polyfills-H1.js': '',
    'chunk-A.js': '',
    'styles-H2.css':
      'a{background:url("media/icon.svg")} b{background:url(https://x.test/a.png)} i{background:url(data:image/png;base64,AA==)} p{color:red}</style>',
    'media/icon.svg': '<svg/>',
    'media/inline.woff2': 'font',
  });

  const { html } = await inlineView(dir, bundle);

  assert.match(
    html,
    /<script type="module">\/\* bundled polyfills-H1\.js \*\/ "<\\\/script>";<\/script>/,
  );
  assert.match(html, /<script type="module">\/\* bundled main-H3\.js/);
  assert.doesNotMatch(html, /src="|modulepreload|styles-H2\.css|<noscript>/);
  assert.match(html, /<style>a\{background:url\("data:image\/svg\+xml;base64,/);
  assert.match(html, /url\(https:\/\/x\.test\/a\.png\)/);
  assert.match(html, /url\(data:image\/png;base64,AA==\)/);
  assert.match(html, /p\{color:red\}<\\\/style><\/style>/);
  // Critical CSS Angular inlines into the page itself.
  assert.match(html, /url\(data:font\/woff2;base64,Zm9udA==\)/);
  // External stylesheets stay; the view's CSP has to allow them.
  assert.match(html, /href="https:\/\/fonts\.googleapis\.com/);
});

test('lists the files the page does not reach', async () => {
  const dir = build({
    'index.html':
      '<html><head></head><body><script src="main.js" type="module"></script></body></html>',
    'main.js': '',
    'chunk-B.js': '',
    'main.js.map': '',
    '3rdpartylicenses.txt': '',
    'favicon.ico': '',
    'assets/logo.png': '',
  });

  const { leftOut } = await inlineView(dir, bundle);

  assert.deepEqual(leftOut.sort(), ['assets/logo.png', 'favicon.ico']);
});

test('drops the icon `ng new` links, which an iframe never shows', async () => {
  const dir = build({
    'index.html':
      '<head><link rel="icon" type="image/x-icon" href="favicon.ico">\n<link rel="icon" href="https://x.test/i.png"></head>',
    'favicon.ico': '',
  });

  const { html, leftOut } = await inlineView(dir, bundle);

  assert.equal(
    html,
    '<head><link rel="icon" href="https://x.test/i.png"></head>',
  );
  assert.deepEqual(leftOut, []);
});

test('inlines a classic script as it is', async () => {
  const dir = build({
    'index.html': '<script src="legacy.js"></script>',
    'legacy.js': 'var x = 1;',
  });

  const { html } = await inlineView(dir, bundle);

  assert.equal(html, '<script>var x = 1;</script>');
});

test('leaves alone what lies outside the build', async () => {
  const dir = build({
    'index.html':
      '<link rel="stylesheet" href="../outside.css"><script src="missing.js" type="module"></script>',
  });

  const { html } = await inlineView(dir, bundle);

  assert.equal(
    html,
    '<link rel="stylesheet" href="../outside.css"><script src="missing.js" type="module"></script>',
  );
});

test('says what is wrong when the build has no index.html', async () => {
  const dir = build({ 'main.js': '' });

  await assert.rejects(inlineView(dir, bundle), /No index\.html in /);
});
