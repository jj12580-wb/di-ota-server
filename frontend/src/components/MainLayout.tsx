import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Avatar, Button, Typography, Space, Tag } from 'antd';
import { DashboardOutlined, BoxPlotOutlined, ThunderboltOutlined, LogoutOutlined, UserOutlined, TeamOutlined, LaptopOutlined, AlertOutlined, ClusterOutlined, HistoryOutlined } from '@ant-design/icons';
import useAuthStore from '../stores/authStore';

const { Sider, Header, Content } = Layout;
const { Text } = Typography;

const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/users', icon: <TeamOutlined />, label: '用户管理' },
  { key: '/devices', icon: <LaptopOutlined />, label: '设备管理' },
  { key: '/device-groups', icon: <ClusterOutlined />, label: '分组管理' },
  { key: '/upgrade-records', icon: <HistoryOutlined />, label: '升级记录' },
  { key: '/alerts', icon: <AlertOutlined />, label: '告警中心' },
  { key: '/packages', icon: <BoxPlotOutlined />, label: '固件包' },
  { key: '/tasks', icon: <ThunderboltOutlined />, label: '发布任务' },
];

export function MainLayout() {
  const logout = useAuthStore((s) => s.logout);
  const username = useAuthStore((s) => s.username);
  const roles = useAuthStore((s) => s.roles);
  const authSource = useAuthStore((s) => s.authSource);
  const hasExternalAccess = useAuthStore((s) => s.hasExternalAccess);
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
            <Space size={[8, 8]} wrap>
              <Tag color={authSource === 'sso' ? 'cyan' : 'default'}>{authSource === 'sso' ? 'SSO 登录' : '本地登录'}</Tag>
              <Tag color={hasExternalAccess ? 'green' : 'gold'}>{hasExternalAccess ? '外部授权已连接' : '外部授权未接入'}</Tag>
              <Text type="secondary">{roles.join(' / ')}</Text>
            </Space>
            <Avatar icon={<UserOutlined />} />
            <Text>{username}</Text>
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
