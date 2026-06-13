# EShop Intelligence Dashboard — 电商数据挖掘与商业决策平台

---

## 📊 项目简介

本项目是一个完整的 **模拟电商经营分析平台**，包含：

- 🛒 **模拟电商商城**（React 前端 + Express 后端）：支持用户注册、浏览商品、加购、下单、支付等完整购物流程
- 📈 **智能分析仪表盘**（FastAPI + ECharts）：9 个数据挖掘子项目，覆盖经营健康度、客户分群、销售预测、营销归因等
- 🤖 **AI 分析助手**：支持接入 OpenAI 兼容大模型 API，基于实时数据生成动态分析建议

所有数据均为模拟生成（2024-04 ~ 2026-03，默认 20000 用户），可复现，无隐私风险。

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
│  16 张业务表：users / categories / spu / sku / campaigns / coupons           │
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
└──────────────────────────────────────────────────────────────────────────────┘──────────────┘
```

---



## 🚀 快速开始

### 前置要求

| 依赖      | 版本      |
| ------- | ------- |
| Node.js | >= 18   |
| Python  | >= 3.10 |
| npm     | >= 9    |

### 一键启动

```bash
# 1. 安装所有依赖
npm run install:all

# 3.生成模拟数据（首次运行）
cd ../server
npm run seed

# 2. 一键启动（mall-api + 商城前端 + 仪表盘）
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
│   │       ├── repurchase_prediction/   # 复购预测
│   │       ├── customer_clustering/     # 客户聚类（用户分群）
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

### 表结构（16 张表 + 多个视图）

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

---

## 📈 9 个数据分析子项目

| #   | 子项目       | 功能                    | 输出                                |
| --- | --------- | --------------------- | --------------------------------- |
| 1   | **经营健康度** | KPI 计算、月度趋势、漏斗分析、渠道分解 | 健康评分、增长机会、风险预警                    |
| 2   | **特征工程**  | RFM 特征构建              | Recency / Frequency / Monetary 分布 |
| 3   | **复购预测**  | 基于历史行为预测复购概率          | 复购概率分布、高潜用户列表                     |
| 4   | **客户聚类**  | 用户分群（K-Means）         | 5-7 个用户画像分群                       |
| 5   | **关联规则**  | 购物篮分析（Apriori）        | 频繁项集、关联规则、提升度                     |
| 6   | **销售预测**  | 线性回归外推                | 未来 7 天 / 30 天 GMV 预测              |
| 7   | **营销归因**  | 渠道 ROAS 分析            | 各渠道投入产出比、最优渠道                     |
| 8   | **履约与售后** | 发货时效、退款率、客诉分析         | 履约健康度、售后风险                        |
| 9   | **综合诊断**  | 整合所有模块                | Top 3 决策建议、优先级排序                  |

---

## 🤖 AI 分析助手

### 本地模式（默认）

无需配置，开箱即用。基于关键词匹配 + 模板引擎：

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
React 商城
cd client && npm run dev # http://localhost:39174

Express API
cd server && npm run dev # http://localhost:38173

分析仪表盘
cd analytics_dashboard && uvicorn app.main:app --reload --port 9002
```

### 重新生成数据

```bash
cd server npm run seed # 清空并重新生成数据
```




### 运行测试

```bash
cd analytics_dashboard python -m pytest tests/
```

---

## 🐳 Docker 部署

```bash
# 构建并启动 Express API
docker build -t eshop-api server/ docker run -p 38173:38173 eshop-api
```

```
# 构建并启动分析仪表盘
docker build -t eshop-dashboard analytics_dashboard/ docker run -p 9002:9002 eshop-dashboard
```

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