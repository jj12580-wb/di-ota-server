import { useEffect, useMemo, useState } from 'react';
import {
  AutoComplete,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  message,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
  DeviceCatalogItem,
  Package,
  ReleaseTask,
  deviceAPI,
  packageAPI,
  taskAPI,
} from '../api';
import { packageOptionLabel } from '../utils/packageLabel';
import {
  tableActionColumn,
  listTableProps,
  listTableScroll,
  clientTablePagination,
} from '../utils/tableActionColumn';
import { tableIdLinkColumn } from '../utils/tableIdLinkColumn';
import {
  tableEllipsisColumn,
  tableEllipsisRenderColumn,
  tableCompactColumn,
} from '../utils/tableEllipsisColumn';
import { useResizableColumns } from '../utils/useResizableColumns';

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

function filterOption(input: string, option?: { label?: unknown; value?: unknown }) {
  const q = input.trim().toLowerCase();
  if (!q) return true;
  return (
    String(option?.label ?? '').toLowerCase().includes(q) ||
    String(option?.value ?? '').toLowerCase().includes(q)
  );
}

export function TasksPage() {
  const [tasks, setTasks] = useState<ReleaseTask[]>([]);
  const [keyword, setKeyword] = useState('');
  const [stateFilter, setStateFilter] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [devices, setDevices] = useState<DeviceCatalogItem[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string | undefined>();
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>();
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

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    deviceAPI
      .list({ limit: 500, offset: 0 })
      .then((data) => setDevices(data.devices || []))
      .catch(() => setDevices([]));
    packageAPI
      .list(200, 0)
      .then((data) => setPackages(data.packages || []))
      .catch(() => setPackages([]));
  }, []);

  const handleCreate = async (values: any) => {
    setCreating(true);
    try {
      await taskAPI.create({
        package_id: values.package_id,
        device_id: values.device_id || undefined,
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
      setSelectedPackageId(undefined);
      setSelectedDeviceId(undefined);
      form.resetFields();
      await load();
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
          await load();
        } catch (e: any) {
          message.error(e.message);
        }
      },
    });
  };

  const baseColumns = useMemo(
    () => [
      tableIdLinkColumn<ReleaseTask>('任务 ID', 'task_id', (id) => navigate(`/tasks/${id}`)),
      tableEllipsisColumn<ReleaseTask>('固件包别名', 'package_alias', {
        render: (v) => (v ? String(v) : '—'),
      }),
      tableEllipsisRenderColumn<ReleaseTask>('固件包', 'package_id', (r) =>
        `${r.product_code ?? '-'} v${r.version ?? '-'}（${r.package_id}）`
      ),
      tableEllipsisColumn<ReleaseTask>('指定设备', 'device_id', {
        render: (v) => (v ? String(v) : '—'),
      }),
      tableEllipsisColumn<ReleaseTask>('分组', 'target_group'),
      tableEllipsisColumn<ReleaseTask>('型号', 'product_model'),
      tableCompactColumn<ReleaseTask>(
        '状态',
        'state',
        (v: string) => <Tag color={stateColor[v]}>{v}</Tag>,
        'state'
      ),
      tableEllipsisColumn<ReleaseTask>('创建时间', 'created_at', {
        size: 'date',
        render: (v) => (v ? new Date(String(v)).toLocaleString() : '-'),
      }),
      tableActionColumn<ReleaseTask>(
        (_, r) => {
          const actions = validActions[r.state] || [];
          const labels: Record<string, string> = {
            start: '开始',
            pause: '暂停',
            resume: '恢复',
            terminate: '终止',
            rollback: '回滚',
          };
          return (
            <Space size={4} className="ota-table-actions">
              {actions.map((a) => (
                <Button key={a} type="link" size="small" onClick={() => handleAction(r, a)}>
                  {labels[a] ?? a}
                </Button>
              ))}
            </Space>
          );
        },
        { actionLabels: ['开始', '暂停', '恢复', '终止', '回滚'], maxButtonsPerRow: 3 }
      ),
    ],
    [navigate],
  );
  const { columns, components: tableComponents } = useResizableColumns(baseColumns, 'ota.table.tasks');

  const filteredTasks = tasks.filter((t) => {
    if (stateFilter && t.state !== stateFilter) return false;
    if (!keyword.trim()) return true;
    const key = keyword.toLowerCase();
    return [t.task_id, t.package_id, t.device_id ?? '', t.product_code ?? '', t.target_group, t.product_model]
      .join(' ')
      .toLowerCase()
      .includes(key);
  });

  const selectedPackage = packages.find((pkg) => pkg.package_id === selectedPackageId);

  const devicesForPackage = useMemo(() => {
    if (!selectedPackage) return devices;
    return devices.filter((device) => {
      const code = (device.product_code || '').trim();
      const pkgCode = (selectedPackage.product_code || '').trim();
      if (pkgCode && code) return code === pkgCode;
      return true;
    });
  }, [devices, selectedPackage]);

  const deviceOptions = useMemo(
    () =>
      devicesForPackage.map((d) => {
        const meta = [d.product_code, d.product_model, d.device_group].filter(Boolean).join(' / ');
        return {
          value: d.device_id,
          label: meta ? `${d.device_id}（${meta}）` : d.device_id,
        };
      }),
    [devicesForPackage]
  );

  const catalogOptions = (
    field: keyof Pick<DeviceCatalogItem, 'device_group' | 'product_model' | 'hardware_version'>
  ) =>
    Array.from(new Set(devicesForPackage.map((device) => device[field]).filter(Boolean))).map((value) => ({
      value: String(value),
    }));

  const mostCommonValue = (values: string[]): string | undefined => {
    if (values.length === 0) return undefined;
    const counts = new Map<string, number>();
    for (const value of values) {
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  };

  const fillScopeFromCatalog = (packageId?: string) => {
    const pkg = packages.find((item) => item.package_id === packageId);
    const matched = pkg
      ? devices.filter((device) => {
          const code = (device.product_code || '').trim();
          const pkgCode = (pkg.product_code || '').trim();
          return !pkgCode || !code || code === pkgCode;
        })
      : devices;
    return {
      group: mostCommonValue(matched.map((d) => d.device_group).filter(Boolean) as string[]),
      product_model: mostCommonValue(matched.map((d) => d.product_model).filter(Boolean) as string[]),
      hardware_version: mostCommonValue(matched.map((d) => d.hardware_version).filter(Boolean) as string[]),
    };
  };

  const applyPackageSelection = (packageId?: string) => {
    setSelectedPackageId(packageId);
    setSelectedDeviceId(undefined);
    if (!packageId) {
      form.setFieldsValue({
        package_version: undefined,
        product_code: undefined,
        device_id: undefined,
        group: undefined,
        product_model: undefined,
        hardware_version: undefined,
      });
      return;
    }
    const pkg = packages.find((item) => item.package_id === packageId);
    form.setFieldsValue({
      package_version: pkg?.version || undefined,
      product_code: pkg?.product_code || undefined,
      device_id: undefined,
      ...fillScopeFromCatalog(packageId),
    });
  };

  const applyDeviceSelection = (deviceId?: string) => {
    setSelectedDeviceId(deviceId);
    if (!deviceId) {
      form.setFieldsValue(fillScopeFromCatalog(selectedPackageId));
      return;
    }
    const device = devices.find((d) => d.device_id === deviceId);
    if (!device) return;
    form.setFieldsValue({
      device_id: device.device_id,
      group: device.device_group || undefined,
      product_model: device.product_model || undefined,
      hardware_version: device.hardware_version || undefined,
    });
  };

  const openCreateModal = () => {
    setSelectedPackageId(undefined);
    setSelectedDeviceId(undefined);
    form.resetFields();
    form.setFieldsValue({ start_now: true });
    setCreateOpen(true);
  };

  return (
    <div className="ota-page ota-page-fill">
      <Card
        className="ota-card ota-card-dense ota-card-list"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            新建任务
          </Button>
        }
      >
        <div className="ota-toolbar">
          <div className="ota-toolbar-left">
            <Input.Search
              allowClear
              placeholder="搜索任务ID/设备/包ID/分组/型号"
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
        </div>

        <Table
          {...listTableProps}
          columns={columns}
          components={tableComponents}
          dataSource={filteredTasks}
          loading={loading}
          rowKey="task_id"
          pagination={clientTablePagination()}
          scroll={listTableScroll(columns, filteredTasks.length)}
        />

        <Modal
          width="min(560px, calc(100vw - 24px))"
          title="新建任务"
          open={createOpen}
          onCancel={() => {
            setCreateOpen(false);
            setSelectedPackageId(undefined);
            setSelectedDeviceId(undefined);
            form.resetFields();
          }}
          footer={null}
          destroyOnClose
        >
          <Form form={form} layout="vertical" onFinish={handleCreate}>
            <Form.Item name="package_id" label="固件包" rules={[{ required: true, message: '请选择固件包' }]}>
              <Select
                showSearch
                allowClear
                placeholder="选择或搜索固件包"
                optionFilterProp="label"
                filterOption={filterOption}
                onChange={(value) => applyPackageSelection(value)}
                options={packages
                  .filter((pkg) => !pkg.status || pkg.status === 'Published')
                  .map((pkg) => ({
                    value: pkg.package_id,
                    label: packageOptionLabel(pkg),
                  }))}
              />
            </Form.Item>
            <Form.Item name="package_version" label="固件版本">
              <Input placeholder="选择固件包后自动填入" disabled />
            </Form.Item>
            <Form.Item name="product_code" label="产品代码">
              <Input placeholder="选择固件包后自动填入" disabled />
            </Form.Item>
            <Form.Item
              name="device_id"
              label="指定设备"
              extra="选填。指定后为单设备升级；不指定则按分组/型号/硬件版本批量升级"
            >
              <Select
                showSearch
                allowClear
                placeholder={selectedPackageId ? '可选：选择或搜索设备' : '请先选择固件包'}
                disabled={!selectedPackageId}
                options={deviceOptions}
                filterOption={filterOption}
                onChange={(value) => applyDeviceSelection(value)}
              />
            </Form.Item>
            <Form.Item name="group" label="目标分组" rules={[{ required: true, message: '请填写目标分组' }]}>
              <AutoComplete
                options={catalogOptions('device_group')}
                placeholder={selectedDeviceId ? '已按设备自动填入' : '可选择或手输'}
                disabled={!!selectedDeviceId}
              />
            </Form.Item>
            <Form.Item name="product_model" label="产品型号" rules={[{ required: true, message: '请填写产品型号' }]}>
              <AutoComplete
                options={catalogOptions('product_model')}
                placeholder={selectedDeviceId ? '已按设备自动填入' : '可选择或手输'}
                disabled={!!selectedDeviceId}
              />
            </Form.Item>
            <Form.Item
              name="hardware_version"
              label="硬件版本"
              rules={[{ required: true, message: '请填写硬件版本' }]}
            >
              <AutoComplete
                options={catalogOptions('hardware_version')}
                placeholder={selectedDeviceId ? '已按设备自动填入' : '可选择或手输'}
                disabled={!!selectedDeviceId}
              />
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
              <Button type="primary" htmlType="submit" loading={creating} block>
                创建
              </Button>
            </Form.Item>
          </Form>
        </Modal>
      </Card>
    </div>
  );
}
