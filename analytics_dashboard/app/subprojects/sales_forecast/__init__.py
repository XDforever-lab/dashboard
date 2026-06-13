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

    next_7d_gmv = [round(mean_gmv, 4) for _ in range(7)]

    # Linear trend projection for 7-day forecast
    slope = 0.0
    intercept = mean_gmv
    if window >= 14:
        x_vals = list(range(window))
        x_mean = (window - 1) / 2
        y_mean = sum(recent_gmv) / window
        num = sum((x_vals[i] - x_mean) * (recent_gmv[i] - y_mean) for i in range(window))
        den = sum((x_vals[i] - x_mean) ** 2 for i in range(window))
        slope = round(num / den, 4) if den > 0 else 0.0
        intercept = y_mean - slope * x_mean
        next_7d_gmv_trend = []
        for d in range(1, 8):
            val = intercept + slope * (window - 1 + d)
            next_7d_gmv_trend.append(round(max(0, val), 4))
        next_7d_gmv = next_7d_gmv_trend

    # 30-day forecast (same linear trend, extended)
    next_30d_gmv = []
    monthly_forecast = {}
    if slope != 0 or window >= 14:
        for d in range(1, 31):
            val = intercept + slope * (window - 1 + d)
            next_30d_gmv.append(round(max(0, val), 4))
        # Group by week for chart display
        weekly_forecast = []
        for w in range(0, 30, 7):
            chunk = next_30d_gmv[w:w+7]
            weekly_forecast.append(round(sum(chunk) / len(chunk), 4))
        monthly_forecast = {
            "daily": next_30d_gmv,
            "weekly_avg": weekly_forecast
        }
    else:
        next_30d_gmv = [round(mean_gmv, 4) for _ in range(30)]
        monthly_forecast = {
            "daily": next_30d_gmv,
            "weekly_avg": [round(mean_gmv, 4) for _ in range(5)]
        }

    z = 1.96
    margin = z * std_gmv
    next_7d_lower = [round(max(0, mean_gmv - margin), 2) for _ in range(7)]
    next_7d_upper = [round(mean_gmv + margin, 2) for _ in range(7)]

    # Trend direction for display
    if slope > 1:
        trend_direction = "up"
    elif slope < -1:
        trend_direction = "down"
    else:
        trend_direction = "flat"

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

    # Backtesting: compute MAE/MAPE/RMSE on the last 60 days
    test_start = max(window, n - 60)
    errors = []
    for i in range(test_start, n):
        train = daily_gmv[i - window:i]
        pred = sum(train) / window
        actual = daily_gmv[i]
        errors.append(abs(pred - actual))
    mae = round(sum(errors) / len(errors), 2) if errors else 0

    ape_errors = []
    for i in range(test_start, n):
        train = daily_gmv[i - window:i]
        pred = sum(train) / window
        actual = daily_gmv[i]
        if actual > 0:
            ape_errors.append(abs((pred - actual) / actual))
    mape = round(sum(ape_errors) / len(ape_errors) * 100, 2) if ape_errors else 0

    se_errors = [(daily_gmv[i] - sum(daily_gmv[i-window:i])/window) ** 2 for i in range(test_start, n)]
    rmse = round(math.sqrt(sum(se_errors) / len(se_errors)), 2) if se_errors else 0

    # Monthly trend decomposition (simple: monthly averages vs overall trend)
    monthly_rows = query("""
        SELECT
            strftime('%Y-%m', order_date) AS month,
            COALESCE(SUM(paid_amount), 0) AS monthly_gmv
        FROM fact_order
        WHERE status IN ('paid', 'completed')
        GROUP BY strftime('%Y-%m', order_date)
        ORDER BY month
    """)
    monthly_decomp = []
    monthly_values = [float(r["monthly_gmv"] or 0) for r in monthly_rows]
    if len(monthly_values) >= 3:
        # Simple moving average as trend
        trend = []
        for i in range(len(monthly_values)):
            if i < 1:
                trend.append(monthly_values[i])
            elif i > len(monthly_values) - 2:
                trend.append(monthly_values[i])
            else:
                trend.append(round((monthly_values[i-1] + monthly_values[i] + monthly_values[i+1]) / 3, 2))
        for i, r in enumerate(monthly_rows):
            monthly_decomp.append({
                "month": r["month"],
                "value": round(monthly_values[i], 2),
                "trend": round(trend[i], 2)
            })

    return {
        "title": "销售预测与库存备货",
        "description": "最近30天移动平均、标准差、波动系数、安全库存",
        "method": "moving_average_30d",
        "forecast": {
            "daily_avg_gmv": round(mean_gmv, 2),
            "daily_std_gmv": round(std_gmv, 2),
            "cv": round(cv, 4),
            "daily_trend_slope": slope,
            "trend_direction": trend_direction,
            "next_7d_gmv": next_7d_gmv,
            "next_7d_lower": next_7d_lower,
            "next_7d_upper": next_7d_upper,
            "next_30d": monthly_forecast,
            "safety_stock_gmv": safety_stock_gmv,
            "mae": mae,
            "mape": mape,
            "rmse": rmse
        },
        "top_categories": top_categories,
        "monthly_decomposition": monthly_decomp,
        "summary": {
            "data_days": n,
            "prediction_horizon": 30
        },
        "insights": insights
    }