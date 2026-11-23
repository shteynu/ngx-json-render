// Lays out a Hugging Face static Space in dist/space: the built page at the
// root, where a static Space serves it, and the Space's card as README.md.
// Upload the folder's files to the Space as they are.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const browser = join(root, 'dist/local-model/browser');
const out = join(root, 'dist/space');

if (!existsSync(join(browser, 'index.html'))) {
  console.error('No build in dist/local-model/browser; run `ng build` first.');
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
cpSync(browser, out, { recursive: true });
cpSync(join(root, 'space/README.md'), join(out, 'README.md'));
console.log(`Space files in ${out}`);
