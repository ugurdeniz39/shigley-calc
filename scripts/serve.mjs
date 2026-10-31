// Tiny zero-dependency static file server for the demo page.
//
// Browsers refuse to load ES modules from file:// URLs, so index.html has to
// be served over http. Usage:  node scripts/serve.mjs [port]   (default 8080)
// The server only listens on the loopback interface.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.argv[2] ?? process.env.PORT ?? 8080);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    const relative = normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, '');
    const file = resolve(join(root, relative === '' ? 'index.html' : relative));
    // refuse anything outside the project, and the dependency/VCS folders
    if (file !== root && !file.startsWith(root + sep)) throw new Error('outside root');
    if (/(^|[/\\])(node_modules|\.git)([/\\]|$)/.test(file.slice(root.length))) throw new Error('hidden');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`shigley-calc demo: http://127.0.0.1:${port}/  (Ctrl+C to stop)`);
});
