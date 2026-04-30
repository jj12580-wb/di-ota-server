import { Breadcrumb, Button, Card, Descriptions, Input, Modal, Space, Table, Tabs, Typography, message, Tag } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { TablePaginationConfig } from 'antd/es/table';
import { deviceAPI, deviceGroupAPI, DeviceGroup, AMSDeviceItem } from '../api';
import type { DeviceSummaryItem } from './mockConsoleData';

const { Title, Paragraph, Text } = Typography;

const statusColor: Record<string, string> = {
  online: 'green',
  warning: 'orange',
  offline: 'red',
};

function toDeviceSummaryItem(item: AMSDeviceItem): DeviceSummaryItem {
  const isOnline = Boolean(item.is_online);
  const isActive = item.is_active !== false;

  let status: DeviceSummaryItem['status'] = isOnline ? 'online' : 'offline';
  if (!isActive) status = 'warning';

  const safe = (value: unknown, fallback = '-') => {
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
    if (typeof value === 'number') return String(value);
    return fallback;
  };

  return {
    device_id: safe(item.sn, safe(item.id)),
    product_code: safe(item.name, safe(item.mac_addr)),
    product_model: safe(item.current_model_id),
    hardware_version: '-',
    current_version: safe(item.current_firmware_version),
    target_version: '-',
    status,
    last_heartbeat: safe(item.last_heartbeat),
    last_error_code: '-',
    data_source: 'external',
    tags: [],
    last_task_id: '',
  };
}

export function DeviceGroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();

  const [loading, setLoading] = useState(false);
  const [group, setGroup] = useState<DeviceGroup | null>(null);
  const [deviceCount, setDeviceCount] = useState(0);

  // edit group
  const [editOpen, setEditOpen] = useState(false);
  const [editCode, setEditCode] = useState('');
  const [editName, setEditName] = useState('');
  const [editPlatformId, setEditPlatformId] = useState<number | undefined>(undefined);
  const [editOrgId, setEditOrgId] = useState<number | undefined>(undefined);

  // members
  const [members, setMembers] = useState<string[]>([]);
  const [membersTotal, setMembersTotal] = useState(0);
  const [membersPage, setMembersPage] = useState(1);
  const [membersPageSize, setMembersPageSize] = useState(50);
  const [addOpen, setAddOpen] = useState(false);
  const [existingMemberSet, setExistingMemberSet] = useState<Set<string>>(new Set());

  // device picker
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerKeyword, setPickerKeyword] = useState('');
  const [pickerPage, setPickerPage] = useState(1);
  const [pickerPageSize, setPickerPageSize] = useState(10);
  const [pickerTotal, setPickerTotal] = useState(0);
  const [pickerItems, setPickerItems] = useState<AMSDeviceItem[]>([]);
  const [selectedSns, setSelectedSns] = useState<string[]>([]);

  // devices
  const [devices, setDevices] = useState<DeviceSummaryItem[]>([]);
  const [notFound, setNotFound] = useState<string[]>([]);
  const [devicesTotal, setDevicesTotal] = useState(0);
  const [devicesPage, setDevicesPage] = useState(1);
  const [devicesPageSize, setDevicesPageSize] = useState(50);

  const notFoundText = useMemo(() => {
    if (!notFound || notFound.length === 0) return '';
    return notFound.slice(0, 12).join(', ') + (notFound.length > 12 ? ` ... (${notFound.length})` : '');
  }, [notFound]);

  async function loadGroup() {
    if (!id) return;
    setLoading(true);
    try {
      const data = await deviceGroupAPI.get(id);
      setGroup(data.group);
      setDeviceCount(data.device_count ?? 0);
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '加载分组失败');
      setGroup(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadMembers(next?: { page?: number; pageSize?: number }) {
    if (!id) return;
    const p = next?.page ?? membersPage;
    const ps = next?.pageSize ?? membersPageSize;
    setLoading(true);
    try {
      const data = await deviceGroupAPI.members(id, { limit: ps, offset: (p - 1) * ps });
      setMembers(data.sns ?? []);
      setMembersTotal(data.total ?? 0);
      setMembersPage(p);
      setMembersPageSize(ps);
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '加载成员失败');
    } finally {
      setLoading(false);
    }
  }

  async function loadDevices(next?: { page?: number; pageSize?: number }) {
    if (!id) return;
    const p = next?.page ?? devicesPage;
    const ps = next?.pageSize ?? devicesPageSize;
    setLoading(true);
    try {
      const data = await deviceGroupAPI.devices(id, { limit: ps, offset: (p - 1) * ps });
      setDevices((data.items ?? []).map(toDeviceSummaryItem));
      setNotFound(data.not_found ?? []);
      setDevicesTotal(data.total ?? 0);
      setDevicesPage(p);
      setDevicesPageSize(ps);
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '加载设备详情失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGroup();
    loadMembers({ page: 1 });
    loadDevices({ page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function openEdit() {
    if (!group) return;
    setEditCode(group.group_code);
    setEditName(group.group_name);
    setEditPlatformId(group.platform_id ?? undefined);
    setEditOrgId(group.org_id ?? undefined);
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!id) return;
    const code = editCode.trim();
    const name = editName.trim();
    if (!code || !name) {
      messageApi.warning('请填写分组编号与名称');
      return;
    }
    setLoading(true);
    try {
      const updated = await deviceGroupAPI.update(id, { group_code: code, group_name: name, platform_id: editPlatformId, org_id: editOrgId });
      setGroup(updated);
      setEditOpen(false);
      messageApi.success('分组已更新');
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '更新分组失败');
    } finally {
      setLoading(false);
    }
  }

  async function deleteGroup() {
    if (!id) return;
    Modal.confirm({
      title: '确认删除该分组？',
      content: '删除后分组与成员 SN 会被移除，但不会影响外部设备数据。',
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        setLoading(true);
        try {
          await deviceGroupAPI.remove(id);
          messageApi.success('分组已删除');
          navigate('/device-groups');
        } catch (err) {
          messageApi.error(err instanceof Error ? err.message : '删除分组失败');
        } finally {
          setLoading(false);
        }
      },
    });
  }

  async function addMembers() {
    if (!id) return;
    const sns = Array.from(new Set(selectedSns)).filter((sn) => sn && !existingMemberSet.has(sn));
    if (sns.length === 0) {
      messageApi.warning('请选择要加入分组的设备');
      return;
    }
    setLoading(true);
    try {
      await deviceGroupAPI.addMembers(id, sns);
      setAddOpen(false);
      setSelectedSns([]);
      messageApi.success('成员已添加');
      await loadGroup();
      await loadMembers({ page: 1 });
      await loadDevices({ page: 1 });
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '添加成员失败');
    } finally {
      setLoading(false);
    }
  }

  async function removeMembers(sns: string[]) {
    if (!id || sns.length === 0) return;
    setLoading(true);
    try {
      await deviceGroupAPI.removeMembers(id, sns);
      messageApi.success('成员已移除');
      await loadGroup();
      await loadMembers({ page: 1 });
      await loadDevices({ page: 1 });
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '移除成员失败');
    } finally {
      setLoading(false);
    }
  }

  async function loadAllMemberSns(): Promise<Set<string>> {
    if (!id) return new Set();
    const limit = 500;
    let offset = 0;
    const all = new Set<string>();
    while (true) {
      const data = await deviceGroupAPI.members(id, { limit, offset });
      for (const sn of data.sns ?? []) all.add(sn);
      const total = data.total ?? all.size;
      offset += limit;
      if (offset >= total) break;
      if ((data.sns ?? []).length === 0) break;
    }
    return all;
  }

  async function loadPickerDevices(next?: { page?: number; pageSize?: number; keyword?: string }) {
    const p = next?.page ?? pickerPage;
    const ps = next?.pageSize ?? pickerPageSize;
    const kw = next?.keyword ?? pickerKeyword;
    setPickerLoading(true);
    try {
      const data = await deviceAPI.list({
        page: p,
        page_size: ps,
        keyword: kw.trim(),
        platform_id: group?.platform_id ?? undefined,
        org_id: group?.org_id ?? undefined,
      });
      setPickerItems(data.items ?? []);
      setPickerTotal(data.total ?? 0);
      setPickerPage(data.page ?? p);
      setPickerPageSize(data.page_size ?? ps);
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '加载设备列表失败');
    } finally {
      setPickerLoading(false);
    }
  }

  async function openAddModal() {
    setAddOpen(true);
    setSelectedSns([]);
    setPickerKeyword('');
    setPickerPage(1);
    setPickerPageSize(10);
    try {
      setPickerLoading(true);
      const set = await loadAllMemberSns();
      setExistingMemberSet(set);
      await loadPickerDevices({ page: 1, pageSize: 10, keyword: '' });
    } finally {
      setPickerLoading(false);
    }
  }

  if (!id) {
    return (
      <div className="ota-page">
        <Card className="ota-card">缺少分组 ID</Card>
      </div>
    );
  }

  return (
    <div className="ota-page">
      {contextHolder}
      <div>
        <Title level={3} className="ota-page-title">分组详情</Title>
        <Paragraph className="ota-page-subtitle">成员 SN 存在本服务中；设备详情通过批量查询接口实时获取并展示。</Paragraph>
      </div>

      <Breadcrumb
        items={[
          { title: <a onClick={() => navigate('/device-groups')}>分组管理</a> },
          { title: group?.group_code ?? id },
        ]}
      />

      <div className="ota-section-grid" style={{ marginTop: 12 }}>
        <Card className="ota-card ota-section-span-12" title="分组信息" extra={
          <Space>
            <Button onClick={openEdit} disabled={!group}>编辑</Button>
            <Button danger onClick={deleteGroup}>删除</Button>
          </Space>
        }>
          {!group ? (
            <Text type="secondary">加载中...</Text>
          ) : (
            <Descriptions bordered column={{ xs: 1, sm: 2 }}>
              <Descriptions.Item label="分组编号">{group.group_code}</Descriptions.Item>
              <Descriptions.Item label="分组名称">{group.group_name}</Descriptions.Item>
              <Descriptions.Item label="平台">{group.platform_id ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="机构">{group.org_id ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="设备数量">{deviceCount}</Descriptions.Item>
              <Descriptions.Item label="更新时间">{group.updated_at}</Descriptions.Item>
            </Descriptions>
          )}
        </Card>
      </div>

      <Card className="ota-card" style={{ marginTop: 12 }}>
        <Tabs
          items={[
            {
              key: 'members',
              label: '分组成员（SN）',
              children: (
                <div>
                  <Space style={{ marginBottom: 12 }}>
                    <Button type="primary" onClick={openAddModal}>选择设备添加</Button>
                    <Button onClick={() => loadMembers()}>刷新</Button>
                  </Space>
                  <Table
                    rowKey={(sn) => sn as string}
                    loading={loading}
                    dataSource={members}
                    columns={[
                      { title: 'SN', dataIndex: '', key: 'sn', render: (v: string) => v },
                      {
                        title: '操作',
                        key: 'actions',
                        render: (_: unknown, sn: string) => (
                          <Button danger type="link" onClick={() => removeMembers([sn])}>移除</Button>
                        ),
                      },
                    ]}
                    pagination={{
                      current: membersPage,
                      pageSize: membersPageSize,
                      total: membersTotal,
                      showSizeChanger: true,
                      onChange: (p, ps) => loadMembers({ page: p, pageSize: ps ?? membersPageSize }),
                    } as TablePaginationConfig}
                  />
                </div>
              ),
            },
            {
              key: 'devices',
              label: '设备详情（实时）',
              children: (
                <div>
                  <Space style={{ marginBottom: 12 }} wrap>
                    <Button onClick={() => loadDevices()}>刷新</Button>
                    {notFoundText ? <Text type="secondary">无权限/不存在：{notFoundText}</Text> : null}
                  </Space>
                  <Table
                    rowKey="device_id"
                    loading={loading}
                    dataSource={devices}
                    columns={[
                      { title: '设备 ID', dataIndex: 'device_id', key: 'device_id' },
                      { title: '产品代码', dataIndex: 'product_code', key: 'product_code' },
                      { title: '型号', dataIndex: 'product_model', key: 'product_model' },
                      { title: '当前版本', dataIndex: 'current_version', key: 'current_version' },
                      { title: '目标版本', dataIndex: 'target_version', key: 'target_version' },
                      { title: '最后心跳', dataIndex: 'last_heartbeat', key: 'last_heartbeat' },
                      {
                        title: '状态',
                        dataIndex: 'status',
                        key: 'status',
                        render: (value: string) => <Tag color={statusColor[value]}>{value}</Tag>,
                      },
                      {
                        title: '数据来源',
                        dataIndex: 'data_source',
                        key: 'data_source',
                        render: (value: string) => <Tag color={value === 'external' ? 'purple' : 'blue'}>{value === 'external' ? '外部系统' : '本地系统'}</Tag>,
                      },
                      { title: '最近错误', dataIndex: 'last_error_code', key: 'last_error_code' },
                      {
                        title: '操作',
                        key: 'actions',
                        fixed: 'right' as const,
                        render: (_: unknown, record: DeviceSummaryItem) => (
                          <Button type="link" onClick={() => navigate(`/devices/${record.device_id}`)}>
                            查看详情
                          </Button>
                        ),
                      },
                    ]}
                    pagination={{
                      current: devicesPage,
                      pageSize: devicesPageSize,
                      total: devicesTotal,
                      showSizeChanger: true,
                      onChange: (p, ps) => loadDevices({ page: p, pageSize: ps ?? devicesPageSize }),
                    } as TablePaginationConfig}
                    scroll={devices.length > 0 ? { x: 1200 } : undefined}
                  />
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="选择设备加入分组"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={addMembers}
        okText="加入分组"
        confirmLoading={loading}
        width={920}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            设备列表来自外部系统；已在分组中的设备会自动置灰不可选。{group?.platform_id ? `（平台=${group.platform_id}）` : ''}{group?.org_id ? `（机构=${group.org_id}）` : ''}
          </Paragraph>
          <Space wrap>
            <Input.Search
              style={{ width: 320 }}
              placeholder="搜索 SN"
              allowClear
              value={pickerKeyword}
              onChange={(e) => setPickerKeyword(e.target.value)}
              onSearch={(v) => {
                const kw = v.trim();
                setPickerKeyword(kw);
                setPickerPage(1);
                loadPickerDevices({ page: 1, keyword: kw });
              }}
            />
            <Button onClick={() => loadPickerDevices()}>刷新</Button>
            <Text type="secondary">已选 {selectedSns.length} 台</Text>
          </Space>

          <Table
            rowKey={(r) => r.sn}
            loading={pickerLoading}
            dataSource={pickerItems}
            pagination={{
              current: pickerPage,
              pageSize: pickerPageSize,
              total: pickerTotal,
              showSizeChanger: true,
              onChange: (p, ps) => {
                const size = ps ?? pickerPageSize;
                setPickerPage(p);
                setPickerPageSize(size);
                loadPickerDevices({ page: p, pageSize: size });
              },
            } as TablePaginationConfig}
            rowSelection={{
              selectedRowKeys: selectedSns,
              onChange: (keys) => setSelectedSns(keys as string[]),
              getCheckboxProps: (record) => ({ disabled: existingMemberSet.has(record.sn) }),
            }}
            columns={[
              { title: 'SN', dataIndex: 'sn', key: 'sn' },
              { title: '名称', dataIndex: 'name', key: 'name', render: (v: string) => v || '-' },
              {
                title: '状态',
                key: 'status',
                render: (_: unknown, r: AMSDeviceItem) => {
                  const status = toDeviceSummaryItem(r).status;
                  return <Tag color={statusColor[status]}>{status}</Tag>;
                },
              },
              { title: '最后心跳', dataIndex: 'last_heartbeat', key: 'last_heartbeat', render: (v: string | null) => v || '-' },
            ]}
          />
        </Space>
      </Modal>

      <Modal
        title="编辑分组"
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={saveEdit}
        okText="保存"
        confirmLoading={loading}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Input placeholder="分组编号" value={editCode} onChange={(e) => setEditCode(e.target.value)} />
          <Input placeholder="分组名称" value={editName} onChange={(e) => setEditName(e.target.value)} />
          <Input placeholder="平台 ID（可选）" value={editPlatformId ?? ''} onChange={(e) => setEditPlatformId(e.target.value ? Number(e.target.value) : undefined)} />
          <Input placeholder="机构 ID（可选）" value={editOrgId ?? ''} onChange={(e) => setEditOrgId(e.target.value ? Number(e.target.value) : undefined)} />
        </Space>
      </Modal>
    </div>
  );
}

