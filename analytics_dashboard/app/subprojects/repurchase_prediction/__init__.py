from datetime import timedelta

from ...data_access import query
from ...utils import parse_date


def _min_max_normalize(values, reverse=False):
    if not values:
        return values
    min_v = min(values)
    max_v = max(values)
    if max_v == min_v:
        return [50.0] * len(values)
    if reverse:
        return [100.0 * (max_v - v) / (max_v - min_v) for v in values]
    return [100.0 * (v - min_v) / (max_v - min_v) for v in values]


def run():
    reference_rows = query("""
        SELECT MAX(order_date) AS reference_date
        FROM fact_order
        WHERE status IN ('paid', 'completed')
    """)
    reference_date = parse_date(reference_rows[0]["reference_date"]) if reference_rows else None
    if reference_date is None:
        return _empty_result()

    reference_date_str = reference_date.isoformat()
    cutoff1_str = (reference_date - timedelta(days=30)).isoformat()
    cutoff2_str = (reference_date - timedelta(days=60)).isoformat()

    # Use SQL to compute all aggregations — avoid pulling raw rows into Python
    rows = query("""
        SELECT
            u.user_id,
            CAST(julianday(?) - julianday(MAX(o.order_date)) AS INTEGER) AS recency,
            COUNT(o.order_id) AS frequency,
            COALESCE(SUM(o.paid_amount), 0) AS monetary,
            COALESCE(SUM(CASE WHEN o.order_date >= ? THEN 1 ELSE 0 END), 0) AS f_recent,
            COALESCE(SUM(CASE WHEN o.order_date >= ? AND o.order_date < ? THEN 1 ELSE 0 END), 0) AS f_prev
        FROM dim_user u
        LEFT JOIN fact_order o ON o.user_id = u.user_id AND o.status IN ('paid', 'completed')
        GROUP BY u.user_id
    """, [reference_date_str, cutoff1_str, cutoff2_str, cutoff1_str])

    user_stats = []
    total_users = len(rows)
    for r in rows:
        if r["frequency"] == 0:
            continue
        user_stats.append({
            "user_id": r["user_id"],
            "recency": int(r["recency"] or 0),
            "frequency": int(r["frequency"] or 0),
            "monetary": float(r["monetary"] or 0),
            "f_recent": int(r["f_recent"] or 0),
            "f_prev": int(r["f_prev"] or 0),
        })

    if not user_stats:
        return _empty_result(reference_date_str)

    recencies = [u["recency"] for u in user_stats]
    frequencies = [u["frequency"] for u in user_stats]
    monetaries = [u["monetary"] for u in user_stats]

    recency_scores = _min_max_normalize(recencies, reverse=True)
    frequency_scores = _min_max_normalize(frequencies)
    monetary_scores = _min_max_normalize(monetaries)

    trend_scores = []
    for u in user_stats:
        f1, f2 = u["f_recent"], u["f_prev"]
        if f1 == 0 and f2 == 0:
            trend_scores.append(50.0)
        elif f2 == 0:
            trend_scores.append(100.0)
        else:
            rate = (f1 - f2) / max(f1, f2)
            ts = 50.0 + 50.0 * rate
            ts = max(0.0, min(100.0, ts))
            trend_scores.append(ts)

    threshold = 60
    high_potential = []
    for i, u in enumerate(user_stats):
        score = (
            recency_scores[i] * 0.3
            + frequency_scores[i] * 0.25
            + monetary_scores[i] * 0.25
            + trend_scores[i] * 0.2
        )
        u["score"] = round(score, 2)
        if score >= threshold:
            high_potential.append(u)

    high_potential.sort(key=lambda x: x["score"], reverse=True)
    top20 = high_potential[:20]

    high_potential_users = [
        {
            "user_id": u["user_id"],
            "score": u["score"],
            "recency": u["recency"],
            "frequency": u["frequency"],
            "monetary": round(u["monetary"], 2),
        }
        for u in top20
    ]

    high_count = len(high_potential)
    eligible_users = len(user_stats)

    total_monetary = sum(u["monetary"] for u in user_stats)
    total_frequency = sum(u["frequency"] for u in user_stats)
    avg_order_value = total_monetary / total_frequency if total_frequency > 0 else 0

    touch_cost = 5.0
    conversion_rate = 0.15
    estimated_roi = (
        (avg_order_value * conversion_rate) / touch_cost
        if touch_cost > 0
        else 0
    )

    summary = {
        "total_users": total_users,
        "eligible_users": eligible_users,
        "high_potential_count": high_count,
        "touch_rate": round(high_count / eligible_users, 4) if eligible_users > 0 else 0.0,
        "estimated_roi": round(estimated_roi, 2),
        "reference_date": reference_date_str,
        "roi_assumptions": {"touch_cost": touch_cost, "conversion_rate": conversion_rate},
    }

    touch_rate_pct = round(high_count / eligible_users * 100, 1) if eligible_users > 0 else 0
    avg_monetary_top = (
        round(sum(u["monetary"] for u in top20) / len(top20), 2) if top20 else 0
    )
    avg_freq_top = (
        round(sum(u["frequency"] for u in top20) / len(top20), 1) if top20 else 0
    )

    insights = [
        f"{eligible_users} 位有购买记录的用户中，{high_count} 位被识别为高复购倾向用户，占比 {touch_rate_pct}%",
        f"情景 ROI 为 {estimated_roi:.2f}（假设触达成本 5 元/人、转化率 15%，并非实际实验结果）",
        f"高潜用户平均消费金额 {avg_monetary_top} 元，平均购买频次 {avg_freq_top} 次",
        "建议优先触达评分前 20 位高潜用户，可结合优惠券策略提升复购转化率",
    ]

    return {
        "title": "复购倾向评分与触达名单",
        "description": "使用可解释规则评分输出高复购倾向用户与情景 ROI",
        "model": {
            "type": "rule_based_scoring",
            "features": ["recency_score", "frequency_score", "monetary_score", "trend_score"],
            "threshold": threshold,
        },
        "high_potential_users": high_potential_users,
        "summary": summary,
        "insights": insights,
    }


def _empty_result(reference_date=None):
    return {
        "title": "复购倾向评分与触达名单",
        "description": "使用可解释规则评分输出高复购倾向用户与情景 ROI",
        "model": {
            "type": "rule_based_scoring",
            "features": ["recency_score", "frequency_score", "monetary_score", "trend_score"],
            "threshold": 60,
        },
        "high_potential_users": [],
        "summary": {
            "total_users": 0,
            "eligible_users": 0,
            "high_potential_count": 0,
            "touch_rate": 0.0,
            "estimated_roi": 0.0,
            "reference_date": reference_date,
            "roi_assumptions": {"touch_cost": 5.0, "conversion_rate": 0.15},
        },
        "insights": ["暂无足够数据用于复购倾向评分"],
    }
