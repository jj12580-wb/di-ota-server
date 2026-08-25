import { useEffect, useState } from 'react';
import { Breadcrumb, Button, Card, Descriptions, message, Tag } from 'antd';
import { useParams, useNavigate } from 'react-router-dom';
import { packageAPI, Package } from '../api';

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
    <div className="ota-page ota-page-fill">
      <Breadcrumb style={{ marginBottom: 16 }} items={[
        { title: <a onClick={() => navigate('/packages')}>固件包</a> },
        { title: pkg.alias || pkg.name || pkg.package_id },
      ]} />
      <Card title="包信息" className="ota-card">
        <Descriptions bordered column={{ xs: 1, sm: 2 }}>
          <Descriptions.Item label="包 ID">{pkg.package_id}</Descriptions.Item>
          <Descriptions.Item label="别名">{pkg.alias || pkg.name || '-'}</Descriptions.Item>
          <Descriptions.Item label="状态"><Tag>{pkg.status}</Tag></Descriptions.Item>
          <Descriptions.Item label="产品代码">{pkg.product_code}</Descriptions.Item>
          <Descriptions.Item label="版本">{pkg.version}</Descriptions.Item>
          <Descriptions.Item label="文件哈希" span={2}>{pkg.file_hash}</Descriptions.Item>
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
