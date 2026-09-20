# EShop Intelligence Dashboard — 电商数据挖掘与商业决策平台

---

## 📊 项目简介

本项目是课程团队基于教师提供的模拟商城与 `course_dataset_v2` 数据集开发的 **电商经营分析与决策平台**，包含：

- 🛒 **模拟电商商城**（React 前端 + Express 后端）：支持用户注册、浏览商品、加购、下单、支付等完整购物流程
- 📈 **智能分析仪表盘**（FastAPI + ECharts）：9 个数据挖掘子项目，覆盖经营健康度、客户分群、销售预测、营销归因等
- 🤖 **AI 分析助手**：支持接入 OpenAI 兼容大模型 API，基于实时数据生成动态分析建议

所有数据均为模拟生成（2024-04 ~ 2026-03，默认 20,000 用户），可复现，无隐私风险。商城交易闭环与课程数据集属于课程基础设施；本仓库的分析重点是指标口径、用户分析、经营诊断、可视化与决策支持。分析结论仅用于教学演示，不代表真实商业效果。

---

## 🏗️ 架构概览

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           用户 / 学生                                         │
└──────┬────────────────────────────────────────────────────┬──────────────────┘
       │ 购物端                                              │ 分析端
       ▼                                                    ▼
┌─────────────────────┐                  ┌─────────────────────────────────────┐
│   client/           │  Vite :39174     │   analytics_dashboard/              │
│   React 电商商城     │  /api 代理       │   FastAPI 分析仪表盘 :9002           │
│                     │                  │                                     │
│  • 商品浏览          │                  │   左侧导航（10 个页面）：             │
│  • 类目筛选          │                  │   ▥ 经营总览    ☷ 数据概览           │
│  • 搜索             │                  │   ⌕ 漏斗诊断    ◌ 客户分析           │
│  • 购物车           │                  │   □ 商品与购物车 ↗ 预测与库存        │
│  • 登录/注册         │                  │   ◎ 营销利润    ◇ 综合诊断           │
│  • 优惠券           │                  │   ↯ 履约售后    AI AI 分析助手       │
│  • 模拟下单          │                  │   ⚙ 系统配置                         │
│  • 订单历史          │                  │                                     │
└──────┬──────────────┘                  └──────────┬──────────────────────────┘
       │                                            │ 只读查询
       ▼                                            ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                        server/  Express API  :38173                           │
│                      (读写)  SQLite  eshop.sqlite                              │
│                                                                              │
│  20 张业务表：users / categories / spu / sku / campaigns / coupons           │
│  orders / order_items / carts / cart_items / payments / refunds              │
│  shipments / page_events / inventory_movements / product_reviews             │
│  ads_spend / user_coupons / admin_action_logs                                │
│                                                                              │
│  分析视图：dim_product / dim_user / dim_campaign / dim_date                  │
│            fact_order / fact_traffic / daily_business_summary                │
│                                                                              │
│  9 个子项目：business_health / feature_engineering / repurchase_prediction   │
│             customer_clustering / association_rules / sales_forecast         │
│             marketing_attribution / fulfillment_analysis / decision_board     │
└──────────────────────────────────────────────────────────────────────────────┘
```

---



## 🚀 快速开始

### 前置要求

| 依赖      | 版本      |
| ------- | ------- |
| Node.js | 20 / 22 LTS（推荐） |
| Python  | >= 3.10 |
| npm     | >= 9    |

### 一键启动

```bash
# 1. 安装所有依赖
npm run install:all

# 2. 生成模拟数据（首次运行；会重建本地课程数据）
npm run seed --prefix server

# 3. 一键启动（mall-api + 商城前端 + 仪表盘）
npm run dev
```

启动后访问：

| 服务          | 地址                     | 说明          |
| ----------- | ---------------------- | ----------- |
| React 商城    | http://localhost:39174 | 模拟用户购物      |
| 分析仪表盘       | http://localhost:9002  | 数据分析与决策     |
| Express API | http://localhost:38173 | 后端 REST API |

---

## 📁 目录结构

```
dashboard/
├── client/                              # 🖥️ React 电商商城（用户购物端）
│   ├── src/
│   │   ├── main.jsx                     # 单文件 React 应用（完整商城逻辑）
│   │   └── styles.css                   # 全局样式
│   ├── index.html                       # HTML 入口
│   ├── vite.config.js                   # Vite 配置，/api 代理到 Express
│   └── package.json
│
├── server/                              # 🔧 Node.js Express API（业务后端）
│   ├── src/
│   │   ├── server.js                    # Express 主服务，RESTful API
│   │   ├── db.js                        # SQLite 连接 + Schema 初始化
│   │   └── seed.js                      # 模拟数据生成脚本
│   ├── data/
│   │   └── eshop.sqlite                 # SQLite 数据库文件
│   ├── Dockerfile
│   └── package.json
│
├── analytics_dashboard/                 # 📈 Python FastAPI 分析仪表盘
│   ├── app/
│   │   ├── main.py                      # FastAPI 主应用 + AI 分析助手
│   │   ├── data_access.py               # 只读 SQLite 连接层
│   │   ├── utils.py                     # 工具函数（格式化、统计、标准化）
│   │   └── subprojects/                 # 9 个数据分析子项目
│   │       ├── business_health/         # 经营健康度（KPI、漏斗、趋势）
│   │       ├── feature_engineering/     # 特征工程（RFM 特征构建）
│   │       ├── repurchase_prediction/   # 复购倾向规则评分
│   │       ├── customer_clustering/     # RFM 规则分群
│   │       ├── association_rules/       # 关联规则（购物篮分析）
│   │       ├── sales_forecast/          # 销售预测（7天/30天 GMV）
│   │       ├── marketing_attribution/   # 营销归因（渠道 ROAS）
│   │       ├── fulfillment_analysis/    # 履约与售后分析
│   │       └── decision_board/          # 综合诊断与决策建议
│   ├── static/
│   │   ├── index.html                   # ECharts 可视化仪表盘前端
│   │   ├── app.js                       # 仪表盘前端逻辑
│   │   └── styles.css                   # 仪表盘样式
│   ├── tests/
│   │   └── smoke_test.py                # 冒烟测试
│   ├── .env.example                     # 环境变量模板
│   ├── Dockerfile
│   └── requirements.txt                 # Python 依赖
│
├── scripts/
│   └── dev.mjs                          # 一键启动脚本（npm run dev）
│
├── package.json                         # 根目录配置 + 启动脚本
├── .gitignore
└── README.md
```

---

## 📊 数据库说明

### 表结构（20 张表 + 14 个分析视图）

| 类型       | 表名                                                       | 说明      |
| -------- | -------------------------------------------------------- | ------- |
| **维度表**  | `users`                                                  | 用户信息    |
|          | `categories`                                             | 商品类目    |
|          | `spu` / `sku`                                            | 商品规格    |
|          | `campaigns`                                              | 营销活动    |
|          | `coupons`                                                | 优惠券     |
|          | `addresses`                                              | 收货地址    |
| **事实表**  | `orders` / `order_items`                                 | 订单及明细   |
|          | `carts` / `cart_items`                                   | 购物车     |
|          | `payments`                                               | 支付记录    |
|          | `refunds`                                                | 退款记录    |
|          | `shipments`                                              | 物流发货    |
|          | `page_events`                                            | 页面行为事件  |
|          | `inventory_movements`                                    | 库存变动    |
|          | `product_reviews`                                        | 商品评价    |
|          | `ads_spend`                                              | 广告花费    |
|          | `user_coupons`                                           | 用户优惠券   |
|          | `admin_action_logs`                                      | 管理员操作日志 |
| **分析视图** | `dim_product` / `dim_user` / `dim_campaign` / `dim_date` | 维度视图    |
|          | `fact_order` / `fact_traffic`                            | 事实视图    |
|          | `daily_business_summary`                                 | 日经营汇总   |

### 数据范围

- 时间跨度：2024-04-01 ~ 2026-03-31（约 2 年）
- 默认用户数：20,000
- 可配置：`SEED_USERS`、`SEED_SPU_PER_CATEGORY`、`SEED_ABANDONED_SESSIONS`

### 核心指标口径

- 客单价：`GMV / 付费订单数`。
- 客均消费：`GMV / 付费买家数`。
- 退款订单率：`已批准退款订单数 / 付费订单数`。
- 退款金额率：`已批准退款金额 / GMV`。
- 转化漏斗：按 `COUNT(DISTINCT session_id)` 统计到达各事件阶段的独立会话。
- RFM 与复购倾向评分：以数据集最大订单日期为分析基准，避免系统日期导致历史数据整体“老化”。
- 决策板中的运营动作与情景 ROI 均为待验证假设，应通过分组实验或上线复盘确认，不作为已实现收益。

---

## 📈 9 个数据分析子项目

| #   | 子项目       | 功能                    | 输出                                |
| --- | --------- | --------------------- | --------------------------------- |
| 1   | **经营健康度** | KPI 计算、月度趋势、会话级漏斗、渠道分解 | 健康评分、增长机会、风险预警                    |
| 2   | **特征工程**  | RFM 特征构建              | Recency / Frequency / Monetary 分布 |
| 3   | **复购倾向评分** | RFM 与近期趋势的可解释规则评分      | 高复购倾向用户列表、情景 ROI                   |
| 4   | **客户分群**  | RFM 五分位规则分群            | 用户价值分层及运营策略                        |
| 5   | **关联规则**  | 两两商品购物篮共现分析           | 支持度、置信度、提升度、组合建议                   |
| 6   | **销售预测**  | 30 日线性趋势与滚动一步回测        | 未来 7/30 日 GMV、MAE/MAPE/RMSE、近似波动范围  |
| 7   | **营销归因**  | 渠道 ROAS 分析            | 各渠道投入产出比、最优渠道                     |
| 8   | **履约与售后** | 发货时效、退款率、客诉分析         | 履约健康度、售后风险                        |
| 9   | **综合诊断**  | 整合所有模块                | Top 3 决策建议、优先级排序                  |

---

## 🤖 AI 分析助手

### 本地模式（默认）

无需配置，开箱即用。基于关键词匹配 + 模板引擎。回答中的运营建议是分析假设，不是已经验证的收益：

| 关键词            | 触发内容          |
| -------------- | ------------- |
| 漏斗 / 流失 / 转化   | 各阶段转化率 + 流失定位 |
| 用户 / 分群 / 运营   | 用户分群画像        |
| 营销 / ROAS / 渠道 | 渠道投入产出分析      |
| 建议 / 决策        | Top 3 决策建议    |
| 其他             | 通用健康摘要        |

### 接入大模型 API

复制 `.env.example` 为 `.env` 并填入你的配置：

```bash
DASHBOARD_AI_ENDPOINT=https://api.deepseek.com/v1/chat/completions
DASHBOARD_AI_API_KEY=sk-           #你的key填这里
DASHBOARD_AI_MODEL=deepseek-chat
```

**兼容平台**：

| 平台        | ENDPOINT                                                             |
| --------- | -------------------------------------------------------------------- |
| OpenAI    | `https://api.openai.com/v1/chat/completions`                         |
| DeepSeek  | `https://api.deepseek.com/v1/chat/completions`                       |
| 阿里百炼      | `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` |
| Ollama 本地 | `http://localhost:11434/v1/chat/completions`                         |

---

## 🛠️ 开发指南

### 单独启动各服务

```bash
# React 商城
cd client && npm run dev # http://localhost:39174

# Express API
cd server && npm run dev # http://localhost:38173

# 分析仪表盘（从仓库根目录执行）
python -m uvicorn app.main:app --app-dir analytics_dashboard --reload --port 9002
```

### 重新生成数据

```bash
npm run seed --prefix server # 清空并重新生成本地模拟数据
```




### 运行测试

```bash
python -m unittest discover -s analytics_dashboard/tests -p "test_*.py"
python analytics_dashboard/tests/smoke_test.py
```

---

## 🐳 Docker 部署

```bash
# 首次运行先在宿主机生成模拟数据，再启动两个服务
npm run seed --prefix server
docker compose up --build
```

Compose 会把 `./server/data` 挂载到 API 与分析仪表盘容器，两个服务读取同一份 `eshop.sqlite`。分析仪表盘暴露在 `http://localhost:9002`。

---

## 📚 技术栈

| 模块     | 技术                                 |
| ------ | ---------------------------------- |
| 前端商城   | React 18 + Vite 5 + 原生 CSS         |
| 后端 API | Node.js + Express + better-sqlite3 |
| 分析后端   | Python 3.10+ + FastAPI + Uvicorn   |
| 可视化    | ECharts 5.5                        |
| 数据库    | SQLite 3                           |
| 部署     | Docker                             |

---
