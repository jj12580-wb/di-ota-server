import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 经 ams.map360.cn / iot.map360.cn 的 nginx 反代访问时，必须放行 Host
export default defineConfig({
  base: '/ota/',
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/ota/api': {
        target: 'http://ota-api:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ota/, ''),
      },
      '/ota/device': {
        target: 'http://ota-api:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ota/, ''),
      },
    },
  },
});
