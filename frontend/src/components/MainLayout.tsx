import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Avatar, Button, Typography, Space } from 'antd';
import { DashboardOutlined, BoxPlotOutlined, ThunderboltOutlined, LogoutOutlined, UserOutlined } from '@ant-design/icons';
import useAuthStore from '../stores/authStore';

const { Sider, Header, Content } = Layout;
const { Text } = Typography;

const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/packages', icon: <BoxPlotOutlined />, label: '固件包' },
  { key: '/tasks', icon: <ThunderboltOutlined />, label: '发布任务' },
];

export function MainLayout() {
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <Layout className="ota-shell" style={{ minHeight: '100vh' }}>
      <Sider theme="light" width={230} collapsedWidth={0} breakpoint="lg">
        <div className="ota-brand">OTA 管理台</div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname === '/' ? '/dashboard' : location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderInlineEnd: 0, padding: '8px 10px' }}
        />
      </Sider>
      <Layout>
        <Header className="ota-header" style={{ padding: '0 20px', borderBottom: '1px solid #e7ecf3' }}>
          <div className="ota-header-title">
            <Text strong>OTA 发布控制台</Text>
            <div>
              <Text type="secondary">固件发布、设备升级与任务监控</Text>
            </div>
          </div>
          <Space size={12} className="ota-header-actions" wrap>
            <Text type="secondary">管理员</Text>
            <Avatar icon={<UserOutlined />} />
            <Button type="text" danger icon={<LogoutOutlined />} onClick={handleLogout}>
              退出
            </Button>
          </Space>
        </Header>
        <Content style={{ padding: 20 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
