// Serves dist/ the way vercel.json says it will be served, security headers included, so a build
// can be checked before it's hosted anywhere. Run: npm run build && npm run preview
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const PORT = Number(process.env.PORT) || 8100;
const { headers: rules } = JSON.parse(await readFile(join(root, 'vercel.json'), 'utf8'));
const headers = Object.fromEntries(rules[0].headers.map(({ key, value }) => [key, value]));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.png': 'image/png' };

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = join(dist, normalize(path.endsWith('/') ? `${path}index.html` : path));
  try {
    if (!file.startsWith(dist)) throw new Error('outside dist');
    const body = await readFile(file);
    res.writeHead(200, { ...headers, 'Content-Type': MIME[extname(file)] ?? 'text/plain' });
    res.end(body);
  } catch {
    res.writeHead(404, headers);
    res.end('Not found');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${PORT}`));
