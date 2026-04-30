import { useEffect, useState } from 'react';
import { Breadcrumb, Button, Card, Descriptions, Form, Input, Modal, Popconfirm, Select, Space, Spin, Tag, Timeline, Typography, message } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { User, userAPI } from '../api';

const { Paragraph, Title, Text } = Typography;

export function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [roleForm] = Form.useForm<{ roles: string[] }>();
  const [passwordForm] = Form.useForm<{ password: string }>();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await userAPI.get(id);
      setUser(data);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载用户详情失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  const openRoleModal = () => {
    roleForm.setFieldsValue({ roles: user?.roles ?? [] });
    setRolesOpen(true);
  };

  const handleUpdateRoles = async (values: { roles: string[] }) => {
    if (!id) {
      return;
    }
    setSaving(true);
    try {
      await userAPI.updateRoles(id, values.roles);
      message.success('角色已更新');
      setRolesOpen(false);
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '更新角色失败');
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async (values: { password: string }) => {
    if (!id) {
      return;
    }
    setSaving(true);
    try {
      await userAPI.resetPassword(id, values.password);
      message.success('密码已重置');
      setPasswordOpen(false);
      passwordForm.resetFields();
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '重置密码失败');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!id || !user) {
      return;
    }
    setSaving(true);
    try {
      await userAPI.updateStatus(id, user.status === 'enabled' ? 'disabled' : 'enabled');
      message.success(user.status === 'enabled' ? '用户已禁用' : '用户已启用');
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '更新用户状态失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ota-page">
      <div>
        <Title level={3} className="ota-page-title">用户详情</Title>
        <Paragraph className="ota-page-subtitle">查看账号信息、角色配置和最近操作状态。</Paragraph>
      </div>

      <Breadcrumb
        items={[
          { title: <a onClick={() => navigate('/users')}>用户管理</a> },
          { title: id ?? 'detail' },
        ]}
      />

      <div className="ota-section-grid">
        <Card className="ota-card ota-section-span-8" title="基础信息">
          {loading ? (
            <div style={{ padding: '24px 0', textAlign: 'center' }}>
              <Spin />
            </div>
          ) : (
            <Descriptions bordered column={{ xs: 1, sm: 2 }}>
              <Descriptions.Item label="用户 ID">{user?.user_id ?? id ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="用户名">{user?.username ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="显示名">{user?.display_name ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="账号状态">
                <Tag color={user?.status === 'enabled' ? 'green' : 'default'}>{user?.status === 'enabled' ? '启用' : user?.status === 'disabled' ? '禁用' : '-'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="认证来源">
                <Tag color={user?.auth_source === 'sso' ? 'cyan' : 'blue'}>{user?.auth_source === 'sso' ? 'SSO' : user?.auth_source === 'local' ? '本地' : '-'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="最近登录">{user?.last_login_at ? new Date(user.last_login_at).toLocaleString() : '-'}</Descriptions.Item>
              <Descriptions.Item label="最后操作">{user?.last_operation_at ? new Date(user.last_operation_at).toLocaleString() : '-'}</Descriptions.Item>
              <Descriptions.Item label="角色" span={2}>
                <Space size={[8, 8]} wrap>
                  {(user?.roles ?? []).map((role) => <span key={role} className="ota-list-chip">{role}</span>)}
                  {!user?.roles?.length && <Text type="secondary">无角色</Text>}
                </Space>
              </Descriptions.Item>
            </Descriptions>
          )}
        </Card>

        <Card className="ota-card ota-section-span-4" title="管理动作">
          <div className="ota-stack">
            <Button type="primary" onClick={openRoleModal} disabled={!user}>编辑角色</Button>
            <Button onClick={() => setPasswordOpen(true)} disabled={!user || user.auth_source !== 'local'}>重置密码</Button>
            <Popconfirm
              title={user?.status === 'enabled' ? '确认禁用该用户？' : '确认启用该用户？'}
              onConfirm={() => void handleToggleStatus()}
              disabled={!user}
            >
              <Button danger={user?.status === 'enabled'} disabled={!user || saving}>
                {user?.status === 'enabled' ? '禁用账号' : '启用账号'}
              </Button>
            </Popconfirm>
            <Text type="secondary">SSO 账号不支持本地密码重置。</Text>
          </div>
        </Card>

        <Card className="ota-card ota-section-span-12" title="账号活动时间线">
          <Timeline
            items={[
              { color: user?.last_login_at ? 'blue' : 'gray', children: user?.last_login_at ? `最近登录 ${new Date(user.last_login_at).toLocaleString()}` : '最近登录暂无记录' },
              { color: user?.last_operation_at ? 'green' : 'gray', children: user?.last_operation_at ? `最近操作 ${new Date(user.last_operation_at).toLocaleString()}` : '最近操作暂无记录' },
              { color: 'gray', children: '后续接入登录审计、角色变更记录、安全操作记录' },
            ]}
          />
        </Card>
      </div>

      <Modal
        title="编辑用户角色"
        open={rolesOpen}
        onCancel={() => setRolesOpen(false)}
        onOk={() => roleForm.submit()}
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={roleForm} layout="vertical" onFinish={(values) => void handleUpdateRoles(values)}>
          <Form.Item name="roles" label="角色" rules={[{ required: true, message: '请至少选择一个角色' }]}>
            <Select
              mode="multiple"
              options={[
                { label: '管理员', value: 'admin' },
                { label: '发布工程师', value: 'release' },
                { label: '只读', value: 'readonly' },
                { label: '审计', value: 'audit' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="重置本地账号密码"
        open={passwordOpen}
        onCancel={() => setPasswordOpen(false)}
        onOk={() => passwordForm.submit()}
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={passwordForm} layout="vertical" onFinish={(values) => void handleResetPassword(values)}>
          <Form.Item name="password" label="新密码" rules={[{ required: true, message: '请输入新密码' }]}>
            <Input.Password placeholder="请输入新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}