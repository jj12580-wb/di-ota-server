import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Form, Input, Select, Space, message, Modal, Table, Tag, Upload } from 'antd';
import type { UploadFile } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { Package, packageAPI } from '../api';
import { packageLabel } from '../utils/packageLabel';
import { tableActionColumn, listTableProps, listTableScroll, clientTablePagination } from '../utils/tableActionColumn';
import { tableIdLinkColumn } from '../utils/tableIdLinkColumn';
import { tableEllipsisColumn, tableCompactColumn } from '../utils/tableEllipsisColumn';
import { useResizableColumns } from '../utils/useResizableColumns';

const statusColor: Record<string, string> = {
  Published: 'green',
  Draft: 'orange',
  Deprecated: 'default',
  Disabled: 'red',
  Archived: 'default',
};

async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function PackagesPage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [form] = Form.useForm();
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [hashing, setHashing] = useState(false);
  const navigate = useNavigate();

  const resetUploadForm = () => {
    form.resetFields();
    setSelectedFile(null);
    setFileList([]);
    setHashing(false);
  };

  const handleFileSelect = async (file: File) => {
    setSelectedFile(file);
    setFileList([{ uid: '-1', name: file.name, status: 'done' }]);
    setHashing(true);
    try {
      const hash = await sha256Hex(file);
      form.setFieldsValue({
        file_hash: hash,
        signature: `console-upload-${hash.slice(0, 16)}`,
      });
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '计算哈希失败');
      setSelectedFile(null);
      setFileList([]);
    } finally {
      setHashing(false);
    }
    return false;
  };

  const load = async () => {
    try {
      const data = await packageAPI.list(100, 0);
      setPackages(data.packages);
    } catch (e: any) {
      message.error(e.message);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleUpload = async (values: {
    alias?: string;
    product_code: string;
    version: string;
    file_hash?: string;
    signature?: string;
  }) => {
    setUploading(true);
    try {
      const file = selectedFile;
      if (!file) {
        message.error('请选择固件文件');
        return;
      }

      const fileHash = values.file_hash?.trim() || (await sha256Hex(file));
      const signature = values.signature?.trim() || `console-upload-${fileHash.slice(0, 16)}`;

      const { package_id, upload_url } = await packageAPI.uploadUrl({
        file_name: file.name,
        content_type: file.type || 'application/octet-stream',
        file_hash: fileHash,
      });

      const putRes = await fetch(upload_url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      });
      if (!putRes.ok) {
        throw new Error(`上传 MinIO 失败: HTTP ${putRes.status}`);
      }

      await packageAPI.complete({
        package_id,
        product_code: values.product_code,
        version: values.version,
        file_hash: fileHash,
        signature,
        file_size: file.size,
        alias: values.alias?.trim() || undefined,
      });

      message.success('上传成功');
      setUploadOpen(false);
      resetUploadForm();
      load();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeprecate = (pkg: Package) => {
    Modal.confirm({
      title: `下架固件包 ${packageLabel(pkg)}?`,
      onOk: async () => {
        try {
          await packageAPI.updateStatus(pkg.package_id, 'Deprecated');
          message.success('已下架');
          load();
        } catch (e: any) {
          message.error(e.message);
        }
      },
    });
  };

  const baseColumns = useMemo(
    () => [
      tableIdLinkColumn<Package>('包 ID', 'package_id', (id) => navigate(`/packages/${id}`)),
      tableEllipsisColumn<Package>('别名', 'alias', {
        render: (_: unknown, r: Package) => (r.alias || r.name || '-'),
      }),
      tableEllipsisColumn<Package>('产品代码', 'product_code'),
      tableEllipsisColumn<Package>('版本', 'version'),
      tableCompactColumn<Package>('状态', 'status', (v: string) => <Tag color={statusColor[v]}>{v}</Tag>, 'status'),
      tableEllipsisColumn<Package>('创建时间', 'created_at', {
        size: 'date',
        render: (v) => new Date(String(v)).toLocaleString(),
      }),
      tableActionColumn<Package>(
        (_, r) => (
          r.status === 'Published' ? (
            <Space size={4} className="ota-table-actions">
              <Button type="link" size="small" onClick={() => handleDeprecate(r)}>下架</Button>
            </Space>
          ) : null
        ),
        { actionLabels: ['下架'] },
      ),
    ],
    [navigate],
  );
  const { columns, components: tableComponents } = useResizableColumns(baseColumns, 'ota.table.packages');

  const filteredPackages = packages.filter((p) => {
    if (statusFilter && p.status !== statusFilter) return false;
    if (!keyword.trim()) return true;
    const key = keyword.toLowerCase();
    return [p.package_id, p.alias || '', p.name || '', p.product_code, p.version].join(' ').toLowerCase().includes(key);
  });

  return (
    <div className="ota-page ota-page-fill">
      <Card
        className="ota-card ota-card-dense ota-card-list"
        extra={<Button type="primary" icon={<UploadOutlined />} onClick={() => setUploadOpen(true)}>上传固件包</Button>}
      >
        <div className="ota-toolbar">
          <div className="ota-toolbar-left">
            <Input.Search
              allowClear
              placeholder="搜索包ID/别名/产品代码/版本"
              className="ota-toolbar-control-search"
              onSearch={setKeyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <Select
              allowClear
              placeholder="状态筛选"
              className="ota-toolbar-control-select"
              value={statusFilter}
              onChange={(v) => setStatusFilter(v)}
              options={[
                { value: 'Published', label: 'Published' },
                { value: 'Draft', label: 'Draft' },
                { value: 'Deprecated', label: 'Deprecated' },
                { value: 'Disabled', label: 'Disabled' },
                { value: 'Archived', label: 'Archived' },
              ]}
            />
          </div>
        </div>

        <Table
          {...listTableProps}
          columns={columns}
          components={tableComponents}
          dataSource={filteredPackages}
          loading={loading}
          rowKey="package_id"
          pagination={clientTablePagination()}
          scroll={listTableScroll(columns, filteredPackages.length)}
        />

        <Modal
          width="min(560px, calc(100vw - 24px))"
          title="上传固件包"
          open={uploadOpen}
          onCancel={() => { setUploadOpen(false); resetUploadForm(); }}
          footer={null}
        >
          <Form form={form} layout="vertical" onFinish={handleUpload}>
            <Form.Item name="alias" label="别名" rules={[{ required: true, message: '请填写固件包别名' }]}>
              <Input placeholder="如 客厅摄像头正式包 v2.4" maxLength={128} />
            </Form.Item>
            <Form.Item name="product_code" label="产品代码" rules={[{ required: true }]}>
              <Input placeholder="如 AMS" />
            </Form.Item>
            <Form.Item name="version" label="版本号" rules={[{ required: true }]}>
              <Input placeholder="如 v2.4.0" />
            </Form.Item>
            <Form.Item label="固件文件" required>
              <Upload
                fileList={fileList}
                beforeUpload={(file) => { void handleFileSelect(file); return false; }}
                onRemove={() => {
                  setSelectedFile(null);
                  setFileList([]);
                  form.setFieldsValue({ file_hash: '', signature: '' });
                }}
                maxCount={1}
              >
                <Button icon={<UploadOutlined />} loading={hashing}>
                  {hashing ? '计算 SHA256…' : '选择固件文件'}
                </Button>
              </Upload>
            </Form.Item>
            <Form.Item name="file_hash" label="文件哈希 (SHA256)" extra="选择文件后自动计算">
              <Input readOnly placeholder="选择文件后自动填充" />
            </Form.Item>
            <Form.Item name="signature" label="签名" extra="默认自动生成；产线真实签名可改">
              <Input.TextArea rows={2} placeholder="选择文件后自动填充" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={uploading} disabled={!selectedFile || hashing} block>
                上传
              </Button>
            </Form.Item>
          </Form>
        </Modal>
      </Card>
    </div>
  );
}
