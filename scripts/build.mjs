// Builds the public site into dist/, with no server, so pages are marked and hide the assistant's
// script writing and the timing recorder. Only what the pages need is copied, so tests and notes
// don't end up on the site.
//   dist/            the editor: app/, built by Vite (needs `npm install` in app/ first)
//   dist/classic/    the original page, kept as it was
//   dist/how-it-works.html
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const app = join(root, 'app');
if (!existsSync(join(app, 'node_modules'))) throw new Error('Run `npm install` in app/ first: the editor is built with Vite.');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

// The editor.
execFileSync('npx', ['vite', 'build', '--outDir', dist, '--emptyOutDir', 'false', '--logLevel', 'warn'], { cwd: app, stdio: 'inherit' });

// The classic page and How it works, bundled with esbuild. Chunks shared between them go in dist/.
await build({
  absWorkingDir: root,
  entryPoints: ['classic/ui.js', 'howitworks.js'],
  outdir: 'dist',
  outbase: '.',
  bundle: true,
  splitting: true,
  format: 'esm',
  minify: true,
  target: 'es2022',
  legalComments: 'inline',
  logLevel: 'warning',
});
// wakefast.js finds its worker beside whichever file it ends up in, which depends on how esbuild
// splits the code, so a self-contained copy goes in both places.
for (const outfile of ['dist/drawworker.js', 'dist/classic/drawworker.js']) {
  await build({ absWorkingDir: root, entryPoints: ['drawworker.js'], outfile, bundle: true, format: 'esm', minify: true, target: 'es2022', legalComments: 'inline', logLevel: 'warning' });
}

const mark = (html, file) => {
  if (!html.includes('<head>')) throw new Error(`${file} has no <head>`);
  return html.replace('<head>', '<head>\n<meta name="marbler-demo" content="no server">');
};
await writeFile(join(dist, 'index.html'), mark(await readFile(join(dist, 'index.html'), 'utf8'), 'the editor'));
await writeFile(join(dist, 'classic/index.html'), mark(await readFile(join(root, 'classic/index.html'), 'utf8'), 'classic/index.html'));

for (const file of ['how-it-works.html', 'how-it-works.css', 'favicon.svg', 'classic/style.css', 'LICENSE', 'NOTICE']) await cp(join(root, file), join(dist, file));
await cp(join(root, 'docs/images'), join(dist, 'docs/images'), { recursive: true });

// Cloudflare reads headers from dist/_headers. They come from vercel.json's rules, so both hosts
// send the same security headers. The editor's assets/ have content hashes in their names, so they
// can be cached for good; the classic page's files keep their names, so they can't.
const { headers: rules } = JSON.parse(await readFile(join(root, 'vercel.json'), 'utf8'));
const lines = rules[0].headers.map(({ key, value }) => `  ${key}: ${value}`);
await writeFile(join(dist, '_headers'), `/*\n${lines.join('\n')}\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n`);
await writeFile(join(dist, '404.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Not found · Marbler</title><link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0e0f11;color:#e6e8eb;font:15px/1.5 system-ui,sans-serif}a{color:#e9cf7a}</style>
</head><body><main><p>There's nothing here.</p><p><a href="/">Open Marbler</a> · <a href="/how-it-works.html">How it works</a></p></main></body></html>
`);

console.log('Built dist/: the editor at /, the classic page at /classic/');
