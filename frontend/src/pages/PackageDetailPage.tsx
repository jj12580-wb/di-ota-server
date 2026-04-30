import { useEffect, useState } from 'react';
import { Breadcrumb, Button, Card, Descriptions, message, Tag, Typography } from 'antd';
import { useParams, useNavigate } from 'react-router-dom';
import { packageAPI, Package } from '../api';

const { Paragraph, Title } = Typography;

export function PackageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [pkg, setPkg] = useState<Package | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!id) return;
    packageAPI.get(id).then(setPkg).catch(() => message.error('包不存在'));
  }, [id]);

  if (!pkg) return null;

  return (
    <div className="ota-page">
      <div>
        <Title level={3} className="ota-page-title">固件包详情</Title>
        <Paragraph className="ota-page-subtitle">查看包元数据与发布状态，快速判断可用性。</Paragraph>
      </div>

      <Breadcrumb style={{ marginBottom: 16 }} items={[
        { title: <a onClick={() => navigate('/packages')}>固件包</a> },
        { title: pkg.package_id },
      ]} />
      <Card title="固件包详情" className="ota-card">
        <Descriptions bordered column={{ xs: 1, sm: 2 }}>
          <Descriptions.Item label="包 ID">{pkg.package_id}</Descriptions.Item>
          <Descriptions.Item label="状态"><Tag>{pkg.status}</Tag></Descriptions.Item>
          <Descriptions.Item label="原始文件名" span={2}>{pkg.name || '-'}</Descriptions.Item>
          <Descriptions.Item label="产品代码">{pkg.product_code}</Descriptions.Item>
          <Descriptions.Item label="版本">{pkg.version}</Descriptions.Item>
          <Descriptions.Item label="文件哈希" span={2}>{pkg.file_hash}</Descriptions.Item>
          <Descriptions.Item label="文件大小" span={2}>{pkg.file_size ? `${(pkg.file_size / 1024 / 1024).toFixed(2)} MB` : '-'}</Descriptions.Item>
          <Descriptions.Item label="创建时间" span={2}>{new Date(pkg.created_at).toLocaleString()}</Descriptions.Item>
          <Descriptions.Item label="签名" span={2}>{pkg.signature}</Descriptions.Item>
        </Descriptions>
        <div style={{ marginTop: 16 }}>
          <Button onClick={() => navigate('/packages')}>返回</Button>
        </div>
      </Card>
    </div>
  );
}
