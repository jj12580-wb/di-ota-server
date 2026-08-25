import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// iot.map360.cn 根路径部署：nginx 把 / 转到本服务、/api/ 转到 ota-api:9080
export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://ota-api:8080',
        changeOrigin: true,
      },
      '/device': {
        target: 'http://ota-api:8080',
        changeOrigin: true,
      },
    },
  },
});
