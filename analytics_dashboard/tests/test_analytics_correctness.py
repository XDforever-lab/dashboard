import os
import sys
import unittest
from unittest.mock import patch


ANALYTICS_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ANALYTICS_ROOT not in sys.path:
    sys.path.insert(0, ANALYTICS_ROOT)

from app.subprojects import business_health
from app.subprojects import customer_clustering
from app.subprojects import feature_engineering
from app.subprojects import repurchase_prediction
from app.subprojects import sales_forecast


class BusinessHealthTests(unittest.TestCase):
    def test_metric_denominators_and_session_funnel(self):
        def fake_query(sql, params=None):
            compact = " ".join(sql.split())
            if "SUM(paid_amount)" in compact and "AS gmv" in compact and "GROUP BY" not in compact:
                return [{"gmv": 100.0}]
            if "COUNT(DISTINCT order_id) AS orders" in compact and "GROUP BY" not in compact:
                return [{"orders": 4}]
            if "COUNT(DISTINCT user_id) AS buyers" in compact:
                return [{"buyers": 1}]
            if "refund_orders" in compact:
                return [{"refund_total": 10.0, "refund_orders": 1}]
            if "GROUP BY strftime('%Y-%m', order_date)" in compact:
                return [{"month": "2026-03", "gmv": 100.0, "orders": 4}]
            if "GROUP BY channel" in compact:
                return [{"channel": "search", "gmv": 100.0, "orders": 4}]
            if "AS session_count" in compact:
                self.assertIn("COUNT(DISTINCT session_id)", compact)
                return [
                    {"event_type": "view_home", "session_count": 10},
                    {"event_type": "view_product", "session_count": 8},
                    {"event_type": "add_to_cart", "session_count": 4},
                    {"event_type": "checkout", "session_count": 3},
                    {"event_type": "pay_success", "session_count": 2},
                ]
            if "GROUP BY strftime('%Y-%m', event_date), event_type" in compact:
                self.assertIn("COUNT(DISTINCT session_id)", compact)
                return []
            raise AssertionError(f"Unexpected SQL: {compact}")

        with patch.object(business_health, "query", side_effect=fake_query):
            result = business_health.run()

        self.assertEqual(result["kpi"]["aov"], 25.0)
        self.assertEqual(result["kpi"]["avg_spend_per_buyer"], 100.0)
        self.assertEqual(result["kpi"]["refund_rate"], 0.25)
        self.assertEqual(result["kpi"]["refund_amount_rate"], 0.1)
        self.assertEqual(result["funnel_grain"], "distinct_session")
        self.assertEqual(result["funnel_rates"]["checkout_to_pay"], 0.6667)


class ReferenceDateTests(unittest.TestCase):
    def test_rfm_uses_dataset_max_date(self):
        calls = []

        def fake_query(sql, params=None):
            compact = " ".join(sql.split())
            calls.append((compact, params))
            if "MAX(order_date) AS reference_date" in compact:
                return [{"reference_date": "2026-03-31"}]
            if "AS recency" in compact:
                return [{"user_id": "u1", "recency": 0, "frequency": 2, "monetary": 120.0}]
            if "AS cohort_month" in compact:
                return [{"user_id": "u1", "cohort_month": "2026-03"}]
            if "AS order_month" in compact:
                return [{"user_id": "u1", "order_month": "2026-03"}]
            raise AssertionError(f"Unexpected SQL: {compact}")

        with patch.object(feature_engineering, "query", side_effect=fake_query):
            result = feature_engineering.run()

        recency_call = next(call for call in calls if "AS recency" in call[0])
        self.assertNotIn("julianday('now')", recency_call[0])
        self.assertEqual(recency_call[1], ["2026-03-31"])
        self.assertEqual(result["summary"]["reference_date"], "2026-03-31")

    def test_customer_segments_use_dataset_max_date(self):
        def fake_query(sql, params=None):
            compact = " ".join(sql.split())
            if "MAX(order_date) AS reference_date" in compact:
                return [{"reference_date": "2026-03-31"}]
            self.assertEqual(params, ["2026-03-31"])
            self.assertNotIn("julianday('now')", compact)
            return [
                {"user_id": "u1", "register_channel": "search", "member_level": "gold", "recency_days": 0, "frequency": 5, "monetary": 500.0},
                {"user_id": "u2", "register_channel": "organic", "member_level": "normal", "recency_days": 40, "frequency": 1, "monetary": 50.0},
            ]

        with patch.object(customer_clustering, "query", side_effect=fake_query):
            result = customer_clustering.run()

        self.assertEqual(result["reference_date"], "2026-03-31")
        self.assertEqual(result["method"], "rfm_rule_based")

    def test_repurchase_scoring_uses_dataset_max_date(self):
        def fake_query(sql, params=None):
            compact = " ".join(sql.split())
            if "MAX(order_date) AS reference_date" in compact:
                return [{"reference_date": "2026-03-31"}]
            self.assertEqual(params, ["2026-03-31", "2026-03-01", "2026-01-30", "2026-03-01"])
            return [
                {"user_id": "u1", "recency": 2, "frequency": 4, "monetary": 400.0, "f_recent": 2, "f_prev": 1},
                {"user_id": "u2", "recency": 20, "frequency": 2, "monetary": 100.0, "f_recent": 0, "f_prev": 1},
            ]

        with patch.object(repurchase_prediction, "query", side_effect=fake_query):
            result = repurchase_prediction.run()

        self.assertEqual(result["summary"]["reference_date"], "2026-03-31")
        self.assertEqual(result["summary"]["eligible_users"], 2)
        self.assertEqual(result["model"]["type"], "rule_based_scoring")
        self.assertIn("倾向", result["title"])


class SalesForecastTests(unittest.TestCase):
    def test_backtest_matches_linear_forecast_method(self):
        daily_rows = [
            {"order_date": f"2026-01-{(i % 28) + 1:02d}", "daily_gmv": float(i + 1)}
            for i in range(45)
        ]

        def fake_query(sql, params=None):
            compact = " ".join(sql.split())
            if "FROM fact_order_item" in compact:
                return []
            if "strftime('%Y-%m', order_date)" in compact:
                return []
            return daily_rows

        with patch.object(sales_forecast, "query", side_effect=fake_query):
            result = sales_forecast.run()

        forecast = result["forecast"]
        self.assertEqual(result["method"], "rolling_linear_trend_30d")
        self.assertEqual(forecast["mae"], 0)
        self.assertEqual(forecast["rmse"], 0)
        self.assertEqual(forecast["next_7d_gmv"][0], 46.0)
        self.assertEqual(forecast["next_7d_lower"][0], 46.0)
        self.assertEqual(forecast["next_7d_upper"][0], 46.0)


if __name__ == "__main__":
    unittest.main()
