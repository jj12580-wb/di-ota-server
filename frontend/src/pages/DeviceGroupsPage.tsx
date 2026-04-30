import { Button, Card, Input, Modal, Space, Table, Typography, message, Select } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TablePaginationConfig } from 'antd/es/table';
import { deviceGroupAPI, organizationAPI, platformAPI, AMSOrganization, AMSPlatform, DeviceGroupListItem } from '../api';

const { Title, Paragraph } = Typography;

export function DeviceGroupsPage() {
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();

  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [platformId, setPlatformId] = useState<number | undefined>(undefined);
  const [orgId, setOrgId] = useState<number | undefined>(undefined);

  const [platforms, setPlatforms] = useState<AMSPlatform[]>([]);
  const [organizations, setOrganizations] = useState<AMSOrganization[]>([]);

  const [items, setItems] = useState<DeviceGroupListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [createOpen, setCreateOpen] = useState(false);
  const [createCode, setCreateCode] = useState('');
  const [createName, setCreateName] = useState('');
  const [createPlatformId, setCreatePlatformId] = useState<number | undefined>(undefined);
  const [createOrgId, setCreateOrgId] = useState<number | undefined>(undefined);

  const orgOptions = useMemo(() => {
    if (!platformId) return organizations;
    return organizations.filter((o) => o.platform_id === platformId);
  }, [organizations, platformId]);

  async function fetchGroups(next?: { page?: number; pageSize?: number }) {
    const p = next?.page ?? page;
    const ps = next?.pageSize ?? pageSize;
    setLoading(true);
    try {
      const data = await deviceGroupAPI.list({
        limit: ps,
        offset: (p - 1) * ps,
        keyword: keyword.trim(),
        platform_id: platformId,
        org_id: orgId,
      });
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      setPage(p);
      setPageSize(ps);
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '加载分组列表失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    Promise.all([platformAPI.list(), organizationAPI.list()])
      .then(([pf, org]) => {
        setPlatforms(pf ?? []);
        setOrganizations(org ?? []);
      })
      .catch((err) => messageApi.error(err instanceof Error ? err.message : '加载平台/机构失败'))
      .finally(() => fetchGroups({ page: 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createGroup() {
    const code = createCode.trim();
    const name = createName.trim();
    if (!code || !name) {
      messageApi.warning('请填写分组编号与名称');
      return;
    }
    setLoading(true);
    try {
      const created = await deviceGroupAPI.create({
        group_code: code,
        group_name: name,
        platform_id: createPlatformId,
        org_id: createOrgId,
      });
      setCreateOpen(false);
      setCreateCode('');
      setCreateName('');
      setCreatePlatformId(undefined);
      setCreateOrgId(undefined);
      messageApi.success('分组已创建');
      navigate(`/device-groups/${created.group_id}`);
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '创建分组失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ota-page">
      {contextHolder}
      <div>
        <Title level={3} className="ota-page-title">分组管理</Title>
        <Paragraph className="ota-page-subtitle">分组内仅保存设备序列号（SN），设备详情通过批量查询接口实时获取展示。</Paragraph>
      </div>

      <Card className="ota-card">
        <div className="ota-toolbar">
          <div className="ota-toolbar-left">
            <Input.Search
              className="ota-toolbar-control-search"
              placeholder="搜索分组编号 / 名称"
              allowClear
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onSearch={() => fetchGroups({ page: 1 })}
            />
            <Select
              className="ota-toolbar-control-select"
              placeholder="平台"
              allowClear
              value={platformId}
              onChange={(value) => {
                const nextPlatform = typeof value === 'number' ? value : undefined;
                setPlatformId(nextPlatform);
                setOrgId(undefined);
                fetchGroups({ page: 1 });
              }}
              options={platforms.map((p) => ({ label: p.name ?? String(p.id), value: p.id }))}
            />
            <Select
              className="ota-toolbar-control-select"
              placeholder="机构"
              allowClear
              value={orgId}
              onChange={(value) => {
                const nextOrg = typeof value === 'number' ? value : undefined;
                setOrgId(nextOrg);
                fetchGroups({ page: 1 });
              }}
              options={orgOptions.map((o) => ({ label: o.name ?? String(o.id), value: o.id }))}
            />
          </div>
          <Space>
            <Button onClick={() => fetchGroups()}>刷新</Button>
            <Button type="primary" onClick={() => setCreateOpen(true)}>新建分组</Button>
          </Space>
        </div>

        <Table
          rowKey="group_id"
          loading={loading}
          dataSource={items}
          columns={[
            { title: '分组编号', dataIndex: 'group_code', key: 'group_code' },
            { title: '分组名称', dataIndex: 'group_name', key: 'group_name' },
            { title: '平台', dataIndex: 'platform_id', key: 'platform_id', render: (v: number | null) => v ?? '-' },
            { title: '机构', dataIndex: 'org_id', key: 'org_id', render: (v: number | null) => v ?? '-' },
            { title: '设备数量', dataIndex: 'device_count', key: 'device_count' },
            {
              title: '操作',
              key: 'actions',
              render: (_: unknown, record: DeviceGroupListItem) => (
                <Space>
                  <Button type="link" onClick={() => navigate(`/device-groups/${record.group_id}`)}>详情</Button>
                </Space>
              ),
            },
          ]}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            onChange: (nextPage, nextPageSize) => {
              const effectiveSize = nextPageSize ?? pageSize;
              fetchGroups({ page: nextPage, pageSize: effectiveSize });
            },
          } as TablePaginationConfig}
        />
      </Card>

      <Modal
        title="新建分组"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={createGroup}
        okText="创建"
        confirmLoading={loading}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Input placeholder="分组编号（唯一）" value={createCode} onChange={(e) => setCreateCode(e.target.value)} />
          <Input placeholder="分组名称" value={createName} onChange={(e) => setCreateName(e.target.value)} />
          <Select
            placeholder="平台（可选）"
            allowClear
            value={createPlatformId}
            onChange={(value) => {
              const nextPlatform = typeof value === 'number' ? value : undefined;
              setCreatePlatformId(nextPlatform);
              setCreateOrgId(undefined);
            }}
            options={platforms.map((p) => ({ label: p.name ?? String(p.id), value: p.id }))}
          />
          <Select
            placeholder="机构（可选）"
            allowClear
            value={createOrgId}
            onChange={(value) => setCreateOrgId(typeof value === 'number' ? value : undefined)}
            options={(createPlatformId ? organizations.filter((o) => o.platform_id === createPlatformId) : organizations)
              .map((o) => ({ label: o.name ?? String(o.id), value: o.id }))}
          />
        </Space>
      </Modal>
    </div>
  );
}

