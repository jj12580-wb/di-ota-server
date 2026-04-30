import { Button, Card, Input, Select, Space, Table, Tag, Typography, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import type { TablePaginationConfig } from 'antd/es/table';
import { DeviceGroupListItem, Package, ReleaseTask, deviceGroupAPI, packageAPI, taskAPI, upgradeAPI, UpgradeRecordItem } from '../api';

const { Title, Paragraph, Text } = Typography;

const statusLabel: Record<string, { label: string; color: string }> = {
  Pending: { label: '接受指令', color: 'blue' },
  Downloading: { label: '开始下载', color: 'orange' },
  Downloaded: { label: '下载完成', color: 'cyan' },
  Upgrading: { label: '升级中', color: 'geekblue' },
  Success: { label: '升级完成', color: 'green' },
  Failed: { label: '失败', color: 'red' },
  RolledBack: { label: '已回滚', color: 'red' },
};

export function UpgradeRecordsPage() {
  const [messageApi, contextHolder] = message.useMessage();
  const [loading, setLoading] = useState(false);

  const [tasks, setTasks] = useState<ReleaseTask[]>([]);
  const [groups, setGroups] = useState<DeviceGroupListItem[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);

  const [taskId, setTaskId] = useState<string | undefined>(undefined);
  const [groupCode, setGroupCode] = useState<string | undefined>(undefined);
  const [packageId, setPackageId] = useState<string | undefined>(undefined);
  const [version, setVersion] = useState<string>('');
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [deviceId, setDeviceId] = useState<string>('');
  const [deviceName, setDeviceName] = useState<string>('');

  const [items, setItems] = useState<UpgradeRecordItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const versionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of packages) {
      if (p.version) set.add(p.version);
    }
    return Array.from(set).sort().reverse();
  }, [packages]);

  async function loadMeta() {
    try {
      const [t, g, p] = await Promise.all([
        taskAPI.list(200, 0),
        deviceGroupAPI.list({ limit: 200, offset: 0 }).then((d) => d.items ?? []),
        packageAPI.list(200, 0).then((d) => d.packages ?? []),
      ]);
      setTasks(t ?? []);
      setGroups(g ?? []);
      setPackages(p ?? []);
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '加载筛选项失败');
    }
  }

  async function load(next?: { page?: number; pageSize?: number }) {
    const p = next?.page ?? page;
    const ps = next?.pageSize ?? pageSize;
    setLoading(true);
    try {
      const data = await upgradeAPI.list({
        limit: ps,
        offset: (p - 1) * ps,
        task_id: taskId,
        group: groupCode,
        package_id: packageId,
        version: version.trim(),
        status,
        device_id: deviceId.trim(),
        device_name: deviceName.trim(),
      });
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      setPage(p);
      setPageSize(ps);
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '加载升级记录失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMeta().finally(() => load({ page: 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function reset() {
    setTaskId(undefined);
    setGroupCode(undefined);
    setPackageId(undefined);
    setVersion('');
    setStatus(undefined);
    setDeviceId('');
    setDeviceName('');
    load({ page: 1 });
  }

  const tableScrollX = 1620;

  const headerCell = (label: string, control?: React.ReactNode) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span>{label}</span>
      {control ? <div onClick={(e) => e.stopPropagation()}>{control}</div> : null}
    </div>
  );

  return (
    <div className="ota-page">
      {contextHolder}
      <div>
        <Title level={3} className="ota-page-title">升级记录</Title>
        <Paragraph className="ota-page-subtitle">查看所有设备升级过程记录，支持按任务/设备/分组/固件筛选与设备名称搜索。</Paragraph>
      </div>

      <Card className="ota-card">
        <Space style={{ marginBottom: 12 }} wrap>
          <Button type="primary" onClick={() => load({ page: 1 })} loading={loading}>查询</Button>
          <Button onClick={reset}>重置</Button>
          <Text type="secondary">共 {total} 条</Text>
        </Space>

        <Table
          rowKey="id"
          loading={loading}
          dataSource={items}
          columns={[
            {
              title: headerCell('设备名称', (
                <Input
                  size="small"
                  placeholder="搜索"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  onPressEnter={() => load({ page: 1 })}
                  allowClear
                />
              )),
              dataIndex: 'device_name',
              key: 'device_name',
              width: 220,
              render: (v: string) => v || '-',
            },
            {
              title: headerCell('设备序列号', (
                <Input
                  size="small"
                  placeholder="SN"
                  value={deviceId}
                  onChange={(e) => setDeviceId(e.target.value)}
                  onPressEnter={() => load({ page: 1 })}
                  allowClear
                />
              )),
              dataIndex: 'device_id',
              key: 'device_id',
              width: 220,
            },
            {
              title: headerCell('任务ID', (
                <Select
                  size="small"
                  allowClear
                  placeholder="选择"
                  value={taskId}
                  options={tasks.map((t) => ({ value: t.task_id, label: t.task_id }))}
                  onChange={(v) => setTaskId(v)}
                />
              )),
              dataIndex: 'task_id',
              key: 'task_id',
              width: 160,
            },
            {
              title: headerCell('固件包ID', (
                <Select
                  size="small"
                  allowClear
                  placeholder="选择"
                  value={packageId}
                  options={packages.map((p) => ({ value: p.package_id, label: `${p.product_code} v${p.version}` }))}
                  onChange={(v) => setPackageId(v)}
                />
              )),
              dataIndex: 'package_id',
              key: 'package_id',
              width: 180,
            },
            {
              title: headerCell('固件版本', (
                <Select
                  size="small"
                  allowClear
                  placeholder="选择"
                  value={version || undefined}
                  options={versionOptions.map((v) => ({ value: v, label: v }))}
                  onChange={(v) => setVersion(v ?? '')}
                />
              )),
              dataIndex: 'version',
              key: 'version',
              width: 120,
            },
            { title: '升级时间', dataIndex: 'upgrade_time', key: 'upgrade_time', width: 180 },
            {
              title: headerCell('升级状态', (
                <Select
                  size="small"
                  allowClear
                  placeholder="选择"
                  value={status}
                  options={Object.entries(statusLabel).map(([k, v]) => ({ value: k, label: v.label }))}
                  onChange={(v) => setStatus(v)}
                />
              )),
              dataIndex: 'status',
              key: 'status',
              width: 220,
              render: (v: string) => {
                const m = statusLabel[v] ?? { label: v || '-', color: 'default' };
                return <Tag color={m.color}>{m.label}</Tag>;
              },
            },
            {
              title: headerCell('所属分组', (
                <Select
                  size="small"
                  allowClear
                  placeholder="选择"
                  value={groupCode}
                  options={groups.map((g) => ({ value: g.group_code, label: g.group_name }))}
                  onChange={(v) => setGroupCode(v)}
                />
              )),
              key: 'group',
              width: 320,
              render: (_: unknown, r: UpgradeRecordItem) => r.group_name ? `${r.group_name} (${r.group})` : (r.group || '-'),
            },
          ]}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            onChange: (p, ps) => load({ page: p, pageSize: ps ?? pageSize }),
          } as TablePaginationConfig}
          scroll={items.length > 0 ? { x: tableScrollX } : undefined}
        />
      </Card>
    </div>
  );
}

