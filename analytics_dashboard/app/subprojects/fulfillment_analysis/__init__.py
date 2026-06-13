from app.data_access import query


def run():
    # 配送延迟分析
    fulfill_rows = query("""
        SELECT
            COALESCE(AVG(delivery_days - promised_days), 0) AS avg_delay_days,
            COUNT(*) AS total_orders,
            SUM(CASE WHEN is_late = 0 THEN 1 ELSE 0 END) AS on_time_count
        FROM fact_fulfillment
    """)
    avg_delay = float(fulfill_rows[0]["avg_delay_days"] or 0) if fulfill_rows else 0
    total_fulfill = int(fulfill_rows[0]["total_orders"] or 0) if fulfill_rows else 0
    on_time = int(fulfill_rows[0]["on_time_count"] or 0) if fulfill_rows else 0
    delay_rate = round(1 - on_time / total_fulfill, 4) if total_fulfill > 0 else 0
    on_time_rate = round(on_time / total_fulfill, 4) if total_fulfill > 0 else 0

    # 退款原因分析
    refund_rows = query("""
        SELECT
            reason,
            COUNT(*) AS cnt,
            COALESCE(SUM(amount), 0) AS total_amount
        FROM fact_refund
        GROUP BY reason
        ORDER BY cnt DESC
    """)
    refund_reasons = []
    total_refund_cnt = 0
    for row in refund_rows:
        cnt = int(row["cnt"] or 0)
        refund_reasons.append({
            "reason": row["reason"] or "未注明",
            "count": cnt,
            "amount": float(row["total_amount"] or 0)
        })
        total_refund_cnt += cnt

    # 评论评分分布
    review_rows = query("""
        SELECT
            CASE
                WHEN rating >= 5 THEN 5
                WHEN rating >= 4 THEN 4
                WHEN rating >= 3 THEN 3
                WHEN rating >= 2 THEN 2
                ELSE 1
            END AS rating_bucket,
            COUNT(*) AS cnt
        FROM fact_product_review
        GROUP BY rating_bucket
        ORDER BY rating_bucket DESC
    """)
    reviews = []
    total_reviews = 0
    for row in review_rows:
        cnt = int(row["cnt"] or 0)
        bucket = int(row["rating_bucket"] or 0)
        reviews.append({"rating": bucket, "count": cnt})
        total_reviews += cnt

    # 高退款率商品 TOP10
    high_refund_products = query("""
        SELECT
            dp.sku_id,
            dp.product_name,
            dp.category_name,
            COUNT(DISTINCT fr.refund_id) AS refund_count,
            COUNT(DISTINCT oi.order_id) AS order_count
        FROM fact_refund fr
        JOIN fact_order_item oi ON fr.order_id = oi.order_id
        JOIN dim_product dp ON oi.sku_id = dp.sku_id
        GROUP BY oi.sku_id
        HAVING order_count >= 5
        ORDER BY refund_count * 1.0 / order_count DESC
        LIMIT 10
    """)
    top_refund_products = []
    for row in high_refund_products:
        order_cnt = int(row["order_count"] or 1)
        refund_cnt = int(row["refund_count"] or 0)
        top_refund_products.append({
            "sku_id": row["sku_id"],
            "product_name": row["product_name"],
            "category": row["category_name"],
            "refund_count": refund_cnt,
            "order_count": order_cnt,
            "refund_rate": round(refund_cnt / order_cnt, 4)
        })

    # 高差评商品 TOP10
    low_rated_products = query("""
        SELECT
            dp.sku_id,
            dp.product_name,
            dp.category_name,
            COUNT(*) AS review_count,
            AVG(rating) AS avg_rating
        FROM fact_product_review pr
        JOIN dim_product dp ON pr.sku_id = dp.sku_id
        GROUP BY pr.sku_id
        HAVING review_count >= 5
        ORDER BY avg_rating ASC
        LIMIT 10
    """)
    top_low_rated = []
    for row in low_rated_products:
        top_low_rated.append({
            "sku_id": row["sku_id"],
            "product_name": row["product_name"],
            "category": row["category_name"],
            "review_count": int(row["review_count"] or 0),
            "avg_rating": round(float(row["avg_rating"] or 0), 2)
        })

    insights = []
    insights.append(f"配送履约分析覆盖 {total_fulfill} 笔订单，平均延迟 {avg_delay:.1f} 天，按时送达率 {on_time_rate * 100:.1f}%，延迟率 {delay_rate * 100:.1f}%")
    if avg_delay > 1:
        insights.append(f"平均配送延迟超过1天（{avg_delay:.1f}天），建议排查物流承运商服务质量，优化仓储发货流程")
    if delay_rate > 0.2:
        insights.append(f"配送延迟率 {delay_rate * 100:.1f}% 偏高，超过20%的订单未能按时送达")
    if len(refund_reasons) > 0:
        top_reason = refund_reasons[0]
        insights.append(f"最大退款原因为「{top_reason['reason']}」（{top_reason['count']} 笔），建议针对性优化商品质量或服务体验")
    if total_reviews > 0:
        avg_rating = sum(r["rating"] * r["count"] for r in reviews) / total_reviews
        insights.append(f"商品平均评分 {avg_rating:.2f} 分（共 {total_reviews} 条评价），{'评分表现良好' if avg_rating >= 4 else '建议关注差评商品并推进改善'}")
    if len(top_refund_products) > 0:
        worst = top_refund_products[0]
        insights.append(f"退款率最高商品为「{worst['product_name']}」（{worst['refund_rate'] * 100:.1f}%），建议核查商品质量或详情页准确性")
    if len(top_low_rated) > 0:
        worst_r = top_low_rated[0]
        insights.append(f"评分最低商品为「{worst_r['product_name']}」（{worst_r['avg_rating']}分），建议排查商品质量或用户体验问题")

    return {
        "title": "履约售后分析",
        "description": "配送延迟、退款原因、评论评分分析",
        "fulfillment": {
            "total_orders": total_fulfill,
            "avg_delay_days": round(avg_delay, 2),
            "delay_rate": delay_rate,
            "on_time_rate": on_time_rate
        },
        "refund_reasons": refund_reasons,
        "reviews": reviews,
        "total_reviews": total_reviews,
        "top_refund_products": top_refund_products,
        "top_low_rated": top_low_rated,
        "insights": insights
    }
