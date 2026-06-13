from app.data_access import query


def run():
    gmv_row = query("""
        SELECT COALESCE(SUM(paid_amount), 0) AS gmv
        FROM fact_order
        WHERE status IN ('paid', 'completed')
    """)
    gmv = float(gmv_row[0]["gmv"] or 0) if gmv_row else 0

    orders_row = query("""
        SELECT COUNT(DISTINCT order_id) AS orders
        FROM fact_order
        WHERE status IN ('paid', 'completed')
    """)
    orders = int(orders_row[0]["orders"] or 0) if orders_row else 0

    buyers_row = query("""
        SELECT COUNT(DISTINCT user_id) AS buyers
        FROM fact_order
        WHERE status IN ('paid', 'completed')
    """)
    buyers = int(buyers_row[0]["buyers"] or 0) if buyers_row else 0

    aov = round(gmv / buyers, 2) if buyers > 0 else 0

    total_refund_row = query("""
        SELECT COALESCE(SUM(amount), 0) AS refund_total
        FROM fact_refund
    """)
    refund_total = float(total_refund_row[0]["refund_total"] or 0) if total_refund_row else 0
    refund_rate = round(refund_total / gmv, 4) if gmv > 0 else 0

    monthly_trend_rows = query("""
        SELECT
            strftime('%Y-%m', order_date) AS month,
            COALESCE(SUM(paid_amount), 0) AS gmv,
            COUNT(DISTINCT order_id) AS orders
        FROM fact_order
        WHERE status IN ('paid', 'completed')
        GROUP BY strftime('%Y-%m', order_date)
        ORDER BY month
    """)
    monthly_trend = []
    for row in monthly_trend_rows:
        monthly_trend.append({
            "month": row["month"],
            "gmv": float(row["gmv"] or 0),
            "orders": int(row["orders"] or 0)
        })

    channel_rows = query("""
        SELECT
            channel,
            COALESCE(SUM(paid_amount), 0) AS gmv,
            COUNT(DISTINCT order_id) AS orders
        FROM fact_order
        WHERE status IN ('paid', 'completed')
        GROUP BY channel
        ORDER BY gmv DESC
    """)
    channel_breakdown = []
    for row in channel_rows:
        channel_gmv = float(row["gmv"] or 0)
        share = round(channel_gmv / gmv, 4) if gmv > 0 else 0
        channel_breakdown.append({
            "channel": row["channel"],
            "gmv": channel_gmv,
            "orders": int(row["orders"] or 0),
            "share": share
        })

    funnel_rows = query("""
        SELECT
            event_type,
            COUNT(*) AS event_count
        FROM fact_traffic
        GROUP BY event_type
    """)
    funnel_map = {}
    for row in funnel_rows:
        funnel_map[row["event_type"]] = int(row["event_count"] or 0)

    view_home = funnel_map.get("view_home", 0)
    view_product = funnel_map.get("view_product", 0)
    add_to_cart = funnel_map.get("add_to_cart", 0)
    checkout = funnel_map.get("checkout", 0)
    pay_success = funnel_map.get("pay_success", 0)

    funnel = {
        "view_home": view_home,
        "view_product": view_product,
        "add_to_cart": add_to_cart,
        "checkout": checkout,
        "pay_success": pay_success
    }

    funnel_rates = {
        "view_to_product": round(view_product / view_home, 4) if view_home > 0 else 0,
        "product_to_cart": round(add_to_cart / view_product, 4) if view_product > 0 else 0,
        "cart_to_checkout": round(checkout / add_to_cart, 4) if add_to_cart > 0 else 0,
        "checkout_to_pay": round(pay_success / checkout, 4) if checkout > 0 else 0
    }

    insights = []
    if aov > 0:
        insights.append(f"客单价为 {aov:.2f} 元，建议关注高客单价商品的推广策略")
    if refund_rate > 0.05:
        insights.append(f"退款率为 {refund_rate * 100:.2f}%，高于 5% 警戒线，需关注商品质量或售后体验")
    if len(channel_breakdown) > 0:
        top_channel = channel_breakdown[0]
        insights.append(f"最大贡献渠道为「{top_channel['channel']}」, GMV 占比 {top_channel['share'] * 100:.1f}%")
    if view_home > 0 and view_product > 0:
        vp_rate = funnel_rates["view_to_product"]
        if vp_rate < 0.5:
            insights.append(f"首页到商品页转化率仅 {vp_rate * 100:.1f}%，建议优化首页推荐和导航体验")
    if add_to_cart > 0 and checkout > 0:
        cc_rate = funnel_rates["cart_to_checkout"]
        if cc_rate < 0.3:
            insights.append(f"加购到结算转化率仅 {cc_rate * 100:.1f}%，建议优化购物车和结算流程")
    if checkout > 0 and pay_success > 0:
        cp_rate = funnel_rates["checkout_to_pay"]
        if cp_rate < 0.7:
            insights.append(f"结算到支付转化率仅 {cp_rate * 100:.1f}%，建议检查支付环节是否顺畅")
    if not insights:
        insights.append("各项指标表现正常，继续保持")

    # 月度漏斗转化率（用于漏斗诊断页趋势图）
    monthly_funnel_rows = query("""
        SELECT
            strftime('%Y-%m', event_date) AS month,
            event_type,
            COUNT(*) AS cnt
        FROM fact_traffic
        GROUP BY strftime('%Y-%m', event_date), event_type
        ORDER BY month
    """)
    monthly_funnel = {}
    for row in monthly_funnel_rows:
        m = row["month"]
        if m not in monthly_funnel:
            monthly_funnel[m] = {}
        monthly_funnel[m][row["event_type"]] = int(row["cnt"] or 0)

    monthly_funnel_trend = []
    for m in sorted(monthly_funnel.keys()):
        fm = monthly_funnel[m]
        vh = fm.get("view_home", 0)
        vp = fm.get("view_product", 0)
        atc = fm.get("add_to_cart", 0)
        co = fm.get("checkout", 0)
        ps = fm.get("pay_success", 0)
        monthly_funnel_trend.append({
            "month": m,
            "view_home": vh,
            "view_product": vp,
            "add_to_cart": atc,
            "checkout": co,
            "pay_success": ps,
            "vp_rate": round(vp / vh, 4) if vh > 0 else 0,
            "pc_rate": round(atc / vp, 4) if vp > 0 else 0,
            "cc_rate": round(co / atc, 4) if atc > 0 else 0,
            "cp_rate": round(ps / co, 4) if co > 0 else 0
        })

    return {
        "title": "经营健康诊断",
        "description": "描述性统计、月度趋势、渠道拆解、转化漏斗",
        "kpi": {
            "gmv": gmv,
            "orders": orders,
            "buyers": buyers,
            "aov": aov,
            "refund_rate": refund_rate
        },
        "monthly_trend": monthly_trend,
        "channel_breakdown": channel_breakdown,
        "funnel": funnel,
        "funnel_rates": funnel_rates,
        "monthly_funnel_trend": monthly_funnel_trend,
        "insights": insights
    }
