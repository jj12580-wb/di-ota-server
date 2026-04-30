import { useEffect, useState } from 'react';
import { Breadcrumb, Button, Card, Descriptions, message, Progress, Space, Table, Tag, Typography } from 'antd';
import { useParams, useNavigate } from 'react-router-dom';
import { ReleaseTask, TaskStats, AuditLog, taskAPI } from '../api';

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

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [task, setTask] = useState<ReleaseTask | null>(null);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const navigate = useNavigate();

  const load = async () => {
    if (!id) return;
    try {
      const data = await taskAPI.get(id);
      setTask(data.task);
      setStats(data.stats);
    } catch (e: any) {
      message.error(e.message);
    }
    try {
      const logs = await taskAPI.audits(id);
      setAudits(logs);
    } catch { /* ignore */ }
  };

  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    if (!task || ['Completed', 'RolledBack', 'Failed'].includes(task.state)) return;
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [task]);

  const handleAction = (action: string) => {
    if (!id) return;
    const labels: Record<string, string> = { start: '开始', pause: '暂停', resume: '恢复', terminate: '终止', rollback: '回滚' };
    if (!confirm(`确认${labels[action]}?`)) return;
    taskAPI.action(id, action)
      .then(() => { message.success('操作成功'); load(); })
      .catch((e: any) => message.error(e.message));
  };

  if (!task) return null;

  const failureRate = stats ? parseFloat(stats.failure_rate) * 100 : 0;
  const actions = validActions[task.state] || [];

  const auditColumns = [
    { title: '操作', dataIndex: 'operation_type', width: 100 },
    { title: '操作者', dataIndex: 'operator', width: 100 },
    { title: '时间', dataIndex: 'created_at', render: (v: string) => new Date(v).toLocaleString() },
  ];

  return (
    <div className="ota-page">
      <div>
        <Title level={3} className="ota-page-title">任务详情</Title>
        <Paragraph className="ota-page-subtitle">查看任务状态、统计指标和审计记录。</Paragraph>
      </div>

      <Breadcrumb style={{ marginBottom: 16 }} items={[
        { title: <a onClick={() => navigate('/tasks')}>发布任务</a> },
        { title: task.task_id },
      ]} />

      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <Card title="任务详情" className="ota-card">
          <Descriptions bordered column={{ xs: 1, sm: 2, lg: 3 }}>
            <Descriptions.Item label="任务 ID">{task.task_id}</Descriptions.Item>
            <Descriptions.Item label="状态"><Tag color={stateColor[task.state]}>{task.state}</Tag></Descriptions.Item>
            <Descriptions.Item label="创建时间">{new Date(task.created_at).toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="固件包">{task.package_id}</Descriptions.Item>
            <Descriptions.Item label="目标分组">{task.target_group}</Descriptions.Item>
            <Descriptions.Item label="产品型号">{task.product_model}</Descriptions.Item>
            <Descriptions.Item label="硬件版本">{task.hardware_version}</Descriptions.Item>
            <Descriptions.Item label="失败阈值">{task.failure_threshold}</Descriptions.Item>
          </Descriptions>

          {stats && (
            <div style={{ marginTop: 16 }}>
              <Descriptions title="统计数据" bordered column={{ xs: 1, sm: 2, lg: 4 }}>
                <Descriptions.Item label="设备总数">{stats.total_count}</Descriptions.Item>
                <Descriptions.Item label="成功">{stats.success_count}</Descriptions.Item>
                <Descriptions.Item label="失败">{stats.failed_count}</Descriptions.Item>
                <Descriptions.Item label="失败率">
                  <Progress percent={Math.round(failureRate)} size="small" status={failureRate > parseFloat(task.failure_threshold) * 100 ? 'exception' : 'normal'} />
                </Descriptions.Item>
              </Descriptions>
            </div>
          )}

          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            {actions.map((a) => {
              const labels: Record<string, string> = { start: '开始', pause: '暂停', resume: '恢复', terminate: '终止', rollback: '回滚' };
              const danger = a === 'rollback';
              return <Button key={a} danger={danger} onClick={() => handleAction(a)}>{labels[a]}</Button>;
            })}
            <Button onClick={() => navigate('/tasks')}>返回</Button>
          </div>
        </Card>

        {audits.length > 0 && (
          <Card title="审计日志" className="ota-card">
            <Table columns={auditColumns} dataSource={audits} rowKey="id" pagination={false} size="small" scroll={audits.length > 0 ? { x: 560 } : undefined} />
          </Card>
        )}
      </Space>
    </div>
  );
}
