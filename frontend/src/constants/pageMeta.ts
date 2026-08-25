export type PageMeta = { title: string; subtitle: string };

const LIST_META: Record<string, PageMeta> = {
  '/dashboard': {
    title: '运行总览',
    subtitle: '聚焦发布节奏、任务状态与包规模，支持快速巡检。',
  },
  '/users': {
    title: '用户管理',
    subtitle: '统一管理系统账号、角色和可用状态。',
  },
  '/devices': {
    title: '设备管理',
    subtitle: '通过 CSV 导入第三方设备清单，作为 OTA 任务选设备的影子目录。',
  },
  '/device-secrets': {
    title: '设备 Secret 管理',
    subtitle: '独立 provision device_secret（secret_admin）；与设备目录 CSV 权限分离。',
  },
  '/alerts': {
    title: '告警中心',
    subtitle: '任务熔断与设备升级异常事件，支持确认与关闭。',
  },
  '/packages': {
    title: '固件包管理',
    subtitle: '上传、查看和下架发布包，保证版本流转可追踪。',
  },
  '/tasks': {
    title: '任务中心',
    subtitle: '配置灰度策略与执行窗口，实时控制任务流转。',
  },
  '/upgrade-policy': {
    title: '升级策略',
    subtitle: '按产品型号配置 report-status 宽松/严格模式（默认宽松）。',
  },
};

const DETAIL_META: Record<string, PageMeta> = {
  users: {
    title: '用户详情',
    subtitle: '查看账号信息、角色配置和最近操作状态。',
  },
  devices: {
    title: '设备详情',
    subtitle: '设备注册表信息、目录冲突标记与 OTA 升级历史。',
  },
  packages: {
    title: '固件包详情',
    subtitle: '查看包元数据与发布状态，快速判断可用性。',
  },
  tasks: {
    title: '任务详情',
    subtitle: '查看任务状态、统计指标和审计记录。',
  },
};

export function menuKeyForPath(pathname: string): string {
  if (pathname.startsWith('/users')) return '/users';
  if (pathname.startsWith('/device-secrets')) return '/device-secrets';
  if (pathname.startsWith('/devices')) return '/devices';
  if (pathname.startsWith('/packages')) return '/packages';
  if (pathname.startsWith('/tasks')) return '/tasks';
  if (pathname.startsWith('/alerts')) return '/alerts';
  if (pathname.startsWith('/upgrade-policy')) return '/upgrade-policy';
  return pathname === '/' ? '/dashboard' : pathname;
}

export function pageMetaForPath(pathname: string): PageMeta {
  if (/^\/users\/[^/]+/.test(pathname)) return DETAIL_META.users;
  if (/^\/devices\/[^/]+/.test(pathname)) return DETAIL_META.devices;
  if (/^\/packages\/[^/]+/.test(pathname)) return DETAIL_META.packages;
  if (/^\/tasks\/[^/]+/.test(pathname)) return DETAIL_META.tasks;
  return LIST_META[menuKeyForPath(pathname)] ?? LIST_META['/dashboard'];
}
