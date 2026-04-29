import { useState } from 'react';
import { Button, Form, Input, Card, message, Typography } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../api';
import useAuthStore from '../stores/authStore';

const { Paragraph, Title } = Typography;

export function LoginPage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const res = await authAPI.login(values.username, values.password);
      useAuthStore.getState().setAuth(res.access_token);
      message.success('登录成功');
      navigate('/dashboard');
    } catch {
      message.error('用户名或密码错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ota-login-wrap">
      <div className="ota-login-aside">
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 420 }}>
          <Title level={2} style={{ color: '#fff', marginBottom: 8 }}>OTA 发布控制中心</Title>
          <Paragraph style={{ color: 'rgba(255,255,255,0.9)', marginBottom: 0 }}>
            管理固件包、发布灰度任务、跟踪升级状态，构建稳定可控的设备升级流程。
          </Paragraph>
        </div>
      </div>

      <div className="ota-login-card-zone">
        <Card title="登录管理台" className="ota-card" style={{ width: 420 }}>
          <Form onFinish={onFinish} size="large" layout="vertical">
            <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
              <Input prefix={<UserOutlined />} placeholder="请输入账号" />
            </Form.Item>
            <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" />
            </Form.Item>
            <Form.Item style={{ marginBottom: 6 }}>
              <Button type="primary" htmlType="submit" loading={loading} block>
                登录
              </Button>
            </Form.Item>
          </Form>
        </Card>
      </div>
    </div>
  );
}
