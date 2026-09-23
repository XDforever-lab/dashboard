# 数据字典：`course_dataset_v2`

`server/src/seed.js` 按固定随机种子生成教学用模拟商城数据，覆盖用户、商品、访问、订单、营销、履约、退款和评论。本文件说明数据对象及粒度；**当前仪表盘的计算公式、过滤条件和方法限制**以[分析方法与指标口径](analysis-methodology.md)为准。

## 数据规模与复现

默认配置为 20,000 用户、12 个类目、每类 24 个 SPU、每个 SPU 3 个 SKU，以及 120,000 个未转化会话；订单与流量生成的基准日期为 2024-04-01 至 2026-03-31，部分履约和售后事件可延后。由此对应约 288 个 SPU、864 个 SKU。订单、事件、退款等行数由生成逻辑和配置决定，不能把约 10 万订单、约 70 万事件等教学规模目标当作固定结果。

| 环境变量 | 默认值 | 含义 |
| --- | ---: | --- |
| `SEED_USERS` | `20000` | 生成用户数 |
| `SEED_SPU_PER_CATEGORY` | `24` | 每类生成的 SPU 数 |
| `SEED_ABANDONED_SESSIONS` | `120000` | 未转化会话数 |

`npm run seed --prefix server` 会**删除并重建**本地数据库，覆盖运行商城后产生的订单与事件。`server/data/eshop.sqlite` 未随仓库提交，需要首次运行时生成。相同代码和参数使用固定随机种子 `20260427`，便于重复教学实验。

## 20 张业务源表

| 表 | 粒度 | 主要内容 |
| --- | --- | --- |
| `users` | 用户 | 注册渠道、地区、会员等级、生命周期字段 |
| `addresses` | 用户地址 | 演示收货地址与省市 |
| `categories` | 类目 | 商品一级类目 |
| `spu` | 标准商品 | 名称、品牌、描述、图片 |
| `sku` | 可售规格 | 价格、成本、供应商、库存 |
| `campaigns` | 活动 | 渠道、类型、目标人群、预算与对照组标记 |
| `coupons` | 优惠券模板 | 门槛、面额、发放与使用计数 |
| `user_coupons` | 用户券 | 发放、核销时间及订单关联 |
| `carts` | 购物车 | 用户购物车记录 |
| `cart_items` | 购物车行 | 购物车中的 SKU 与数量 |
| `orders` | 订单 | 金额、状态、渠道、创建与支付时间 |
| `order_items` | 订单行 | SKU、数量、单价、成本、优惠 |
| `payments` | 支付流水 | 模拟支付方式与结果 |
| `shipments` | 履约包裹 | 承运商、承诺及实际时效 |
| `refunds` | 退款记录 | 原因、金额、审核状态 |
| `page_events` | 行为事件 | 页面与交易事件，含未转化会话 |
| `ads_spend` | 活动日投放 | 曝光、点击、转化、消耗 |
| `inventory_movements` | 库存流水 | 初始库存、补货、销售出库 |
| `product_reviews` | 评论 | 评分、情感与内容标签 |
| `admin_action_logs` | 管理操作日志 | 后台审计记录 |

## 14 个分析视图

这些对象是 `server/src/db.js` 中的 SQLite `CREATE VIEW`，查询时直接读取业务源表，并非预先物化的 ETL 结果。

| 视图 | 粒度 | 典型用途 |
| --- | --- | --- |
| `dim_date` | 日期 | 年、月、星期与周末标记 |
| `dim_product` | SKU | 类目、品牌、价格带、成本、供应商 |
| `dim_user` | 用户 | 地区、注册渠道、会员等级 |
| `dim_campaign` | 活动 | 渠道、类型、目标人群、预算 |
| `fact_order` | 订单 | GMV、客单价、复购、渠道 |
| `fact_order_item` | 订单行 | 品类贡献、毛利、购物篮 |
| `fact_traffic` | 页面事件 | 漏斗、路径、未转化行为 |
| `fact_ads_spend` | 活动日消耗 | CTR、CPA、ROAS |
| `fact_coupon_use` | 用户券 | 发放、核销和券使用 |
| `fact_refund` | 退款 | 退款原因与售后风险 |
| `fact_fulfillment` | 包裹 | 配送时效与延迟 |
| `fact_inventory_movement` | 库存流水 | 补货与出库 |
| `fact_product_review` | 评论 | 评分与体验问题 |
| `daily_business_summary` | 创建日期 × 订单渠道 | 付费订单的经营日报 |

`daily_business_summary` 直接从 `orders` 按 `date(created_at)` 和 `channel` 聚合，仅包含 `paid/completed` 订单。`fact_order_item` 视图本身不筛选订单状态；如需“已付费商品销售”口径，应与 `fact_order` 连接后再过滤状态。

## 常用指标速查

| 指标 | 当前仪表盘口径 |
| --- | --- |
| GMV | `fact_order` 中 `paid/completed` 订单的 `SUM(paid_amount)`，未扣退款 |
| 订单数 / 买家数 | 同一付费集合内分别按订单 ID / 用户 ID 去重 |
| 客单价 / 客均消费 | GMV / 付费订单数；GMV / 付费买家数 |
| 退款订单率 | `approved` 退款订单去重数 / 付费订单数，分子包含已转为 `refunded` 等状态的订单 |
| 漏斗阶段 | 各 `event_type` 分别按 `session_id` 去重，不验证有序路径 |
| 渠道 ROAS | 订单自带渠道的 GMV / 同渠道广告消耗，非触点级因果归因 |
| RFM | 以数据集中最后一个付费订单日期为基准计算最近购买天数、次数、金额 |

字段与过滤条件详见[分析方法与指标口径](analysis-methodology.md)，源表到各视图的关系见[源表与分析视图映射](source-to-dataset-mapping.md)。

## 可扩展的课程分析题目

仪表盘已实现按首次付费月分组的基础 Cohort 再次购买率矩阵；更深入的 Cohort 驱动分析、LTV、券敏感度、活动增量、SKU 安全库存和流失分类器等属于可选的后续课程任务。已有模块的实现范围以根目录 README 和代码为准。

## 数据来源与使用

商品名称、品牌、类目、价格和用户记录为教学合成数据；商品图片使用 `placehold.co` 动态占位 URL。数据不来自商业平台爬取，也不包含真实用户隐私。模拟数据中的渠道差异、转化和退款模式由生成逻辑设定，分析结果不能直接推断真实商业效果。
