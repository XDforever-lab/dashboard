# Ubuntu Docker Compose 部署

本指南对应仓库根目录的 `docker-compose.yml`。Compose 只启动 `mall-api`（38173）和 `dashboard`（9002），**不包含 React 商城前端**。首次启动必须先生成未随仓库提交的 SQLite 数据库。

## 1. 准备环境和项目

在 Ubuntu 上安装 Docker Engine 与 Compose 插件，步骤以 [Docker 官方 Ubuntu 安装指南](https://docs.docker.com/engine/install/ubuntu/)为准。确认以下命令可运行：

```bash
docker --version
docker compose version
```

把仓库克隆或上传到服务器并进入根目录，例如：

```bash
git clone https://github.com/XDforever-lab/dashboard.git
cd dashboard
```

## 2. 首次生成课程数据

下列命令通过 `mall-api` 镜像执行 seed，生成的 `server/data/eshop.sqlite` 保存在宿主机挂载目录中，无需在宿主机安装 Node.js：

```bash
docker compose build mall-api
docker compose run --rm mall-api npm run seed
```

**只在首次初始化或明确需要重置演示数据时运行 seed。** 再次执行会删除并重建数据库，清除后续商城交易与事件。保留现有数据时先备份 `server/data/`。

## 3. 构建并启动

```bash
docker compose up --build -d
docker compose ps
docker compose logs --tail=50 dashboard
```

Compose 将 `./server/data` 分别挂载到 API 的 `/app/data` 和仪表盘的 `/data`。挂载本身没有 `:ro` 选项；分析服务的 SQLite 连接使用 `mode=ro`。如需从另一台电脑访问，请按服务器防火墙与网络配置开放相应端口。

## 4. 验收

| 服务 | 地址 |
| --- | --- |
| 仪表盘页面 | `http://服务器IP:9002/` |
| 仪表盘健康检查 | `http://服务器IP:9002/health` |
| Express API 健康检查 | `http://服务器IP:38173/api/health` |

在服务器上执行：

```bash
curl http://127.0.0.1:9002/health
curl http://127.0.0.1:9002/api/summary
curl http://127.0.0.1:38173/api/health
```

仪表盘 `/health` 的 `status: ok` 只表示服务响应；`database: connected` 只表示数据库文件存在。再访问 `/api/summary` 验证实际查询。若显示 `database: not found`，检查 `server/data/eshop.sqlite` 是否生成，以及 Compose 挂载路径。

## 5. 停止与维护

```bash
docker compose down
docker compose up -d
```

`docker compose down` 不会删除 `server/data/eshop.sqlite`。若要更新展示数据，启动后可调用 `POST http://127.0.0.1:9002/api/reload` 清除 300 秒分析缓存；这不会重建数据库。要重新生成模拟数据，先备份现有文件并停掉服务，再执行第 2 节 seed。

仪表盘的图表脚本来自 ECharts CDN；离线服务器或受限网络需要为该前端资源提供可访问的替代地址。
