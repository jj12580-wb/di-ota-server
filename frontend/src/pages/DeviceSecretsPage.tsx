import { Alert, Button, Card, Form, Input, Space, Typography, Upload, message } from 'antd';
import { DownloadOutlined, KeyOutlined, UploadOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { deviceSecretAPI } from '../api';

const { Paragraph, Text } = Typography;

export function DeviceSecretsPage() {
  const [importing, setImporting] = useState(false);
  const [singleForm] = Form.useForm<{ device_id: string; device_secret: string }>();
  const [savingOne, setSavingOne] = useState(false);

  const handleDownloadTemplate = async () => {
    try {
      const res = await deviceSecretAPI.downloadTemplate();
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ota-device-secret-template.csv';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '下载模板失败');
    }
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    try {
      const result = await deviceSecretAPI.importCSV(file);
      message.success(`导入成功：${result.imported_count} 台设备已 provision secret`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '导入失败');
    } finally {
      setImporting(false);
    }
  };

  const handleSaveOne = async (values: { device_id: string; device_secret: string }) => {
    setSavingOne(true);
    try {
      await deviceSecretAPI.setSecret(values.device_id.trim(), values.device_secret.trim());
      message.success(`已为 ${values.device_id.trim()} 写入 device_secret，请立即复制保存`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '写入失败');
    } finally {
      setSavingOne(false);
    }
  };

  const handleGenerateSecret = () => {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const secret = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    singleForm.setFieldsValue({ device_secret: secret });
  };

  return (
    <div className="ota-page ota-page-fill">
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="独立权限模块"
        description="本页仅 secret_admin / admin 可访问。设备 CSV 导入在「设备管理」，不含 secret；产线 secret 在此单独 provision，与运营目录分离。"
      />

      <Card className="ota-card" title="单台 provision" style={{ marginBottom: 16 }}>
        <Form form={singleForm} layout="vertical" onFinish={handleSaveOne}>
          <Form.Item name="device_id" label="device_id" rules={[{ required: true, message: '请输入设备 SN' }]}>
            <Input placeholder="须已在设备注册表中" />
          </Form.Item>
          <Form.Item
            name="device_secret"
            label="device_secret"
            rules={[
              { required: true, message: '请输入 device_secret' },
              { max: 128, message: '最长 128 字符' },
            ]}
            extra="平台不回显已有 secret；写入后请立即复制到产线或模拟器。"
          >
            <Input.Password visibilityToggle />
          </Form.Item>
          <Space wrap>
            <Button icon={<KeyOutlined />} onClick={handleGenerateSecret}>生成随机 Secret</Button>
            <Button type="primary" htmlType="submit" loading={savingOne}>保存到平台</Button>
            <Link to="/simulator">打开设备模拟器</Link>
          </Space>
        </Form>
      </Card>

      <Card className="ota-card" title="批量导入 Secret CSV">
        <Paragraph type="secondary">
          CSV 字段：<Text code>device_id,device_secret</Text>。设备须先通过「设备管理」导入注册；本文件仅写入 HMAC secret。
        </Paragraph>
        <Space wrap>
          <Button icon={<DownloadOutlined />} onClick={() => void handleDownloadTemplate()}>下载模板</Button>
          <Upload accept=".csv,text/csv" showUploadList={false} beforeUpload={(file) => { void handleImport(file); return false; }}>
            <Button type="primary" icon={<UploadOutlined />} loading={importing}>上传 Secret CSV</Button>
          </Upload>
        </Space>
      </Card>
    </div>
  );
}
