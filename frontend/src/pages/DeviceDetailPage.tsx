import { Breadcrumb, Button, Card, Descriptions, Space, Table, Tag, Timeline, Typography, message, Spin } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { DeviceSummaryItem } from './mockConsoleData';
import { AMSDeviceItem, deviceAPI } from '../api';

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

export function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();
  const [loading, setLoading] = useState(false);
  const [device, setDevice] = useState<DeviceSummaryItem | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    deviceAPI.list({ page: 1, page_size: 10, keyword: id })
      .then((data) => {
        const matched = (data.items ?? []).find((it) => it.sn === id) ?? data.items?.[0];
        if (!matched) {
          setDevice(null);
          return;
        }
        setDevice(toDeviceSummaryItem(matched));
      })
      .catch((err) => {
        messageApi.error(err instanceof Error ? err.message : '加载设备详情失败');
        setDevice(null);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const upgradeHistory = [
    {
      key: '1',
      task_id: device?.last_task_id ?? '-',
      from_version: device?.current_version ?? '-',
      to_version: device?.target_version ?? '-',
      result: device?.status === 'warning' ? '异常' : '执行中',
      reported_at: device?.last_heartbeat ?? '-',
    },
    {
      key: '2',
      task_id: 'task-0940',
      from_version: '1.1.0',
      to_version: device?.current_version ?? '-',
      result: '成功',
      reported_at: '2026-04-20 11:20:00',
    },
  ];

  return (
    <div className="ota-page">
      {contextHolder}
      <div>
        <Title level={3} className="ota-page-title">设备详情</Title>
        <Paragraph className="ota-page-subtitle">先固定设备详情页的信息编排，后续再接升级历史、心跳详情和异常归因接口。</Paragraph>
      </div>

      <Breadcrumb
        items={[
          { title: <a onClick={() => navigate('/devices')}>设备管理</a> },
          { title: id ?? '-' },
        ]}
      />

      {loading ? (
        <Card className="ota-card">
          <Spin />
        </Card>
      ) : !device ? (
        <Card className="ota-card">
          <Space direction="vertical">
            <Title level={4}>设备不存在</Title>
            <Button onClick={() => navigate('/devices')}>返回设备管理</Button>
          </Space>
        </Card>
      ) : (
      <div className="ota-section-grid">
        <Card className="ota-card ota-section-span-8" title="设备概览">
          <Descriptions bordered column={{ xs: 1, sm: 2 }}>
            <Descriptions.Item label="设备 ID">{device.device_id}</Descriptions.Item>
            <Descriptions.Item label="状态"><Tag color={statusColor[device.status]}>{device.status}</Tag></Descriptions.Item>
            <Descriptions.Item label="产品代码">{device.product_code}</Descriptions.Item>
            <Descriptions.Item label="产品型号">{device.product_model}</Descriptions.Item>
            <Descriptions.Item label="硬件版本">{device.hardware_version}</Descriptions.Item>
            <Descriptions.Item label="数据来源">
              <Tag color={device.data_source === 'external' ? 'purple' : 'blue'}>{device.data_source === 'external' ? '外部系统' : '本地系统'}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="当前版本">{device.current_version}</Descriptions.Item>
            <Descriptions.Item label="目标版本">{device.target_version}</Descriptions.Item>
            <Descriptions.Item label="最后心跳">{device.last_heartbeat}</Descriptions.Item>
            <Descriptions.Item label="最近错误">{device.last_error_code}</Descriptions.Item>
            <Descriptions.Item label="标签" span={2}>
              <Space size={[8, 8]} wrap>
                {device.tags.map((tag) => <span key={tag} className="ota-list-chip">{tag}</span>)}
              </Space>
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card className="ota-card ota-section-span-4" title="运维动作占位">
          <div className="ota-stack">
            <Button type="primary">查看关联任务</Button>
            <Button>加入观察名单</Button>
            <Button danger={device.status === 'warning'}>标记异常已确认</Button>
            <Text type="secondary">后续接入重试、诊断、任务回跳等动作。</Text>
          </div>
        </Card>

        <Card className="ota-card ota-section-span-7" title="升级历史">
          <Table
            rowKey="key"
            dataSource={upgradeHistory}
            pagination={false}
            scroll={upgradeHistory.length > 0 ? { x: 680 } : undefined}
            columns={[
              { title: '任务', dataIndex: 'task_id', key: 'task_id' },
              { title: '起始版本', dataIndex: 'from_version', key: 'from_version' },
              { title: '目标版本', dataIndex: 'to_version', key: 'to_version' },
              { title: '结果', dataIndex: 'result', key: 'result' },
              { title: '上报时间', dataIndex: 'reported_at', key: 'reported_at' },
            ]}
          />
        </Card>

        <Card className="ota-card ota-section-span-5" title="设备时间线">
          <Timeline
            items={[
              { color: 'green', children: `最近心跳 ${device.last_heartbeat}` },
              { color: device.status === 'offline' ? 'red' : 'blue', children: `当前状态 ${device.status}` },
              { color: 'gray', children: '后续接入任务关联、错误详情、诊断记录' },
            ]}
          />
        </Card>
      </div>
      )}
    </div>
  );
}