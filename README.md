# EShop Intelligence — 经营分析与数据挖掘系统

IT 项目管理课程实践项目。围绕模拟电商数据集，构建涵盖经营诊断、客户分群、关联规则、销售预测、营销归因等模块的数据分析仪表盘。

## 项目概览

```
┌─────────────┐    ┌──────────────────────────────────────────┐
│  mall-api   │    │    analytics_dashboard                    │
│  (Express)  │    │    (FastAPI + ECharts)                     │
│   :38173    │◀───│    :9002                                   │
│             │    │                                            │
│   SQLite    │    │  ┌─ 经营总览（双Y轴趋势 + 渠道筛选 + CSV）  │
│   数据库     │    │  ├─ 数据概览（ETL 事实表/维度表分布）       │
│  ~108K 订单  │    │  ├─ 漏斗诊断（5 层转化 + 流失定位）        │
│  ~1M 事件    │    │  ├─ 客户分析（Cohort 热力图 + RFM 分群）    │
│  ~20K 用户   │    │  ├─ 商品与购物车（关联规则矩阵 + 明细表）   │
│             │    │  ├─ 预测与库存（7 天 GMV 趋势外推 + 误差）   │
│             │    │  ├─ 营销利润（渠道 ROAS 归因）               │
│             │    │  ├─ 综合诊断（WBS 表格 + 风险矩阵）          │
│             │    │  ├─ 履约售后（配送/退款/评论分析）            │
│             │    │  ├─ AI 分析助手                            │
│             │    │  └─ 系统配置                               │
└─────────────┘    └──────────────────────────────────────────┘
```

| 组件 | 技术栈 | 说明 |
|---|---|---|
| **商城后端** | Node.js + Express + SQLite | 商品/订单/用户 API，ETL 只读数据接口 |
| **商城前端** | React + Vite | 商城页面（开发模式） |
| **分析仪表盘** | Python + FastAPI | 数据挖掘子项目聚合 API + 可视化看板 |
| **前端页面** | HTML + ECharts + CSS | 11 功能模块仪表盘（含CSV导出、筛选器、加载进度提示） |

## 数据说明

数据为合成模拟数据，由 `server/src/seed.js` 使用固定随机种子 `20260427` 生成，确保每次生成完全一致。

数据层通过 **16 个 SQLite VIEW** 将源表映射到分析视图（如 `orders` → `fact_order`），保证后端查询名称一致，详见 `server/src/db.js` 和 `migrate_views.py`。

| 数据类型 | 规模 | 时间范围 |
|---|---|---|
| 用户 | 20,000 人 | — |
| 商品 | 12 类目 / 864 SKU | — |
| 订单 | ~108,000 单 | 2024-04 ~ 2026-04 |
| 行为事件 | ~1,000,000 条 | 含转化与流失流量 |
| 营销活动 | 56 个 | 24 个月 |

详细数据字典见 [docs/data-dictionary.md](docs/data-dictionary.md)。

## 快速开始

```bash
# 1. 安装所有依赖
npm run install:all

# 2. 一键启动（mall-api + 商城前端 + 仪表盘）
npm run dev
```

访问地址：

```
仪表盘：http://127.0.0.1:9002
商城 API：http://127.0.0.1:38173/api/health
商城前端：http://127.0.0.1:39174
```

## 仅启动仪表盘

```powershell
cd eshop-dashboard-practice

# 首次安装依赖
pip install -r analytics_dashboard/requirements.txt

# 启动（统一使用 9002 端口）
python -m uvicorn app.main:app --app-dir analytics_dashboard --host 127.0.0.1 --port 9002
```

打开 `http://127.0.0.1:9002`。首次加载约需 3-5 分钟（后端需运行 8 个子项目分析运算），加载遮罩会显示进度条和方法论提示。

## 仪表盘功能模块

| 模块 | 数据来源 | 说明 |
|---|---|---|
| **经营总览** | business_health | KPI 卡、月度 GMV 双 Y 轴趋势图、渠道饼图、漏斗预览；支持渠道/月份筛选器 + CSV 导出 |
| **数据概览** | ETL 元数据 | 数据表规模分布（事实表+维度表分类）、总记录数、SKU 数、数据版本与时间范围 |
| **漏斗诊断** | business_health | 5 层转化漏斗、各阶段流失定位、月度转化率趋势折线图 |
| **客户分析** | RFM + 聚类 + 复购预测 | RFM 分群饼图、聚类柱状图、Cohort 留存热力图、高潜复购用户排名、综合评分模型指标 |
| **商品与购物车** | 关联规则 | 提升度矩阵散点图、Top 关联规则明细表（含支持度%和共现次数）、CSV 导出 |
| **预测与库存** | 销售预测 | 7 天 GMV 趋势外推预测（线性回归）、月度 GMV 趋势分解、MAE/MAPE/RMSE 回测指标 |
| **营销利润** | 营销归因 | 渠道 ROAS 柱状图、效率明细表（含 CSV 导出）、预算调整建议 |
| **综合诊断** | 决策板 | 健康度评分、WBS 项目阶段表格（V1-V6）、风险矩阵、P0/P1/P2 决策列表 |
| **履约售后** | fulfillment_analysis | 配送延迟率 KPI、退款原因分布、评论评分分布、高退款/低评分商品 TOP10 |
| **AI 分析助手** | 全部子项目 | 基于规则的自然语言问答 |
| **系统配置** | — | 子项目运行状态监测 |

## 数据挖掘子项目

后端 8 个数据分析模块，位于 `analytics_dashboard/app/subprojects/`：

| 子项目 | 算法/方法 | 输出 |
|---|---|---|
| `business_health` | SQL 聚合 + 漏斗分析 | KPI、月度趋势、渠道拆解、转化漏斗 |
| `feature_engineering` | RFM 模型（R×F×M 分桶） | RFM 标签与分群、Cohort 留存矩阵 |
| `customer_clustering` | K-Means 规则分群 | 5 类客户画像 |
| `repurchase_prediction` | 加权综合评分模型 | 高潜复购名单、模型阈值/ROI |
| `association_rules` | Apriori（手工实现） | 支持度/置信度/提升度规则 + 共现次数 |
| `sales_forecast` | 线性回归趋势外推 | 7 天 GMV 逐日预测 + MAE/MAPE/RMSE 回测 |
| `marketing_attribution` | ROAS/CPA/归因 | 渠道效率 + 预算建议 |
| `fulfillment_analysis` | 配送/退款/评价分析 | 配送延迟率、退款原因、评分分布、TOP10 商品 |

## 项目文件结构

```
eshop-dashboard-practice/
├── server/                     # 商城后端
│   ├── src/
│   │   ├── db.js              # SQLite 建库建表（含 16 个分析视图 DDL）
│   │   ├── seed.js            # 数据种子生成器
│   │   └── server.js          # Express API 接口
│   ├── migrate_views.py       # VIEW 映射脚本（源表 → 分析视图）
│   ├── data/                  # SQLite 数据库文件
│   ├── Dockerfile
│   ├── package.json
│   └── package-lock.json
├── client/                     # 商城前端 (React + Vite)
│   ├── src/
│   │   ├── main.jsx           # 商城页面（商品/购物车/下单）
│   │   └── styles.css
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── package-lock.json
├── analytics_dashboard/        # 分析仪表盘
│   ├── app/
│   │   ├── main.py            # FastAPI 主应用（路由/缓存/AI分析）
│   │   ├── data_access.py     # SQLite 只读连接层
│   │   ├── utils.py            # 工具函数
│   │   └── subprojects/       # 8 个子项目（每项一个目录）
│   ├── static/
│   │   ├── index.html         # 仪表盘页面（11 个 Tab）
│   │   ├── app.js             # 前端逻辑（ECharts 渲染 + CSV 导出 + 加载进度）
│   │   ├── styles.css         # 仪表盘样式
│   │   └── assets/            # 静态资源
│   ├── tests/
│   │   └── smoke_test.py      # 冒烟测试
│   ├── Dockerfile
│   └── requirements.txt
├── scripts/
│   └── dev.mjs                 # 一键启动脚本（端口统一 9002）
├── docs/                       # 课程文档
│   ├── course-teaching-syllabus.md
│   ├── data-dictionary.md
│   ├── source-to-dataset-mapping.md
│   ├── student-assignment.md
│   ├── student-feature-requirements.md
│   └── ubuntu-docker-compose-guide.md
├── docker-compose.yml          # Docker 部署（端口 9002）
├── package.json                # 根级 npm 脚本
├── .gitignore
└── README.md
```

## 加载体验

打开仪表盘后，页面会显示全屏加载遮罩，包含：

- **进度条**：从 5% → 100% 分 11 步推进
- **轮换提示**：CRISP-DM → RFM 分群 → Cohort 留存 → Apriori 关联规则 → 趋势外推 → WBS → 安全库存 → 营销归因 → 数据建模
- **耗时提示**：底部显示「预计耗时 3-5 分钟，请耐心等待」
- 加载完成后遮罩自动淡出

## 验证与测试

```bash
npm run verify               # 构建商城前端
npm run test:dashboard       # 运行仪表盘冒烟测试
```

## Docker Compose 部署

```bash
docker compose up --build -d
docker compose ps
```

访问 `http://localhost:9002`。

详细 Ubuntu 部署步骤见 [docs/ubuntu-docker-compose-guide.md](docs/ubuntu-docker-compose-guide.md)。

## 课程参考文档

| 文档 | 内容 |
|---|---|
| [教学大纲](docs/course-teaching-syllabus.md) | 14 周教学安排与课堂任务 |
| [数据字典](docs/data-dictionary.md) | 18 张源表 + 16 个分析视图的字段说明 |
| [ETL 映射](docs/source-to-dataset-mapping.md) | OLTP 源表到分析视图的转换逻辑 |
| [学生作业](docs/student-assignment.md) | 作业要求与评分建议 |
| [功能需求](docs/student-feature-requirements.md) | R0-R11 模块功能规格 |
| [部署指南](docs/ubuntu-docker-compose-guide.md) | Ubuntu 环境 Docker 部署步骤 |
