import { useEffect, useMemo, useState } from 'react';
import { Card, Col, Row, Statistic, Table, Tag, Spin } from 'antd';
import { useNavigate } from 'react-router-dom';
import { dashboardAPI, ReleaseTask } from '../api';
import { listTableProps, listTableScroll } from '../utils/tableActionColumn';
import { tableIdLinkColumn } from '../utils/tableIdLinkColumn';
import { tableEllipsisColumn, tableEllipsisRenderColumn, tableCompactColumn } from '../utils/tableEllipsisColumn';
import { useResizableColumns } from '../utils/useResizableColumns';

const stateColor: Record<string, string> = {
  Running: 'blue',
  Paused: 'orange',
  Completed: 'green',
  RolledBack: 'red',
  Failed: 'red',
};

export function DashboardPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<ReleaseTask[]>([]);
  const [totalPackages, setTotalPackages] = useState(0);

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

  const baseColumns = useMemo(
    () => [
      tableIdLinkColumn<ReleaseTask>('任务', 'task_id', (id) => navigate(`/tasks/${id}`)),
      tableEllipsisColumn<ReleaseTask>('固件包别名', 'package_alias', {
        render: (v) => (v ? String(v) : '—'),
      }),
      tableEllipsisRenderColumn<ReleaseTask>('产品', 'product', (r) => `${r.product_code ?? r.package_id} v${r.version ?? '-'}`),
      tableEllipsisColumn<ReleaseTask>('分组', 'target_group'),
      tableCompactColumn<ReleaseTask>('状态', 'state', (v: string) => <Tag color={stateColor[v]}>{v}</Tag>, 'state'),
      tableEllipsisColumn<ReleaseTask>('创建时间', 'created_at', {
        size: 'date',
        render: (v) => new Date(String(v)).toLocaleString(),
      }),
    ],
    [navigate],
  );
  const { columns, components: tableComponents } = useResizableColumns(baseColumns, 'ota.table.dashboard');

  if (loading) return <Spin />;

  return (
    <div className="ota-page ota-page-fill">
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
        <Table
          {...listTableProps}
          columns={columns}
          components={tableComponents}
          dataSource={tasks.slice(0, 10)}
          pagination={false}
          rowKey="task_id"
          scroll={listTableScroll(columns, tasks.length)}
        />
      </Card>
    </div>
  );
}
