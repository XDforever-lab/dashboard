from collections import defaultdict, Counter
from itertools import combinations
from ...data_access import query


def run():
    total_row = query("SELECT COUNT(DISTINCT order_id) AS cnt FROM fact_order_item")
    total_transactions = total_row[0]["cnt"] if total_row else 0

    order_ids_row = query("""
        SELECT DISTINCT order_id
        FROM fact_order_item
        ORDER BY order_id DESC
        LIMIT 20000
    """)

    if not order_ids_row:
        return {
            "title": "商品关联规则",
            "description": "购物篮分析：支持度、置信度、提升度、组合销售建议",
            "method": "apriori_manual",
            "rules": [],
            "summary": {"total_transactions": 0, "total_rules": 0},
            "insights": ["暂无数据"]
        }

    order_ids = [row["order_id"] for row in order_ids_row]
    placeholders = ",".join(["?" for _ in order_ids])

    items_rows = query(f"""
        SELECT oi.order_id, oi.sku_id, dp.product_name
        FROM fact_order_item oi
        JOIN dim_product dp ON oi.sku_id = dp.sku_id
        WHERE oi.order_id IN ({placeholders})
    """, order_ids)

    baskets = defaultdict(set)
    sku_names = {}
    for row in items_rows:
        baskets[row["order_id"]].add(row["sku_id"])
        sku_names[row["sku_id"]] = row["product_name"]

    valid_baskets = {oid: items for oid, items in baskets.items() if len(items) >= 2}
    total_valid_orders = len(valid_baskets)

    if total_valid_orders < 2:
        return {
            "title": "商品关联规则",
            "description": "购物篮分析：支持度、置信度、提升度、组合销售建议",
            "method": "apriori_manual",
            "rules": [],
            "summary": {"total_transactions": total_transactions, "total_rules": 0},
            "insights": ["有效订单数不足，无法挖掘关联规则"]
        }

    pair_counts = Counter()
    item_support_counts = Counter()

    for items in valid_baskets.values():
        for item in items:
            item_support_counts[item] += 1
        for a, b in combinations(sorted(items), 2):
            pair_counts[(a, b)] += 1

    rules = []
    N = total_valid_orders

    for (a, b), pair_count in pair_counts.items():
        support_ab = pair_count / N
        if support_ab < 0.0001:
            continue

        support_a = item_support_counts[a] / N
        support_b = item_support_counts[b] / N
        pair_lift = support_ab / (support_a * support_b) if support_a * support_b > 0 else 0

        if pair_lift < 0.5:
            continue

        confidence_ab = pair_count / item_support_counts[a]
        if confidence_ab >= 0.05:
            rules.append((a, b, support_ab, confidence_ab, pair_lift))

        confidence_ba = pair_count / item_support_counts[b]
        if confidence_ba >= 0.05:
            rules.append((b, a, support_ab, confidence_ba, pair_lift))

    rules.sort(key=lambda r: r[4], reverse=True)
    rules = rules[:20]

    result_rules = []
    for ante, cons, supp, conf, lift_val in rules:
        if lift_val > 1.5:
            suggestion = "强关联，适合捆绑销售"
        elif lift_val > 1.0:
            suggestion = "中等关联，适合推荐位展示"
        else:
            suggestion = "弱关联，可观察"

        result_rules.append({
            "antecedent": sku_names.get(ante, f"SKU_{ante}"),
            "consequent": sku_names.get(cons, f"SKU_{cons}"),
            "support": round(supp, 4),
            "confidence": round(conf, 4),
            "lift": round(lift_val, 2),
            "business_suggestion": suggestion
        })

    insights = []
    if result_rules:
        high_lift = [r for r in result_rules if r["lift"] > 2]
        if high_lift:
            names = [f"「{r['antecedent']}」→「{r['consequent']}」" for r in high_lift[:3]]
            insights.append(f"发现{len(high_lift)}条强关联规则（提升度>2），如{', '.join(names)}，建议优先捆绑销售")

        medium_lift = [r for r in result_rules if 1.5 < r["lift"] <= 2]
        if medium_lift:
            insights.append(f"发现{len(medium_lift)}条中等关联规则（提升度1.5~2），适合在商品详情页做推荐位展示")

        weak_lift = [r for r in result_rules if r["lift"] <= 1.5]
        if weak_lift:
            insights.append(f"发现{len(weak_lift)}条弱关联规则，可继续观察是否需要营销干预")

    if not insights:
        insights.append("未发现显著的关联规则，建议扩大数据范围或调整阈值")

    return {
        "title": "商品关联规则",
        "description": "购物篮分析：支持度、置信度、提升度、组合销售建议",
        "method": "apriori_manual",
        "rules": result_rules,
        "summary": {
            "total_transactions": total_transactions,
            "total_rules": len(result_rules)
        },
        "insights": insights
    }
