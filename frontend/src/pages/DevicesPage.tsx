import { Alert, Button, Card, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { DeviceSummaryItem, mockDevices } from './mockConsoleData';

const { Paragraph, Title, Text } = Typography;

const statusColor: Record<string, string> = {
  online: 'green',
  warning: 'orange',
  offline: 'red',
};

export function DevicesPage() {
  const navigate = useNavigate();

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

  return (
    <div className="ota-page">
      <div>
        <Title level={3} className="ota-page-title">设备管理</Title>
        <Paragraph className="ota-page-subtitle">先确认设备列表的筛选、状态表达和来源分区，再逐步接入详情页与升级历史。</Paragraph>
      </div>

      <Alert
        type="warning"
        showIcon
        message="外部系统数据为占位演示"
        description="当前已预留外部设备数据展示位，后续通过服务端代理接口统一接入。"
      />

      <Card className="ota-card">
        <div className="ota-toolbar">
          <div className="ota-toolbar-left">
            <Input.Search className="ota-toolbar-control-search" placeholder="搜索设备 ID / 型号 / 产品代码" allowClear />
            <Select
              className="ota-toolbar-control-select"
              defaultValue="all"
              options={[
                { label: '全部状态', value: 'all' },
                { label: '在线', value: 'online' },
                { label: '告警', value: 'warning' },
                { label: '离线', value: 'offline' },
              ]}
            />
            <Select
              className="ota-toolbar-control-select"
              defaultValue="all"
              options={[
                { label: '全部来源', value: 'all' },
                { label: '本地系统', value: 'local' },
                { label: '外部系统', value: 'external' },
              ]}
            />
          </div>
          <Space>
            <Button icon={<ReloadOutlined />}>刷新</Button>
            <Button icon={<DownloadOutlined />}>导出设备</Button>
          </Space>
        </div>

        <Table
          rowKey="device_id"
          columns={columns}
          dataSource={mockDevices}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          scroll={mockDevices.length > 0 ? { x: 1200 } : undefined}
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