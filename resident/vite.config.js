import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The resident phone app. Served by the API server under /resident (prod), and
// wrapped unchanged into the Android APK by Capacitor later — one codebase, two
// targets. In dev it runs on :5174 and forwards /api + the /ws socket to :3001.
export default defineConfig({
  base: '/resident/',
  plugins: [react()],
  server: {
    port: 5175,
    // Allow importing the shared/ WS protocol from one directory up.
    fs: { allow: ['..'] },
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
  },
});
