import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';

// Resolve repo root relative to this script location for reliability
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../../../../..');
const exampleIndex = path.join(__dirname, 'index.html');
const port = Number(process.env.PORT || 3001);

const contentTypes = new Map([
  ['.html', 'text/html; charset=UTF-8'],
  ['.js', 'text/javascript; charset=UTF-8'],
  ['.mjs', 'text/javascript; charset=UTF-8'],
  ['.css', 'text/css; charset=UTF-8'],
  ['.json', 'application/json; charset=UTF-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.avif', 'image/avif'],
]);

function resolvePath(requestUrl) {
  const { pathname } = url.parse(requestUrl);
  // Normalize and prevent path traversal
  const resolved = path.normalize(path.join(repoRoot, pathname));
  if (!resolved.startsWith(repoRoot)) return null;
  return resolved;
}

const server = http.createServer(async (req, res) => {
  try {
    const resolved = resolvePath(req.url || '/');
    if (!resolved) {
      res.writeHead(403); res.end('Forbidden'); return;
    }

    let filePath = resolved;
    let st;
    try { st = await stat(filePath); } catch { filePath = exampleIndex; try { st = await stat(filePath); } catch { res.writeHead(404); res.end('Not Found'); return; } }

    if (st.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      try { st = await stat(filePath); } catch { res.writeHead(403); res.end('Forbidden'); return; }
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = contentTypes.get(ext) || 'application/octet-stream';
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch (e) {
    console.log(e);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
});

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Form UI example server running at http://localhost:${port}/blocks/edit/prose/plugins/form-ui/examples/standalone/`);
});
