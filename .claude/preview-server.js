const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 8080;
const API_PORT = process.env.API_PORT || 3001;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  try {
    // 把 /api/* 轉發到 erp-api（讓 8080 的畫面也能打 API）
    if (req.url.startsWith('/api/')) {
      const proxyReq = http.request(
        { host: '127.0.0.1', port: API_PORT, path: req.url, method: req.method, headers: req.headers },
        (pr) => { res.writeHead(pr.statusCode || 502, pr.headers); pr.pipe(res); }
      );
      proxyReq.on('error', () => {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end('{"error":{"message":"erp-api (' + API_PORT + ') not running"}}');
      });
      req.pipe(proxyReq);
      return;
    }
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/預檢工單系統_物料表調整版.html';
    const filePath = path.join(ROOT, urlPath);
    // prevent path traversal
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found: ' + urlPath);
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    });
  } catch (e) {
    res.writeHead(500);
    res.end('Server error');
  }
});

server.listen(PORT, () => {
  console.log('Preview server running on http://localhost:' + PORT);
});
