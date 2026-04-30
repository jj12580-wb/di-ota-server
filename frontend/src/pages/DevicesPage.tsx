import { Alert, Button, Card, Input, Select, Space, Table, Tag, Typography, message } from 'antd';
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import type { TablePaginationConfig } from 'antd/es/table';
import type { DeviceSummaryItem } from './mockConsoleData';
import { AMSDeviceItem, AMSOrganization, AMSPlatform, deviceAPI, organizationAPI, platformAPI } from '../api';

const { Paragraph, Title, Text } = Typography;

const statusColor: Record<string, string> = {
  online: 'green',
  warning: 'orange',
  offline: 'red',
};

function toDeviceSummaryItem(item: AMSDeviceItem): DeviceSummaryItem {
  const isOnline = Boolean(item.is_online);
  const isActive = item.is_active !== false;

  let status: DeviceSummaryItem['status'] = isOnline ? 'online' : 'offline';
  if (!isActive) status = 'warning';

  const safe = (value: unknown, fallback = '-') => {
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
    if (typeof value === 'number') return String(value);
    return fallback;
  };

  return {
    device_id: safe(item.sn, safe(item.id)),
    product_code: safe(item.name, safe(item.mac_addr)),
    product_model: safe(item.current_model_id),
    hardware_version: '-',
    current_version: safe(item.current_firmware_version),
    target_version: '-',
    status,
    last_heartbeat: safe(item.last_heartbeat),
    last_error_code: '-',
    data_source: 'external',
    tags: [],
    last_task_id: '',
  };
}

export function DevicesPage() {
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();
  const [loading, setLoading] = useState(false);
  const [devices, setDevices] = useState<DeviceSummaryItem[]>([]);
  const [platforms, setPlatforms] = useState<AMSPlatform[]>([]);
  const [organizations, setOrganizations] = useState<AMSOrganization[]>([]);
  const [platformId, setPlatformId] = useState<number | undefined>(undefined);
  const [orgId, setOrgId] = useState<number | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | DeviceSummaryItem['status']>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | DeviceSummaryItem['data_source']>('all');

  const columns = [
    { title: '设备 ID', dataIndex: 'device_id', key: 'device_id' },
    { title: '产品代码', dataIndex: 'product_code', key: 'product_code' },
    { title: '型号', dataIndex: 'product_model', key: 'product_model' },
    { title: '当前版本', dataIndex: 'current_version', key: 'current_version' },
    { title: '目标版本', dataIndex: 'target_version', key: 'target_version' },
    { title: '最后心跳', dataIndex: 'last_heartbeat', key: 'last_heartbeat' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (value: string) => <Tag color={statusColor[value]}>{value}</Tag>,
    },
    {
      title: '数据来源',
      dataIndex: 'data_source',
      key: 'data_source',
      render: (value: string) => <Tag color={value === 'external' ? 'purple' : 'blue'}>{value === 'external' ? '外部系统' : '本地系统'}</Tag>,
    },
    { title: '最近错误', dataIndex: 'last_error_code', key: 'last_error_code' },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right' as const,
      render: (_: unknown, record: DeviceSummaryItem) => (
        <Button type="link" onClick={() => navigate(`/devices/${record.device_id}`)}>
          查看详情
        </Button>
      ),
    },
  ];

  const filteredDevices = useMemo(() => {
    return devices.filter((d) => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (sourceFilter !== 'all' && d.data_source !== sourceFilter) return false;
      return true;
    });
  }, [devices, statusFilter, sourceFilter]);

  const orgOptions = useMemo(() => {
    if (!platformId) return organizations;
    return organizations.filter((o) => o.platform_id === platformId);
  }, [organizations, platformId]);

  async function fetchDevices(next?: { page?: number; pageSize?: number; keyword?: string; platformId?: number; orgId?: number }) {
    const p = next?.page ?? page;
    const ps = next?.pageSize ?? pageSize;
    const kw = next?.keyword ?? keyword;
    const pf = next?.platformId ?? platformId;
    const og = next?.orgId ?? orgId;

    setLoading(true);
    try {
      const data = await deviceAPI.list({ page: p, page_size: ps, keyword: kw, platform_id: pf, org_id: og });
      setDevices((data.items ?? []).map(toDeviceSummaryItem));
      setTotal(data.total ?? 0);
      setPage(data.page ?? p);
      setPageSize(data.page_size ?? ps);
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '加载设备列表失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    Promise.all([platformAPI.list(), organizationAPI.list()])
      .then(([pf, org]) => {
        setPlatforms(pf ?? []);
        setOrganizations(org ?? []);
      })
      .catch((err) => {
        messageApi.error(err instanceof Error ? err.message : '加载平台/机构列表失败');
      })
      .finally(() => {
        fetchDevices();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="ota-page">
      {contextHolder}
      <div>
        <Title level={3} className="ota-page-title">设备管理</Title>
        <Paragraph className="ota-page-subtitle">先确认设备列表的筛选、状态表达和来源分区，再逐步接入详情页与升级历史。</Paragraph>
      </div>

      <Alert
        type="info"
        showIcon
        message="外部设备数据已接入"
        description="当前列表通过服务端代理接口读取外部系统（AMS）的设备数据。"
      />

      <Card className="ota-card">
        <div className="ota-toolbar">
          <div className="ota-toolbar-left">
            <Input.Search
              className="ota-toolbar-control-search"
              placeholder="搜索设备 SN"
              allowClear
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onSearch={(value) => {
                const nextKeyword = value.trim();
                setKeyword(nextKeyword);
                setPage(1);
                fetchDevices({ page: 1, keyword: nextKeyword });
              }}
            />
            <Select
              className="ota-toolbar-control-select"
              placeholder="平台"
              allowClear
              value={platformId}
              onChange={(value) => {
                const nextPlatform = typeof value === 'number' ? value : undefined;
                setPlatformId(nextPlatform);
                // platform 变化时，机构不一定还合法，直接重置
                setOrgId(undefined);
                setPage(1);
                fetchDevices({ page: 1, platformId: nextPlatform, orgId: undefined });
              }}
              options={platforms.map((p) => ({ label: p.name ?? String(p.id), value: p.id }))}
            />
            <Select
              className="ota-toolbar-control-select"
              placeholder="机构"
              allowClear
              value={orgId}
              onChange={(value) => {
                const nextOrg = typeof value === 'number' ? value : undefined;
                setOrgId(nextOrg);
                setPage(1);
                fetchDevices({ page: 1, orgId: nextOrg });
              }}
              options={orgOptions.map((o) => ({ label: o.name ?? String(o.id), value: o.id }))}
            />
            <Select
              className="ota-toolbar-control-select"
              value={statusFilter}
              onChange={(value) => setStatusFilter(value)}
              options={[
                { label: '全部状态', value: 'all' },
                { label: '在线', value: 'online' },
                { label: '告警', value: 'warning' },
                { label: '离线', value: 'offline' },
              ]}
            />
            <Select
              className="ota-toolbar-control-select"
              value={sourceFilter}
              onChange={(value) => setSourceFilter(value)}
              options={[
                { label: '全部来源', value: 'all' },
                { label: '本地系统', value: 'local' },
                { label: '外部系统', value: 'external' },
              ]}
            />
          </div>
          <Space>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => fetchDevices()}>
              刷新
            </Button>
            <Button icon={<DownloadOutlined />}>导出设备</Button>
          </Space>
        </div>

        <Table
          rowKey="device_id"
          columns={columns}
          loading={loading}
          dataSource={filteredDevices}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            onChange: (nextPage, nextPageSize) => {
              const effectivePageSize = nextPageSize ?? pageSize;
              setPage(nextPage);
              setPageSize(effectivePageSize);
              fetchDevices({ page: nextPage, pageSize: effectivePageSize });
            },
          } as TablePaginationConfig}
          scroll={filteredDevices.length > 0 ? { x: 1200 } : undefined}
        />
      </Card>

      <div className="ota-section-grid">
        <Card className="ota-card ota-section-span-8" title="设备视角需要继续补的区域">
          <div className="ota-stack">
            <Text>设备详情页</Text>
            <Text>升级历史时间线</Text>
            <Text>异常设备快速过滤</Text>
            <Text>按产品型号 / 标签 / 分组的组合查询</Text>
          </div>
        </Card>
        <Card className="ota-card ota-section-span-4" title="当前页面重点">
          <div className="ota-stack">
            <Text>本地 / 外部来源分区</Text>
            <Text>异常状态优先暴露</Text>
            <Text>后续跳 DeviceDetailPage</Text>
          </div>
        </Card>
      </div>
    </div>
  );
}