# OTA Server Monorepo

## 目录
- `backend/`: Go API 与 Worker
- `frontend/`: React 管理台
- `docker-compose.yml`: 本地一键启动
- `docker-compose.staging.yml`: 预发覆盖配置
- `.env.example`: 环境变量模板

## 快速启动
1. 复制环境变量文件：
   - `cp .env.example .env`
   - 按注释填写密钥占位符（`<...>`）
2. 启动服务：
   - `docker compose up -d`
3. 访问地址：
   - API 健康检查：`http://localhost:8080/healthz`
   - 管理台：`http://localhost:5173`
   - RabbitMQ 管理台：`http://localhost:15672`（guest/guest）
   - Keycloak 管理台：`http://localhost:18080`（admin/admin）
   - MinIO Console：`http://localhost:9001`（minioadmin/minioadmin）

## 本地联调默认配置
- ⚠️ 以下默认账号/密码仅用于开发联调，严禁用于生产环境。
- OIDC Provider：Keycloak（realm: `ota-dev`）
- OIDC Client：`ota-console`
- OIDC Client Secret：`ota-dev-client-secret`
- OIDC 测试用户：`dev-admin` / `Admin@123456`
- S3 兼容存储：MinIO
- 默认 Bucket：`ota-packages`（由 `minio-init` 自动创建）

## OIDC 与 S3 关键环境变量
- OIDC:
   - `OIDC_ENABLED=true`
   - `OIDC_ISSUER_URL=http://keycloak:8080/realms/ota-dev`
   - `OIDC_AUTHORIZE_URL=`（可选覆盖）
   - `OIDC_TOKEN_URL=`（可选覆盖）
   - `OIDC_USERINFO_URL=`（可选覆盖）
   - `OIDC_CLIENT_ID=ota-console`
   - `OIDC_CLIENT_SECRET=ota-dev-client-secret`
   - `OIDC_REDIRECT_URL=http://localhost:8080/api/v1/auth/sso/callback`
   - `OIDC_STATE_SIGNING_KEY=<state-signing-key>`（建议独立配置，未配置时回落 `JWT_SECRET`）
   - `OIDC_STATE_TTL_SEC=300`
- API 运行:
   - `API_AUTO_MIGRATE_ON_START=false`（默认关闭，建议通过迁移工具执行）
- Worker:
   - `WORKER_TASK_STATS_RETENTION_HOURS=168`（默认保留最近 7 天快照）
- Local Auth:
   - `LOCAL_AUTH_ENABLED=false`
   - `LOCAL_ADMIN_USERNAME=admin`
   - `LOCAL_ADMIN_PASSWORD_HASH=<bcrypt-hash>`
   - 密码需预先生成 bcrypt 哈希后填入该变量。
- S3:
   - `S3_ENDPOINT=http://minio:9000`
   - `S3_BUCKET=ota-packages`
   - `S3_ACCESS_KEY_ID=minioadmin`
   - `S3_SECRET_ACCESS_KEY=minioadmin`
   - `S3_PUBLIC_BASE_URL=http://localhost:9000/ota-packages`

## 当前已实现
- API 服务（Gin）
- Worker 统计任务（周期快照 + 超阈值自动回滚）
- 本地登录接口：`POST /api/v1/auth/login`（默认禁用，启用后使用 bcrypt 哈希校验）
- OIDC 开关接口：
   - `GET /api/v1/auth/sso/login`
   - `GET /api/v1/auth/sso/callback`
   - 回调已支持 state 校验 + code->token->userinfo 交换（未配置时可回落 Mock）
   - 默认本地 Provider：Keycloak（realm: `ota-dev`，client: `ota-console`）
- 管理端接口：
   - `GET /api/v1/ping`
   - `POST /api/v1/packages/upload-url`
   - `POST /api/v1/packages/complete`
   - `POST /api/v1/packages`
   - `POST /api/v1/release-tasks`
   - `POST /api/v1/release-tasks/:task_id/actions`（pause/resume/rollback）
   - `GET /api/v1/release-tasks/:task_id/audits`
- 设备端接口：
   - `POST /device/v1/check-update`（按分组/产品型号/硬件版本筛选）
   - 返回真实 S3/MinIO 预签名下载 URL（失败时回落占位签名）
   - `POST /device/v1/report-status`（支持幂等键）
- 本地对象存储：MinIO（自动创建 bucket: `ota-packages`）
- `sqlc` 查询定义与生成代码（`backend/queries/ota.sql`、`backend/internal/store`）
- React 管理台骨架页面
- PostgreSQL 初始化脚本：`backend/migrations/001_init.sql`

## 安全密钥说明
- `JWT_SECRET`：管理端登录后签发 JWT 的签名密钥。
- `DEVICE_SIGNING_SECRET`：设备请求签名（HMAC）校验密钥。
- `OIDC_CLIENT_SECRET`：SSO 对接 OIDC 提供方的客户端密钥。

## 下一步
1. 增加 OIDC 交换失败场景的细粒度错误码与重试策略。
2. 补充包上传、任务流转与设备上报的集成测试。

## 包上传最小联调流程
1. 调用 `POST /api/v1/packages/upload-url` 获取 `upload_url` 与 `package_id`。
2. 使用返回的 `upload_url` 直接 `PUT` 二进制到 MinIO/S3。
3. 调用 `POST /api/v1/packages/complete`，提交 `package_id`、版本信息、哈希、签名和文件大小。
4. 服务端会校验对象存在与大小（以及可用时的哈希元数据），通过后入库为可发布包。

## 常见问题
1. `sqlc` 命令找不到：
   - 使用 `$(go env GOPATH)/bin/sqlc` 执行，或把 `$(go env GOPATH)/bin` 加入 `PATH`。
2. `sqlc generate` 报 `sqlc.yaml does not exist`：
   - 需要在 `backend/` 目录执行生成命令。
3. Keycloak 或 MinIO 首次拉取较慢：
   - `docker compose up -d` 可能需要等待镜像拉取完成后再检查状态。
