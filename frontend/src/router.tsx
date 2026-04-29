import { createHashRouter, Navigate, Outlet } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { MainLayout } from './components/MainLayout';
import { DashboardPage } from './pages/DashboardPage';
import { PackagesPage } from './pages/PackagesPage';
import { PackageDetailPage } from './pages/PackageDetailPage';
import { TasksPage } from './pages/TasksPage';
import { TaskDetailPage } from './pages/TaskDetailPage';
import useAuthStore from './stores/authStore';

function PrivateRoute() {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

export const router = createHashRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <PrivateRoute />,
    children: [
      { path: '/', element: <Navigate to="/dashboard" replace /> },
      { element: <MainLayout />, children: [
        { path: '/dashboard', element: <DashboardPage /> },
        { path: '/packages', element: <PackagesPage /> },
        { path: '/packages/:id', element: <PackageDetailPage /> },
        { path: '/tasks', element: <TasksPage /> },
        { path: '/tasks/:id', element: <TaskDetailPage /> },
      ]},
    ],
  },
]);
