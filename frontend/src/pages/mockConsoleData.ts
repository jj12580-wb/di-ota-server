export interface DeviceSummaryItem {
  device_id: string;
  product_code: string;
  product_model: string;
  hardware_version: string;
  current_version: string;
  target_version: string;
  status: 'online' | 'warning' | 'offline';
  last_heartbeat: string;
  last_error_code: string;
  data_source: 'local' | 'external';
  tags: string[];
  last_task_id: string;
}

export const mockDevices: DeviceSummaryItem[] = [
  {
    device_id: 'dev-001',
    product_code: 'GW-A1',
    product_model: 'Gateway-A1',
    hardware_version: 'A1.2',
    current_version: '1.2.3',
    target_version: '1.3.0',
    status: 'online',
    last_heartbeat: '2026-04-30 10:25:00',
    last_error_code: '-',
    data_source: 'local',
    tags: ['核心机房', '华东'],
    last_task_id: 'task-1001',
  },
  {
    device_id: 'dev-204',
    product_code: 'BOX-C9',
    product_model: 'Box-C9',
    hardware_version: 'C9.0',
    current_version: '3.1.0',
    target_version: '3.1.4',
    status: 'warning',
    last_heartbeat: '2026-04-30 09:58:00',
    last_error_code: 'DOWNLOAD_TIMEOUT',
    data_source: 'external',
    tags: ['门店', '南区'],
    last_task_id: 'task-0998',
  },
  {
    device_id: 'dev-389',
    product_code: 'GW-A1',
    product_model: 'Gateway-A1',
    hardware_version: 'A1.1',
    current_version: '1.1.8',
    target_version: '1.3.0',
    status: 'offline',
    last_heartbeat: '2026-04-29 22:12:00',
    last_error_code: 'HEARTBEAT_LOST',
    data_source: 'external',
    tags: ['仓储', '离线观察'],
    last_task_id: 'task-0991',
  },
];