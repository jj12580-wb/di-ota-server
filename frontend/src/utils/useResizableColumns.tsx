import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type HTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type ThHTMLAttributes,
} from 'react';
import type { ColumnType, ColumnsType } from 'antd/es/table';
import type { TableProps } from 'antd';
import { TABLE_COL_WIDTH } from './tableActionColumn';

const MIN_COL_WIDTH = 64;
const DEFAULT_COL_WIDTH = TABLE_COL_WIDTH.text;

type WidthMap = Record<string, number>;

type ResizableHeaderProps = ThHTMLAttributes<HTMLTableCellElement> & {
  width?: number;
  resizable?: boolean;
  onResize?: (width: number) => void;
  children?: ReactNode;
};

function columnKey<T>(column: ColumnType<T>, index: number): string {
  if (column.key != null) return String(column.key);
  if (Array.isArray(column.dataIndex)) return column.dataIndex.join('.');
  if (column.dataIndex != null) return String(column.dataIndex);
  return `col-${index}`;
}

function readStoredWidths(storageKey: string): WidthMap {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: WidthMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value) && value >= MIN_COL_WIDTH) {
        out[key] = Math.round(value);
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeStoredWidths(storageKey: string, widths: WidthMap) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(widths));
  } catch {
    // ignore quota / private mode
  }
}

/** 表头单元格：右侧拖拽条调整列宽 */
export function ResizableHeaderCell({
  width,
  resizable,
  onResize,
  children,
  ...rest
}: ResizableHeaderProps) {
  const startResize = (event: ReactMouseEvent) => {
    if (!resizable || !onResize || typeof width !== 'number') return;
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = width;

    const onMove = (moveEvent: MouseEvent) => {
      const next = Math.max(MIN_COL_WIDTH, Math.round(startWidth + (moveEvent.clientX - startX)));
      onResize(next);
    };
    const onUp = () => {
      document.body.classList.remove('ota-col-resizing');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.body.classList.add('ota-col-resizing');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  if (!resizable || typeof width !== 'number' || !onResize) {
    return <th {...rest}>{children}</th>;
  }

  return (
    <th
      {...rest}
      style={{
        ...(rest.style as HTMLAttributes<HTMLTableCellElement>['style']),
        width,
        position: 'relative',
      }}
    >
      {children}
      <span
        className="ota-table-resize-handle"
        onMouseDown={startResize}
        onClick={(e) => e.stopPropagation()}
      />
    </th>
  );
}

/**
 * 为列表列增加拖拽调宽；宽度写入 localStorage，刷新后保留。
 * 用法：
 *   const { columns, components } = useResizableColumns(baseColumns, 'ota.table.devices');
 *   <Table columns={columns} components={components} scroll={listTableScroll(columns, n)} />
 */
export function useResizableColumns<T extends object>(
  columns: ColumnsType<T>,
  storageKey: string,
): {
  columns: ColumnsType<T>;
  components: NonNullable<TableProps<T>['components']>;
} {
  const [widths, setWidths] = useState<WidthMap>(() => readStoredWidths(storageKey));

  useEffect(() => {
    writeStoredWidths(storageKey, widths);
  }, [storageKey, widths]);

  const setColumnWidth = useCallback((key: string, width: number) => {
    setWidths((prev) => {
      if (prev[key] === width) return prev;
      return { ...prev, [key]: width };
    });
  }, []);

  const mergedColumns = useMemo(() => {
    return columns.map((col, index) => {
      const column = col as ColumnType<T>;
      const key = columnKey(column, index);
      const baseWidth =
        typeof column.width === 'number'
          ? column.width
          : DEFAULT_COL_WIDTH;
      const width = widths[key] ?? baseWidth;
      const prevOnHeaderCell = column.onHeaderCell;

      return {
        ...column,
        width,
        onHeaderCell: (raw: unknown) => {
          const prev =
            typeof prevOnHeaderCell === 'function'
              ? (prevOnHeaderCell as (col: unknown) => Record<string, unknown>)(raw)
              : ((prevOnHeaderCell as Record<string, unknown> | undefined) ?? {});
          return {
            ...prev,
            width,
            resizable: true,
            onResize: (next: number) => setColumnWidth(key, next),
          };
        },
      };
    });
  }, [columns, widths, setColumnWidth]);

  const components = useMemo<NonNullable<TableProps<T>['components']>>(
    () => ({
      header: {
        cell: ResizableHeaderCell,
      },
    }),
    [],
  );

  return { columns: mergedColumns, components };
}
