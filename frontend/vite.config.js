import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 개발 시 게이트웨이(8080)로 API/Neko 프록시.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
      '/neko': { target: 'http://localhost:8080', changeOrigin: true, ws: true },
    },
  },
  build: {
    outDir: 'dist',
  },
});
