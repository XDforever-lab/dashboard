from ...data_access import query
import math


def run():
    daily_rows = query("""
        SELECT
            order_date,
            COALESCE(SUM(paid_amount), 0) AS daily_gmv
        FROM fact_order
        WHERE status IN ('paid', 'completed')
        GROUP BY order_date
        ORDER BY order_date
    """)

    if not daily_rows:
        return {
            "title": "销售预测与库存备货",
            "description": "最近30天移动平均、标准差、波动系数、安全库存",
            "method": "moving_average_30d",
            "forecast": {
                "daily_avg_gmv": 0,
                "daily_std_gmv": 0,
                "cv": 0,
                "next_7d_gmv": [0] * 7,
                "next_7d_lower": [0] * 7,
                "next_7d_upper": [0] * 7,
                "safety_stock_gmv": 0
            },
            "top_categories": [],
            "summary": {
                "data_days": 0,
                "prediction_horizon": 7
            },
            "insights": ["暂无足够数据进行销售预测"]
        }

    daily_gmv = [float(r["daily_gmv"] or 0) for r in daily_rows]
    n = len(daily_gmv)

    window = min(n, 30)
    recent_gmv = daily_gmv[-window:]

    mean_gmv = sum(recent_gmv) / window

    variance = sum((x - mean_gmv) ** 2 for x in recent_gmv) / window
    std_gmv = math.sqrt(variance)

    cv = std_gmv / mean_gmv if mean_gmv > 0 else 0

    next_7d_gmv = [round(mean_gmv, 2) for _ in range(7)]

    z = 1.96
    margin = z * std_gmv
    next_7d_lower = [round(max(0, mean_gmv - margin), 2) for _ in range(7)]
    next_7d_upper = [round(mean_gmv + margin, 2) for _ in range(7)]

    safety_stock_gmv = round(mean_gmv * 1.5 * cv, 2)

    category_rows = query("""
        SELECT
            dp.category_name,
            oi.order_date,
            COALESCE(SUM(oi.line_amount), 0) AS daily_gmv
        FROM fact_order_item oi
        JOIN dim_product dp ON oi.sku_id = dp.sku_id
        JOIN fact_order o ON oi.order_id = o.order_id
        WHERE o.status IN ('paid', 'completed')
        GROUP BY dp.category_name, oi.order_date
        ORDER BY dp.category_name, oi.order_date
    """)

    category_data = {}
    for row in category_rows:
        cat = row["category_name"]
        gmv = float(row["daily_gmv"] or 0)
        if cat not in category_data:
            category_data[cat] = []
        category_data[cat].append(gmv)

    top_categories = []
    for cat, gmv_values in category_data.items():
        cat_window = min(len(gmv_values), 30)
        cat_recent = gmv_values[-cat_window:]

        cat_mean = sum(cat_recent) / cat_window
        cat_variance = sum((x - cat_mean) ** 2 for x in cat_recent) / cat_window
        cat_std = math.sqrt(cat_variance)
        cat_cv = cat_std / cat_mean if cat_mean > 0 else 0
        cat_safety = cat_mean * 1.5 * cat_cv

        top_categories.append({
            "category": cat,
            "daily_avg_gmv": round(cat_mean, 2),
            "daily_std": round(cat_std, 2),
            "safety_stock": round(cat_safety, 2)
        })

    top_categories.sort(key=lambda x: x["daily_avg_gmv"], reverse=True)
    top_categories = top_categories[:5]

    insights = []
    insights.append(
        f"基于最近{window}天数据，日均GMV为 {mean_gmv:,.2f} 元，日标准差为 {std_gmv:,.2f} 元"
    )
    if cv > 0.3:
        insights.append(f"波动系数 CV = {cv:.4f}，波动较大，建议适当增加安全库存")
    else:
        insights.append(f"波动系数 CV = {cv:.4f}，波动较小，销售趋势相对稳定")

    insights.append(
        f"安全库存建议金额为 {safety_stock_gmv:,.2f} 元（安全系数1.5）"
    )

    if top_categories:
        top_cat = top_categories[0]
        insights.append(
            f"GMV最高品类为「{top_cat['category']}」，日均 {top_cat['daily_avg_gmv']:,.2f} 元，建议重点关注该品类的备货"
        )

    if cv > 0.5:
        insights.append("波动系数较高（>0.5），建议结合促销日历和外部因素进一步分析波动来源")
    elif cv < 0.15:
        insights.append("销售波动极小（CV<0.15），预测置信度较高，可适当降低安全库存比例")

    if len(daily_gmv) >= 3:
        recent_trend = daily_gmv[-3:]
        if all(recent_trend[i] <= recent_trend[i + 1] for i in range(len(recent_trend) - 1)):
            insights.append("最近3天GMV呈上升趋势，预测值可能偏保守")
        elif all(recent_trend[i] >= recent_trend[i + 1] for i in range(len(recent_trend) - 1)):
            insights.append("最近3天GMV呈下降趋势，需关注是否出现异常波动")

    return {
        "title": "销售预测与库存备货",
        "description": "最近30天移动平均、标准差、波动系数、安全库存",
        "method": "moving_average_30d",
        "forecast": {
            "daily_avg_gmv": round(mean_gmv, 2),
            "daily_std_gmv": round(std_gmv, 2),
            "cv": round(cv, 4),
            "next_7d_gmv": next_7d_gmv,
            "next_7d_lower": next_7d_lower,
            "next_7d_upper": next_7d_upper,
            "safety_stock_gmv": safety_stock_gmv
        },
        "top_categories": top_categories,
        "summary": {
            "data_days": n,
            "prediction_horizon": 7
        },
        "insights": insights
    }
