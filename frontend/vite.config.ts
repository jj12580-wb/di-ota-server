import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    // 允许所有主机名访问，不再报 Blocked host 错误
    allowedHosts: true, 
    proxy: {
      '/api': {
        target: 'http://ota-api:8080',
        changeOrigin: true
      },
      '/device': {
        target: 'http://ota-api:8080',
        changeOrigin: true
      }
    }
  }
});