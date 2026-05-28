from app.data_access import query


def _safe_div(numerator, denominator, default=0.0):
    if denominator == 0:
        return default
    return round(numerator / denominator, 2)


def run():
    ad_rows = query("""
        SELECT
            channel,
            SUM(impressions) AS impressions,
            SUM(clicks) AS clicks,
            SUM(conversions) AS conversions,
            SUM(spend_amount) AS spend
        FROM fact_ads_spend
        GROUP BY channel
    """)

    order_rows = query("""
        SELECT
            channel,
            SUM(paid_amount) AS gmv,
            COUNT(DISTINCT order_id) AS orders
        FROM fact_order
        WHERE status IN ('paid', 'completed')
        GROUP BY channel
    """)

    campaign_rows = query("""
        SELECT campaign_id, name, channel, budget
        FROM dim_campaign
        WHERE status = 'active'
    """)

    if not ad_rows and not order_rows:
        return {
            "title": "营销归因与预算建议",
            "description": "渠道GMV、广告花费、CPA、ROAS、预算动作建议",
            "method": "last_click_attribution",
            "channel_efficiency": [],
            "summary": {
                "total_gmv": 0,
                "total_spend": 0,
                "overall_roas": 0
            },
            "budget_suggestions": [],
            "insights": ["暂无广告投放数据或订单数据，无法进行归因分析"]
        }

    ad_map = {r["channel"]: r for r in ad_rows}
    order_map = {r["channel"]: r for r in order_rows}
    campaign_map = {}
    for r in campaign_rows:
        campaign_map[r["channel"]] = r

    all_channels = set(list(ad_map.keys()) + list(order_map.keys()))

    channel_efficiency = []
    budget_suggestions = []

    total_gmv = 0
    total_spend = 0

    for channel in sorted(all_channels):
        ad = ad_map.get(channel, {})
        order = order_map.get(channel, {})

        impressions = ad.get("impressions") or 0
        clicks = ad.get("clicks") or 0
        conversions = ad.get("conversions") or 0
        spend = ad.get("spend") or 0
        gmv = order.get("gmv") or 0
        orders = order.get("orders") or 0

        total_gmv += gmv
        total_spend += spend

        ctr = _safe_div(clicks, impressions)
        cvr = _safe_div(conversions, clicks) if conversions > 0 else _safe_div(orders, clicks)
        cpa = _safe_div(spend, conversions) if conversions > 0 else _safe_div(spend, orders)
        roas = _safe_div(gmv, spend)

        if roas > 5:
            action = "加投"
        elif roas > 2:
            action = "维持"
        elif roas > 1:
            action = "压缩"
        else:
            action = "实验化或停投"

        channel_efficiency.append({
            "channel": channel,
            "gmv": gmv,
            "orders": orders,
            "spend": spend,
            "impressions": impressions,
            "clicks": clicks,
            "ctr": ctr,
            "cvr": cvr,
            "cpa": cpa,
            "roas": roas,
            "action": action
        })

        campaign = campaign_map.get(channel, {})
        current_budget = campaign.get("budget") or 0
        if roas > 2:
            suggested_budget = round(current_budget * 1.2, 2)
            reason = f"{channel} 渠道 ROAS 表现优秀 ({roas})，建议追加 20% 预算以放大收益"
        elif roas > 1:
            suggested_budget = round(current_budget * 0.7, 2)
            reason = f"{channel} 渠道 ROAS 偏低 ({roas})，建议压缩 30% 预算，优化投放策略"
        else:
            suggested_budget = round(current_budget * 0.3, 2)
            reason = f"{channel} 渠道 ROAS 不理想 ({roas})，建议大幅缩减预算或暂停投放，重新测试"

        budget_suggestions.append({
            "channel": channel,
            "current_budget": current_budget,
            "suggested_budget": suggested_budget,
            "reason": reason
        })

    overall_roas = _safe_div(total_gmv, total_spend)

    sorted_channels = sorted(channel_efficiency, key=lambda x: x["roas"], reverse=True)

    insights = []

    if sorted_channels:
        best = sorted_channels[0]
        if best["roas"] > 0:
            insights.append(f"ROAS 最高的渠道是 {best['channel']}（ROAS={best['roas']}），GMV={best['gmv']}，建议优先加投")

        worst = sorted_channels[-1]
        if worst["roas"] <= 1:
            insights.append(f"ROAS 最低的渠道是 {worst['channel']}（ROAS={worst['roas']}），建议缩减预算或停止投放")

    if overall_roas > 0:
        level = "高于" if overall_roas > 2 else "低于"
        insights.append(f"整体 ROAS 为 {overall_roas}，{level}行业健康线 (2.0)")

    active_spend_channels = [c for c in channel_efficiency if c["spend"] > 0 and c["cpa"] > 0]
    if active_spend_channels:
        avg_cpa = sum(c["cpa"] for c in active_spend_channels) / len(active_spend_channels)
        insights.append(f"有花费渠道的平均获客成本 (CPA) 为 {round(avg_cpa, 2)}，请持续关注成本效率")

    return {
        "title": "营销归因与预算建议",
        "description": "渠道GMV、广告花费、CPA、ROAS、预算动作建议",
        "method": "last_click_attribution",
        "channel_efficiency": channel_efficiency,
        "summary": {
            "total_gmv": total_gmv,
            "total_spend": total_spend,
            "overall_roas": overall_roas
        },
        "budget_suggestions": budget_suggestions,
        "insights": insights
    }
