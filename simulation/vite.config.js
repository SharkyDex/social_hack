import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Dev-server middleware: lets the running app write its zone report straight
// into the project (reports/) instead of triggering a browser download.
// The browser can't write files to disk on its own, so the page POSTs the
// JSON here and the dev server saves it. Only active under `npm run dev`.
function reportWriter() {
  return {
    name: 'zone-report-writer',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/save-report', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end('POST only');
        }
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const report = JSON.parse(body);
            const dir = resolve(server.config.root, 'reports');
            mkdirSync(dir, { recursive: true });
            const disaster = report.disaster || 'run';
            const pretty = JSON.stringify(report, null, 2);

            // A unique, timestamped file per run, so every completed run is
            // kept rather than overwritten. Colons/dots stripped so the
            // filename is valid on every OS.
            const stamp = (report.generatedAt || new Date().toISOString()).replace(/[:.]/g, '-');
            const stampedName = `zone_severity_${disaster}_${stamp}.json`;
            writeFileSync(resolve(dir, stampedName), pretty);

            // Convenience copies: the newest run for this disaster, and the
            // newest run overall.
            writeFileSync(resolve(dir, `zone_severity_${disaster}.json`), pretty);
            writeFileSync(resolve(dir, 'latest.json'), pretty);

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, path: `reports/${stampedName}` }));
            server.config.logger.info(`[zone-report] wrote reports/${stampedName}`);
          } catch (err) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: String(err) }));
          }
        });
      });
    },
  };
}

// vite-plugin-cesium copies Cesium's static assets (workers, widgets, etc.)
// into the build and sets window.CESIUM_BASE_URL automatically.
export default defineConfig({
  plugins: [cesium(), reportWriter()],
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
});
