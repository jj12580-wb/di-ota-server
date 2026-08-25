# di-ota-server-dev（现网 iot.map360.cn）

- 分支：`experiment/relax-upgrade-state-machine`
- 编排：`docker-compose.yml` + `docker-compose.iot.yml`
- 项目名：`di-ota-server-dev`
- 管理台登录：`admin` / `admin123`

## 常用命令

```bash
cd /root/workspace/di-ota-server-dev
docker-compose -p di-ota-server-dev -f docker-compose.yml -f docker-compose.iot.yml ps
docker-compose -p di-ota-server-dev -f docker-compose.yml -f docker-compose.iot.yml logs -f ota-api
docker-compose -p di-ota-server-dev -f docker-compose.yml -f docker-compose.iot.yml restart ota-api ota-console
```

恢复旧版见 `../di-ota-server/RESTORE-IOT.md`。
