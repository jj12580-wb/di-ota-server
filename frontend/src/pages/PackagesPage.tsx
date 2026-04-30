import { useEffect, useState } from 'react';
import { Button, Card, Form, Input, Select, Upload, message, Modal, Table, Tag, Typography, Radio } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { Package, packageAPI } from '../api';

const { Paragraph, Title } = Typography;

const statusColor: Record<string, string> = {
  Published: 'green',
  Draft: 'orange',
  Deprecated: 'default',
  Disabled: 'red',
  Archived: 'default',
};

export function PackagesPage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [form] = Form.useForm();
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [hashing, setHashing] = useState(false);
  const [uploadMode, setUploadMode] = useState<'file' | 'url'>('file');
  const navigate = useNavigate();

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

  const handleUpload = async (values: any) => {
    setUploading(true);
    try {
      if (uploadMode === 'file') {
        const file = selectedFile;
        if (!file) {
          message.error('请选择文件');
          return;
        }
        await packageAPI.upload({
          product_code: values.product_code,
          version: values.version,
          signature: values.signature || undefined,
          file,
        });
      } else {
        const downloadUrl = String(values.download_url || '').trim();
        if (!downloadUrl) {
          message.error('请输入下载地址');
          return;
        }
        // simple URL validation
        let parsed: URL | null = null;
        try {
          parsed = new URL(downloadUrl);
        } catch {
          parsed = null;
        }
        if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
          message.error('下载地址必须是 http/https URL');
          return;
        }
        await packageAPI.uploadByUrl({
          product_code: values.product_code,
          version: values.version,
          signature: values.signature || undefined,
          download_url: downloadUrl,
        });
      }

      message.success('上传成功');
      setUploadOpen(false);
      form.resetFields();
      setSelectedFile(null);
      load();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  async function computeSHA256Hex(file: File): Promise<string> {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    const bytes = new Uint8Array(digest);
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  const handleDeprecate = (pkg: Package) => {
    Modal.confirm({
      title: `下架固件包 ${pkg.package_id}?`,
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

  const columns = [
    { title: '包 ID', dataIndex: 'package_id', key: 'package_id', width: 220, render: (v: string) => <a onClick={() => navigate(`/packages/${v}`)}>{v}</a> },
    { title: '名称', dataIndex: 'name', key: 'name', render: (v: string) => v || '-' },
    { title: '版本', dataIndex: 'version', key: 'version' },
    { title: '状态', dataIndex: 'status', key: 'status', render: (v: string) => <Tag color={statusColor[v]}>{v}</Tag> },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', render: (v: string) => new Date(v).toLocaleString() },
    {
      title: '操作', key: 'action', render: (_: unknown, r: Package) => (
        r.status === 'Published' ? <Button type="link" size="small" style={{ padding: 0 }} onClick={() => handleDeprecate(r)}>下架</Button> : null
      ),
    },
  ];

  const filteredPackages = packages.filter((p) => {
    if (statusFilter && p.status !== statusFilter) return false;
    if (!keyword.trim()) return true;
    const key = keyword.toLowerCase();
    return [p.package_id, p.product_code, p.version].join(' ').toLowerCase().includes(key);
  });

  return (
    <div className="ota-page">
      <div>
        <Title level={3} className="ota-page-title">固件包管理</Title>
        <Paragraph className="ota-page-subtitle">上传、查看和下架发布包，保证版本流转可追踪。</Paragraph>
      </div>

      <Card
        className="ota-card"
        extra={<Button type="primary" icon={<UploadOutlined />} onClick={() => setUploadOpen(true)}>上传固件包</Button>}
      >
        <div className="ota-toolbar">
          <div className="ota-toolbar-left">
            <Input.Search
              allowClear
              placeholder="搜索包ID/产品代码/版本"
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
          <span className="ota-muted">共 {filteredPackages.length} 条</span>
        </div>

        <Table columns={columns} dataSource={filteredPackages} loading={loading} rowKey="package_id" pagination={{ pageSize: 12 }} size="middle" scroll={filteredPackages.length > 0 ? { x: 880 } : undefined} />

        <Modal
          width="min(560px, calc(100vw - 24px))"
          title="上传固件包"
          open={uploadOpen}
          onCancel={() => {
            setUploadOpen(false);
            form.resetFields();
            setSelectedFile(null);
            setUploadMode('file');
          }}
          footer={null}
        >
          <Form form={form} layout="vertical" onFinish={handleUpload}>
            <Form.Item name="product_code" label="名称" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="version" label="版本号" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="signature" label="签名">
              <Input.TextArea rows={2} />
            </Form.Item>
            <Form.Item label="上传方式">
              <Radio.Group
                value={uploadMode}
                onChange={(e) => {
                  const next = e.target.value as 'file' | 'url';
                  setUploadMode(next);
                  setSelectedFile(null);
                  form.setFieldValue('download_url', '');
                }}
                options={[
                  { label: '选择文件上传', value: 'file' },
                  { label: '输入下载地址（服务器后台下载）', value: 'url' },
                ]}
              />
            </Form.Item>

            {uploadMode === 'file' ? (
              <>
                <Form.Item name="file_hash" label="文件哈希">
                  <Input placeholder="选择文件后自动计算" disabled />
                </Form.Item>
                <Form.Item label="固件文件" required>
                  <Upload
                    maxCount={1}
                    beforeUpload={() => false}
                    onRemove={() => {
                      setSelectedFile(null);
                      form.setFieldValue('file_hash', '');
                    }}
                    onChange={async (info) => {
                      const f = info.fileList?.[0]?.originFileObj as File | undefined;
                      if (!f) return;
                      setSelectedFile(f);
                      setHashing(true);
                      try {
                        const h = await computeSHA256Hex(f);
                        form.setFieldValue('file_hash', h);
                      } catch (e: any) {
                        message.error(e?.message || '计算文件哈希失败');
                        form.setFieldValue('file_hash', '');
                      } finally {
                        setHashing(false);
                      }
                    }}
                  >
                    <Button icon={<UploadOutlined />} loading={hashing}>
                      选择文件
                    </Button>
                  </Upload>
                  {selectedFile ? (
                    <div className="ota-muted" style={{ marginTop: 8 }}>
                      已选择：{selectedFile.name}（{(selectedFile.size / 1024 / 1024).toFixed(2)} MB）
                    </div>
                  ) : null}
                </Form.Item>
              </>
            ) : (
              <Form.Item
                name="download_url"
                label="文件下载地址"
                rules={[
                  { required: true, message: '请输入下载地址' },
                  {
                    validator: async (_, value) => {
                      const v = String(value || '').trim();
                      if (!v) return Promise.resolve();
                      try {
                        const u = new URL(v);
                        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
                          return Promise.reject(new Error('必须是 http/https URL'));
                        }
                        return Promise.resolve();
                      } catch {
                        return Promise.reject(new Error('URL 格式不合法'));
                      }
                    },
                  },
                ]}
              >
                <Input placeholder="https://example.com/firmware.bin" />
              </Form.Item>
            )}
            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={uploading}
                disabled={(uploadMode === 'file' && (!selectedFile || hashing)) || (uploadMode === 'url' && hashing)}
                block
              >
                上传
              </Button>
            </Form.Item>
          </Form>
        </Modal>
      </Card>
    </div>
  );
}
