import { useEffect, useState } from 'react';
import { Alert, Breadcrumb, Button, Card, Descriptions, Space, Tag, Timeline, Typography, message } from 'antd';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { DeviceCatalogItem, UpgradeRecord, deviceAPI } from '../api';
import useAuthStore from '../stores/authStore';
import { canManageDeviceSecrets } from '../utils/roles';

const { Paragraph, Title } = Typography;

const statusColor: Record<string, string> = {
  Success: 'green',
  Failed: 'red',
  Downloading: 'blue',
  Applying: 'blue',
  Pending: 'default',
};

const FLAG_LABELS: Record<string, string> = {
  version_rollback_ignored: '目录同步版本低于 OTA 上报，已忽略回退',
  version_ahead_of_device: '目录版本高于设备 OTA 上报',
  identity_changed: '产品型号或硬件版本与历史记录不一致',
};

export function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const roles = useAuthStore((s) => s.roles);
  const [device, setDevice] = useState<DeviceCatalogItem | null>(null);
  const [records, setRecords] = useState<UpgradeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const showSecretAdminLink = canManageDeviceSecrets(roles);

  const loadDevice = async (deviceId: string) => {
    const [dev, history] = await Promise.all([
      deviceAPI.get(deviceId),
      deviceAPI.upgradeRecords(deviceId),
    ]);
    setDevice(dev);
    setRecords(history.records);
  };

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    loadDevice(id)
      .catch((e: Error) => message.error(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return null;
  }

  if (!device) {
    return (
      <div className="ota-page ota-page-fill">
        <Card className="ota-card">
          <Space direction="vertical">
            <Title level={4}>设备不存在</Title>
            <Button onClick={() => navigate('/devices')}>返回设备管理</Button>
          </Space>
        </Card>
      </div>
    );
  }

  const tagEntries = device.tags && typeof device.tags === 'object'
    ? Object.entries(device.tags as Record<string, unknown>)
    : [];
  const flags = device.inconsistency_flags ?? [];

  return (
    <div className="ota-page ota-page-fill">
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <a onClick={() => navigate('/devices')}>设备管理</a> },
          { title: device.device_id },
        ]}
      />

      {(device.eligibility_state === 'blocked' || flags.length > 0) && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="设备存在异常标记"
          description={
            <Space direction="vertical" size={4}>
              {device.eligibility_state === 'blocked' && <span>升级资格：已阻断（blocked）</span>}
              {flags.length > 0 && (
                <span>
                  目录冲突：
                  {flags.map((flag) => (
                    <Tag key={flag} color="orange" style={{ marginInlineStart: 8 }}>{flag}</Tag>
                  ))}
                </span>
              )}
            </Space>
          }
        />
      )}

      {(flags.length > 0 || device.catalog_version || device.reported_version) && (
        <Card className="ota-card" title="目录与 OTA 版本对比" style={{ marginBottom: 16 }}>
          <Descriptions bordered column={{ xs: 1, sm: 3 }} size="small">
            <Descriptions.Item label="目录版本 (catalog)">{device.catalog_version || '-'}</Descriptions.Item>
            <Descriptions.Item label="OTA 上报 (reported)">{device.reported_version || '-'}</Descriptions.Item>
            <Descriptions.Item label="决策用当前版本">{device.current_version || '-'}</Descriptions.Item>
          </Descriptions>
          {flags.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <Space direction="vertical" size={4}>
                {flags.map((flag) => (
                  <span key={flag}>
                    <Tag color="orange">{flag}</Tag>
                    <Typography.Text type="secondary">{FLAG_LABELS[flag] ?? '目录同步冲突标记'}</Typography.Text>
                  </span>
                ))}
              </Space>
            </div>
          )}
        </Card>
      )}

      <Card className="ota-card" title="设备鉴权 Secret (HMAC)" style={{ marginBottom: 16 }}>
        <Descriptions bordered column={{ xs: 1, sm: 2 }} size="small" style={{ marginBottom: showSecretAdminLink ? 12 : 0 }}>
          <Descriptions.Item label="Provision 状态">
            <Tag color={device.secret_provisioned ? 'green' : 'orange'}>
              {device.secret_provisioned ? '已配置' : '未配置'}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="说明">
            设备 CSV 不含 secret；由「设备 Secret 管理」单独 provision（secret_admin 权限）
          </Descriptions.Item>
        </Descriptions>
        {showSecretAdminLink ? (
          <Link to="/device-secrets">
            <Button type="primary">前往设备 Secret 管理</Button>
          </Link>
        ) : (
          <Alert type="info" showIcon message="无 secret 写入权限" description="请联系 secret_admin 或管理员 provision device_secret。" />
        )}
      </Card>

      <Card className="ota-card" title="设备概览">
        <Descriptions bordered column={{ xs: 1, sm: 2 }}>
          <Descriptions.Item label="设备 ID">{device.device_id}</Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag color={device.eligibility_state === 'active' ? 'green' : 'red'}>{device.eligibility_state}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="产品代码">{device.product_code}</Descriptions.Item>
          <Descriptions.Item label="产品型号">{device.product_model}</Descriptions.Item>
          <Descriptions.Item label="硬件版本">{device.hardware_version}</Descriptions.Item>
          <Descriptions.Item label="设备分组">{device.device_group}</Descriptions.Item>
          <Descriptions.Item label="当前版本">{device.current_version || '-'}</Descriptions.Item>
          <Descriptions.Item label="OTA 上报版本">{device.reported_version || '-'}</Descriptions.Item>
          <Descriptions.Item label="目录版本">{device.catalog_version || '-'}</Descriptions.Item>
          <Descriptions.Item label="目录来源">{device.catalog_source || '-'}</Descriptions.Item>
          <Descriptions.Item label="最后心跳">
            {device.last_heartbeat ? new Date(device.last_heartbeat).toLocaleString() : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="注册时间">
            {device.registered_at ? new Date(device.registered_at).toLocaleString() : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="标签" span={2}>
            <Space size={[8, 8]} wrap>
              {tagEntries.length === 0 ? '-' : tagEntries.map(([k, v]) => (
                <span key={k} className="ota-list-chip">{k}: {String(v)}</span>
              ))}
            </Space>
          </Descriptions.Item>
        </Descriptions>
        <div style={{ marginTop: 16 }}>
          <Button onClick={() => navigate('/devices')}>返回列表</Button>
        </div>
      </Card>

      <Card className="ota-card" title="升级历史" style={{ marginTop: 16 }}>
        {records.length === 0 ? (
          <Paragraph type="secondary">暂无升级记录（设备上报 report-status 后将出现在此）。</Paragraph>
        ) : (
          <Timeline
            items={records.map((record) => ({
              color: statusColor[record.status] ?? 'gray',
              children: (
                <Space direction="vertical" size={2}>
                  <Space wrap>
                    <Tag color={statusColor[record.status] ?? 'default'}>{record.status}</Tag>
                    <span>{new Date(record.created_at).toLocaleString()}</span>
                  </Space>
                  <span>
                    任务 <Button type="link" size="small" onClick={() => navigate(`/tasks/${record.task_id}`)}>{record.task_id}</Button>
                  </span>
                  {(record.source_version || record.target_version) && (
                    <span>
                      版本：{record.source_version || '-'} → {record.target_version || '-'}
                    </span>
                  )}
                  {record.error_code && <Tag color="red">{record.error_code}</Tag>}
                </Space>
              ),
            }))}
          />
        )}
      </Card>
    </div>
  );
}
