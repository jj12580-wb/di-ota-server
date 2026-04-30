import { useEffect, useState } from 'react';
import { Button, Card, DatePicker, Form, Input, InputNumber, Switch, Select, message, Modal, Table, Tag, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { DeviceGroupListItem, Package, ReleaseTask, deviceGroupAPI, packageAPI, taskAPI } from '../api';

const { Paragraph, Title } = Typography;

const stateColor: Record<string, string> = {
  Running: 'blue',
  Paused: 'orange',
  Completed: 'green',
  RolledBack: 'red',
  Failed: 'red',
};

const validActions: Record<string, string[]> = {
  Draft: ['start'],
  Paused: ['resume', 'rollback', 'terminate'],
  Running: ['pause', 'rollback', 'terminate'],
};

export function TasksPage() {
  const [tasks, setTasks] = useState<ReleaseTask[]>([]);
  const [keyword, setKeyword] = useState('');
  const [stateFilter, setStateFilter] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [metaLoading, setMetaLoading] = useState(false);
  const [packages, setPackages] = useState<Package[]>([]);
  const [groups, setGroups] = useState<DeviceGroupListItem[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<DeviceGroupListItem | null>(null);
  const [form] = Form.useForm();
  const navigate = useNavigate();

  const load = async () => {
    try {
      const data = await taskAPI.list(100, 0);
      setTasks(data);
    } catch (e: any) {
      message.error(e.message);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!createOpen) return;
    setSelectedPackage(null);
    setSelectedGroup(null);
    setMetaLoading(true);
    Promise.all([
      packageAPI.list(200, 0).then((d) => d.packages ?? []),
      deviceGroupAPI.list({ limit: 200, offset: 0 }).then((d) => d.items ?? []),
    ])
      .then(([pkgs, grps]) => {
        setPackages(pkgs);
        setGroups(grps);
      })
      .catch((e: any) => message.error(e.message || '加载固件包/分组失败'))
      .finally(() => setMetaLoading(false));
  }, [createOpen]);

  const handleCreate = async (values: any) => {
    setCreating(true);
    try {
      await taskAPI.create({
        package_id: values.package_id,
        group: values.group,
        product_model: values.product_model,
        hardware_version: values.hardware_version,
        failure_threshold: values.failure_threshold || 0.05,
        canary_percent: values.canary_percent || 100,
        schedule_time: values.schedule_time ? values.schedule_time.toISOString() : undefined,
        force_upgrade: !!values.force_upgrade,
        start_now: values.start_now !== false,
      });
      message.success('任务创建成功');
      setCreateOpen(false);
      form.resetFields();
      load();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleAction = (task: ReleaseTask, action: string) => {
    Modal.confirm({
      title: `确认 ${action}?`,
      content: `任务 ${task.task_id} 当前状态为 ${task.state}`,
      onOk: async () => {
        try {
          await taskAPI.action(task.task_id, action);
          message.success('操作成功');
          load();
        } catch (e: any) {
          message.error(e.message);
        }
      },
    });
  };

  const columns = [
    { title: '任务 ID', dataIndex: 'task_id', key: 'task_id', width: 220, render: (v: string) => <a onClick={() => navigate(`/tasks/${v}`)}>{v}</a> },
    { title: '说明', key: 'product', render: (_: unknown, r: ReleaseTask) => `${r.description || '-'} v${r.version || '-'}` },
    { title: '分组', dataIndex: 'target_group', key: 'target_group' },
    { title: '型号', dataIndex: 'product_model', key: 'product_model' },
    { title: '状态', dataIndex: 'state', key: 'state', render: (v: string) => <Tag color={stateColor[v]}>{v}</Tag> },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', render: (v: string) => new Date(v).toLocaleString() },
    {
      title: '操作', key: 'action', render: (_: unknown, r: ReleaseTask) => {
        const actions = validActions[r.state] || [];
        return actions.map((a) => (
          <Button key={a} type="link" size="small" style={{ padding: 0, marginRight: 8 }} onClick={() => handleAction(r, a)}>
            {a === 'start' ? '开始' : a === 'pause' ? '暂停' : a === 'resume' ? '恢复' : a === 'terminate' ? '终止' : '回滚'}
          </Button>
        ));
      },
    },
  ];

  const filteredTasks = tasks.filter((t) => {
    if (stateFilter && t.state !== stateFilter) return false;
    if (!keyword.trim()) return true;
    const key = keyword.toLowerCase();
    return [t.task_id, t.package_id, t.product_code ?? '', t.target_group, t.product_model]
      .join(' ')
      .toLowerCase()
      .includes(key);
  });

  return (
    <div className="ota-page">
      <div>
        <Title level={3} className="ota-page-title">发布任务</Title>
        <Paragraph className="ota-page-subtitle">配置灰度策略与执行窗口，实时控制任务流转。</Paragraph>
      </div>

      <Card
        className="ota-card"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建任务</Button>}
      >
        <div className="ota-toolbar">
          <div className="ota-toolbar-left">
            <Input.Search
              allowClear
              placeholder="搜索任务ID/包ID/分组/型号"
              className="ota-toolbar-control-search"
              onSearch={setKeyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <Select
              allowClear
              placeholder="状态筛选"
              className="ota-toolbar-control-select"
              value={stateFilter}
              onChange={(v) => setStateFilter(v)}
              options={[
                { value: 'Draft', label: 'Draft' },
                { value: 'Running', label: 'Running' },
                { value: 'Paused', label: 'Paused' },
                { value: 'Completed', label: 'Completed' },
                { value: 'Failed', label: 'Failed' },
                { value: 'RolledBack', label: 'RolledBack' },
              ]}
            />
          </div>
          <span className="ota-muted">共 {filteredTasks.length} 条</span>
        </div>

        <Table columns={columns} dataSource={filteredTasks} loading={loading} rowKey="task_id" pagination={{ pageSize: 12 }} size="middle" scroll={filteredTasks.length > 0 ? { x: 920 } : undefined} />

        <Modal
          width="min(640px, calc(100vw - 24px))"
          title="新建发布任务"
          open={createOpen}
          onCancel={() => {
            setCreateOpen(false);
            setSelectedPackage(null);
            setSelectedGroup(null);
            form.resetFields();
          }}
          footer={null}
        >
          <Form form={form} layout="vertical" onFinish={handleCreate}>
            <Form.Item name="package_id" label="固件包" rules={[{ required: true, message: '请选择固件包' }]}>
              <Select
                loading={metaLoading}
                showSearch
                optionFilterProp="label"
                placeholder="先选择固件包"
                options={packages.map((p) => ({
                  value: p.package_id,
                  label: `${p.product_code} v${p.version} (${p.package_id})`,
                }))}
                onChange={(value) => {
                  const pkg = packages.find((p) => p.package_id === value) ?? null;
                  setSelectedPackage(pkg);
                }}
              />
            </Form.Item>
            <Form.Item label="固件信息">
              <Input
                disabled
                value={selectedPackage ? `${selectedPackage.product_code} v${selectedPackage.version}` : ''}
                placeholder="选择固件包后自动填入"
              />
            </Form.Item>

            <Form.Item name="group" label="目标分组" rules={[{ required: true, message: '请选择目标分组' }]}>
              <Select
                loading={metaLoading}
                showSearch
                optionFilterProp="label"
                placeholder="选择目标分组（将自动填入分组编号）"
                options={groups.map((g) => ({
                  value: g.group_code,
                  label: `${g.group_name} (${g.group_code})`,
                }))}
                onChange={(value) => {
                  const grp = groups.find((g) => g.group_code === value) ?? null;
                  setSelectedGroup(grp);
                  form.setFieldValue('group', value);
                }}
              />
            </Form.Item>
            <Form.Item label="分组信息">
              <Input
                disabled
                value={selectedGroup ? `${selectedGroup.group_name}（设备数：${selectedGroup.device_count}）` : ''}
                placeholder="选择分组后自动填入"
              />
            </Form.Item>
            <Form.Item name="product_model" label="产品型号" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="hardware_version" label="硬件版本" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="failure_threshold" label="失败阈值">
              <InputNumber min={0.0001} max={1} defaultValue={0.05} step={0.01} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="canary_percent" label="灰度比例(%)">
              <InputNumber min={1} max={100} defaultValue={100} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="schedule_time" label="定时开始时间">
              <DatePicker showTime style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="force_upgrade" label="强制升级" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="start_now" label="创建后立即开始" valuePropName="checked" initialValue={true}>
              <Switch />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={creating} block>创建</Button>
            </Form.Item>
          </Form>
        </Modal>
      </Card>
    </div>
  );
}
