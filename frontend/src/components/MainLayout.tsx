import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Avatar, Button, Typography, Space, Tag } from 'antd';
import { DashboardOutlined, BoxPlotOutlined, ThunderboltOutlined, LogoutOutlined, UserOutlined, TeamOutlined, LaptopOutlined, AlertOutlined, KeyOutlined, ControlOutlined } from '@ant-design/icons';
import useAuthStore from '../stores/authStore';
import { APP_VERSION_LABEL, COPYRIGHT_HOLDER } from '../constants/version';
import { menuKeyForPath, pageMetaForPath } from '../constants/pageMeta';
import { OtaLogo } from './OtaLogo';
import { canManageDeviceSecrets, canManageUpgradePolicy } from '../utils/roles';

const { Sider, Header, Content } = Layout;
const { Text } = Typography;

const roleLabels: Record<string, string> = {
  admin: '管理员',
  secret_admin: 'Secret 管理员',
  release: '发布工程师',
  readonly: '只读',
  audit: '审计',
};

const allMenuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/users', icon: <TeamOutlined />, label: '用户管理' },
  { key: '/devices', icon: <LaptopOutlined />, label: '设备管理' },
  { key: '/device-secrets', icon: <KeyOutlined />, label: '设备 Secret 管理' },
  { key: '/alerts', icon: <AlertOutlined />, label: '告警中心' },
  { key: '/packages', icon: <BoxPlotOutlined />, label: '固件包' },
  { key: '/tasks', icon: <ThunderboltOutlined />, label: '任务中心' },
  { key: '/upgrade-policy', icon: <ControlOutlined />, label: '升级策略' },
];

export function MainLayout() {
  const logout = useAuthStore((s) => s.logout);
  const username = useAuthStore((s) => s.username);
  const roles = useAuthStore((s) => s.roles);
  const authSource = useAuthStore((s) => s.authSource);
  const navigate = useNavigate();
  const location = useLocation();

  const { title: pageTitle, subtitle: pageSubtitle } = pageMetaForPath(location.pathname);
  const activeMenuKey = menuKeyForPath(location.pathname);
  const menuItems = allMenuItems.filter((item) => {
    if (item.key === '/device-secrets') return canManageDeviceSecrets(roles);
    if (item.key === '/upgrade-policy') return canManageUpgradePolicy(roles);
    return true;
  });

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const roleText = roles.map((role) => roleLabels[role] ?? role).join(' / ');
  const showRole = roleText.length > 0 && roleText !== username;

  return (
    <Layout className="ota-shell" style={{ minHeight: '100vh' }}>
      <Sider theme="light" width={230} collapsedWidth={0} breakpoint="lg" className="ota-shell-sider">
        <div className="ota-brand">
          <OtaLogo className="ota-brand-logo" size={30} />
          <span className="ota-brand-text">OTA 管理台</span>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[activeMenuKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderInlineEnd: 0, padding: '8px 10px' }}
        />
        <div className="ota-shell-meta">
          <span>© {COPYRIGHT_HOLDER}</span>
          <span>{APP_VERSION_LABEL}</span>
        </div>
      </Sider>
      <Layout>
        <Header className="ota-header" style={{ padding: '0 20px', borderBottom: '1px solid #e7ecf3' }}>
          <div className="ota-header-title">
            <Text strong className="ota-header-page-title">{pageTitle}</Text>
            <Text type="secondary" className="ota-header-page-subtitle">{pageSubtitle}</Text>
          </div>
          <Space size={10} className="ota-header-actions" align="center">
            <Space size={8} align="center" className="ota-header-user-wrap">
              <Avatar size={32} icon={<UserOutlined />} />
              <div className="ota-header-user">
                <Text className="ota-header-user-name">{username}</Text>
                {showRole && (
                  <Text type="secondary" className="ota-header-user-role">{roleText}</Text>
                )}
              </div>
            </Space>
            <Tag color={authSource === 'sso' ? 'cyan' : 'default'}>{authSource === 'sso' ? 'SSO' : '本地'}</Tag>
            <Button type="text" danger icon={<LogoutOutlined />} onClick={handleLogout}>
              退出
            </Button>
          </Space>
        </Header>
        <Content className="ota-shell-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
