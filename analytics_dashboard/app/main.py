from fastapi import Body, FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import html
import json
import time
import os
import urllib.error
import urllib.request

from app.data_access import get_db_path
from app.subprojects.business_health import run as run_business_health
from app.subprojects.feature_engineering import run as run_feature_engineering
from app.subprojects.repurchase_prediction import run as run_repurchase_prediction
from app.subprojects.customer_clustering import run as run_customer_clustering
from app.subprojects.association_rules import run as run_association_rules
from app.subprojects.sales_forecast import run as run_sales_forecast
from app.subprojects.marketing_attribution import run as run_marketing_attribution
from app.subprojects.fulfillment_analysis import run as run_fulfillment_analysis
from app.subprojects.decision_board import run as run_decision_board

app = FastAPI(title="E-Shop Dashboard", version="1.0.0")

static_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")

_cache = {}
_cache_time = 0
CACHE_TTL = 300
AI_MODEL_ENDPOINT = os.environ.get("DASHBOARD_AI_ENDPOINT", "").strip()
AI_MODEL_KEY = os.environ.get("DASHBOARD_AI_API_KEY", "").strip()
AI_MODEL_NAME = os.environ.get("DASHBOARD_AI_MODEL", "dashboard-local-analyst").strip()


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
    fa = run_fulfillment_analysis()

    others = {
        "business_health": bh,
        "feature_engineering": fe,
        "repurchase_prediction": rp,
        "customer_clustering": cc,
        "association_rules": ar,
        "sales_forecast": sf,
        "marketing_attribution": ma,
        "fulfillment_analysis": fa
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


@app.get("/api/etl-overview")
def api_etl_overview():
    from app.data_access import query
    # 获取所有物理表（非视图）
    tables = query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    table_info = []
    total_rows = 0

    # 表类型映射
    fact_set = {'orders', 'order_items', 'page_events', 'refunds', 'product_reviews', 
                 'ads_spend', 'shipments', 'payments', 'inventory_movements',
                 'cart_items', 'carts', 'user_coupons'}
    dim_set = {'users', 'sku', 'spu', 'categories', 'campaigns', 'coupons', 'addresses'}

    for t in tables:
        tname = t["name"]
        try:
            cnt = query(f"SELECT COUNT(*) AS c FROM \"{tname}\"")[0]["c"]
        except Exception:
            cnt = 0
        cols = query(f"PRAGMA table_info(\"{tname}\")")
        col_count = len(cols)
        if tname in fact_set:
            ttype = "事实表"
        elif tname in dim_set:
            ttype = "维度表"
        else:
            ttype = "其他"
        table_info.append({
            "name": tname,
            "rows": cnt,
            "columns": col_count,
            "type": ttype
        })
        total_rows += cnt

    # 数据质量概览
    date_range = query("SELECT MIN(order_date) AS min_date, MAX(order_date) AS max_date FROM fact_order")
    order_count = query("SELECT COUNT(*) AS c FROM fact_order")
    user_count = query("SELECT COUNT(*) AS c FROM dim_user")
    product_count = query("SELECT COUNT(*) AS c FROM dim_product")
    traffic_count = query("SELECT COUNT(*) AS c FROM fact_traffic")

    return {
        "tables": table_info,
        "total_tables": len(table_info),
        "total_records": total_rows,
        "date_range": {
            "min": date_range[0]["min_date"] if date_range else None,
            "max": date_range[0]["max_date"] if date_range else None
        },
        "order_count": order_count[0]["c"] if order_count else 0,
        "user_count": user_count[0]["c"] if user_count else 0,
        "product_count": product_count[0]["c"] if product_count else 0,
        "traffic_count": traffic_count[0]["c"] if traffic_count else 0,
        "data_version": "course_dataset_v2"
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
        "monthly_funnel_trend": bh.get("monthly_funnel_trend", []),
        "channel_breakdown": bh.get("channel_breakdown", []),
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


@app.post("/api/ai/analyze")
def api_ai_analyze(payload: dict = Body(default={})):
    question = str(payload.get("question", "")).strip()[:500]
    if not question:
        return {
            "source": "local",
            "model": "dashboard-local-analyst",
            "answer_html": "<p>请先输入一个想分析的问题。</p>"
        }

    results = _get_all_results()
    context = _build_ai_context(results)

    if AI_MODEL_ENDPOINT:
        model_answer = _call_external_model(question, context)
        if model_answer:
            return {
                "source": "external",
                "model": AI_MODEL_NAME,
                "answer_html": _text_to_html(model_answer)
            }

    return {
        "source": "local",
        "model": "dashboard-local-analyst",
        "answer_html": _local_ai_answer(question, results)
    }


def _build_ai_context(results):
    bh = results.get("business_health", {})
    cc = results.get("customer_clustering", {})
    ar = results.get("association_rules", {})
    ma = results.get("marketing_attribution", {})
    db = results.get("decision_board", {})
    return {
        "kpi": bh.get("kpi", {}),
        "funnel": bh.get("funnel", {}),
        "funnel_rates": bh.get("funnel_rates", {}),
        "channels": bh.get("channel_breakdown", [])[:8],
        "segments": cc.get("segments", [])[:8],
        "top_rules": ar.get("rules", [])[:6],
        "marketing": ma.get("channel_efficiency", [])[:8],
        "decision_summary": db.get("summary", {}),
        "decisions": db.get("decisions", [])[:5]
    }


def _call_external_model(question, context):
    payload = {
        "model": AI_MODEL_NAME,
        "messages": [
            {
                "role": "system",
                "content": (
                    "你是电商经营分析 dashboard 的数据分析助手。"
                    "请基于给定 JSON 指标回答，输出中文，结论明确，给出可执行建议。"
                )
            },
            {
                "role": "user",
                "content": json.dumps({"question": question, "dashboard_context": context}, ensure_ascii=False)
            }
        ],
        "temperature": 0.2
    }
    headers = {"Content-Type": "application/json"}
    if AI_MODEL_KEY:
        headers["Authorization"] = f"Bearer {AI_MODEL_KEY}"

    try:
        req = urllib.request.Request(
            AI_MODEL_ENDPOINT,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        choices = data.get("choices") or []
        if choices:
            message = choices[0].get("message") or {}
            return message.get("content") or choices[0].get("text")
    except (urllib.error.URLError, TimeoutError, ValueError, KeyError):
        return None
    return None


def _local_ai_answer(question, results):
    bh = results.get("business_health", {})
    cc = results.get("customer_clustering", {})
    ma = results.get("marketing_attribution", {})
    db = results.get("decision_board", {})

    kpi = bh.get("kpi", {})
    funnel = bh.get("funnel", {})
    decisions = db.get("decisions", [])
    segments = cc.get("segments", [])
    channels = ma.get("channel_efficiency", [])

    gmv = float(kpi.get("gmv") or 0)
    orders = int(kpi.get("orders") or 0)
    aov = float(kpi.get("aov") or 0)
    refund_rate = float(kpi.get("refund_rate") or 0) * 100

    if "漏斗" in question or "流失" in question or "转化" in question:
        stages = [
            ("首页访问", "view_home"),
            ("商品页浏览", "view_product"),
            ("加入购物车", "add_to_cart"),
            ("提交结算", "checkout"),
            ("支付成功", "pay_success")
        ]
        rows = []
        worst = {"stage": "", "rate": 1.0}
        for idx in range(1, len(stages)):
            prev_name, prev_key = stages[idx - 1]
            cur_name, cur_key = stages[idx]
            prev = funnel.get(prev_key) or 0
            cur = funnel.get(cur_key) or 0
            rate = cur / prev if prev else 0
            rows.append(f"<li>{prev_name} → {cur_name}: <strong>{rate * 100:.1f}%</strong></li>")
            if rate < worst["rate"]:
                worst = {"stage": f"{prev_name} → {cur_name}", "rate": rate}
        return (
            "<p>当前漏斗最需要关注的是 "
            f"<strong>{html.escape(worst['stage'])}</strong>，阶段转化率为 "
            f"<strong>{worst['rate'] * 100:.1f}%</strong>。</p>"
            f"<ul>{''.join(rows)}</ul>"
            "<p>建议优先检查该环节的页面加载、促销承接、购物车/支付流程和异常日志，并用 A/B 测试验证优化方案。</p>"
        )

    if "用户" in question or "分群" in question or "运营" in question:
        items = []
        for seg in segments[:5]:
            name = html.escape(str(seg.get("name", "未命名分群")))
            count = int(seg.get("count") or 0)
            share = float(seg.get("gmv_share") or 0) * 100
            strategy = html.escape(str(seg.get("strategy", "持续观察")))
            items.append(f"<li><strong>{name}</strong>: {count} 人，GMV 占比 {share:.1f}%，建议 {strategy}</li>")
        return (
            "<p>用户运营应按价值和活跃度分层推进，优先覆盖高价值和近期活跃人群。</p>"
            f"<ul>{''.join(items) if items else '<li>当前暂无分群结果。</li>'}</ul>"
            "<p>执行上可把高价值用户做会员权益，沉睡用户做召回券，潜力用户做组合购和满减提升客单价。</p>"
        )

    if "营销" in question or "ROAS" in question.upper() or "渠道" in question:
        sorted_channels = sorted(channels, key=lambda row: row.get("roas") or 0, reverse=True)
        best = sorted_channels[0] if sorted_channels else {}
        worst = sorted_channels[-1] if sorted_channels else {}
        items = [
            f"<li>{html.escape(str(c.get('channel')))}: ROAS <strong>{float(c.get('roas') or 0):.2f}</strong>，建议 {html.escape(str(c.get('action') or '-'))}</li>"
            for c in sorted_channels[:4]
        ]
        return (
            f"<p>营销预算建议向高 ROAS 渠道倾斜。当前最佳渠道是 <strong>{html.escape(str(best.get('channel', '-')))}</strong>，"
            f"ROAS 为 <strong>{float(best.get('roas') or 0):.2f}</strong>；最低渠道是 "
            f"<strong>{html.escape(str(worst.get('channel', '-')))}</strong>。</p>"
            f"<ul>{''.join(items)}</ul>"
            "<p>健康线可按 ROAS 2.0 观察，低于健康线的渠道建议先优化人群和素材，再决定是否继续加投。</p>"
        )

    if "建议" in question or "决策" in question:
        items = []
        for d in decisions[:3]:
            title = html.escape(str(d.get("title", "决策建议")))
            priority = html.escape(str(d.get("priority", "P2")))
            action = html.escape(str(d.get("action", "")))
            items.append(f"<li><strong>[{priority}] {title}</strong>: {action}</li>")
        return (
            "<p>我建议本轮优先处理这三件事：</p>"
            f"<ol>{''.join(items) if items else '<li>暂无决策建议。</li>'}</ol>"
            "<p>优先级可以按影响 GMV、影响转化、执行成本三个维度排序。</p>"
        )

    health_score = html.escape(str(db.get("summary", {}).get("health_score", "未知")))
    top_opportunity = html.escape(str(db.get("summary", {}).get("top_opportunity", "暂无")))
    top_risk = html.escape(str(db.get("summary", {}).get("top_risk", "暂无")))
    return (
        f"<p>整体经营健康度为 <strong>{health_score}</strong>。当前 GMV 为 <strong>{_fmt_money(gmv)}</strong>，"
        f"订单数 <strong>{orders:,}</strong>，客单价 <strong>{_fmt_money(aov)}</strong>，退款率 <strong>{refund_rate:.2f}%</strong>。</p>"
        f"<ul><li>最大增长机会: {top_opportunity}</li><li>最大经营风险: {top_risk}</li></ul>"
        "<p>下一步建议结合漏斗流失、用户分群和渠道 ROAS 三个页面交叉验证，避免只看单一指标做决策。</p>"
    )


def _fmt_money(value):
    if abs(value) >= 100000000:
        return f"¥{value / 100000000:.2f}亿"
    if abs(value) >= 10000:
        return f"¥{value / 10000:.2f}万"
    return f"¥{value:,.2f}"


def _text_to_html(text):
    safe = html.escape(str(text or "").strip())
    blocks = [f"<p>{part}</p>" for part in safe.split("\n\n") if part.strip()]
    if blocks:
        return "".join(blocks).replace("\n", "<br/>")
    return "<p>模型暂未返回有效内容。</p>"


if os.path.isdir(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")
