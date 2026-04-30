import { useEffect, useState } from 'react';
import { Alert, Card, Col, Row, Statistic, Table, Tag, Spin, Typography } from 'antd';
import { dashboardAPI, ReleaseTask } from '../api';
import useAuthStore from '../stores/authStore';

const { Paragraph, Title } = Typography;

const stateColor: Record<string, string> = {
  Running: 'blue',
  Paused: 'orange',
  Completed: 'green',
  RolledBack: 'red',
  Failed: 'red',
};

export function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<ReleaseTask[]>([]);
  const [totalPackages, setTotalPackages] = useState(0);
  const hasExternalAccess = useAuthStore((s) => s.hasExternalAccess);

  const load = async () => {
    try {
      const data = await dashboardAPI.overview();
      setTasks(data.tasks);
      setTotalPackages(data.totalPackages);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const running = tasks.filter((t) => t.state === 'Running').length;
  const completed = tasks.filter((t) => t.state === 'Completed').length;

  const columns = [
    { title: '任务', dataIndex: 'task_id', key: 'task_id' },
    { title: '产品', key: 'product', render: (_: unknown, r: ReleaseTask) => `${r.product_code ?? r.package_id} v${r.version ?? '-'}` },
    { title: '分组', dataIndex: 'target_group', key: 'target_group' },
    { title: '状态', dataIndex: 'state', key: 'state', render: (v: string) => <Tag color={stateColor[v]}>{v}</Tag> },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', render: (v: string) => new Date(v).toLocaleString() },
  ];

  if (loading) return <Spin />;

  return (
    <div className="ota-page">
      <div>
        <Title level={3} className="ota-page-title">运行总览</Title>
        <Paragraph className="ota-page-subtitle">聚焦发布节奏、任务状态与包规模，支持快速巡检。</Paragraph>
      </div>

      <Alert
        type={hasExternalAccess ? 'success' : 'warning'}
        showIcon
        message={hasExternalAccess ? '外部系统授权可用' : '外部系统授权未接入'}
        description={hasExternalAccess ? '看板中的外部聚合指标可正常加载。' : '涉及外部系统的指标位已预留，当前仅展示本地系统数据。'}
      />

      <Row gutter={[16, 16]} className="ota-kpi">
        <Col xs={24} md={8}>
          <Card className="ota-card"><Statistic title="固件包总数" value={totalPackages} /></Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="ota-card"><Statistic title="运行中任务" value={running} /></Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="ota-card"><Statistic title="已完成任务" value={completed} /></Card>
        </Col>
      </Row>

      <Card title="最近任务" className="ota-card">
        <Table columns={columns} dataSource={tasks.slice(0, 10)} pagination={false} rowKey="task_id" size="middle" scroll={tasks.length > 0 ? { x: 760 } : undefined} />
      </Card>
    </div>
  );
}
