from app.data_access import query


def run():
    rows = query("""
        SELECT
            user_id,
            CAST(julianday('now') - julianday(MAX(order_date)) AS INTEGER) AS recency,
            COUNT(DISTINCT order_id) AS frequency,
            COALESCE(SUM(paid_amount), 0) AS monetary
        FROM fact_order
        WHERE status IN ('paid', 'completed')
        GROUP BY user_id
    """)

    if not rows:
        return {
            "title": "用户建模宽表 (RFM)",
            "description": "基于RFM框架构建用户特征宽表，为复购预测和客户分群提供统一特征底座",
            "rfm_segments": [],
            "summary": {
                "total_users": 0,
                "avg_recency": 0,
                "avg_frequency": 0,
                "avg_monetary": 0
            },
            "rfm_distribution": {"labels": {}},
            "insights": ["暂无订单数据，无法生成RFM宽表"]
        }

    users = []
    for row in rows:
        users.append({
            "user_id": row["user_id"],
            "recency": int(row["recency"] or 0),
            "frequency": int(row["frequency"] or 0),
            "monetary": float(row["monetary"] or 0)
        })

    recency_values = [u["recency"] for u in users]
    frequency_values = [u["frequency"] for u in users]
    monetary_values = [u["monetary"] for u in users]

    n = len(users)
    r_sorted = sorted(range(n), key=lambda i: recency_values[i])
    f_sorted = sorted(range(n), key=lambda i: frequency_values[i])
    m_sorted = sorted(range(n), key=lambda i: monetary_values[i])

    r_scores = [0] * n
    f_scores = [0] * n
    m_scores = [0] * n
    bucket_size = n / 5

    for rank, idx in enumerate(r_sorted):
        bucket = min(int(rank / bucket_size), 4)
        r_scores[idx] = 5 - bucket
    for rank, idx in enumerate(f_sorted):
        bucket = min(int(rank / bucket_size), 4)
        f_scores[idx] = bucket + 1
    for rank, idx in enumerate(m_sorted):
        bucket = min(int(rank / bucket_size), 4)
        m_scores[idx] = bucket + 1

    LABEL_RULES = [
        (lambda r, f, m: r >= 4 and f >= 4 and m >= 4, "重要价值客户"),
        (lambda r, f, m: r >= 4 and f < 4 and m >= 4, "重要发展客户"),
        (lambda r, f, m: r < 4 and f >= 4 and m >= 4, "重要保持客户"),
        (lambda r, f, m: r >= 4 and f >= 4 and m < 4, "潜力客户"),
        (lambda r, f, m: r < 4 and f < 4 and m >= 4, "重要挽留客户"),
        (lambda r, f, m: r >= 4 and f < 4 and m < 4, "新客户"),
        (lambda r, f, m: r < 4 and f >= 4 and m < 4, "一般保持客户"),
    ]

    def get_label(r_val, f_val, m_val):
        for condition, label in LABEL_RULES:
            if condition(r_val, f_val, m_val):
                return label
        return "流失客户"

    rfm_segments = []
    label_counts = {}
    for i, u in enumerate(users):
        r_score = r_scores[i]
        f_score = f_scores[i]
        m_score = m_scores[i]
        label = get_label(r_score, f_score, m_score)
        rfm_segments.append({
            "user_id": u["user_id"],
            "recency": u["recency"],
            "frequency": u["frequency"],
            "monetary": u["monetary"],
            "r_score": r_score,
            "f_score": f_score,
            "m_score": m_score,
            "rfm_label": label
        })
        label_counts[label] = label_counts.get(label, 0) + 1

    avg_recency = sum(recency_values) / n
    avg_frequency = sum(frequency_values) / n
    avg_monetary = sum(monetary_values) / n

    insights = []
    insights.append(f"共 {n} 名用户纳入RFM分析，平均最近购买距今 {avg_recency:.0f} 天，平均购买 {avg_frequency:.1f} 次，平均消费 {avg_monetary:.2f} 元")
    high_value = label_counts.get("重要价值客户", 0)
    churn = label_counts.get("流失客户", 0)
    if high_value > 0:
        insights.append(f"识别出 {high_value} 名「重要价值客户」（占比 {high_value / n * 100:.1f}%），建议优先维护，提供专属权益和会员升级激励")
    if churn > 0:
        insights.append(f"识别出 {churn} 名「流失客户」（占比 {churn / n * 100:.1f}%），建议通过优惠券或push推送进行唤醒尝试")
    important_retain = label_counts.get("重要保持客户", 0)
    if important_retain > 0:
        insights.append(f"「重要保持客户」{important_retain} 名，R值偏低但消费能力强，建议通过个性化推荐和限时优惠提升活跃度")
    potential = label_counts.get("潜力客户", 0)
    if potential > 0:
        insights.append(f"「潜力客户」{potential} 名，近期活跃且购买频次高，但客单价偏低，建议通过满减或捆绑销售提升客单价")
    if avg_recency > 30:
        insights.append(f"整体用户平均最近购买间隔超过30天，存在用户活跃度下降风险，建议加大促销活动和内容推送频次")

    # Cohort retention matrix
    # Step 1: Find each user's true first order month
    user_first = query("""
        SELECT user_id, strftime('%Y-%m', MIN(order_date)) AS cohort_month
        FROM fact_order
        WHERE status IN ('paid', 'completed')
        GROUP BY user_id
    """)
    # Step 2: Find all user-month pairs (orders in each month)
    order_months = query("""
        SELECT user_id, strftime('%Y-%m', order_date) AS order_month
        FROM fact_order
        WHERE status IN ('paid', 'completed')
        GROUP BY user_id, strftime('%Y-%m', order_date)
    """)

    # Build cohort data structures
    cohort_map = {}
    for row in user_first:
        cm = row["cohort_month"]
        cohort_map[cm] = {"users": set(), "months": {}}
    for row in user_first:
        cm = row["cohort_month"]
        uid = row["user_id"]
        cohort_map[cm]["users"].add(uid)

    for row in order_months:
        uid = row["user_id"]
        om = row["order_month"]
        # Find this user's cohort month
        for cm_row in user_first:
            if cm_row["user_id"] == uid:
                cm = cm_row["cohort_month"]
                if om not in cohort_map[cm]["months"]:
                    cohort_map[cm]["months"][om] = set()
                cohort_map[cm]["months"][om].add(uid)
                break

    # Build matrix: only take latest 12 cohorts, max 12 periods
    sorted_cohorts = sorted(cohort_map.keys())[-12:]
    cohort_matrix = []
    for ci, cm in enumerate(sorted_cohorts):
        cohort_size = len(cohort_map[cm]["users"])
        row_data = {"cohort": cm, "size": cohort_size, "rates": []}
        for pi in range(min(12, len(sorted_cohorts) - ci)):
            target_month = _add_months(cm, pi)
            retained = len(cohort_map[cm]["months"].get(target_month, set()))
            rate = round(retained / cohort_size, 4) if cohort_size > 0 else 0
            row_data["rates"].append(rate)
        cohort_matrix.append(row_data)

    return {
        "title": "用户建模宽表 (RFM)",
        "description": "基于RFM框架构建用户特征宽表，为复购预测和客户分群提供统一特征底座",
        "rfm_segments": rfm_segments,
        "summary": {
            "total_users": n,
            "avg_recency": round(avg_recency, 1),
            "avg_frequency": round(avg_frequency, 2),
            "avg_monetary": round(avg_monetary, 2)
        },
        "rfm_distribution": {
            "labels": label_counts
        },
        "cohort_matrix": cohort_matrix,
        "insights": insights
    }


def _add_months(ym, offset):
    y, m = int(ym[:4]), int(ym[5:7])
    m += offset
    while m > 12:
        y += 1
        m -= 12
    return f"{y}-{m:02d}"
