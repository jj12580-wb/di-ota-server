import { Alert, Button, Card, Select, Space, Table, Tag, Typography } from 'antd';
import { CheckOutlined, ReloadOutlined, StopOutlined } from '@ant-design/icons';

const { Paragraph, Title, Text } = Typography;

const alerts = [
  {
    alert_id: 'alert-001',
    alert_type: '任务失败率过高',
    severity: 'critical',
    status: 'open',
    resource_type: 'task',
    resource_id: 'task-1001',
    message: '任务失败率已超过 15%',
    created_at: '2026-04-30 10:18:00',
  },
  {
    alert_id: 'alert-002',
    alert_type: '设备下载异常',
    severity: 'warning',
    status: 'acknowledged',
    resource_type: 'device',
    resource_id: 'dev-204',
    message: '外部系统返回下载超时',
    created_at: '2026-04-30 09:42:00',
  },
  {
    alert_id: 'alert-003',
    alert_type: '任务长时间无进展',
    severity: 'warning',
    status: 'open',
    resource_type: 'task',
    resource_id: 'task-0991',
    message: '最近 30 分钟未收到设备状态上报',
    created_at: '2026-04-30 08:55:00',
  },
];

const severityColor: Record<string, string> = {
  critical: 'red',
  warning: 'orange',
  info: 'blue',
};

const statusColor: Record<string, string> = {
  open: 'red',
  acknowledged: 'gold',
  closed: 'green',
};

export function AlertsPage() {
  const columns = [
    { title: '告警类型', dataIndex: 'alert_type', key: 'alert_type' },
    {
      title: '级别',
      dataIndex: 'severity',
      key: 'severity',
      render: (value: string) => <Tag color={severityColor[value]}>{value}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (value: string) => <Tag color={statusColor[value]}>{value}</Tag>,
    },
    { title: '资源类型', dataIndex: 'resource_type', key: 'resource_type' },
    { title: '资源 ID', dataIndex: 'resource_id', key: 'resource_id' },
    { title: '说明', dataIndex: 'message', key: 'message' },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at' },
  ];

  return (
    <div className="ota-page">
      <div>
        <Title level={3} className="ota-page-title">告警中心</Title>
        <Paragraph className="ota-page-subtitle">先把告警列表、状态流转和关联跳转位置做出来，后续再接规则引擎和通知链路。</Paragraph>
      </div>

      <Alert
        type="info"
        showIcon
        message="当前为告警工作台骨架"
        description="已预留确认、关闭和关联资源跳转入口，后续接入真实告警事件和处理审计。"
      />

      <Card className="ota-card">
        <div className="ota-toolbar">
          <div className="ota-toolbar-left">
            <Select
              className="ota-toolbar-control-select"
              defaultValue="all"
              options={[
                { label: '全部级别', value: 'all' },
                { label: 'critical', value: 'critical' },
                { label: 'warning', value: 'warning' },
              ]}
            />
            <Select
              className="ota-toolbar-control-select"
              defaultValue="all"
              options={[
                { label: '全部状态', value: 'all' },
                { label: 'open', value: 'open' },
                { label: 'acknowledged', value: 'acknowledged' },
                { label: 'closed', value: 'closed' },
              ]}
            />
          </div>
          <Space>
            <Button icon={<ReloadOutlined />}>刷新</Button>
            <Button icon={<CheckOutlined />}>批量确认</Button>
            <Button icon={<StopOutlined />}>批量关闭</Button>
          </Space>
        </div>

        <Table
          rowKey="alert_id"
          columns={columns}
          dataSource={alerts}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          scroll={alerts.length > 0 ? { x: 980 } : undefined}
        />
      </Card>

      <div className="ota-section-grid">
        <Card className="ota-card ota-section-span-6" title="后续接口接入点">
          <div className="ota-stack">
            <Text>告警列表查询</Text>
            <Text>确认 / 关闭动作</Text>
            <Text>跳转任务详情 / 设备详情</Text>
          </div>
        </Card>
        <Card className="ota-card ota-section-span-6" title="页面结构已确认">
          <div className="ota-stack">
            <Text>筛选栏</Text>
            <Text>告警表格</Text>
            <Text>批量处理入口</Text>
          </div>
        </Card>
      </div>
    </div>
  );
}