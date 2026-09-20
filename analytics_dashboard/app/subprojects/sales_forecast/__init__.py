from ...data_access import query
import math


def _linear_projection(values, horizon):
    """Fit a simple linear trend and project the next ``horizon`` points."""
    n = len(values)
    if n == 0:
        return [0.0] * horizon, 0.0
    if n == 1:
        return [round(max(0, values[0]), 4)] * horizon, 0.0

    x_mean = (n - 1) / 2
    y_mean = sum(values) / n
    numerator = sum((i - x_mean) * (values[i] - y_mean) for i in range(n))
    denominator = sum((i - x_mean) ** 2 for i in range(n))
    slope = numerator / denominator if denominator > 0 else 0.0
    intercept = y_mean - slope * x_mean
    forecasts = [
        round(max(0, intercept + slope * (n - 1 + step)), 4)
        for step in range(1, horizon + 1)
    ]
    return forecasts, round(slope, 4)


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
            "description": "最近30天线性趋势、滚动回测、波动范围与销售缓冲参考",
            "method": "rolling_linear_trend_30d",
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

    next_7d_gmv, slope = _linear_projection(recent_gmv, 7)
    next_30d_gmv, _ = _linear_projection(recent_gmv, 30)
    weekly_forecast = []
    for week_start in range(0, 30, 7):
        chunk = next_30d_gmv[week_start:week_start + 7]
        weekly_forecast.append(round(sum(chunk) / len(chunk), 4))
    monthly_forecast = {"daily": next_30d_gmv, "weekly_avg": weekly_forecast}

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
        f"销售波动缓冲金额参考为 {safety_stock_gmv:,.2f} 元（按 1.5 倍日GMV标准差估算，不等同于SKU安全库存）"
    )

    if top_categories:
        top_cat = top_categories[0]
        insights.append(
            f"GMV最高品类为「{top_cat['category']}」，日均 {top_cat['daily_avg_gmv']:,.2f} 元，建议重点关注该品类的备货"
        )

    if cv > 0.5:
        insights.append("波动系数较高（>0.5），建议结合促销日历和外部因素进一步分析波动来源")
    elif cv < 0.15:
        insights.append("销售波动较小（CV<0.15）；仍需结合促销、节假日和品类库存验证预测稳定性")

    if len(daily_gmv) >= 3:
        recent_trend = daily_gmv[-3:]
        if all(recent_trend[i] <= recent_trend[i + 1] for i in range(len(recent_trend) - 1)):
            insights.append("最近3天GMV呈上升趋势，预测值可能偏保守")
        elif all(recent_trend[i] >= recent_trend[i + 1] for i in range(len(recent_trend) - 1)):
            insights.append("最近3天GMV呈下降趋势，需关注是否出现异常波动")

    # Rolling one-step backtest with the same linear-trend model used above.
    test_start = max(window, n - 60)
    residuals = []
    absolute_errors = []
    ape_errors = []
    for i in range(test_start, n):
        train = daily_gmv[i - window:i]
        pred = _linear_projection(train, 1)[0][0]
        actual = daily_gmv[i]
        residual = actual - pred
        residuals.append(residual)
        absolute_errors.append(abs(residual))
        if actual > 0:
            ape_errors.append(abs((pred - actual) / actual))

    mae = round(sum(absolute_errors) / len(absolute_errors), 2) if absolute_errors else 0
    mape = round(sum(ape_errors) / len(ape_errors) * 100, 2) if ape_errors else 0
    rmse = round(math.sqrt(sum(r ** 2 for r in residuals) / len(residuals)), 2) if residuals else 0
    residual_mean = sum(residuals) / len(residuals) if residuals else 0
    residual_variance = (
        sum((r - residual_mean) ** 2 for r in residuals) / len(residuals)
        if residuals else std_gmv ** 2
    )
    residual_std = math.sqrt(residual_variance)
    margin = 1.96 * residual_std
    next_7d_lower = [round(max(0, prediction - margin), 2) for prediction in next_7d_gmv]
    next_7d_upper = [round(prediction + margin, 2) for prediction in next_7d_gmv]

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
        "description": "最近30天线性趋势、滚动回测、波动范围与销售缓冲参考",
        "method": "rolling_linear_trend_30d",
        "forecast": {
            "daily_avg_gmv": round(mean_gmv, 2),
            "daily_std_gmv": round(std_gmv, 2),
            "cv": round(cv, 4),
            "daily_trend_slope": slope,
            "trend_direction": trend_direction,
            "next_7d_gmv": next_7d_gmv,
            "next_7d_lower": next_7d_lower,
            "next_7d_upper": next_7d_upper,
            "interval_method": "normal_approximation_from_backtest_residuals",
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
