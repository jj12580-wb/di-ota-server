import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Select, Space, Table, Tag, message } from 'antd';
import { CheckOutlined, ReloadOutlined, StopOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { AlertItem, alertAPI } from '../api';
import { listTableProps, listTableScroll, serverTablePagination, TABLE_COL_WIDTH } from '../utils/tableActionColumn';
import { tableIdLinkRenderColumn } from '../utils/tableIdLinkColumn';
import { tableEllipsisColumn, tableCompactColumn } from '../utils/tableEllipsisColumn';
import { useResizableColumns } from '../utils/useResizableColumns';

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
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const load = async () => {
    setLoading(true);
    try {
      const data = await alertAPI.list({
        limit: pageSize,
        offset: (page - 1) * pageSize,
        status: statusFilter,
        severity: severityFilter,
      });
      setAlerts(data.alerts);
      setTotal(data.total);
      setSelected([]);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '加载告警失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [page, statusFilter, severityFilter, pageSize]);

  const runAction = async (action: 'acknowledge' | 'close') => {
    if (selected.length === 0) {
      message.warning('请先选择告警');
      return;
    }
    try {
      const res = await alertAPI.batchAction(action, selected);
      message.success(`已更新 ${res.updated} 条告警`);
      await load();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  const baseColumns = useMemo(
    () => [
      tableEllipsisColumn<AlertItem>('告警类型', 'alert_type'),
      tableCompactColumn<AlertItem>('级别', 'severity', (value: string) => <Tag color={severityColor[value]}>{value}</Tag>, 'severity'),
      tableCompactColumn<AlertItem>('状态', 'status', (value: string) => <Tag color={statusColor[value]}>{value}</Tag>, 'status'),
      tableIdLinkRenderColumn<AlertItem>(
        '资源',
        'resource',
        (r) => `${r.resource_type}/${r.resource_id}`,
        (r) => {
          if (r.resource_type === 'task') navigate(`/tasks/${r.resource_id}`);
          else if (r.resource_type === 'device') navigate(`/devices/${r.resource_id}`);
        },
      ),
      tableEllipsisColumn<AlertItem>('说明', 'message', { size: 'detail' }),
      tableEllipsisColumn<AlertItem>('创建时间', 'created_at', {
        size: 'date',
        render: (v) => new Date(String(v)).toLocaleString(),
      }),
    ],
    [navigate],
  );
  const { columns, components: tableComponents } = useResizableColumns(baseColumns, 'ota.table.alerts');

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
            <Select
              className="ota-toolbar-control-select"
              allowClear
              placeholder="全部状态"
              value={statusFilter || undefined}
              options={[
                { label: 'open', value: 'open' },
                { label: 'acknowledged', value: 'acknowledged' },
                { label: 'closed', value: 'closed' },
              ]}
              onChange={(v) => { setStatusFilter(v ?? ''); setPage(1); }}
            />
            <Select
              className="ota-toolbar-control-select"
              allowClear
              placeholder="全部级别"
              value={severityFilter || undefined}
              options={[
                { label: 'critical', value: 'critical' },
                { label: 'warning', value: 'warning' },
                { label: 'info', value: 'info' },
              ]}
              onChange={(v) => { setSeverityFilter(v ?? ''); setPage(1); }}
            />
          </div>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
            <Button icon={<CheckOutlined />} onClick={() => void runAction('acknowledge')}>批量确认</Button>
            <Button icon={<StopOutlined />} onClick={() => void runAction('close')}>批量关闭</Button>
          </Space>
        </div>

        <Table
          {...listTableProps}
          rowKey="alert_id"
          rowSelection={{ selectedRowKeys: selected, onChange: (keys) => setSelected(keys as string[]) }}
          columns={columns}
          components={tableComponents}
          dataSource={alerts}
          loading={loading}
          pagination={serverTablePagination(page, pageSize, total, handlePageChange)}
          scroll={listTableScroll(columns, alerts.length, TABLE_COL_WIDTH.selection)}
          locale={{ emptyText: '暂无告警事件' }}
        />
      </Card>
    </div>
  );
}
