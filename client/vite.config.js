import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The React app runs on :5173 and forwards /api to the Express server on :3001,
// so the browser never needs (or sees) the API key.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
});
