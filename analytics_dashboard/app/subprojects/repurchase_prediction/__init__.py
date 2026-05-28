from datetime import date, timedelta
from collections import defaultdict

from ...data_access import query
from ...utils import safe_divide


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
    today = date.today()

    users = query("SELECT user_id FROM dim_user")
    user_ids = [u["user_id"] for u in users]
    total_users = len(user_ids)

    if total_users == 0:
        return _empty_result()

    orders = query(
        "SELECT user_id, order_date, paid_amount FROM fact_order "
        "WHERE status IN ('paid', 'completed') ORDER BY user_id, order_date"
    )

    user_orders = defaultdict(list)
    for o in orders:
        user_orders[o["user_id"]].append(o)

    user_stats = []
    for uid in user_ids:
        u_orders = user_orders.get(uid, [])
        if not u_orders:
            continue

        order_dates = []
        monetary = 0.0
        for o in u_orders:
            od = o["order_date"]
            if isinstance(od, str):
                od = date.fromisoformat(od)
            order_dates.append(od)
            monetary += o["paid_amount"] or 0.0

        order_dates.sort()
        last_order_date = order_dates[-1]
        recency = (today - last_order_date).days
        frequency = len(u_orders)

        cutoff1 = today - timedelta(days=30)
        cutoff2 = today - timedelta(days=60)
        f_recent = sum(1 for d in order_dates if d >= cutoff1)
        f_prev = sum(1 for d in order_dates if cutoff2 <= d < cutoff1)

        user_stats.append({
            "user_id": uid,
            "recency": recency,
            "frequency": frequency,
            "monetary": monetary,
            "f_recent": f_recent,
            "f_prev": f_prev,
        })

    if not user_stats:
        return _empty_result()

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
        "high_potential_count": high_count,
        "touch_rate": round(high_count / total_users, 4) if total_users > 0 else 0.0,
        "estimated_roi": round(estimated_roi, 2),
    }

    touch_rate_pct = round(high_count / total_users * 100, 1) if total_users > 0 else 0
    avg_monetary_top = (
        round(sum(u["monetary"] for u in top20) / len(top20), 2) if top20 else 0
    )
    avg_freq_top = (
        round(sum(u["frequency"] for u in top20) / len(top20), 1) if top20 else 0
    )

    insights = [
        f"共 {total_users} 位用户中，{high_count} 位被识别为高潜复购用户，触达比例为 {touch_rate_pct}%",
        f"预估触达 ROI 为 {estimated_roi:.2f}（假设触达成本 5 元/人，转化率 15%）",
        f"高潜用户平均消费金额 {avg_monetary_top} 元，平均购买频次 {avg_freq_top} 次",
        "建议优先触达评分前 20 位高潜用户，可结合优惠券策略提升复购转化率",
    ]

    return {
        "title": "复购预测与触达名单",
        "description": "使用可解释评分模型输出高潜用户与触达 ROI",
        "model": {
            "type": "rule_based_scoring",
            "features": ["recency_score", "frequency_score", "monetary_score", "trend_score"],
            "threshold": threshold,
        },
        "high_potential_users": high_potential_users,
        "summary": summary,
        "insights": insights,
    }


def _empty_result():
    return {
        "title": "复购预测与触达名单",
        "description": "使用可解释评分模型输出高潜用户与触达 ROI",
        "model": {
            "type": "rule_based_scoring",
            "features": ["recency_score", "frequency_score", "monetary_score", "trend_score"],
            "threshold": 60,
        },
        "high_potential_users": [],
        "summary": {
            "total_users": 0,
            "high_potential_count": 0,
            "touch_rate": 0.0,
            "estimated_roi": 0.0,
        },
        "insights": ["暂无足够数据用于复购预测分析"],
    }
