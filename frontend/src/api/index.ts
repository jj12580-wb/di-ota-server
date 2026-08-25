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
  alias?: string;
  name?: string;
}

export interface ReleaseTask {
  task_id: string;
  package_id: string;
  package_alias?: string;
  device_id?: string;
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

export interface DeviceCatalogItem {
  device_id: string;
  device_group: string;
  product_model: string;
  hardware_version: string;
  current_version: string;
  reported_version?: string;
  catalog_version?: string;
  eligibility_state?: string;
  catalog_source?: string;
  product_code: string;
  last_heartbeat?: string;
  tags: Record<string, unknown>;
  inconsistency_flags?: string[];
  registered_at: string;
  secret_provisioned?: boolean;
}

export interface UpgradeRecord {
  id: number;
  device_id: string;
  task_id: string;
  status: string;
  source_version: string;
  target_version: string;
  error_code?: string;
  created_at: string;
}

export interface DeviceListParams {
  limit?: number;
  offset?: number;
  search?: string;
  group?: string;
  product_model?: string;
  tag?: string;
  eligibility_state?: string;
  abnormal?: boolean;
}

export interface DeviceCSVImportResult {
  total_rows: number;
  imported_count: number;
  failed_count: number;
  errors: Array<{ row: number; message: string }>;
}

export interface CreateUserPayload {
  username: string;
  display_name: string;
  password?: string;
  status?: 'enabled' | 'disabled';
  auth_source?: 'local' | 'sso';
  roles: string[];
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
  complete: (params: { package_id: string; product_code: string; version: string; file_hash: string; signature: string; file_size: number; alias?: string }) =>
    wrap<Package>(api.post('/packages/complete', params)),
  updateStatus: (id: string, status: string) =>
    wrap<Package>(api.patch(`/packages/${id}/status`, { status })),
  updateAlias: (id: string, alias: string) =>
    wrap<Package>(api.patch(`/packages/${id}/alias`, { alias })),
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
    device_id?: string;
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
  list: (params: DeviceListParams = {}) =>
    wrap<{ devices: DeviceCatalogItem[]; total: number }>(
      api.get('/devices', {
        params: {
          limit: params.limit ?? 20,
          offset: params.offset ?? 0,
          search: params.search ?? '',
          group: params.group ?? '',
          product_model: params.product_model ?? '',
          tag: params.tag ?? '',
          eligibility_state: params.eligibility_state ?? '',
          abnormal: params.abnormal ? 'true' : '',
        },
      })
    ),
  get: (id: string) => wrap<DeviceCatalogItem>(api.get(`/devices/${id}`)),
  upgradeRecords: (id: string, limit = 50) =>
    wrap<{ records: UpgradeRecord[] }>(
      api.get(`/devices/${id}/upgrade-records`, { params: { limit } })
    ),
  importCSV: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return wrap<DeviceCSVImportResult>(
      api.post('/devices/import-csv', form)
    );
  },
  downloadTemplate: () => api.get('/devices/csv-template', { responseType: 'blob' }),
  create: (payload: DeviceUpsertPayload) =>
    wrap<DeviceCatalogItem>(api.post('/devices', payload)),
  update: (id: string, payload: Omit<DeviceUpsertPayload, 'device_id'>) =>
    wrap<DeviceCatalogItem>(api.put(`/devices/${id}`, payload)),
};

export interface DeviceUpsertPayload {
  device_id: string;
  product_code?: string;
  product_model: string;
  hardware_version: string;
  current_version?: string;
  device_group?: string;
  tags?: Record<string, unknown>;
}

export interface DeviceSecretCSVImportResult {
  total_rows: number;
  imported_count: number;
  failed_count: number;
  errors: Array<{ row: number; message: string }>;
}

export const deviceSecretAPI = {
  setSecret: (id: string, deviceSecret: string) =>
    wrap<{ device_id: string; provisioned: boolean }>(
      api.put(`/devices/${id}/device-secret`, { device_secret: deviceSecret })
    ),
  importCSV: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return wrap<DeviceSecretCSVImportResult>(api.post('/device-secrets/import-csv', form));
  },
  downloadTemplate: () => api.get('/device-secrets/csv-template', { responseType: 'blob' }),
};

export interface AlertItem {
  alert_id: string;
  alert_type: string;
  severity: string;
  status: string;
  resource_type: string;
  resource_id: string;
  message: string;
  detail?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export const alertAPI = {
  list: (params?: { limit?: number; offset?: number; status?: string; severity?: string }) =>
    wrap<{ alerts: AlertItem[]; total: number }>(
      api.get('/alerts', {
        params: {
          limit: params?.limit ?? 20,
          offset: params?.offset ?? 0,
          status: params?.status ?? '',
          severity: params?.severity ?? '',
        },
      })
    ),
  batchAction: (action: 'acknowledge' | 'close', alertIds: string[]) =>
    wrap<{ updated: number }>(api.post('/alerts/actions', { action, alert_ids: alertIds })),
};

export interface ProductModelPolicy {
  product_model: string;
  report_status_mode: 'relaxed' | 'strict' | string;
  updated_at?: string | null;
  updated_by?: string;
  explicit?: boolean;
}

export interface UpgradePolicy {
  policy_id: string;
  device_id?: string;
  product_code?: string;
  product_model?: string;
  hardware_version?: string;
  device_group?: string;
  current_version?: string;
  report_status_mode: 'relaxed' | 'strict' | string;
  created_at?: string | null;
  updated_at?: string | null;
  updated_by?: string;
}

export type UpgradePolicyInput = {
  device_id?: string;
  product_code?: string;
  product_model?: string;
  hardware_version?: string;
  device_group?: string;
  current_version?: string;
  report_status_mode: string;
};

export const productModelPolicyAPI = {
  list: () =>
    wrap<{ default_mode: string; policies: ProductModelPolicy[] }>(
      api.get('/product-model-policies')
    ),
  update: (productModel: string, reportStatusMode: string) =>
    wrap<ProductModelPolicy>(
      api.put(`/product-model-policies/${encodeURIComponent(productModel)}`, {
        report_status_mode: reportStatusMode,
      })
    ),
};

export const upgradePolicyAPI = {
  list: () =>
    wrap<{ default_mode: string; policies: UpgradePolicy[] }>(
      api.get('/upgrade-policies')
    ),
  create: (payload: UpgradePolicyInput) =>
    wrap<UpgradePolicy>(api.post('/upgrade-policies', payload)),
  update: (policyId: string, payload: UpgradePolicyInput) =>
    wrap<UpgradePolicy>(api.put(`/upgrade-policies/${encodeURIComponent(policyId)}`, payload)),
  remove: (policyId: string) =>
    wrap<unknown>(api.delete(`/upgrade-policies/${encodeURIComponent(policyId)}`)),
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
