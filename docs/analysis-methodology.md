# 分析方法与指标口径

本文记录当前代码实际执行的计算。课程大纲和作业要求提出的模型、实验与管理功能属于教学目标，不能作为已实现能力或效果证明。实现入口为 `analytics_dashboard/app/subprojects/`，视图定义位于 `server/src/db.js`。

## 数据层与共同约定

- `server/src/db.js` 建立 20 张业务表和 14 个 SQLite 视图。`dim_*`、`fact_*`、`daily_business_summary` 是即时查询的 `CREATE VIEW`，没有独立的 ETL 批处理或物化宽表。
- `fact_order` 一行一订单，保留源表 `orders.status` 和 `paid_amount`；`order_date = date(orders.created_at)`。因此按日、月归期使用**创建时间**。
- 经营指标的付费订单集合为 `status IN ('paid', 'completed')`。数据生成器会把部分退款订单改为 `refunded`，这类订单不再进入该集合。
- 分析服务通过 `analytics_dashboard/app/data_access.py` 以 SQLite `mode=ro` 查询。`ESHOP_DB_PATH` 可覆盖默认文件路径。
- FastAPI 对汇总结果缓存 300 秒。`POST /api/reload` 清空缓存并重新计算；页面显示的“实时”结果可能落后于刚写入的交易。

## 经营指标

以下口径对应 `business_health.run()`，在没有分母时返回 0。

| 指标 | 表与过滤条件 | 计算与粒度 |
| --- | --- | --- |
| GMV | `fact_order`，状态为 `paid` 或 `completed` | `SUM(paid_amount)`；全量或按 `order_date` / `channel` 分组，未扣退款。 |
| 付费订单数 | 同上 | `COUNT(DISTINCT order_id)`。 |
| 付费买家数 | 同上 | `COUNT(DISTINCT user_id)`。 |
| 客单价 AOV | 同上 | GMV / 付费订单数。 |
| 客均消费 | 同上 | GMV / 付费买家数。 |
| 退款订单率 | `fact_refund` 中全部 `approved` 退款；分母为上述付费订单 | `COUNT(DISTINCT refund.order_id) / 付费订单数`。 |
| 退款金额率 | 同上 | `SUM(approved refund.amount) / GMV`。 |
| 月度趋势 | `fact_order`，状态为 `paid` 或 `completed` | 按 `strftime('%Y-%m', order_date)` 汇总 GMV 和订单数。 |
| 渠道贡献 | 同上 | 按订单已有 `channel` 汇总；渠道占比 = 渠道 GMV / 全部 GMV。 |

**退款口径限制：**退款分子未限制原订单是否仍为 `paid/completed`；数据生成器还会把退款订单状态改成 `refunded`。两边当前都未设日期过滤，但退款没有按原订单状态与分母集合配对。因此两个退款比率是当前代码的描述性值，不应直接用作严格对账或跨期比较。`净销售额 = GMV - 已批准退款金额`可作为另行定义的分析值，但当前经营总览的 GMV 不是净销售额。

例如，经营总览的 GMV 与订单数可用下列查询复核：

```sql
SELECT
  COALESCE(SUM(paid_amount), 0) AS gmv,
  COUNT(DISTINCT order_id) AS paid_orders,
  COUNT(DISTINCT user_id) AS paid_buyers
FROM fact_order
WHERE status IN ('paid', 'completed');
```

### 会话漏斗

`business_health` 对 `fact_traffic` 中每一种 `event_type` 分别执行 `COUNT(DISTINCT session_id)`，忽略空会话 ID。页面使用的阶段是 `view_home`、`view_product`、`add_to_cart`、`checkout`、`pay_success`。相邻阶段比率为后一阶段计数 / 前一阶段计数；月度趋势先按 `event_date` 的月份分别计数后再相除。

这个计算没有要求事件发生在同一会话、同一月份的固定顺序，也没有逐会话校验路径。商城在线交互与模拟数据生成器使用的事件名并不完全一致，新增交易不一定能完整进入这条课程漏斗。

## 九个分析模块

| 模块 | 实现方法 | 输出与解读边界 |
| --- | --- | --- |
| `business_health` | 上述 KPI、月度/渠道聚合、事件级独立会话计数 | 经营描述与阈值提示，不是实验效果。 |
| `feature_engineering` | 对有 `paid/completed` 订单的用户计算 R/F/M；基准日是该集合最大的 `order_date`；按首次付费月份建立 Cohort | R 为距最近订单天数，F 为去重订单数，M 为 `SUM(paid_amount)`；排序分五档并按规则给用户标签，同时输出按月再次购买率矩阵。 |
| `repurchase_prediction` | 有购买记录的用户按 R/F/M/近 30 天趋势归一化，并按 0.30/0.25/0.25/0.20 加权 | 分数 ≥60 列入高倾向名单，展示前 20 位。没有训练分类模型、留出集或真实复购准确率。 |
| `customer_clustering` | 所有用户通过左连接计算 R/F/M，按排序分五档并使用条件规则分群 | 这是 RFM 规则分层，不是 K-Means。代码中的“未转化浏览客”条件检查 `F == 0`，但 F 档分数为 1–5，该分支当前不会触发。 |
| `association_rules` | 按订单 ID 倒序最多取 20,000 个有明细订单，保留至少 2 个不同 SKU 的购物篮，低频 SKU 预筛后只枚举两两组合 | 返回最多 20 条按提升度排序的有向规则；没有挖掘更长频繁项集。 |
| `sales_forecast` | 对最近最多 30 个有付费订单的日期拟合一元线性趋势，向后投影 7/30 期 | 提供一步滚动回测误差和近似波动范围；不足 31 个观测日时误差返回 0 代表未回测。空白日未补零，也未建模节假日、促销和季节性。 |
| `marketing_attribution` | 按 `channel` 分别聚合广告数据和已付费订单，再在渠道层拼接 | ROAS 等渠道效率指标及固定阈值的预算建议；没有用户触点归因或因果增量估计。 |
| `fulfillment_analysis` | 从 `fact_fulfillment`、`fact_refund`、`fact_product_review` 聚合 | 包裹延迟率、退款原因、评分分布和高退款商品；不是履约干预实验。 |
| `decision_board` | 汇总其他模块结果并应用阈值规则 | 决策优先级与建议是假设，需通过真实试点或对照实验验证。 |

### RFM 与复购评分

`feature_engineering` 的 R/F/M 只覆盖有付费订单用户；`customer_clustering` 则把没有付费订单的用户也纳入左连接后的分档。两个模块的分析人群不同，不能直接比较各分群人数。所有基准日取数据集内最后一个付费订单日期，避免教学历史数据因系统当前日期不断“老化”；新增交易会推进该基准日。`feature_engineering` 还以用户首次付费订单所在月为 Cohort，计算该组在后续月份再次下单的人数 / 首月用户数，展示最近最多 12 个 Cohort 的矩阵；这衡量购买留存，不是页面访问留存。

`repurchase_prediction` 对 R（越近越高）、F、M 做样本内最小最大归一化，趋势分数比较最近 30 天与之前 30 天的购买次数。分数公式为：

```text
score = 0.30 × R_score + 0.25 × F_score + 0.25 × M_score + 0.20 × trend_score
```

返回字段 `estimated_roi` 的计算是 `平均客单价 × 0.15 / 5`，其中 0.15 为假设转化率、5 元为假设触达成本（元/人）。这是情景收益与成本之比，不包含实测转化、毛利或增量，因此不应作为实际营销 ROI。

### 关联规则

模块在候选订单中保留至少两个不同 SKU 的购物篮，以有效购物篮数 `N` 为分母。先用 `MIN_SUPPORT = 0.001`（0.1%）筛去低频单品，再对剩余购物篮计算有向 `A → B`：

```text
support(A,B)    = 同时包含 A 与 B 的购物篮数 / N
confidence(A→B) = 同时包含 A 与 B 的购物篮数 / 包含 A 的购物篮数
lift(A→B)       = support(A,B) / (support(A) × support(B))
```

其中实际输出的 `N` 是**单品预筛后仍至少包含两个 SKU 的购物篮数**。规则过滤阈值为 `confidence >= 0.05`、`lift >= 0.5`，按 lift 取前 20；`MIN_SUPPORT` 是单品预筛阈值，不是最终成对规则的最低支持度。返回的 `summary.total_transactions` 是源表中有订单明细的总订单数，与计算支持度的 `N` 不同；每条规则的 `total_transactions` 才是 `N`。

### 销售趋势与回测

`sales_forecast` 按 `fact_order.order_date` 汇总付费订单日 GMV，取最后最多 30 个观测日拟合直线，并将负预测截为 0。因为查询只返回有订单的日期，这里的“30 天”在有断档时实际是 30 个观测日。

滚动一步回测使用同样的线性方法，输出 MAE、RMSE 和 MAPE（实际值为 0 的观测不计入 MAPE）。展示的上下范围为 `预测 ± 1.96 × 回测残差标准差`，并截断负下界；不足 31 个观测日时没有回测残差，误差指标为 0，并不表示预测完全准确。它是正态近似的启发式波动范围，未校准为覆盖率已验证的 95% 预测区间。`safety_stock_gmv = 1.5 × 最近窗口日 GMV 标准差`，单位为元，仅是销售波动缓冲金额参考，不是 SKU 件数。

### 渠道效率与履约

`marketing_attribution` 的 `ROAS = 渠道 GMV / 同渠道广告支出`、`CTR = clicks / impressions`。`CVR` 优先使用广告表 `conversions / clicks`，若 `conversions` 为 0 则用订单数 / clicks；`CPA` 相应地使用支出 / conversions 或支出 / 订单数。分母为 0 时返回 0。模块返回的 `method: last_click_attribution` 是接口字段名称，代码实际只依赖订单已有 `channel`，没有重建用户触点链。预算“加投/维持/压缩”等建议是 ROAS 阈值规则，不代表改变预算后会得到相同回报。

`fulfillment_analysis` 的包裹延迟率为 `标记延迟的包裹记录数 / 包裹记录数`，其中 `is_late` 来自 `delivery_days > promised_days`。`delivery_days` 为空时 SQL 将其标为未延迟，所以未送达记录也可能进入“按时”一侧；该比率不等同于实际准时送达率。退款原因分布查询所有 `fact_refund` 记录，与经营总览只统计 `approved` 退款的口径不同，比较两处图表时应注意。

## 复现和验证

1. 安装依赖并执行 `npm run seed --prefix server`。seed 使用固定随机种子 `20260427`，默认 20,000 用户、每类 24 个 SPU、120,000 个未转化会话，订单与流量生成的基准日期从 2024-04-01 到 2026-03-31，部分履约和售后事件可延后。再次运行会**重建数据库并清除后续交互数据**。
2. 运行 `npm run test:analytics` 检查指标分母、漏斗去重、RFM/评分基准日及线性回测等逻辑；运行 `npm run build:mall-web` 验证商城构建。`npm run verify` 串联这两项。
3. 数据库已生成后，运行 `npm run test:dashboard` 做页面和主要 API 的冒烟检查。也可启动服务后访问 `/health`，确认 `database` 字段为 `connected`（仅表示文件存在），再请求 `/api/summary` 验证查询。
4. 需要核对某个展示值时，先 `POST /api/reload` 清除 300 秒缓存，再根据本页列出的表、过滤条件和粒度执行 SQL。测试和演示结果只支持代码计算正确性，不构成真实业务效果评估。

后续若用于真实经营决策，优先统一退款分子分母、规范全流程埋点、建立带时间切分的预测验证，再通过随机对照或分阶段试点评估运营动作。
