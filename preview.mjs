import http from 'node:http';
import {readFile} from 'node:fs/promises';
const files = new Map([['/', ['index.html', 'text/html; charset=utf-8']], ['/index.html', ['index.html', 'text/html; charset=utf-8']], ['/styles.css', ['styles.css', 'text/css; charset=utf-8']], ['/steel-brothers-logo.avif', ['steel-brothers-logo.avif', 'image/avif']]]);
http.createServer(async (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noimageindex');
  const route = files.get(new URL(req.url, 'http://localhost').pathname);
  if (!route) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const body = await readFile(new URL(route[0], import.meta.url));
    res.writeHead(200, {'Content-Type': route[1], 'Cache-Control': 'no-cache'});
    res.end(body);
  } catch { res.writeHead(500); res.end('Preview unavailable'); }
}).listen(4173, '127.0.0.1', () => console.log('Local preview: http://127.0.0.1:4173'));
