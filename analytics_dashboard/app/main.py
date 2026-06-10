from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import time
import os

from app.data_access import get_db_path
from app.subprojects.business_health import run as run_business_health
from app.subprojects.feature_engineering import run as run_feature_engineering
from app.subprojects.repurchase_prediction import run as run_repurchase_prediction
from app.subprojects.customer_clustering import run as run_customer_clustering
from app.subprojects.association_rules import run as run_association_rules
from app.subprojects.sales_forecast import run as run_sales_forecast
from app.subprojects.marketing_attribution import run as run_marketing_attribution
from app.subprojects.decision_board import run as run_decision_board

app = FastAPI(title="E-Shop Dashboard", version="1.0.0")

static_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")

_cache = {}
_cache_time = 0
CACHE_TTL = 300


def _get_all_results(force=False):
    global _cache, _cache_time
    now = time.time()
    if not force and _cache and (now - _cache_time) < CACHE_TTL:
        return _cache

    bh = run_business_health()
    fe = run_feature_engineering()
    rp = run_repurchase_prediction()
    cc = run_customer_clustering()
    ar = run_association_rules()
    sf = run_sales_forecast()
    ma = run_marketing_attribution()

    others = {
        "business_health": bh,
        "feature_engineering": fe,
        "repurchase_prediction": rp,
        "customer_clustering": cc,
        "association_rules": ar,
        "sales_forecast": sf,
        "marketing_attribution": ma
    }
    db = run_decision_board(others)
    others["decision_board"] = db

    _cache = others
    _cache_time = now
    return _cache


@app.get("/")
def root():
    index_path = os.path.join(static_dir, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path)
    return {"message": "E-Shop Dashboard API", "docs": "/docs"}


@app.get("/health")
def health():
    db_path = get_db_path()
    db_exists = os.path.isfile(db_path)
    return {
        "status": "ok",
        "database": "connected" if db_exists else "not found",
        "db_path": db_path
    }


@app.get("/api/overview")
def api_overview():
    from app.data_access import query
    date_range = query("""
        SELECT MIN(order_date) AS min_date, MAX(order_date) AS max_date
        FROM fact_order
    """)
    order_count = query("SELECT COUNT(DISTINCT order_id) AS c FROM fact_order WHERE status IN ('paid', 'completed')")
    event_count = query("SELECT COUNT(*) AS c FROM fact_traffic")
    user_count = query("SELECT COUNT(DISTINCT user_id) AS c FROM dim_user")
    sku_count = query("SELECT COUNT(DISTINCT sku_id) AS c FROM dim_product")
    return {
        "date_range": {
            "min": date_range[0]["min_date"] if date_range else None,
            "max": date_range[0]["max_date"] if date_range else None
        },
        "orders": order_count[0]["c"] if order_count else 0,
        "events": event_count[0]["c"] if event_count else 0,
        "users": user_count[0]["c"] if user_count else 0,
        "products": sku_count[0]["c"] if sku_count else 0
    }


@app.get("/api/summary")
def api_summary():
    results = _get_all_results()
    bh = results.get("business_health", {})
    fe = results.get("feature_engineering", {})
    rp = results.get("repurchase_prediction", {})
    sf = results.get("sales_forecast", {})
    ma = results.get("marketing_attribution", {})
    db = results.get("decision_board", {})

    return {
        "kpi": bh.get("kpi", {}),
        "monthly_trend": bh.get("monthly_trend", []),
        "funnel": bh.get("funnel", {}),
        "funnel_rates": bh.get("funnel_rates", {}),
        "rfm_summary": fe.get("summary", {}),
        "rfm_distribution": fe.get("rfm_distribution", {}),
        "repurchase_summary": rp.get("summary", {}),
        "forecast": sf.get("forecast", {}),
        "channel_efficiency": ma.get("channel_efficiency", []),
        "decisions": db.get("decisions", []),
        "insights": bh.get("insights", []) + db.get("insights", []),
        "computed_at": time.strftime("%Y-%m-%d %H:%M:%S")
    }


@app.get("/api/subprojects")
def api_subprojects():
    results = _get_all_results()
    items = []
    for key, val in results.items():
        items.append({
            "id": key,
            "title": val.get("title", key),
            "description": val.get("description", ""),
            "method": val.get("method", "")
        })
    return {"subprojects": items}


@app.get("/api/subprojects/{subproject_id}")
def api_subproject_detail(subproject_id: str):
    results = _get_all_results()
    if subproject_id not in results:
        return {"error": f"subproject '{subproject_id}' not found"}
    return results[subproject_id]


@app.get("/api/decision-board")
def api_decision_board():
    results = _get_all_results()
    return results.get("decision_board", {})


@app.post("/api/reload")
def api_reload():
    _get_all_results(force=True)
    return {"status": "reloaded", "computed_at": time.strftime("%Y-%m-%d %H:%M:%S")}


if os.path.isdir(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")
