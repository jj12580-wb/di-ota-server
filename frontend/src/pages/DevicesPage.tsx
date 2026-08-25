import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Form, Input, Modal, Select, Space, Switch, Table, Tag, Upload, message } from 'antd';
import { ApiOutlined, DownloadOutlined, PlusOutlined, ReloadOutlined, UploadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { DeviceCatalogItem, DeviceUpsertPayload, deviceAPI } from '../api';
import { tableActionColumn, listTableProps, listTableScroll, serverTablePagination } from '../utils/tableActionColumn';
import { tableIdLinkColumn } from '../utils/tableIdLinkColumn';
import { tableEllipsisColumn, tableCompactColumn } from '../utils/tableEllipsisColumn';
import { useResizableColumns } from '../utils/useResizableColumns';

type DeviceFormValues = {
  device_id: string;
  product_code?: string;
  product_model: string;
  hardware_version: string;
  current_version?: string;
  device_group?: string;
  tags_text?: string;
};

function tagsToText(tags: Record<string, unknown> | undefined): string {
  if (!tags || Object.keys(tags).length === 0) return '';
  try {
    return JSON.stringify(tags);
  } catch {
    return '';
  }
}

function parseTagsText(text: string | undefined): Record<string, unknown> {
  const raw = (text ?? '').trim();
  if (!raw) return {};
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('标签必须是 JSON 对象，例如 {"batch":"2026-05"}');
  }
  return parsed as Record<string, unknown>;
}

export function DevicesPage() {
  const navigate = useNavigate();
  const [form] = Form.useForm<DeviceFormValues>();
  const [devices, setDevices] = useState<DeviceCatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState('');
  const [appliedKeyword, setAppliedKeyword] = useState('');
  const [groupFilter, setGroupFilter] = useState<string | undefined>(undefined);
  const [modelFilter, setModelFilter] = useState<string | undefined>(undefined);
  const [tagFilter, setTagFilter] = useState('');
  const [appliedTagFilter, setAppliedTagFilter] = useState('');
  const [abnormalOnly, setAbnormalOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DeviceCatalogItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [filterOptions, setFilterOptions] = useState<{ groups: string[]; models: string[] }>({ groups: [], models: [] });

  const loadFilterOptions = useCallback(async () => {
    try {
      const data = await deviceAPI.list({ limit: 200, offset: 0 });
      setFilterOptions({
        groups: Array.from(new Set(data.devices.map((d) => d.device_group).filter(Boolean))),
        models: Array.from(new Set(data.devices.map((d) => d.product_model).filter(Boolean))),
      });
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await deviceAPI.list({
        limit: pageSize,
        offset: (page - 1) * pageSize,
        search: appliedKeyword.trim(),
        group: groupFilter,
        product_model: modelFilter,
        tag: appliedTagFilter.trim(),
        abnormal: abnormalOnly,
      });
      setDevices(data.devices);
      setTotal(data.total);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '加载设备失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, appliedKeyword, groupFilter, modelFilter, appliedTagFilter, abnormalOnly]);

  useEffect(() => { void loadFilterOptions(); }, [loadFilterOptions]);
  useEffect(() => { void load(); }, [load]);

  const handleDownloadTemplate = async () => {
    try {
      const res = await deviceAPI.downloadTemplate();
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'ota-device-template.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '下载模板失败');
    }
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    try {
      const result = await deviceAPI.importCSV(file);
      message.success(`导入成功：${result.imported_count} 台设备`);
      setPage(1);
      await loadFilterOptions();
      await load();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '导入失败');
    } finally {
      setImporting(false);
    }
  };

  const applyFilters = () => {
    setAppliedKeyword(keyword);
    setAppliedTagFilter(tagFilter);
    setPage(1);
  };

  const openCreateModal = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      product_code: '',
      current_version: '',
      device_group: '',
      tags_text: '',
    });
    setModalOpen(true);
  };

  const openEditModal = (record: DeviceCatalogItem) => {
    setEditing(record);
    form.setFieldsValue({
      device_id: record.device_id,
      product_code: record.product_code,
      product_model: record.product_model,
      hardware_version: record.hardware_version,
      current_version: record.catalog_version || record.current_version || '',
      device_group: record.device_group,
      tags_text: tagsToText(record.tags),
    });
    setModalOpen(true);
  };

  const handleSubmit = async (values: DeviceFormValues) => {
    let tags: Record<string, unknown>;
    try {
      tags = parseTagsText(values.tags_text);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '标签格式错误');
      return;
    }

    const payload: DeviceUpsertPayload = {
      device_id: values.device_id.trim(),
      product_code: values.product_code?.trim() || '',
      product_model: values.product_model.trim(),
      hardware_version: values.hardware_version.trim(),
      current_version: values.current_version?.trim() || '',
      device_group: values.device_group?.trim() || '',
      tags,
    };

    setSubmitting(true);
    try {
      if (editing) {
        const { device_id: _id, ...rest } = payload;
        await deviceAPI.update(editing.device_id, rest);
        message.success('设备已更新');
      } else {
        await deviceAPI.create(payload);
        message.success('设备已添加');
        setPage(1);
      }
      setModalOpen(false);
      form.resetFields();
      setEditing(null);
      await loadFilterOptions();
      await load();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : (editing ? '更新设备失败' : '添加设备失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const baseColumns = useMemo(
    () => [
      tableIdLinkColumn<DeviceCatalogItem>('设备 ID', 'device_id', (id) => navigate(`/devices/${id}`)),
      tableEllipsisColumn<DeviceCatalogItem>('产品代码', 'product_code'),
      tableEllipsisColumn<DeviceCatalogItem>('型号', 'product_model'),
      tableEllipsisColumn<DeviceCatalogItem>('硬件版本', 'hardware_version'),
      tableEllipsisColumn<DeviceCatalogItem>('设备分组', 'device_group'),
      tableEllipsisColumn<DeviceCatalogItem>('当前版本', 'current_version'),
      tableEllipsisColumn<DeviceCatalogItem>('OTA 上报', 'reported_version', {
        render: (v) => (v ? String(v) : '-'),
      }),
      tableCompactColumn<DeviceCatalogItem>('Secret', 'secret_provisioned', (_: unknown, record: DeviceCatalogItem) => (
        <Tag color={record.secret_provisioned ? 'green' : 'orange'}>
          {record.secret_provisioned ? '已配置' : '未配置'}
        </Tag>
      )),
      tableCompactColumn<DeviceCatalogItem>('状态', 'status', (_: unknown, record: DeviceCatalogItem) => {
        const flags = record.inconsistency_flags ?? [];
        if (record.eligibility_state === 'blocked') {
          return <Tag color="red">已阻断</Tag>;
        }
        if (flags.length > 0) {
          return <Tag color="orange">目录异常</Tag>;
        }
        return <Tag color="green">正常</Tag>;
      }),
      tableEllipsisColumn<DeviceCatalogItem>('导入/更新时间', 'last_heartbeat', {
        size: 'date',
        render: (v) => (v ? new Date(String(v)).toLocaleString() : '-'),
      }),
      tableActionColumn<DeviceCatalogItem>(
        (_, record) => (
          <Space size={4} className="ota-table-actions">
            <Button type="link" size="small" onClick={() => openEditModal(record)}>
              编辑
            </Button>
            <Button type="link" size="small" onClick={() => navigate(`/devices/${record.device_id}`)}>
              详情
            </Button>
          </Space>
        ),
        { actionLabels: ['编辑', '详情'] },
      ),
    ],
    [navigate],
  );
  const { columns, components: tableComponents } = useResizableColumns(baseColumns, 'ota.table.devices');

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
            <Input.Search
              className="ota-toolbar-control-search"
              placeholder="搜索设备 ID / 型号 / 产品代码"
              allowClear
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onSearch={applyFilters}
            />
            <Select
              className="ota-toolbar-control-select"
              allowClear
              placeholder="设备分组"
              value={groupFilter}
              options={filterOptions.groups.map((group) => ({ label: group, value: group }))}
              onChange={(value) => { setGroupFilter(value); setPage(1); }}
            />
            <Select
              className="ota-toolbar-control-select"
              allowClear
              placeholder="产品型号"
              value={modelFilter}
              options={filterOptions.models.map((model) => ({ label: model, value: model }))}
              onChange={(value) => { setModelFilter(value); setPage(1); }}
            />
            <Input
              className="ota-toolbar-control-select"
              placeholder="标签关键词"
              allowClear
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              onPressEnter={applyFilters}
            />
            <label className="ota-toolbar-filter-switch">
              <span className="ota-toolbar-filter-switch-label">仅异常设备</span>
              <Switch
                size="small"
                checked={abnormalOnly}
                onChange={(checked) => { setAbnormalOnly(checked); setPage(1); }}
              />
            </label>
          </div>
          <Space wrap>
            <Button icon={<ApiOutlined />} onClick={() => navigate('/simulator')}>设备端模拟器</Button>
            <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
            <Button icon={<DownloadOutlined />} onClick={() => void handleDownloadTemplate()}>模板</Button>
            <Upload accept=".csv,text/csv" showUploadList={false} beforeUpload={(file) => { void handleImport(file); return false; }}>
              <Button icon={<UploadOutlined />} loading={importing}>导入 CSV</Button>
            </Upload>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>添加设备</Button>
          </Space>
        </div>

        <Table
          {...listTableProps}
          size="small"
          rowKey="device_id"
          columns={columns}
          components={tableComponents}
          dataSource={devices}
          loading={loading}
          pagination={serverTablePagination(page, pageSize, total, handlePageChange, {
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50],
          })}
          scroll={listTableScroll(columns, devices.length)}
          locale={{ emptyText: '暂无设备，可点击「添加设备」或导入 CSV' }}
        />
      </Card>

      <Modal
        title={editing ? '编辑设备' : '添加设备'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditing(null); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={submitting}
        destroyOnClose
        okText={editing ? '保存' : '添加'}
        cancelText="取消"
        width={560}
      >
        <Form form={form} layout="vertical" onFinish={(values) => void handleSubmit(values)}>
          <Form.Item
            name="device_id"
            label="设备 ID"
            rules={[{ required: true, message: '请输入设备 ID' }]}
          >
            <Input placeholder="例如 AMS000001" disabled={!!editing} />
          </Form.Item>
          <Form.Item name="product_code" label="产品代码">
            <Input placeholder="例如 AMS" />
          </Form.Item>
          <Form.Item
            name="product_model"
            label="产品型号"
            rules={[{ required: true, message: '请输入产品型号' }]}
          >
            <Input placeholder="例如 V9" />
          </Form.Item>
          <Form.Item
            name="hardware_version"
            label="硬件版本"
            rules={[{ required: true, message: '请输入硬件版本' }]}
          >
            <Input placeholder="例如 1.0" />
          </Form.Item>
          <Form.Item name="current_version" label="当前/目录版本">
            <Input placeholder="例如 v2.3.0（可选）" />
          </Form.Item>
          <Form.Item name="device_group" label="设备分组">
            <Input placeholder="例如 org-1001（可选）" />
          </Form.Item>
          <Form.Item
            name="tags_text"
            label="标签 JSON"
            extra='可选，例如 {"batch":"2026-05"}'
          >
            <Input.TextArea rows={2} placeholder='{"batch":"2026-05"}' />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
