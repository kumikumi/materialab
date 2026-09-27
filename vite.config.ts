import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Dev-server endpoints that let the browser write files to disk:
 *   POST /__export/<material>/<file>  -> $MATERIALAB_EXPORT_DIR (default ./exports)
 *   POST /__shot/<file>               -> ./shots (screenshots of the viewer)
 *   GET  /__export                    -> { dir } (where exports go)
 *   POST /__done                      -> batch finished (scripts/export.ts waits for it)
 */
function fileSinkPlugin(): Plugin {
  const exportDir = path.resolve(process.env.MATERIALAB_EXPORT_DIR ?? 'exports');
  const shotDir = path.resolve('shots');

  const sink = (root: string) => (req: any, res: any) => {
    if (req.method === 'GET') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ dir: root }));
      return;
    }
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end();
      return;
    }
    const rel = decodeURIComponent(String(req.url ?? '').replace(/^\/+/, '').split('?')[0]);
    const target = path.resolve(root, rel);
    if (!rel || !target.startsWith(root + path.sep)) {
      res.statusCode = 400;
      res.end('bad path');
      return;
    }
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      try {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, Buffer.concat(chunks));
        res.end(JSON.stringify({ ok: true, path: target }));
      } catch (e) {
        res.statusCode = 500;
        res.end(String(e));
      }
    });
  };

  return {
    name: 'materialab-file-sink',
    configureServer(server) {
      server.middlewares.use('/__export', sink(exportDir));
      server.middlewares.use('/__shot', sink(shotDir));
      // the page reports batch completion here (used by scripts/export.ts)
      server.middlewares.use('/__done', (req: any, res: any) => {
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          res.end('ok');
          let info: unknown = {};
          try {
            info = JSON.parse(Buffer.concat(chunks).toString() || '{}');
          } catch {
            /* ignore */
          }
          (globalThis as { __materialabDone?: (i: unknown) => void }).__materialabDone?.(info);
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [fileSinkPlugin()],
  // relative asset URLs, so the static build works under any path (e.g. GitHub Pages' /materialab/)
  base: './',
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 1500 },
});
