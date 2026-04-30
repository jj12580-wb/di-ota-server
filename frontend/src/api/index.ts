import api from './client';

export interface APIResponse<T> {
  code: number;
  message: string;
  data: T;
}

export interface Package {
  package_id: string;
  product_code: string;
  version: string;
  file_hash: string;
  signature: string;
  status: string;
  created_at: string;
}

export interface ReleaseTask {
  task_id: string;
  package_id: string;
  target_group: string;
  product_model: string;
  hardware_version: string;
  failure_threshold: string;
  state: string;
  created_at: string;
  canary_percent?: number;
  schedule_time?: string | null;
  force_upgrade?: boolean;
  product_code?: string;
  version?: string;
}

export interface TaskStats {
  task_id: string;
  total_count: number;
  success_count: number;
  failed_count: number;
  failure_rate: string;
  error_distribution: Record<string, unknown>;
  snapshot_time: string;
}

export interface AuditLog {
  id: number;
  trace_id: string;
  operator: string;
  operation_type: string;
  resource_id: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  created_at: string;
}

export interface User {
  user_id: string;
  username: string;
  display_name: string;
  status: 'enabled' | 'disabled';
  auth_source: 'local' | 'sso';
  last_login_at: string | null;
  last_operation_at: string;
  created_at: string;
  updated_at: string;
  roles: string[];
}

export interface CreateUserPayload {
  username: string;
  display_name: string;
  password?: string;
  status?: 'enabled' | 'disabled';
  auth_source?: 'local' | 'sso';
  roles: string[];
}

export interface AMSDeviceItem {
  id: number;
  sn: string;
  name: string;
  is_active: boolean;
  is_online: boolean;
  last_heartbeat: string | null;
  current_firmware_version: string | null;
  current_model_id: number | null;
  mac_addr: string | null;
  location: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  background_image_url?: string | null;
  [key: string]: unknown;
}

export interface AMSDeviceListResponse {
  items: AMSDeviceItem[];
  page: number;
  page_size: number;
  total: number;
}

export interface AMSPlatform {
  id: number;
  name: string;
  code?: string;
  is_active?: boolean;
  [key: string]: unknown;
}

export interface AMSOrganization {
  id: number;
  name: string;
  code?: string;
  platform_id?: number;
  is_active?: boolean;
  [key: string]: unknown;
}

function wrap<T>(promise: Promise<{ data: APIResponse<T> }>): Promise<T> {
  return promise.then((res) => {
    if (res.data.code !== 0) {
      throw new Error(res.data.message);
    }
    return res.data.data;
  });
}

export const authAPI = {
  login: (username: string, password: string) =>
    wrap<{ access_token: string; token_type: string }>(
      api.post('/auth/login', { username, password })
    ),
};

export const userAPI = {
  list: (params?: { limit?: number; offset?: number; search?: string; status?: string; role?: string }) =>
    wrap<{ users: User[]; total: number }>(
      api.get('/users', {
        params: {
          limit: params?.limit ?? 20,
          offset: params?.offset ?? 0,
          search: params?.search ?? '',
          status: params?.status ?? '',
          role: params?.role ?? '',
        },
      })
    ),
  get: (id: string) => wrap<User>(api.get(`/users/${id}`)),
  create: (payload: CreateUserPayload) => wrap<User>(api.post('/users', payload)),
  updateStatus: (id: string, status: 'enabled' | 'disabled') =>
    wrap<User>(api.patch(`/users/${id}/status`, { status })),
  updateRoles: (id: string, roles: string[]) =>
    wrap<User>(api.patch(`/users/${id}/roles`, { roles })),
  resetPassword: (id: string, password: string) =>
    wrap<User>(api.post(`/users/${id}/reset-password`, { password })),
};

export const packageAPI = {
  list: (limit = 20, offset = 0) =>
    wrap<{ packages: Package[]; total: number }>(
      api.get('/packages', { params: { limit, offset } })
    ),
  get: (id: string) => wrap<Package>(api.get(`/packages/${id}`)),
  uploadUrl: (params: { package_id?: string; file_name: string; content_type: string; file_hash?: string }) =>
    wrap<{ package_id: string; upload_url: string; object_key: string; expires_at: number; required_headers: Record<string, string> }>(
      api.post('/packages/upload-url', params)
    ),
  complete: (params: { package_id: string; product_code: string; version: string; file_hash: string; signature: string; file_size: number }) =>
    wrap<Package>(api.post('/packages/complete', params)),
  updateStatus: (id: string, status: string) =>
    wrap<Package>(api.patch(`/packages/${id}/status`, { status })),
};

export const taskAPI = {
  list: (limit = 20, offset = 0) =>
    wrap<ReleaseTask[]>(
      api.get('/release-tasks', { params: { limit, offset } })
    ),
  get: (id: string) =>
    wrap<{ task: ReleaseTask; stats: TaskStats | null }>(
      api.get(`/release-tasks/${id}`)
    ),
  create: (params: {
    package_id: string;
    group: string;
    product_model: string;
    hardware_version: string;
    failure_threshold?: number;
    canary_percent?: number;
    schedule_time?: string;
    force_upgrade?: boolean;
    start_now?: boolean;
  }) =>
    wrap<ReleaseTask>(api.post('/release-tasks', params)),
  action: (id: string, action: string, reason?: string) =>
    wrap<{ task: ReleaseTask; audit_log: AuditLog }>(
      api.post(`/release-tasks/${id}/actions`, { action, reason })
    ),
  audits: (id: string) => wrap<AuditLog[]>(api.get(`/release-tasks/${id}/audits`)),
};

export const deviceAPI = {
  list: (params?: { page?: number; page_size?: number; keyword?: string; search?: string; platform_id?: number; org_id?: number }) =>
    wrap<AMSDeviceListResponse>(
      api.get('/devices', {
        params: {
          page: params?.page ?? 1,
          page_size: params?.page_size ?? 10,
          keyword: params?.keyword ?? '',
          platform_id: params?.platform_id,
          org_id: params?.org_id,
          // legacy
          search: params?.search ?? '',
        },
      })
    ),
};

export const platformAPI = {
  list: () => wrap<AMSPlatform[]>(api.get('/platforms')),
};

export const organizationAPI = {
  list: () => wrap<AMSOrganization[]>(api.get('/organizations')),
};

export const dashboardAPI = {
  overview: () => {
    return Promise.all([
      taskAPI.list(100, 0),
      packageAPI.list(1, 0),
    ]).then(([tasks, pkg]) => ({
      tasks,
      totalPackages: pkg.total,
    }));
  },
};
