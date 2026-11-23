import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { Readable } from 'node:stream';

/**
 * Vite dev middleware that bridges Web Request/Response Vercel Functions
 * (/api/extract and /api/hls-proxy) so local dev behaves identically to production.
 */
function cloudxApiDevPlugin() {
  return {
    name: 'cloudx-api-dev-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (
          !req.url ||
          (!req.url.startsWith('/api/extract') &&
            !req.url.startsWith('/api/hls-proxy') &&
            !req.url.startsWith('/api/cloudx-feed'))
        ) {
          return next();
        }

        try {
          const fullUrl = `http://${req.headers.host || 'localhost:5174'}${req.url}`;
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) {
            if (typeof v === 'string') headers.set(k, v);
            else if (Array.isArray(v)) headers.set(k, v.join(', '));
          }

          const mod = req.url.startsWith('/api/extract')
            ? await import('./api/extract.js')
            : req.url.startsWith('/api/cloudx-feed')
              ? await import('./api/cloudx-feed.js')
              : await import('./api/hls-proxy.js');

          const webReq = new Request(fullUrl, { method: req.method || 'GET', headers });
          const handler = req.method === 'OPTIONS' && mod.OPTIONS ? mod.OPTIONS : mod.GET;
          const webRes = await handler(webReq);

          res.statusCode = webRes.status;
          webRes.headers.forEach((value, key) => {
            if (key.toLowerCase() !== 'content-encoding') {
              res.setHeader(key, value);
            }
          });

          if (!webRes.body) {
            res.end();
            return;
          }

          const nodeStream = Readable.fromWeb(webRes.body);
          nodeStream.on('error', () => {
            if (!res.writableEnded) res.end();
          });
          req.on('close', () => {
            nodeStream.destroy();
          });
          nodeStream.pipe(res);
        } catch (err) {
          console.error('[vite-api-dev] Error handling', req.url, err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
          }
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cloudxApiDevPlugin(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/hls.js')) return 'hls';
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router')
          ) {
            return 'vendor';
          }
          if (id.includes('node_modules/lucide-react')) return 'icons';
        },
      },
    },
  },
  server: {
    port: 5174,
    host: true,
  },
});
