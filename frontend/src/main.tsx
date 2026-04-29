import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { ConfigProvider, theme } from 'antd';
import { router } from './router';
import useAuthStore from './stores/authStore';
import 'antd/dist/reset.css';
import './styles/app.css';

useAuthStore.getState().init();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#2563a9',
          colorSuccess: '#10865b',
          colorWarning: '#d97706',
          colorError: '#b42318',
          borderRadius: 10,
          fontFamily: '"IBM Plex Sans", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
        },
        algorithm: [theme.defaultAlgorithm, theme.compactAlgorithm],
        components: {
          Card: {
            borderRadiusLG: 14,
            bodyPadding: 16,
          },
          Table: {
            headerBg: '#f7f9fc',
            headerColor: '#1f2937',
            cellPaddingBlock: 10,
            cellPaddingInline: 10,
          },
        },
      }}
    >
      <RouterProvider router={router} />
    </ConfigProvider>
  </React.StrictMode>
);
