// Builds the public demo into dist/: bundled, so a visit makes few requests, and with no server, so
// the page is marked and hides the assistant and the timing recorder. Only what the page needs is
// copied, so tests and notes don't end up on the site.
import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await build({
  absWorkingDir: root,
  // A top-level file name stays the same, so wakefast.js still finds drawworker.js beside it.
  entryPoints: ['ui.js', 'howitworks.js', 'drawworker.js'],
  outdir: 'dist',
  bundle: true,
  splitting: true,
  format: 'esm',
  minify: true,
  target: 'es2022',
  legalComments: 'inline',
  logLevel: 'warning',
});

const index = await readFile(join(root, 'index.html'), 'utf8');
if (!index.includes('<head>')) throw new Error('index.html has no <head>');
await writeFile(join(dist, 'index.html'), index.replace('<head>', '<head>\n<meta name="marbler-demo" content="no server">'));

for (const file of ['how-it-works.html', 'how-it-works.css', 'style.css', 'LICENSE', 'NOTICE']) await cp(join(root, file), join(dist, file));
await cp(join(root, 'docs/images'), join(dist, 'docs/images'), { recursive: true });

console.log('Built dist/');
