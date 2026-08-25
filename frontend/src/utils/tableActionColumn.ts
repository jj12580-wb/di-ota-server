import type { ColumnType } from 'antd/es/table';
import type { TableProps } from 'antd';

const FIXED_ACTION_CLASS = 'ota-table-fixed-col';

/** 列宽预设：集中定义，页面不再散落写像素 */
export const TABLE_COL_WIDTH = {
  id: 220,
  text: 112,
  wide: 160,
  detail: 200,
  date: 168,
  tag: 96,
  selection: 48,
} as const;

export type TableActionColumnOptions = {
  /** 该表可能出现的操作按钮文案，用于估算列宽 */
  actionLabels: string[];
  /** 同一行最多并排几个按钮（如任务页最多 3 个） */
  maxButtonsPerRow?: number;
};

/** 按按钮文案估算冻结操作列宽度（Ant Design 冻结列仍需数值 width） */
export function measureActionColumnWidth(options: TableActionColumnOptions): number {
  const { actionLabels, maxButtonsPerRow } = options;
  if (actionLabels.length === 0) {
    return 88;
  }
  const charPx = 13;
  const btnPad = 10;
  const gap = 4;
  const cellPad = 16;
  const perRow = Math.min(maxButtonsPerRow ?? actionLabels.length, actionLabels.length);
  const row = [...actionLabels].sort((a, b) => b.length - a.length).slice(0, perRow);
  const content = row.reduce(
    (sum, label, index) => sum + label.length * charPx + btnPad + (index > 0 ? gap : 0),
    0,
  );
  return Math.max(72, Math.ceil(content + cellPad));
}

export function tableActionColumn<T>(
  render: NonNullable<ColumnType<T>['render']>,
  options: TableActionColumnOptions,
): ColumnType<T> {
  return {
    title: '操作',
    key: 'actions',
    width: measureActionColumnWidth(options),
    fixed: 'right',
    align: 'center',
    className: FIXED_ACTION_CLASS,
    onHeaderCell: () => ({ className: FIXED_ACTION_CLASS }),
    onCell: () => ({ className: FIXED_ACTION_CLASS }),
    render,
  };
}

/** 根据列定义估算横向滚动宽度，保证冻结操作列生效 */
export function measureTableScrollX(columns: readonly { width?: number | string }[]): number {
  let total = 0;
  for (const col of columns) {
    if (typeof col.width === 'number') {
      total += col.width;
    } else {
      total += TABLE_COL_WIDTH.text;
    }
  }
  return Math.max(720, total + 32);
}

/** 带冻结列的列表表格：fixed 布局 + 列宽约束，ellipsis 才能生效 */
export const listTableProps: Pick<TableProps, 'size' | 'tableLayout' | 'className'> = {
  size: 'middle',
  tableLayout: 'fixed',
  className: 'ota-list-table',
};

export function listTableScroll<T>(
  columns: readonly ColumnType<T>[],
  rowCount: number,
  extraWidth = 0,
): TableProps['scroll'] {
  if (rowCount <= 0) return undefined;
  return {
    x: measureTableScrollX(columns) + extraWidth,
    y: 'calc(100vh - 280px)',
  };
}

/** 列表页统一分页：10 / 20 / 50，默认 50，底部展示共 N 条 */
export const LIST_PAGE_SIZE_OPTIONS = ['10', '20', '50'] as const;
export const LIST_DEFAULT_PAGE_SIZE = 50;

/** 服务端分页列表通用配置 */
export function serverTablePagination(
  page: number,
  pageSize: number,
  total: number,
  onChange: (page: number, nextPageSize?: number) => void,
  options?: {
    pageSizeOptions?: Array<string | number>;
    showSizeChanger?: boolean;
  },
): NonNullable<TableProps['pagination']> {
  const showSizeChanger = options?.showSizeChanger ?? true;
  return {
    current: page,
    pageSize,
    total,
    showSizeChanger,
    pageSizeOptions: options?.pageSizeOptions ?? [...LIST_PAGE_SIZE_OPTIONS],
    showTotal: (n) => `共 ${n} 条`,
    position: ['bottomRight'],
    onChange,
    onShowSizeChange: showSizeChanger
      ? (_current, size) => onChange(1, size)
      : undefined,
  };
}

/** 客户端分页列表通用配置 */
export function clientTablePagination(
  pageSize = LIST_DEFAULT_PAGE_SIZE,
  options?: {
    pageSizeOptions?: Array<string | number>;
    showSizeChanger?: boolean;
  },
): NonNullable<TableProps['pagination']> {
  const showSizeChanger = options?.showSizeChanger ?? true;
  return {
    pageSize,
    showSizeChanger,
    pageSizeOptions: options?.pageSizeOptions ?? [...LIST_PAGE_SIZE_OPTIONS],
    showTotal: (n) => `共 ${n} 条`,
    position: ['bottomRight'],
  };
}
