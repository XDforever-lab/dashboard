"""
数据库视图迁移脚本
将后端代码使用的 fact_/dim_ 前缀表名映射到实际数据库表名
"""
import sqlite3
import os

DB = os.path.join(os.path.dirname(__file__), "data", "eshop.sqlite")

conn = sqlite3.connect(DB)
conn.execute("PRAGMA journal_mode=WAL")

# 先删除已有视图（如果存在）
existing = conn.execute("SELECT name FROM sqlite_master WHERE type='view'").fetchall()
for (name,) in existing:
    conn.execute(f"DROP VIEW IF EXISTS [{name}]")
print(f"Dropped {len(existing)} existing views")

VIEWS = [
    # ========== 事实表 ==========
    ("fact_order", """
        CREATE VIEW fact_order AS
        SELECT
            order_id, user_id, campaign_id,
            status, channel,
            DATE(created_at) AS order_date,
            paid_amount, total_amount, paid_at,
            subtotal, discount_amount, shipping_fee,
            created_at, paid_at AS order_paid_at, completed_at
        FROM orders
    """),

    ("fact_order_item", """
        CREATE VIEW fact_order_item AS
        SELECT
            oi.order_item_id, oi.order_id, oi.sku_id, oi.spu_id,
            oi.quantity, oi.unit_price AS price,
            oi.unit_cost AS cost,
            oi.line_amount,
            oi.discount_amount,
            DATE(o.created_at) AS order_date
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.order_id
    """),

    ("fact_traffic", """
        CREATE VIEW fact_traffic AS
        SELECT
            event_id, user_id, session_id,
            event_type, page,
            DATE(created_at) AS event_date,
            channel, device, campaign_id, sku_id,
            created_at AS event_time
        FROM page_events
    """),

    ("fact_refund", """
        CREATE VIEW fact_refund AS
        SELECT
            refund_id, order_id,
            amount, reason, status,
            DATE(created_at) AS event_date,
            created_at
        FROM refunds
    """),

    ("fact_product_review", """
        CREATE VIEW fact_product_review AS
        SELECT
            review_id, order_id, user_id, sku_id,
            rating, sentiment, content_tag,
            DATE(created_at) AS created_date,
            created_at
        FROM product_reviews
    """),

    ("fact_ads_spend", """
        CREATE VIEW fact_ads_spend AS
        SELECT
            spend_id, campaign_id,
            spend_date,
            channel,
            impressions, clicks, conversions,
            spend_amount
        FROM ads_spend
    """),

    ("fact_fulfillment", """
        CREATE VIEW fact_fulfillment AS
        SELECT
            shipment_id, order_id,
            carrier, province,
            promised_days, delivery_days,
            CASE WHEN delivery_days > promised_days THEN 1 ELSE 0 END AS is_late,
            status,
            shipped_at, delivered_at
        FROM shipments
    """),

    ("fact_cart", """
        CREATE VIEW fact_cart AS
        SELECT
            c.cart_id, c.user_id,
            ci.cart_item_id, ci.sku_id, ci.quantity,
            c.created_at
        FROM carts c
        LEFT JOIN cart_items ci ON c.cart_id = ci.cart_id
    """),

    ("fact_inventory_movement", """
        CREATE VIEW fact_inventory_movement AS
        SELECT
            movement_id, sku_id,
            movement_type, quantity, reason,
            related_order_id, created_at
        FROM inventory_movements
    """),

    ("fact_payment", """
        CREATE VIEW fact_payment AS
        SELECT
            payment_id, order_id,
            provider, amount, status,
            paid_at
        FROM payments
    """),

    # ========== 维度表 ==========
    ("dim_product", """
        CREATE VIEW dim_product AS
        SELECT
            sk.sku_id, sk.spu_id,
            sk.sku_name AS product_name,
            sk.price, sk.cost,
            sk.supplier,
            sk.listing_date,
            sk.stock,
            sk.status,
            sp.name AS spu_name,
            sp.brand,
            cat.name AS category_name,
            cat.category_id,
            sp.description AS spu_description
        FROM sku sk
        JOIN spu sp ON sk.spu_id = sp.spu_id
        LEFT JOIN categories cat ON sp.category_id = cat.category_id
    """),

    ("dim_user", """
        CREATE VIEW dim_user AS
        SELECT
            user_id, name,
            province, city,
            register_channel, segment,
            gender, birth_year,
            member_level, status,
            created_at
        FROM users
    """),

    ("dim_campaign", """
        CREATE VIEW dim_campaign AS
        SELECT
            campaign_id, name,
            channel, campaign_type,
            target_segment,
            start_date, end_date,
            budget, status
        FROM campaigns
    """),

    ("dim_coupon", """
        CREATE VIEW dim_coupon AS
        SELECT
            coupon_id, campaign_id,
            code, name,
            threshold, discount,
            start_date, end_date,
            total_limit, issued_count, used_count,
            status
        FROM coupons
    """),

    ("dim_address", """
        CREATE VIEW dim_address AS
        SELECT
            address_id, user_id,
            receiver, phone,
            province, city, detail,
            is_default
        FROM addresses
    """),

    ("dim_admin_log", """
        CREATE VIEW dim_admin_log AS
        SELECT
            log_id, admin_name,
            action_type, entity_type, entity_id,
            detail, created_at
        FROM admin_action_logs
    """),
]

for view_name, sql in VIEWS:
    try:
        conn.execute(sql)
        cnt = conn.execute(f"SELECT COUNT(*) FROM [{view_name}]").fetchone()[0]
        print(f"  OK  {view_name}: {cnt} rows")
    except Exception as e:
        print(f"  FAIL {view_name}: {e}")

conn.close()
print("\nMigration complete!")
