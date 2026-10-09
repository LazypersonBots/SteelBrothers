import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGallery } from './scripts/build-gallery.mjs';

await buildGallery();

const output = resolve(fileURLToPath(new URL('./dist/', import.meta.url)));
const routes = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/gallery', 'gallery/index.html'],
  ['/gallery/', 'gallery/index.html'],
  ['/gallery/index.html', 'gallery/index.html'],
  ['/activity', 'activity/index.html'],
  ['/activity/', 'activity/index.html'],
  ['/activity/index.html', 'activity/index.html'],
  ['/signin', 'signin/index.html'],
  ['/signin/', 'signin/index.html'],
  ['/signin/index.html', 'signin/index.html'],
  ['/activity-data.json', 'activity-data.json'],
  ['/activity.js', 'activity.js'],
  ['/signin.js', 'signin.js'],
  ['/email-verification.js', 'email-verification.js'],
  ['/auth.css', 'auth.css'],
  ['/gallery-data.json', 'gallery-data.json'],
  ['/gallery.js', 'gallery.js'],
  ['/styles.css', 'styles.css'],
  ['/steel-brothers-logo.avif', 'steel-brothers-logo.avif'],
  ['/favicon.png', 'favicon.png']
]);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif'
};

http.createServer(async (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noimageindex');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405); res.end('Method not allowed'); return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400); res.end('Invalid URL'); return;
  }
  const file = routes.get(pathname) ||
    (pathname.startsWith('/photos/') && mime[extname(pathname).toLowerCase()]
      ? pathname.slice(1) : null);
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  const target = resolve(output, file);
  const within = relative(output, target);
  if (within.startsWith('..') || within.startsWith('/') || within === '') {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  try {
    const body = await readFile(target);
    res.writeHead(200, {
      'Content-Type': mime[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}).listen(4173, '127.0.0.1', () =>
  console.log('Local preview: http://127.0.0.1:4173')
);
