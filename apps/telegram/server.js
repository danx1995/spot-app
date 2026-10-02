import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, normalize } from 'node:path';

const port = Number(process.env.PORT || 3000);
const apiPort = Number(process.env.API_PORT || 8080);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, 'dist');

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

function proxyToApi(req, res) {
  const upstream = httpRequest({
    host: '127.0.0.1',
    port: apiPort,
    method: req.method,
    path: req.url,
    headers: {
      ...req.headers,
      host: `127.0.0.1:${apiPort}`
    }
  }, (apiRes) => {
    res.writeHead(apiRes.statusCode || 502, apiRes.headers);
    apiRes.pipe(res);
  });

  upstream.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    }
    res.end(JSON.stringify({ error: 'spot api unavailable' }));
  });

  req.pipe(upstream);
}

function healthz(res) {
  const probe = httpRequest({
    host: '127.0.0.1',
    port: apiPort,
    method: 'GET',
    path: '/health',
    timeout: 1500
  }, (apiRes) => {
    apiRes.resume();
    if (apiRes.statusCode === 200) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'ok', service: 'spot-telegram', api: 'ok' }));
      return;
    }

    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'starting', service: 'spot-telegram', api: 'unhealthy' }));
  });

  probe.on('timeout', () => probe.destroy());
  probe.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
    }
    res.end(JSON.stringify({ status: 'starting', service: 'spot-telegram', api: 'unavailable' }));
  });
  probe.end();
}

createServer((req, res) => {
  const pathname = (req.url || '/').split('?')[0];

  if (pathname === '/healthz') {
    healthz(res);
    return;
  }

  if (pathname === '/health' || pathname.startsWith('/api/')) {
    proxyToApi(req, res);
    return;
  }

  const rawPath = decodeURIComponent(pathname);
  const safePath = normalize(rawPath).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(root, safePath === '/' ? 'index.html' : safePath);

  if (!filePath.startsWith(root) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(root, 'index.html');
  }

  const extension = extname(filePath);
  res.writeHead(200, {
    'Content-Type': mime[extension] || 'application/octet-stream',
    'Cache-Control': extension === '.html' ? 'no-store' : 'public, max-age=31536000, immutable'
  });
  createReadStream(filePath).pipe(res);
}).listen(port, '0.0.0.0', () => {
  console.log(`SPOT Telegram Mini App listening on :${port}; proxying API on :${apiPort}`);
});
