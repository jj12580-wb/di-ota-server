import { useEffect, useState } from 'react';
import { Button, Card, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, message } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { CreateUserPayload, User, userAPI } from '../api';
import { tableActionColumn, listTableProps, listTableScroll, serverTablePagination } from '../utils/tableActionColumn';
import { tableEllipsisColumn, tableEllipsisRenderColumn, tableCompactColumn } from '../utils/tableEllipsisColumn';

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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const load = async () => {
    setLoading(true);
    try {
      const data = await userAPI.list({
        limit: pageSize,
        offset: (page - 1) * pageSize,
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
  }, [page, pageSize, search, status, role]);

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
    tableEllipsisColumn<User>('用户名', 'username'),
    tableEllipsisColumn<User>('显示名', 'display_name'),
    tableEllipsisRenderColumn<User>('角色', 'roles', (record) => record.roles.join(', ')),
    tableCompactColumn<User>('状态', 'status', (value: string) => (
      <Tag color={value === 'enabled' ? 'green' : 'default'}>{value === 'enabled' ? '启用' : '禁用'}</Tag>
    ), 'status'),
    tableCompactColumn<User>('认证来源', 'auth_source', (value: string) => (
      <Tag color={value === 'sso' ? 'cyan' : 'blue'}>{value === 'sso' ? 'SSO' : '本地'}</Tag>
    ), 'auth_source'),
    tableEllipsisColumn<User>('最近登录', 'last_login_at', {
      size: 'date',
      render: (v) => (v ? new Date(String(v)).toLocaleString() : '-'),
    }),
    tableEllipsisColumn<User>('最后操作', 'last_operation_at', {
      size: 'date',
      render: (v) => new Date(String(v)).toLocaleString(),
    }),
    tableActionColumn<User>(
      (_, record) => (
        <Space size={4} className="ota-table-actions">
          <Button type="link" size="small" onClick={() => navigate(`/users/${record.user_id}`)}>查看详情</Button>
          <Popconfirm
            title={record.status === 'enabled' ? '确认禁用该用户？' : '确认启用该用户？'}
            onConfirm={() => void handleToggleStatus(record)}
          >
            <Button type="link" size="small" danger={record.status === 'enabled'}>
              {record.status === 'enabled' ? '禁用' : '启用'}
            </Button>
          </Popconfirm>
        </Space>
      ),
      { actionLabels: ['查看详情', '禁用', '启用'] },
    ),
  ];

  const handlePageChange = (nextPage: number, nextPageSize?: number) => {
    if (nextPageSize && nextPageSize !== pageSize) {
      setPageSize(nextPageSize);
      setPage(1);
      return;
    }
    setPage(nextPage);
  };

  return (
    <div className="ota-page ota-page-fill">
      <Card className="ota-card ota-card-dense ota-card-list">
        <div className="ota-toolbar">
          <div className="ota-toolbar-left">
            <Input.Search className="ota-toolbar-control-search" placeholder="搜索用户名 / 显示名" allowClear value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} onSearch={() => void load()} />
            <Select
              className="ota-toolbar-control-select"
              value={role}
              onChange={(v) => { setRole(v); setPage(1); }}
              options={[
                { label: '全部角色', value: 'all' },
                { label: '管理员', value: 'admin' },
                { label: 'Secret 管理员', value: 'secret_admin' },
                { label: '发布工程师', value: 'release' },
                { label: '只读', value: 'readonly' },
                { label: '审计', value: 'audit' },
              ]}
            />
            <Select
              className="ota-toolbar-control-select"
              value={status}
              onChange={(v) => { setStatus(v); setPage(1); }}
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
          {...listTableProps}
          rowKey="user_id"
          columns={columns}
          loading={loading}
          dataSource={users}
          pagination={serverTablePagination(page, pageSize, total, handlePageChange)}
          locale={{ emptyText: '当前没有匹配的用户数据。' }}
          scroll={listTableScroll(columns, users.length)}
        />
      </Card>

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
                { label: 'Secret 管理员', value: 'secret_admin' },
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