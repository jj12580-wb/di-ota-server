export type DeviceConfig = {
  deviceId: string;
  currentVersion: string;
  deviceSecret: string;
};

type ApiEnvelope<T = unknown> = {
  code: number;
  message: string;
  data: T;
};

export type CheckUpdateData = {
  has_update?: boolean;
  task_id?: string;
  target_version?: string;
  download_url?: string;
  reason?: string;
  retry_after_sec?: number;
  current_version?: string;
};

class DeviceApiError extends Error {
  code: number;
  data?: Record<string, unknown>;

  constructor(code: number, message: string, data?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

function formatDeviceApiError(parsed: ApiEnvelope): DeviceApiError {
  const data = parsed.data as Record<string, unknown> | undefined;
  if (parsed.code === 2005 && data?.previous && data?.current) {
    return new DeviceApiError(
      parsed.code,
      `该任务当前状态为 ${data.previous}，无法回退上报 ${data.current}。请在任务中心新建任务，或更换 device_id 后重试。`,
      data,
    );
  }
  return new DeviceApiError(parsed.code, `code=${parsed.code} ${parsed.message}`, data);
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSha256Base64Url(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const bytes = new Uint8Array(sig);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function buildDeviceAuthHeader(
  deviceId: string,
  secret: string,
  method: string,
  apiPath: string,
  body: string,
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const bodyHash = await sha256Hex(body);
  const payload = `${timestamp}\n${method.toUpperCase()}\n${apiPath}\n${bodyHash}`;
  const signature = await hmacSha256Base64Url(secret, payload);
  return `Device device_id=${deviceId},timestamp=${timestamp},signature=${signature}`;
}

const deviceFetchPath = (suffix: string) =>
  `${import.meta.env.BASE_URL}device/v1${suffix}`.replace(/\/{2,}/g, '/');

async function devicePost<T>(
  fetchPath: string,
  signPath: string,
  body: Record<string, unknown>,
  cfg: DeviceConfig,
): Promise<ApiEnvelope<T>> {
  const rawBody = JSON.stringify(body);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const secret = cfg.deviceSecret.trim();
  if (secret) {
    headers.Authorization = await buildDeviceAuthHeader(
      cfg.deviceId.trim(),
      secret,
      'POST',
      signPath,
      rawBody,
    );
  }
  const res = await fetch(fetchPath, { method: 'POST', headers, body: rawBody });
  const raw = await res.text();
  let parsed: ApiEnvelope<T>;
  try {
    parsed = JSON.parse(raw) as ApiEnvelope<T>;
  } catch {
    throw new Error(`HTTP ${res.status}: ${raw}`);
  }
  if (res.status >= 400) {
    throw new Error(`HTTP ${res.status}: ${parsed.message || raw}`);
  }
  if (parsed.code !== 0 && parsed.code !== 2001) {
    throw formatDeviceApiError(parsed);
  }
  return parsed;
}

export async function checkUpdate(cfg: DeviceConfig) {
  return devicePost<CheckUpdateData>(
    deviceFetchPath('/check-update'),
    '/device/v1/check-update',
    {
      device_id: cfg.deviceId,
      current_version: cfg.currentVersion,
    },
    cfg,
  );
}

export async function reportStatus(
  cfg: DeviceConfig,
  payload: { taskId: string; status: string; targetVersion: string; sourceVersion?: string },
) {
  return devicePost(
    deviceFetchPath('/report-status'),
    '/device/v1/report-status',
    {
      device_id: cfg.deviceId,
      task_id: payload.taskId,
      status: payload.status,
      source_version: payload.sourceVersion ?? cfg.currentVersion,
      target_version: payload.targetVersion,
    },
    cfg,
  );
}

export const UPGRADE_STATUS_STEPS = ['pending', 'downloading', 'downloaded', 'upgrading', 'success'] as const;

export async function probeDownload(url: string): Promise<{ status: number; bytes: number }> {
  const res = await fetch(url, { method: 'GET' });
  const buf = await res.arrayBuffer();
  return { status: res.status, bytes: buf.byteLength };
}

export function describeNoUpdate(data: CheckUpdateData | undefined): string {
  const reason = data?.reason || 'unknown';
  const version = data?.current_version;
  if (reason === 'already_latest') {
    return version
      ? `服务端认定当前版本 ${version}，已达目标版本。重复联调请发布更高版本包并创建新 Running 任务。`
      : '服务端认定设备已是最新版本。重复联调请发布更高版本包并创建新 Running 任务。';
  }
  if (reason === 'no_running_task') {
    return '无 Running 任务或未命中任务快照，请先在任务中心创建并启动任务。';
  }
  return `无可用升级（${reason}）`;
}
