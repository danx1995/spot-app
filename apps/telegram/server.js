const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.env.PORT || 3000);
const root = __dirname;

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function writeConfig(res) {
  const config = {
    apiBaseUrl: (process.env.SPOT_API_URL || 'http://localhost:8080').replace(/\/$/, ''),
    botUsername: process.env.SPOT_BOT_USERNAME || '',
    allowBrowserGuest: String(process.env.SPOT_ALLOW_BROWSER_GUEST || '').toLowerCase() === 'true'
  };
  res.writeHead(200, {
    'content-type': 'application/javascript; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end('window.SPOT_CONFIG=' + JSON.stringify(config) + ';');
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, service: 'spot-telegram' }));
    return;
  }

  if (url.pathname === '/config.js') {
    writeConfig(res);
    return;
  }

  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.resolve(root, '.' + requested);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      fs.readFile(path.join(root, 'index.html'), (fallbackError, fallback) => {
        if (fallbackError) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-cache'
        });
        res.end(fallback);
      });
      return;
    }

    res.writeHead(200, {
      'content-type': mime[path.extname(filePath)] || 'application/octet-stream',
      'cache-control': requested === '/index.html' ? 'no-cache' : 'public, max-age=3600'
    });
    res.end(data);
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log('SPOT Telegram Mini App listening on :' + port);
});
