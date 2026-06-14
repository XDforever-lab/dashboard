from collections import defaultdict, Counter
from itertools import combinations
from ...data_access import query

BATCH_SIZE = 500  # Avoid SQLite variable limit (default 999)
MIN_SUPPORT = 0.001  # 0.1% minimum support to prune low-frequency items


def _fetch_baskets(order_ids, batch_size=BATCH_SIZE):
    """Fetch order items in batches to avoid exceeding SQLite placeholder limit."""
    baskets = defaultdict(set)
    sku_names = {}
    for i in range(0, len(order_ids), batch_size):
        batch = order_ids[i:i + batch_size]
        placeholders = ",".join(["?" for _ in batch])
        rows = query(f"""
            SELECT oi.order_id, oi.sku_id, dp.product_name
            FROM fact_order_item oi
            JOIN dim_product dp ON oi.sku_id = dp.sku_id
            WHERE oi.order_id IN ({placeholders})
        """, batch)
        for row in rows:
            baskets[row["order_id"]].add(row["sku_id"])
            sku_names[row["sku_id"]] = row["product_name"]
    return baskets, sku_names


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
        return _empty_result(0)

    order_ids = [row["order_id"] for row in order_ids_row]
    baskets, sku_names = _fetch_baskets(order_ids)

    # Keep only baskets with >= 2 items
    valid_baskets = {oid: items for oid, items in baskets.items() if len(items) >= 2}
    total_valid_orders = len(valid_baskets)

    if total_valid_orders < 2:
        return _empty_result(total_transactions)

    # Pre-filter: compute per-item frequency and prune low-support items
    item_freq = Counter()
    for items in valid_baskets.values():
        for item in items:
            item_freq[item] += 1

    min_count = max(1, int(total_valid_orders * MIN_SUPPORT))
    frequent_items = {item for item, cnt in item_freq.items() if cnt >= min_count}

    # Prune each basket to frequent items only, skip if < 2 remain
    pruned_baskets = {}
    for oid, items in valid_baskets.items():
        pruned = sorted(items & frequent_items)
        if len(pruned) >= 2:
            pruned_baskets[oid] = pruned
    N = len(pruned_baskets)

    if N < 2:
        return _empty_result(total_transactions)

    # Count pairs only among frequent items → far fewer combinations
    pair_counts = Counter()
    item_support_counts = Counter()
    for items in pruned_baskets.values():
        for item in items:
            item_support_counts[item] += 1
        for a, b in combinations(items, 2):
            pair_counts[(a, b)] += 1

    rules = []
    for (a, b), pair_count in pair_counts.items():
        support_ab = pair_count / N
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
            "support_pct": round(supp * 100, 2),
            "pair_count": pair_counts[(ante, cons)] if (ante, cons) in pair_counts else pair_counts.get((cons, ante), 0),
            "total_transactions": N,
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
        "summary": {"total_transactions": total_transactions, "total_rules": len(result_rules)},
        "insights": insights
    }


def _empty_result(total_transactions):
    return {
        "title": "商品关联规则",
        "description": "购物篮分析：支持度、置信度、提升度、组合销售建议",
        "method": "apriori_manual",
        "rules": [],
        "summary": {"total_transactions": total_transactions, "total_rules": 0},
        "insights": ["暂无数据"]
    }
