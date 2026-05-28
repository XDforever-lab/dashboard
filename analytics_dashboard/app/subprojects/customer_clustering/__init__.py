from ...data_access import query


def _quintile_scores(values, ascending=True):
    n = len(values)
    if n == 0:
        return []
    sorted_vals = sorted(values)
    scores = []
    for v in values:
        if ascending:
            pct = sum(1 for x in sorted_vals if x < v) / n
        else:
            pct = sum(1 for x in sorted_vals if x > v) / n
        if pct >= 0.8:
            scores.append(5)
        elif pct >= 0.6:
            scores.append(4)
        elif pct >= 0.4:
            scores.append(3)
        elif pct >= 0.2:
            scores.append(2)
        else:
            scores.append(1)
    return scores


def run():
    sql = """
        SELECT
            u.user_id,
            u.register_channel,
            u.member_level,
            CAST(julianday('now') - julianday(MAX(o.order_date)) AS INTEGER) AS recency_days,
            COUNT(o.order_id) AS frequency,
            COALESCE(ROUND(SUM(o.paid_amount), 2), 0) AS monetary
        FROM dim_user u
        LEFT JOIN fact_order o ON o.user_id = u.user_id AND o.status IN ('paid', 'completed')
        GROUP BY u.user_id
    """
    rows = query(sql)

    if not rows:
        return {
            "title": "客户分群",
            "description": "基于RFM的规则分群，不同群体匹配不同运营策略",
            "method": "rfm_rule_based",
            "segments": [],
            "insights": ["暂无数据"]
        }

    recency_vals = [r["recency_days"] if r["recency_days"] is not None else 9999 for r in rows]
    frequency_vals = [r["frequency"] for r in rows]
    monetary_vals = [r["monetary"] for r in rows]

    r_scores = _quintile_scores(recency_vals, ascending=False)
    f_scores = _quintile_scores(frequency_vals, ascending=True)
    m_scores = _quintile_scores(monetary_vals, ascending=True)

    for i, row in enumerate(rows):
        row["R"] = r_scores[i]
        row["F"] = f_scores[i]
        row["M"] = m_scores[i]

    total_gmv = sum(r["monetary"] for r in rows)

    segments = {
        "高价值高频客": [],
        "近期活跃复购客": [],
        "沉睡待召回客": [],
        "未转化浏览客": [],
        "一般活跃客": []
    }

    for row in rows:
        R, F, M = row["R"], row["F"], row["M"]
        if R >= 4 and F >= 4 and M >= 4:
            segments["高价值高频客"].append(row)
        elif R >= 4 and F >= 3 and M >= 3:
            segments["近期活跃复购客"].append(row)
        elif R <= 2 and F >= 3:
            segments["沉睡待召回客"].append(row)
        elif F == 0:
            segments["未转化浏览客"].append(row)
        else:
            segments["一般活跃客"].append(row)

    segment_strategies = {
        "高价值高频客": "VIP维护，专属客服，新品优先",
        "近期活跃复购客": "复购券，回购奖励",
        "沉睡待召回客": "大额唤醒券，短信触达",
        "未转化浏览客": "首单立减，新手引导",
        "一般活跃客": "日常促销，会员权益推送"
    }

    result_segments = []
    insights = []

    for seg_name, seg_users in segments.items():
        count = len(seg_users)
        if count == 0:
            continue

        sum_recency = sum(u["recency_days"] if u["recency_days"] is not None else 0 for u in seg_users)
        sum_frequency = sum(u["frequency"] for u in seg_users)
        sum_monetary = sum(u["monetary"] for u in seg_users)
        seg_gmv = sum_monetary

        result_segments.append({
            "name": seg_name,
            "count": count,
            "avg_recency": round(sum_recency / count, 1),
            "avg_frequency": round(sum_frequency / count, 1),
            "avg_monetary": round(sum_monetary / count, 2),
            "gmv_share": round(seg_gmv / total_gmv, 4) if total_gmv > 0 else 0,
            "strategy": segment_strategies[seg_name]
        })

    for seg in result_segments:
        name = seg["name"]
        count = seg["count"]
        gmv_pct = round(seg["gmv_share"] * 100, 1)
        user_pct = round(count / len(rows) * 100, 1)
        if name == "高价值高频客":
            insights.append(f"高价值高频客共{count}人({user_pct}%)，贡献GMV占比{gmv_pct}%，是核心利润来源，建议VIP专属维护")
        elif name == "近期活跃复购客":
            insights.append(f"近期活跃复购客共{count}人({user_pct}%)，GMV占比{gmv_pct}%，可通过复购券和品类推荐提升客单价")
        elif name == "沉睡待召回客":
            insights.append(f"沉睡待召回客共{count}人({user_pct}%)，曾经活跃但近期流失，建议大额唤醒券配合短信触达")
        elif name == "未转化浏览客":
            insights.append(f"未转化浏览客共{count}人({user_pct}%)，无购买记录，需首单立减和新手引导加速转化")
        elif name == "一般活跃客":
            insights.append(f"一般活跃客共{count}人({user_pct}%)，GMV占比{gmv_pct}%，适合日常促销和会员权益推送维持活跃")

    return {
        "title": "客户分群",
        "description": "基于RFM的规则分群，不同群体匹配不同运营策略",
        "method": "rfm_rule_based",
        "segments": result_segments,
        "insights": insights
    }
