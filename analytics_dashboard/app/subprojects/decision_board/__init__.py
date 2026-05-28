def run(others):
    if not others or not isinstance(others, dict):
        return {
            "title": "综合决策板",
            "description": "把前述分析转化为经营动作和课堂解释",
            "summary": {
                "health_score": "无法评估",
                "top_opportunity": "数据不可用",
                "top_risk": "数据不可用"
            },
            "decisions": [],
            "git_roadmap": _default_roadmap(),
            "insights": ["各子项目结果数据不完整或为空，无法生成综合决策建议，请确认上游分析是否正常执行。"]
        }

    health_data = others.get("business_health", {})
    customer_data = others.get("customer_clustering", {})
    feature_data = others.get("feature_engineering", {})
    repurchase_data = others.get("repurchase_prediction", {})

    health_kpi = health_data.get("kpi", {}) if isinstance(health_data, dict) else {}
    monthly_trend = health_data.get("monthly_trend", []) if isinstance(health_data, dict) else []
    channel_breakdown = health_data.get("channel_breakdown", []) if isinstance(health_data, dict) else []
    funnel_rates = health_data.get("funnel_rates", {}) if isinstance(health_data, dict) else {}
    funnel = health_data.get("funnel", {}) if isinstance(health_data, dict) else {}

    segments = customer_data.get("segments", []) if isinstance(customer_data, dict) else []
    customer_insights = customer_data.get("insights", []) if isinstance(customer_data, dict) else []

    rfm_summary = feature_data.get("summary", {}) if isinstance(feature_data, dict) else {}
    rfm_distribution = feature_data.get("rfm_distribution", {}) if isinstance(feature_data, dict) else {}
    rfm_labels = rfm_distribution.get("labels", {}) if isinstance(rfm_distribution, dict) else {}

    repurchase_summary = repurchase_data.get("summary", {}) if isinstance(repurchase_data, dict) else {}

    refund_rate = health_kpi.get("refund_rate", 0)
    gmv = health_kpi.get("gmv", 0)
    aov = health_kpi.get("aov", 0)
    orders = health_kpi.get("orders", 0)
    buyers = health_kpi.get("buyers", 0)

    gmv_trend_up = _check_gmv_trend(monthly_trend)

    if refund_rate < 0.05 and gmv_trend_up:
        health_score = "良好"
    elif refund_rate > 0.10 or (not gmv_trend_up and len(monthly_trend) >= 2):
        health_score = "预警"
    else:
        health_score = "一般"

    decisions = []
    insights = []

    decisions.extend(_build_p0_decisions(health_kpi, monthly_trend, channel_breakdown, funnel_rates, funnel, segments, rfm_labels, repurchase_summary))
    decisions.extend(_build_p1_decisions(health_kpi, funnel_rates, funnel, segments, customer_insights, rfm_labels, repurchase_summary))
    decisions.extend(_build_p2_decisions(segments, rfm_labels, channel_breakdown, customer_insights, repurchase_summary))

    top_opportunity, top_risk = _analyze_opportunity_and_risk(
        health_kpi, monthly_trend, channel_breakdown, funnel_rates, segments, rfm_labels
    )

    insights.extend(_build_comprehensive_insights(
        health_kpi, monthly_trend, channel_breakdown, funnel_rates,
        segments, rfm_labels, rfm_summary, repurchase_summary, health_score
    ))

    missing_parts = _check_missing_parts(others)
    if missing_parts:
        insights.append(f"注意：以下子项目结果缺失或为空，决策建议可能不完整 - {', '.join(missing_parts)}")

    git_roadmap = others.get("git_roadmap", None)
    if not git_roadmap or not isinstance(git_roadmap, list) or len(git_roadmap) == 0:
        git_roadmap = _default_roadmap()

    return {
        "title": "综合决策板",
        "description": "把前述分析转化为经营动作和课堂解释",
        "summary": {
            "health_score": health_score,
            "top_opportunity": top_opportunity,
            "top_risk": top_risk
        },
        "decisions": decisions,
        "git_roadmap": git_roadmap,
        "insights": insights
    }


def _check_gmv_trend(monthly_trend):
    if not monthly_trend or len(monthly_trend) < 2:
        return True
    gmv_values = [m.get("gmv", 0) for m in monthly_trend if isinstance(m, dict)]
    if len(gmv_values) < 2:
        return True
    first_half = gmv_values[:len(gmv_values) // 2]
    second_half = gmv_values[len(gmv_values) // 2:]
    avg_first = sum(first_half) / len(first_half) if first_half else 0
    avg_second = sum(second_half) / len(second_half) if second_half else 0
    return avg_second > avg_first


def _build_p0_decisions(health_kpi, monthly_trend, channel_breakdown, funnel_rates, funnel, segments, rfm_labels, repurchase_summary):
    decisions = []
    refund_rate = health_kpi.get("refund_rate", 0)
    gmv = health_kpi.get("gmv", 0)

    if refund_rate > 0.10:
        decisions.append({
            "priority": "P0",
            "title": "高退款率紧急治理",
            "evidence": {"退款率": f"{refund_rate * 100:.2f}%", "警戒线": "10%"},
            "action": "立即排查高退款商品类目和用户群，对退款率超标的商品暂停推广并联系供应商整改；同步优化商品详情页描述准确性和售后流程",
            "expected_impact": "将退款率降至10%以下，预计可挽回约{(refund_rate - 0.10) * gmv:.0f}元GMV流失",
            "owner": "运营",
            "timeline": "短期"
        })

    if monthly_trend and len(monthly_trend) >= 2:
        recent_months = monthly_trend[-3:] if len(monthly_trend) >= 3 else monthly_trend
        gmv_list = [m.get("gmv", 0) for m in recent_months if isinstance(m, dict)]
        if len(gmv_list) >= 2 and gmv_list[-1] < gmv_list[-2] * 0.85:
            decisions.append({
                "priority": "P0",
                "title": "GMV连续下滑预警",
                "evidence": {
                    "最近月份GMV": f"{gmv_list[-1]:.2f}",
                    "前一月份GMV": f"{gmv_list[-2]:.2f}",
                    "降幅": f"{(1 - gmv_list[-1] / max(gmv_list[-2], 0.01)) * 100:.1f}%"
                },
                "action": "紧急启动全渠道促销活动，加大高转化渠道的投放预算，针对性发放挽回优惠券给沉睡用户群",
                "expected_impact": "短期内刺激消费回流，力争下月GMV环比回升10%以上",
                "owner": "市场",
                "timeline": "短期"
            })

    has_low_roas_channel = False
    for ch in channel_breakdown:
        if isinstance(ch, dict):
            share = ch.get("share", 0)
            if share > 0.3:
                has_low_roas_channel = True
                break
    if has_low_roas_channel and refund_rate > 0.05:
        decisions.append({
            "priority": "P0",
            "title": "渠道投放效率优化",
            "evidence": {
                "退款率": f"{refund_rate * 100:.2f}%",
                "渠道集中度": "单一渠道占比超30%，存在依赖风险"
            },
            "action": "重新评估各渠道ROAS，减少低效渠道投放，将预算转向高转化渠道；同时拓展1-2个新渠道降低集中度风险",
            "expected_impact": "提升整体营销ROI 15%以上，降低单一渠道依赖风险",
            "owner": "市场",
            "timeline": "短期"
        })

    churn_count = rfm_labels.get("流失客户", 0)
    important_churn = rfm_labels.get("重要挽留客户", 0)
    if churn_count + important_churn > 0:
        total_rfm = sum(rfm_labels.values())
        churn_pct = (churn_count + important_churn) / max(total_rfm, 1)
        if churn_pct > 0.15:
            decisions.append({
                "priority": "P0",
                "title": "核心用户流失风险",
                "evidence": {
                    "流失客户数": churn_count,
                    "重要挽留客户数": important_churn,
                    "流失占比": f"{churn_pct * 100:.1f}%"
                },
                "action": "对重要挽留客户启动一对一挽回计划：专属客服回访 + 大额回归券 + 新品优先体验权；对流失客户批量发送唤醒push",
                "expected_impact": "目标挽回30%流失客户，预计带来额外GMV增长",
                "owner": "运营",
                "timeline": "短期"
            })

    return decisions


def _build_p1_decisions(health_kpi, funnel_rates, funnel, segments, customer_insights, rfm_labels, repurchase_summary):
    decisions = []

    view_to_product = funnel_rates.get("view_to_product", 0)
    product_to_cart = funnel_rates.get("product_to_cart", 0)
    cart_to_checkout = funnel_rates.get("cart_to_checkout", 0)
    checkout_to_pay = funnel_rates.get("checkout_to_pay", 0)

    bottlenecks = []
    if view_to_product > 0 and view_to_product < 0.5:
        bottlenecks.append(("首页→商品页", view_to_product))
    if product_to_cart > 0 and product_to_cart < 0.3:
        bottlenecks.append(("商品页→加购", product_to_cart))
    if cart_to_checkout > 0 and cart_to_checkout < 0.3:
        bottlenecks.append(("加购→结算", cart_to_checkout))
    if checkout_to_pay > 0 and checkout_to_pay < 0.7:
        bottlenecks.append(("结算→支付", checkout_to_pay))

    if bottlenecks:
        worst_stage, worst_rate = min(bottlenecks, key=lambda x: x[1])
        decisions.append({
            "priority": "P1",
            "title": f"转化漏斗瓶颈：{worst_stage}转化率仅 {worst_rate * 100:.1f}%",
            "evidence": {
                "瓶颈环节": worst_stage,
                "当前转化率": f"{worst_rate * 100:.1f}%",
                "全部环节": ", ".join(f"{s}= {r * 100:.1f}%" for s, r in bottlenecks)
            },
            "action": f"针对「{worst_stage}」环节进行专项优化：A/B测试不同页面布局、优化加载速度、简化用户操作步骤",
            "expected_impact": f"将{worst_stage}转化率提升20%以上，带动整体GMV增长",
            "owner": "产品",
            "timeline": "中期"
        })

    gmv = health_kpi.get("gmv", 0)
    aov = health_kpi.get("aov", 0)
    if aov > 0:
        decisions.append({
            "priority": "P1",
            "title": "提升客单价策略",
            "evidence": {
                "当前客单价": f"{aov:.2f}元",
                "总GMV": f"{gmv:.2f}元"
            },
            "action": "推行满减促销、捆绑销售和交叉推荐策略；在购物车页面增加「凑单推荐」模块，设置梯度满减门槛",
            "expected_impact": "客单价提升10-20%，带动整体GMV增长",
            "owner": "运营",
            "timeline": "中期"
        })

    churn_count = rfm_labels.get("流失客户", 0)
    new_customer_count = rfm_labels.get("新客户", 0)
    total_rfm = sum(rfm_labels.values())
    if total_rfm > 0 and churn_count / total_rfm > 0.1:
        decisions.append({
            "priority": "P1",
            "title": "客户留存与激活计划",
            "evidence": {
                "流失客户占比": f"{churn_count / total_rfm * 100:.1f}%",
                "新客户占比": f"{new_customer_count / total_rfm * 100:.1f}%" if total_rfm > 0 else "0%"
            },
            "action": "建立客户生命周期管理体系：新用户7日留存引导、活跃用户会员成长体系、沉默用户30日/60日/90日阶梯唤醒机制",
            "expected_impact": "将客户留存率提升15%，降低获客成本依赖",
            "owner": "运营",
            "timeline": "中期"
        })

    high_potential_count = repurchase_summary.get("high_potential_count", 0)
    estimated_roi = repurchase_summary.get("estimated_roi", 0)
    if high_potential_count > 0 and estimated_roi > 1:
        decisions.append({
            "priority": "P1",
            "title": "高潜复购用户精准触达",
            "evidence": {
                "高潜用户数": high_potential_count,
                "预估触达ROI": f"{estimated_roi:.2f}"
            },
            "action": f"对{high_potential_count}名高潜复购用户分组推送个性化优惠券，结合其历史购买偏好进行品类精准推荐",
            "expected_impact": f"预计带来约{estimated_roi:.1f}倍ROI的额外收入",
            "owner": "运营",
            "timeline": "中期"
        })

    return decisions


def _build_p2_decisions(segments, rfm_labels, channel_breakdown, customer_insights, repurchase_summary):
    decisions = []

    high_value = rfm_labels.get("重要价值客户", 0)
    important_dev = rfm_labels.get("重要发展客户", 0)
    potential = rfm_labels.get("潜力客户", 0)
    total_rfm = sum(rfm_labels.values())

    if total_rfm > 0:
        decisions.append({
            "priority": "P2",
            "title": "用户分群精细化运营",
            "evidence": {
                "重要价值客户": high_value,
                "重要发展客户": important_dev,
                "潜力客户": potential,
                "总用户数": total_rfm
            },
            "action": "建立分群运营SOP：重要价值客户→VIP权益+新品内测；重要发展客户→品类偏好推荐+满减券；潜力客户→捆绑套餐+会员升级引导",
            "expected_impact": "各分群人均消费提升10-25%，整体用户LTV显著增长",
            "owner": "运营",
            "timeline": "长期"
        })

    if segments:
        decision_candidates = []
        for seg in segments:
            if isinstance(seg, dict):
                name = seg.get("name", "")
                count = seg.get("count", 0)
                gmv_share = seg.get("gmv_share", 0)
                strategy = seg.get("strategy", "")
                if name == "高价值高频客" and gmv_share > 0.3:
                    decision_candidates.append({
                        "priority": "P2",
                        "title": "高价值客户深度运营",
                        "evidence": {"客户群": name, "人数": count, "GMV占比": f"{gmv_share * 100:.1f}%"},
                        "action": f"为{name}（{count}人）建立VIP专属服务体系：1对1客服、生日礼遇、新品优先购、专属折扣日",
                        "expected_impact": "巩固核心用户忠诚度，提升该类用户年度复购频次20%以上",
                        "owner": "运营",
                        "timeline": "长期"
                    })
                elif name == "沉睡待召回客" and count > 0:
                    decision_candidates.append({
                        "priority": "P2",
                        "title": "沉睡用户系统性唤醒",
                        "evidence": {"客户群": name, "人数": count},
                        "action": f"对{count}名沉睡用户设计三段式唤醒流程：短信触达→APP Push→专属优惠券，配合限时活动提升紧迫感",
                        "expected_impact": "目标唤醒率15-20%，为平台注入增量活跃用户",
                        "owner": "市场",
                        "timeline": "中期"
                    })
        decisions.extend(decision_candidates)

    if channel_breakdown:
        channel_count = len([c for c in channel_breakdown if isinstance(c, dict)])
        if channel_count >= 2:
            top_channel = channel_breakdown[0]
            if isinstance(top_channel, dict):
                decisions.append({
                    "priority": "P2",
                    "title": "渠道组合优化与多元化",
                    "evidence": {
                        "渠道数量": channel_count,
                        "最大渠道": top_channel.get("channel", "未知"),
                        "最大渠道占比": f"{top_channel.get('share', 0) * 100:.1f}%"
                    },
                    "action": "建立渠道健康度评分体系，每季度review各渠道ROAS；对新兴渠道进行小预算测试（如直播、短视频带货），逐步降低对单一渠道的依赖",
                    "expected_impact": "渠道结构更加健康，中长期获客成本降低20%以上",
                    "owner": "市场",
                    "timeline": "长期"
                })

    return decisions


def _analyze_opportunity_and_risk(health_kpi, monthly_trend, channel_breakdown, funnel_rates, segments, rfm_labels):
    refund_rate = health_kpi.get("refund_rate", 0)
    gmv = health_kpi.get("gmv", 0)

    top_opportunity = "暂无足够数据判断最大增长机会"

    high_value = rfm_labels.get("重要价值客户", 0)
    important_dev = rfm_labels.get("重要发展客户", 0)
    potential = rfm_labels.get("潜力客户", 0)
    total_rfm = sum(rfm_labels.values())

    if total_rfm > 0:
        if high_value > 0:
            top_opportunity = f"高价值客户（{high_value}人）深度运营可带来稳定复购增长，建议优先投入VIP权益体系"
        elif potential > 0:
            top_opportunity = f"潜力客户（{potential}人）近期活跃但客单价偏低，通过捆绑销售和满减策略可快速提升GMV"
        elif important_dev > 0:
            top_opportunity = f"重要发展客户（{important_dev}人）消费能力强但频次低，精准推荐可激发潜在需求"

    if channel_breakdown:
        top_ch = channel_breakdown[0]
        if isinstance(top_ch, dict) and top_ch.get("share", 0) > 0.5:
            top_opportunity = f"拓展第二增长渠道可降低单一依赖风险，当前最大渠道「{top_ch.get('channel', '未知')}」占比超50%"

    top_risk = "暂无显著经营风险"
    if refund_rate > 0.10:
        top_risk = f"退款率高达 {refund_rate * 100:.2f}%，严重影响净利润和品牌口碑，需立即治理"
    elif refund_rate > 0.05:
        top_risk = f"退款率 {refund_rate * 100:.2f}% 超过5%健康线，存在持续恶化风险"

    churn_count = rfm_labels.get("流失客户", 0)
    important_churn = rfm_labels.get("重要挽留客户", 0)
    if total_rfm > 0 and (churn_count + important_churn) / total_rfm > 0.2:
        top_risk = f"流失用户（含重要挽留）占比超20%，客户流失速度可能快于拉新速度，核心用户资产在缩水"

    gmv_trend_up = _check_gmv_trend(monthly_trend)
    if not gmv_trend_up and len(monthly_trend) >= 2:
        if "退款率" not in top_risk:
            top_risk = "GMV月度趋势呈下降态势，需警惕市场竞争力下降或用户需求变化"

    return top_opportunity, top_risk


def _build_comprehensive_insights(health_kpi, monthly_trend, channel_breakdown, funnel_rates, segments, rfm_labels, rfm_summary, repurchase_summary, health_score):
    insights = []

    refund_rate = health_kpi.get("refund_rate", 0)
    gmv = health_kpi.get("gmv", 0)
    aov = health_kpi.get("aov", 0)
    orders = health_kpi.get("orders", 0)

    if gmv > 0:
        insights.append(f"平台累计GMV为 {gmv:,.2f} 元，共 {orders} 笔订单，整体健康评分为「{health_score}」")

    if aov > 0:
        insights.append(f"客单价为 {aov:.2f} 元，建议持续通过满减活动和交叉销售提升客单价，目标提升至 {aov * 1.2:.2f} 元")

    if refund_rate > 0:
        insights.append(f"当前退款率为 {refund_rate * 100:.2f}%，{'高于警戒线，需重点关注商品质量和售后体验' if refund_rate > 0.05 else '处于健康范围' if refund_rate < 0.05 else '接近警戒线，需保持关注'}")

    total_rfm = sum(rfm_labels.values())
    if total_rfm > 0:
        high_value = rfm_labels.get("重要价值客户", 0)
        new_customer = rfm_labels.get("新客户", 0)
        insights.append(f"RFM分群覆盖 {total_rfm} 位用户，其中重要价值客户 {high_value} 位（{high_value / total_rfm * 100:.1f}%），新客户 {new_customer} 位（{new_customer / total_rfm * 100:.1f}%）")

    if segments:
        for seg in segments:
            if isinstance(seg, dict):
                name = seg.get("name", "")
                count = seg.get("count", 0)
                gmv_share = seg.get("gmv_share", 0)
                if name == "高价值高频客" and count > 0:
                    insights.append(f"高价值高频客群共 {count} 人，贡献 GMV 占比 {gmv_share * 100:.1f}%，是核心利润来源，应优先维护")
                elif name == "沉睡待召回客" and count > 0:
                    insights.append(f"沉睡待召回客群共 {count} 人，曾经活跃但已流失，唤醒成本低于拉新成本，建议优先触达")

    high_potential_count = repurchase_summary.get("high_potential_count", 0)
    estimated_roi = repurchase_summary.get("estimated_roi", 0)
    if high_potential_count > 0:
        insights.append(f"复购预测模型识别出 {high_potential_count} 名高潜复购用户，预估触达ROI为 {estimated_roi:.2f}，建议配合优惠券策略进行精准触达")

    if channel_breakdown:
        active_channels = [c for c in channel_breakdown if isinstance(c, dict) and c.get("gmv", 0) > 0]
        if active_channels:
            top = active_channels[0]
            insights.append(f"最大营收渠道为「{top.get('channel', '未知')}」，贡献 {top.get('share', 0) * 100:.1f}% GMV，建议在稳固该渠道的同时拓展第二增长渠道")

    if funnel_rates:
        view_to_product = funnel_rates.get("view_to_product", 0)
        checkout_to_pay = funnel_rates.get("checkout_to_pay", 0)
        if 0 < view_to_product < 0.5:
            insights.append(f"首页到商品页转化率仅 {view_to_product * 100:.1f}%，首页引流效率有待提升，建议优化推荐算法和首页布局")
        if 0 < checkout_to_pay < 0.7:
            insights.append(f"结算到支付转化率仅 {checkout_to_pay * 100:.1f}%，存在支付环节流失，建议检查支付流程便捷性并增加多种支付方式")

    if monthly_trend and len(monthly_trend) >= 3:
        recent = monthly_trend[-1]
        if isinstance(recent, dict):
            insights.append(f"最近月份（{recent.get('month', '未知')}）GMV为 {recent.get('gmv', 0):,.2f} 元，环比趋势{'向好' if _check_gmv_trend(monthly_trend) else '需关注'}")

    avg_recency = rfm_summary.get("avg_recency", 0)
    if avg_recency > 30:
        insights.append(f"整体用户平均最近购买间隔 {avg_recency:.0f} 天，存在用户活跃度下降趋势，建议加大促销活动和内容推送频次")

    return insights


def _check_missing_parts(others):
    expected_keys = [
        "business_health",
        "customer_clustering",
        "feature_engineering",
        "repurchase_prediction"
    ]
    missing = []
    for key in expected_keys:
        val = others.get(key)
        if val is None or (isinstance(val, dict) and len(val) == 0):
            missing.append(key)
    return missing


def _default_roadmap():
    return [
        {"milestone": "v0.1", "description": "从源码建立项目基线，完成数据仓库建模（dim_user / fact_order / fact_traffic / fact_refund）"},
        {"milestone": "v0.2", "description": "实现经营健康诊断模块：GMV、客单价、退款率、月度趋势、渠道拆解、转化漏斗"},
        {"milestone": "v0.3", "description": "实现用户建模宽表（RFM）：Recency / Frequency / Monetary 特征工程与分群标注"},
        {"milestone": "v0.4", "description": "实现客户分群模块：基于RFM的规则分群，匹配差异化运营策略"},
        {"milestone": "v0.5", "description": "实现复购预测模块：可解释评分模型 + 高潜用户触达名单 + ROI预估"},
        {"milestone": "v0.6", "description": "实现综合决策板模块：整合各子项目结果，生成P0/P1/P2三级决策建议"},
        {"milestone": "v1.0", "description": "全模块联调与端到端测试，产出完整经营分析报告"},
        {"milestone": "v1.1", "description": "优化UI展示：ECharts可视化、决策板交互、导出PDF报告"},
        {"milestone": "v1.2", "description": "引入机器学习模型：复购概率预测、用户LTV预估、智能定价建议"},
    ]
