import { useEffect, useState } from 'react';
import { Button, Card, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography, message } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { CreateUserPayload, User, userAPI } from '../api';

const { Paragraph, Title, Text } = Typography;

export function UsersPage() {
  const navigate = useNavigate();
  const [form] = Form.useForm<CreateUserPayload>();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [role, setRole] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createAuthSource, setCreateAuthSource] = useState<'local' | 'sso'>('local');

  const load = async () => {
    setLoading(true);
    try {
      const data = await userAPI.list({
        limit: 20,
        offset: 0,
        search,
        status: status === 'all' ? '' : status,
        role: role === 'all' ? '' : role,
      });
      setUsers(data.users);
      setTotal(data.total);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openCreateModal = () => {
    form.setFieldsValue({
      auth_source: 'local',
      status: 'enabled',
      roles: ['readonly'],
    });
    setCreateAuthSource('local');
    setCreateOpen(true);
  };

  const handleCreate = async (values: CreateUserPayload) => {
    setSubmitting(true);
    try {
      await userAPI.create({
        username: values.username.trim(),
        display_name: values.display_name.trim(),
        password: values.auth_source === 'local' ? values.password : undefined,
        auth_source: values.auth_source,
        status: values.status,
        roles: values.roles,
      });
      message.success('用户已创建');
      setCreateOpen(false);
      form.resetFields();
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '创建用户失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (record: User) => {
    try {
      await userAPI.updateStatus(record.user_id, record.status === 'enabled' ? 'disabled' : 'enabled');
      message.success(record.status === 'enabled' ? '用户已禁用' : '用户已启用');
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '更新用户状态失败');
    }
  };

  const columns = [
    { title: '用户名', dataIndex: 'username', key: 'username' },
    { title: '显示名', dataIndex: 'display_name', key: 'display_name' },
    {
      title: '角色',
      key: 'roles',
      render: (_: unknown, record: User) => (
        <Space size={[6, 6]} wrap>
          {record.roles.map((role) => <span key={role} className="ota-list-chip">{role}</span>)}
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (value: string) => <Tag color={value === 'enabled' ? 'green' : 'default'}>{value === 'enabled' ? '启用' : '禁用'}</Tag>,
    },
    {
      title: '认证来源',
      dataIndex: 'auth_source',
      key: 'auth_source',
      render: (value: string) => <Tag color={value === 'sso' ? 'cyan' : 'blue'}>{value === 'sso' ? 'SSO' : '本地'}</Tag>,
    },
    { title: '最近登录', dataIndex: 'last_login_at', key: 'last_login_at', render: (value: string | null) => value ? new Date(value).toLocaleString() : '-' },
    { title: '最后操作', dataIndex: 'last_operation_at', key: 'last_operation_at', render: (value: string) => new Date(value).toLocaleString() },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right' as const,
      render: (_: unknown, record: User) => (
        <Space size={4} wrap>
          <Button type="link" onClick={() => navigate(`/users/${record.user_id}`)}>查看详情</Button>
          <Popconfirm
            title={record.status === 'enabled' ? '确认禁用该用户？' : '确认启用该用户？'}
            onConfirm={() => void handleToggleStatus(record)}
          >
            <Button type="link" danger={record.status === 'enabled'}>
              {record.status === 'enabled' ? '禁用' : '启用'}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="ota-page">
      <div>
        <Title level={3} className="ota-page-title">用户管理</Title>
        <Paragraph className="ota-page-subtitle">统一管理系统账号、角色和可用状态。</Paragraph>
      </div>

      <Card className="ota-card">
        <div className="ota-toolbar">
          <div className="ota-toolbar-left">
            <Input.Search className="ota-toolbar-control-search" placeholder="搜索用户名 / 显示名" allowClear value={search} onChange={(e) => setSearch(e.target.value)} onSearch={() => void load()} />
            <Select
              className="ota-toolbar-control-select"
              value={role}
              onChange={setRole}
              options={[
                { label: '全部角色', value: 'all' },
                { label: '管理员', value: 'admin' },
                { label: '发布工程师', value: 'release' },
                { label: '只读', value: 'readonly' },
                { label: '审计', value: 'audit' },
              ]}
            />
            <Select
              className="ota-toolbar-control-select"
              value={status}
              onChange={setStatus}
              options={[
                { label: '全部状态', value: 'all' },
                { label: '启用', value: 'enabled' },
                { label: '禁用', value: 'disabled' },
              ]}
            />
          </div>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
            <Button onClick={() => void load()}>应用筛选</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>新建用户</Button>
          </Space>
        </div>

        <Table
          rowKey="user_id"
          columns={columns}
          loading={loading}
          dataSource={users}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          locale={{ emptyText: '当前没有匹配的用户数据。' }}
          scroll={users.length > 0 ? { x: 1080 } : undefined}
        />
      </Card>

      <div className="ota-section-grid">
        <Card className="ota-card ota-section-span-6" title="待接后端能力">
          <div className="ota-stack">
            <Text>用户分页</Text>
            <Text>批量操作</Text>
            <Text>审计记录联动</Text>
          </div>
        </Card>
        <Card className="ota-card ota-section-span-6" title="当前确认项">
          <div className="ota-stack">
            <Text>列表字段与筛选器已固定</Text>
            <Text>认证来源和角色标签已单独显示</Text>
            <Text>当前查询结果 {total} 条</Text>
          </div>
        </Card>
      </div>

      <Modal
        title="新建用户"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(values) => void handleCreate(values)}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input placeholder="例如 release.engineer" />
          </Form.Item>
          <Form.Item name="display_name" label="显示名" rules={[{ required: true, message: '请输入显示名' }]}>
            <Input placeholder="例如 发布工程师" />
          </Form.Item>
          <Form.Item name="auth_source" label="认证来源" rules={[{ required: true, message: '请选择认证来源' }]}>
            <Select
              options={[
                { label: '本地账号', value: 'local' },
                { label: 'SSO 账号', value: 'sso' },
              ]}
              onChange={(value) => setCreateAuthSource(value)}
            />
          </Form.Item>
          {createAuthSource === 'local' && (
            <Form.Item name="password" label="初始密码" rules={[{ required: true, message: '请输入初始密码' }]}>
              <Input.Password placeholder="请输入初始密码" />
            </Form.Item>
          )}
          <Form.Item name="status" label="账号状态" rules={[{ required: true, message: '请选择账号状态' }]}>
            <Select
              options={[
                { label: '启用', value: 'enabled' },
                { label: '禁用', value: 'disabled' },
              ]}
            />
          </Form.Item>
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
    </div>
  );
}