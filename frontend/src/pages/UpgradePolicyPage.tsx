import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Form,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  deviceAPI,
  upgradePolicyAPI,
  type DeviceCatalogItem,
  type UpgradePolicy,
  type UpgradePolicyInput,
} from '../api';
import { listTableProps, listTableScroll, clientTablePagination } from '../utils/tableActionColumn';
import { tableEllipsisColumn } from '../utils/tableEllipsisColumn';
import { useResizableColumns } from '../utils/useResizableColumns';

const { Text } = Typography;

function dash(v?: string) {
  return v && String(v).trim() ? String(v) : '—';
}

function uniqueOptions(
  values: Array<string | undefined | null>,
  extra?: Array<string | undefined | null>
) {
  return Array.from(
    new Set(
      [...values, ...(extra || [])]
        .map((v) => (v || '').trim())
        .filter(Boolean)
    )
  )
    .sort((a, b) => a.localeCompare(b, 'zh-CN'))
    .map((value) => ({ value, label: value }));
}

function filterOption(input: string, option?: { label?: unknown; value?: unknown }) {
  const q = input.trim().toLowerCase();
  if (!q) return true;
  const label = String(option?.label ?? '');
  const value = String(option?.value ?? '');
  return label.toLowerCase().includes(q) || value.toLowerCase().includes(q);
}

export function UpgradePolicyPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filling, setFilling] = useState(false);
  const [defaultMode, setDefaultMode] = useState('relaxed');
  const [policies, setPolicies] = useState<UpgradePolicy[]>([]);
  const [devices, setDevices] = useState<DeviceCatalogItem[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UpgradePolicy | null>(null);
  const [form] = Form.useForm<UpgradePolicyInput>();

  const load = async () => {
    setLoading(true);
    try {
      const data = await upgradePolicyAPI.list();
      setDefaultMode(data.default_mode || 'relaxed');
      setPolicies(data.policies || []);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    deviceAPI
      .list({ limit: 500, offset: 0 })
      .then((data) => setDevices(data.devices || []))
      .catch(() => setDevices([]));
  }, []);

  const editExtras = editing
    ? {
        device_id: editing.device_id,
        product_code: editing.product_code,
        product_model: editing.product_model,
        hardware_version: editing.hardware_version,
        device_group: editing.device_group,
        current_version: editing.current_version,
      }
    : null;

  const deviceOptions = useMemo(() => {
    const fromCatalog = devices.map((d) => {
      const meta = [d.product_code, d.product_model, d.device_group].filter(Boolean).join(' / ');
      return {
        value: d.device_id,
        label: meta ? `${d.device_id}（${meta}）` : d.device_id,
      };
    });
    const extraId = (editExtras?.device_id || '').trim();
    if (extraId && !fromCatalog.some((o) => o.value === extraId)) {
      fromCatalog.push({ value: extraId, label: extraId });
    }
    return fromCatalog;
  }, [devices, editExtras?.device_id]);

  const productCodeOptions = useMemo(
    () => uniqueOptions(devices.map((d) => d.product_code), [editExtras?.product_code]),
    [devices, editExtras?.product_code]
  );
  const productModelOptions = useMemo(
    () => uniqueOptions(devices.map((d) => d.product_model), [editExtras?.product_model]),
    [devices, editExtras?.product_model]
  );
  const hardwareVersionOptions = useMemo(
    () => uniqueOptions(devices.map((d) => d.hardware_version), [editExtras?.hardware_version]),
    [devices, editExtras?.hardware_version]
  );
  const deviceGroupOptions = useMemo(
    () => uniqueOptions(devices.map((d) => d.device_group), [editExtras?.device_group]),
    [devices, editExtras?.device_group]
  );
  const currentVersionOptions = useMemo(
    () =>
      uniqueOptions(
        devices.flatMap((d) => [d.reported_version, d.current_version, d.catalog_version]),
        [editExtras?.current_version]
      ),
    [devices, editExtras?.current_version]
  );

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ report_status_mode: 'relaxed' });
    setModalOpen(true);
  };

  const openEdit = (record: UpgradePolicy) => {
    setEditing(record);
    form.setFieldsValue({
      device_id: record.device_id || undefined,
      product_code: record.product_code || undefined,
      product_model: record.product_model || undefined,
      hardware_version: record.hardware_version || undefined,
      device_group: record.device_group || undefined,
      current_version: record.current_version || undefined,
      report_status_mode: record.report_status_mode || 'relaxed',
    });
    setModalOpen(true);
  };

  const autofillFromDevice = async (raw?: string) => {
    const deviceId = (raw ?? form.getFieldValue('device_id') ?? '').trim();
    if (!deviceId) return;
    setFilling(true);
    try {
      const fromList = devices.find((d) => d.device_id === deviceId);
      const device = fromList || (await deviceAPI.get(deviceId));
      const current = (
        device.reported_version ||
        device.current_version ||
        device.catalog_version ||
        ''
      ).trim();
      form.setFieldsValue({
        device_id: device.device_id,
        product_code: device.product_code || undefined,
        product_model: device.product_model || undefined,
        hardware_version: device.hardware_version || undefined,
        device_group: device.device_group || undefined,
        current_version: current || undefined,
      });
      message.success(`已根据设备 ${device.device_id} 自动填入其它字段`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '设备不存在或加载失败');
    } finally {
      setFilling(false);
    }
  };

  const handleSubmit = async (values: UpgradePolicyInput) => {
    setSaving(true);
    try {
      const payload: UpgradePolicyInput = {
        device_id: values.device_id?.trim() || '',
        product_code: values.product_code?.trim() || '',
        product_model: values.product_model?.trim() || '',
        hardware_version: values.hardware_version?.trim() || '',
        device_group: values.device_group?.trim() || '',
        current_version: values.current_version?.trim() || '',
        report_status_mode: values.report_status_mode || 'relaxed',
      };
      if (editing) {
        await upgradePolicyAPI.update(editing.policy_id, payload);
        message.success('策略已更新');
      } else {
        await upgradePolicyAPI.create(payload);
        message.success('策略已创建');
      }
      setModalOpen(false);
      setEditing(null);
      form.resetFields();
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record: UpgradePolicy) => {
    try {
      await upgradePolicyAPI.remove(record.policy_id);
      message.success('策略已删除');
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  const baseColumns: ColumnsType<UpgradePolicy> = useMemo(
    () => [
      tableEllipsisColumn<UpgradePolicy>('设备 ID', 'device_id', {
        render: (v) => dash(typeof v === 'string' ? v : String(v ?? '')),
      }),
      tableEllipsisColumn<UpgradePolicy>('产品代码', 'product_code', {
        render: (v) => dash(typeof v === 'string' ? v : String(v ?? '')),
      }),
      tableEllipsisColumn<UpgradePolicy>('型号', 'product_model', {
        render: (v) => dash(typeof v === 'string' ? v : String(v ?? '')),
      }),
      tableEllipsisColumn<UpgradePolicy>('硬件版本', 'hardware_version', {
        render: (v) => dash(typeof v === 'string' ? v : String(v ?? '')),
      }),
      tableEllipsisColumn<UpgradePolicy>('设备分组', 'device_group', {
        render: (v) => dash(typeof v === 'string' ? v : String(v ?? '')),
      }),
      tableEllipsisColumn<UpgradePolicy>('当前版本', 'current_version', {
        render: (v) => dash(typeof v === 'string' ? v : String(v ?? '')),
      }),
      {
        title: '模式',
        dataIndex: 'report_status_mode',
        width: 100,
        render: (mode: string) => (
          <Tag color={mode === 'strict' ? 'red' : 'blue'}>{mode === 'strict' ? '严格' : '宽松'}</Tag>
        ),
      },
      {
        title: '更新人',
        dataIndex: 'updated_by',
        width: 100,
        render: (v: string) => v || '—',
      },
      {
        title: '操作',
        key: 'actions',
        width: 140,
        fixed: 'right',
        render: (_, record) => (
          <Space size={4}>
            <Button type="link" size="small" onClick={() => openEdit(record)}>
              编辑
            </Button>
            <Popconfirm title="确认删除该策略？" onConfirm={() => void handleDelete(record)}>
              <Button type="link" size="small" danger>
                删除
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [],
  );
  const { columns, components: tableComponents } = useResizableColumns(baseColumns, 'ota.table.upgrade-policies');

  const searchableSelectProps = {
    showSearch: true,
    allowClear: true,
    filterOption,
    style: { width: '100%' as const },
  };

  return (
    <div className="ota-page ota-page-fill">
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="升级策略（多条件匹配）"
        description={
          <span>
            默认模式：
            <Tag color="blue">{defaultMode === 'strict' ? '严格' : '宽松'}</Tag>
            匹配字段均可留空（空=通配）。选择设备 ID 后会自动带出产品代码/型号/硬件版本/分组/当前版本。
            设备上报 report-status 时按「最具体匹配」选择宽松或严格。仅 admin 可改。
          </span>
        }
      />

      <Card
        className="ota-card ota-card-dense ota-card-list"
        title="策略列表"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新增策略
          </Button>
        }
      >
        <Table<UpgradePolicy>
          {...listTableProps}
          loading={loading}
          rowKey="policy_id"
          dataSource={policies}
          components={tableComponents}
          scroll={listTableScroll(columns, policies.length)}
          pagination={clientTablePagination()}
          columns={columns}
          locale={{ emptyText: '暂无策略，点击右上角「新增策略」创建' }}
        />
      </Card>

      <Modal
        title={editing ? '编辑升级策略' : '新增升级策略'}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        confirmLoading={saving}
        destroyOnClose
        width={560}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" onFinish={(values) => void handleSubmit(values)}>
          <Form.Item
            name="device_id"
            label="设备 ID"
            extra="选填。从下拉选择或输入搜索；选定后自动带出其它字段"
          >
            <Select
              {...searchableSelectProps}
              placeholder="选择或搜索设备 ID"
              options={deviceOptions}
              loading={filling}
              onChange={(value) => {
                if (value) void autofillFromDevice(String(value));
              }}
            />
          </Form.Item>
          <Form.Item name="product_code" label="产品代码">
            <Select
              {...searchableSelectProps}
              placeholder="选择或搜索；可留空通配"
              options={productCodeOptions}
            />
          </Form.Item>
          <Form.Item name="product_model" label="产品型号">
            <Select
              {...searchableSelectProps}
              placeholder="选择或搜索；可留空通配"
              options={productModelOptions}
            />
          </Form.Item>
          <Form.Item name="hardware_version" label="硬件版本">
            <Select
              {...searchableSelectProps}
              placeholder="选择或搜索；可留空通配"
              options={hardwareVersionOptions}
            />
          </Form.Item>
          <Form.Item name="device_group" label="设备分组">
            <Select
              {...searchableSelectProps}
              placeholder="选择或搜索；可留空通配"
              options={deviceGroupOptions}
            />
          </Form.Item>
          <Form.Item name="current_version" label="当前版本">
            <Select
              {...searchableSelectProps}
              placeholder="选择或搜索；可留空通配"
              options={currentVersionOptions}
            />
          </Form.Item>
          <Form.Item
            name="report_status_mode"
            label="上报状态机模式"
            rules={[{ required: true, message: '请选择模式' }]}
          >
            <Select
              options={[
                { value: 'relaxed', label: '宽松（允许乱序/回退与 Failed→Success）' },
                { value: 'strict', label: '严格（非法迁移返回 409）' },
              ]}
            />
          </Form.Item>
          <Text type="secondary">
            空字段表示不限制该维度。多个策略同时命中时，匹配条件越多（尤其含设备 ID）优先级越高。
          </Text>
        </Form>
      </Modal>
    </div>
  );
}
