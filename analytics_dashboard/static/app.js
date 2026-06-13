// ========== EShop Intelligence Dashboard ==========
const API = {
  async fetch(path) {
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.error(`API ${path} failed:`, e);
      return null;
    }
  },
  overview() { return this.fetch('/api/overview'); },
  summary() { return this.fetch('/api/summary'); },
  subproject(id) { return this.fetch(`/api/subprojects/${id}`); },
  decision() { return this.fetch('/api/decision-board'); },
  async ai(question) {
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.error('AI analyze failed:', e);
      return null;
    }
  },
};

const TITLES = {
  overview: '经营总览',
  etl: '数据概览',
  funnel: '漏斗诊断',
  customer: '客户分析',
  product: '商品与购物车',
  forecast: '预测与库存',
  marketing: '营销利润',
  decision: '综合诊断',
  fulfillment: '履约售后',
  ai: 'AI 分析助手',
  config: '系统配置',
};

let _allData = null;
let _subData = {};
let _overviewData = null;

// ========== Init ==========
document.addEventListener('DOMContentLoaded', () => {
  document.body.dataset.page = 'overview';
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => switchPage(el.dataset.page));
  });
  document.getElementById('btnRefresh').addEventListener('click', reloadAll);

  document.querySelectorAll('.ai-quick-btn').forEach(btn => {
    btn.addEventListener('click', () => askAI(btn.dataset.q));
  });
  document.getElementById('aiSendBtn').addEventListener('click', () => {
    const input = document.getElementById('aiInput');
    if (input.value.trim()) { askAI(input.value.trim()); input.value = ''; }
  });
  document.getElementById('aiInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { document.getElementById('aiSendBtn').click(); }
  });

  loadData(true).then(renderActivePage);
});

function switchPage(page) {
  document.body.dataset.page = page;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelector(`.nav-item[data-page="${page}"]`).classList.add('active');
  document.querySelectorAll('.page-section').forEach(el => el.style.display = 'none');
  const sec = document.getElementById(`page-${page}`);
  if (sec) sec.style.display = 'block';
  document.getElementById('pageTitle').textContent = TITLES[page] || page;
  renderPage(page);
}

async function reloadAll() {
  await loadData(true);
  renderActivePage();
}

function renderActivePage() {
  const page = document.querySelector('.nav-item.active')?.dataset?.page || 'overview';
  renderPage(page);
}

async function loadData(forceReload) {
  document.getElementById('loadingOverlay').style.display = 'flex';
  document.getElementById('updateTime').textContent = '加载中...';

  // Cycling tips during loading
  const LOADING_TIPS = [
    { title: 'CRISP-DM 方法论', desc: '商业理解 → 数据理解 → 数据准备 → 建模 → 评估 → 部署' },
    { title: 'RFM 用户分群', desc: 'Recency(近度) × Frequency(频次) × Monetary(金额) 三维评估用户价值' },
    { title: 'Cohort 留存分析', desc: '按首购月份分组，追踪每批用户后续月份的复购留存率' },
    { title: 'Apriori 关联规则', desc: '基于购物篮共现挖掘商品组合，计算支持度、置信度、提升度' },
    { title: '移动平均预测', desc: '30天滑动窗口 + 线性趋势外推，预测未来7天GMV与安全库存' },
    { title: 'WBS 甘特图', desc: '将项目拆解为6个可交付阶段，展示V1-V6渐进式交付进度' },
    { title: '安全库存模型', desc: '日波动系数 CV × 1.5 安全系数，按品类计算建议备货金额' },
    { title: '营销归因', desc: '按渠道拆分GMV与ROAS，识别高效渠道 → 优化预算分配' },
    { title: '数据建模', desc: '10万+仿真订单数据，涵盖2年电商经营全场景' },
  ];
  let tipTimer = null;
  let tipIdx = 0;
  const tipEl = document.getElementById('loadingSub');
  const startTips = () => {
    if (tipEl) tipEl.textContent = `${LOADING_TIPS[tipIdx].title}：${LOADING_TIPS[tipIdx].desc}`;
    tipTimer = setInterval(() => {
      tipIdx = (tipIdx + 1) % LOADING_TIPS.length;
      if (tipEl) tipEl.textContent = `${LOADING_TIPS[tipIdx].title}：${LOADING_TIPS[tipIdx].desc}`;
    }, 3000);
  };
  startTips();
  const stopTips = () => { if (tipTimer) { clearInterval(tipTimer); tipTimer = null; } };

  const setProgress = (pct, text, sub = '') => {
    document.getElementById('loadingText').textContent = text;
    document.getElementById('loadingSub').textContent = sub;
    document.getElementById('loadingBar').style.width = pct + '%';
  };

  // Step 1: Sidebar overview
  setProgress(5, '正在加载数据...', '获取基础指标');
  const ov = await API.overview();
  if (ov) {
    _overviewData = ov;
    document.getElementById('footerDateRange').textContent =
      `${ov.date_range?.min || '-'} 至 ${ov.date_range?.max || '-'}`;
    document.getElementById('footerOrders').textContent = (ov.orders || 0).toLocaleString();
    document.getElementById('footerEvents').textContent = (ov.events || 0).toLocaleString();
    document.getElementById('footerUsers').textContent = (ov.users || 0).toLocaleString();
    const heroOrders = document.getElementById('heroOrders');
    const heroEvents = document.getElementById('heroEvents');
    const heroUsers = document.getElementById('heroUsers');
    if (heroOrders) heroOrders.textContent = fmtNum(ov.orders || 0);
    if (heroEvents) heroEvents.textContent = fmtNum(ov.events || 0);
    if (heroUsers) heroUsers.textContent = fmtNum(ov.users || 0);
  }

  // Step 2: Reload (longest step)
  if (forceReload) {
    setProgress(10, '正在计算分析结果...', '首次加载需运算所有子项目，请耐心等待');
    await fetch('/api/reload', { method: 'POST' }).catch(() => {});
  }

  // Step 3: Summary
  setProgress(80, '正在汇总数据...', '获取经营总览');
  const data = await API.summary();
  if (data) {
    _allData = data;
    document.getElementById('updateTime').textContent =
      `数据更新于 ${data.computed_at || '-'}`;
  }

  // Step 4-10: Load subproject details
  const subIds = [
    'customer_clustering', 'feature_engineering', 'repurchase_prediction',
    'association_rules', 'sales_forecast', 'marketing_attribution',
    'fulfillment_analysis'
  ];
  const subNames = [
    '客户分群', '用户特征宽表', '复购预测',
    '关联规则', '销售预测', '营销归因',
    '履约售后分析'
  ];
  for (let i = 0; i < subIds.length; i++) {
    const pct = 80 + Math.round((i + 1) / subIds.length * 15);
    setProgress(pct, `正在加载子项目 ${i + 1}/${subIds.length}`, subNames[i]);
    const sub = await API.subproject(subIds[i]);
    if (sub) _subData[subIds[i]] = sub;
  }

  // Step 11: Decision board
  setProgress(98, '正在生成决策建议...', '综合诊断');
  const db = await API.decision();
  if (db) _subData['decision_board'] = db;

  setProgress(100, '加载完成', '');
  stopTips();
  setTimeout(() => {
    document.getElementById('loadingOverlay').style.display = 'none';
  }, 300);
}

// ========== Page Router ==========
function renderPage(page) {
  if (!_allData) return;
  switch (page) {
    case 'overview':  renderOverview(); break;
    case 'etl':       renderETL(); break;
    case 'funnel':    renderFunnel(); break;
    case 'customer':  renderCustomer(); break;
    case 'product':   renderProduct(); break;
    case 'forecast':  renderForecast(); break;
    case 'marketing': renderMarketing(); break;
    case 'decision':  renderDecision(); break;
    case 'fulfillment': renderFulfillment(); break;
    case 'ai':        break;
    case 'config':    renderConfig(); break;
  }
}

// ========== ETL Data Overview ==========
async function renderETL() {
  const etl = await API.fetch('/api/etl-overview');
  if (!etl) {
    document.getElementById('etlKpiGrid').innerHTML = '<div style="padding:20px;text-align:center;color:#999">数据加载失败</div>';
    return;
  }

  // KPI Cards
  const factTables = (etl.tables || []).filter(t => t.type === '事实表');
  const dimTables = (etl.tables || []).filter(t => t.type === '维度表');
  document.getElementById('etlKpiGrid').innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">数据表总数</div>
      <div class="kpi-value">${etl.total_tables}</div>
      <div class="kpi-sub">${factTables.length} 事实表 + ${dimTables.length} 维度表</div>
    </div>
    <div class="kpi-card accent-green">
      <div class="kpi-label">总记录数</div>
      <div class="kpi-value">${fmtNum(etl.total_records)}</div>
      <div class="kpi-sub">订单 ${fmtNum(etl.order_count)} | 事件 ${fmtNum(etl.traffic_count)} | 用户 ${fmtNum(etl.user_count)}</div>
    </div>
    <div class="kpi-card accent-orange">
      <div class="kpi-label">商品 SKU 数</div>
      <div class="kpi-value">${fmtNum(etl.product_count)}</div>
      <div class="kpi-sub">数据版本: ${etl.data_version}</div>
    </div>
    <div class="kpi-card accent-teal">
      <div class="kpi-label">数据时间范围</div>
      <div class="kpi-value" style="font-size:18px">${etl.date_range?.min || '-'} ~ ${etl.date_range?.max || '-'}</div>
      <div class="kpi-sub">覆盖 24 个月电商经营数据</div>
    </div>
  `;

  // Table distribution chart - show all tables grouped by type
  const factShow = [...factTables].slice(0, 6);
  const dimShow = [...dimTables].slice(0, 6);
  const otherTables = (etl.tables || []).filter(t => t.type !== '事实表' && t.type !== '维度表');
  const showTables = [...factShow, ...dimShow, ...otherTables.slice(0, 3)];

  renderChart('chart-etl-tables', {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: params => {
        let html = `<strong>${params[0].name}</strong><br/>`;
        params.forEach(p => html += `${p.marker} ${p.seriesName}: <strong>${fmtNum(p.value)}</strong><br/>`);
        return html;
      }
    },
    legend: { data: ['记录数', '字段数'], top: 10 },
    grid: { left: 80, right: 40, top: 50, bottom: 80 },
    xAxis: {
      type: 'category',
      data: showTables.map(t => t.name),
      axisLabel: { rotate: 45, fontSize: 11 }
    },
    yAxis: [
      { type: 'value', name: '记录数', axisLabel: { formatter: v => fmtNum(v) } },
      { type: 'value', name: '字段数' }
    ],
    series: [
      {
        name: '记录数', type: 'bar',
        data: showTables.map(t => t.rows),
        itemStyle: { color: '#2b6fbb' },
        barMaxWidth: 32
      },
      {
        name: '字段数', type: 'bar', yAxisIndex: 1,
        data: showTables.map(t => t.columns),
        itemStyle: { color: '#d9822b' },
        barMaxWidth: 32
      }
    ]
  });

  // Table detail
  const allTables = [...(etl.tables || [])].sort((a, b) => b.rows - a.rows);
  document.getElementById('etlTableDetail').innerHTML = `
    <table>
      <thead>
        <tr>
          <th>表名</th>
          <th>类型</th>
          <th>记录数</th>
          <th>字段数</th>
        </tr>
      </thead>
      <tbody>
        ${allTables.map(t => {
          const tagClass = t.type === '事实表' ? 'tag-p0' : t.type === '维度表' ? 'tag-p1' : 'tag-p2';
          return `
            <tr>
              <td><strong>${t.name}</strong></td>
              <td><span class="tag ${tagClass}">${t.type}</span></td>
              <td>${fmtNum(t.rows)}</td>
              <td>${t.columns}</td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;

  // Insights
  const insights = [];
  const factTotal = factTables.reduce((s, t) => s + t.rows, 0);
  const dimTotal = dimTables.reduce((s, t) => s + t.rows, 0);
  insights.push(`数据集覆盖 ${etl.date_range?.min || '?'} 至 ${etl.date_range?.max || '?'} 共 24 个月的电商经营数据，核心事实表 orders（${fmtNum(etl.order_count)} 条）和 page_events（${fmtNum(etl.traffic_count)} 条）驱动全部分析。`);
  insights.push(`数据由固定种子 seed.js 生成（${etl.data_version}），确保每次实验可复现，适合教学和作业统一使用。`);
  const maxTable = allTables.length > 0 ? allTables[0] : { name: '-', rows: 0 };
  insights.push(`最大数据表「${maxTable.name}」(${fmtNum(maxTable.rows)} 条记录)，建议建模时考虑采样或索引优化。`);
  renderInsights('etlInsights', insights);

  // CSV export for ETL table
  addExportBtn('etlTableDetail', () =>
    allTables.map(t => ({
      表名: t.name,
      类型: t.type,
      记录数: t.rows,
      字段数: t.columns
    })),
    'etl_tables.csv'
  );
}

// ========== Overview ==========
function renderOverview() {
  // 同步更新侧边栏底部 + Hero区统计（每次切回概览页兜底刷新）
  const ov = _overviewData;
  if (ov) {
    document.getElementById('footerDateRange').textContent =
      `${ov.date_range?.min || '-'} 至 ${ov.date_range?.max || '-'}`;
    document.getElementById('footerOrders').textContent = (ov.orders || 0).toLocaleString();
    document.getElementById('footerEvents').textContent = (ov.events || 0).toLocaleString();
    document.getElementById('footerUsers').textContent = (ov.users || 0).toLocaleString();
    const ho = document.getElementById('heroOrders');
    const he = document.getElementById('heroEvents');
    const hu = document.getElementById('heroUsers');
    if (ho) ho.textContent = fmtNum(ov.orders || 0);
    if (he) he.textContent = fmtNum(ov.events || 0);
    if (hu) hu.textContent = fmtNum(ov.users || 0);
  }

  const { kpi, monthly_trend, funnel, funnel_rates, channel_breakdown, insights } = _allData;

  // KPI Cards
  const gmv = kpi?.gmv || 0;
  const orders = kpi?.orders || 0;
  const buyers = kpi?.buyers || 0;
  const aov = kpi?.aov || 0;
  const refundRate = (kpi?.refund_rate || 0) * 100;

  document.getElementById('kpiGrid').innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">GMV</div>
      <div class="kpi-value">${fmtMoney(gmv)}</div>
      <div class="kpi-sub">总交易额</div>
    </div>
    <div class="kpi-card accent-green">
      <div class="kpi-label">订单数</div>
      <div class="kpi-value">${fmtNum(orders)}</div>
      <div class="kpi-sub">已支付订单</div>
    </div>
    <div class="kpi-card accent-teal">
      <div class="kpi-label">买家数</div>
      <div class="kpi-value">${fmtNum(buyers)}</div>
      <div class="kpi-sub">独立买家</div>
    </div>
    <div class="kpi-card accent-purple">
      <div class="kpi-label">客单价</div>
      <div class="kpi-value">${fmtMoney(aov)}</div>
      <div class="kpi-sub">GMV / 买家数</div>
    </div>
    <div class="kpi-card ${refundRate > 5 ? 'accent-red' : 'accent-orange'}">
      <div class="kpi-label">退款率</div>
      <div class="kpi-value">${refundRate.toFixed(2)}%</div>
      <div class="kpi-sub">${refundRate > 5 ? '高于警戒线' : '健康范围'}</div>
    </div>
  `;

  // Monthly Trend - dual Y-axis
  if (monthly_trend?.length) {
    renderChart('chart-monthly-trend', {
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: monthly_trend.map(m => m.month) },
      yAxis: [
        { type: 'value', name: 'GMV (元)', axisLabel: { formatter: fmtShort }, nameTextStyle: { fontSize: 11 } },
        { type: 'value', name: '订单数', axisLabel: { formatter: fmtShort }, nameTextStyle: { fontSize: 11 } }
      ],
      series: [
        { name: 'GMV', type: 'line', data: monthly_trend.map(m => m.gmv), smooth: true, areaStyle: { opacity: 0.15 }, itemStyle: { color: '#4facfe' } },
        { name: '订单数', type: 'line', yAxisIndex: 1, data: monthly_trend.map(m => m.orders), smooth: true, itemStyle: { color: '#2ecc71' } },
      ],
      legend: { data: ['GMV', '订单数'], bottom: 0 },
      grid: { top: 30, right: 60, bottom: 40, left: 60 },
    });
  }

  // Channel pie
  if (channel_breakdown?.length) {
    renderChart('chart-channel-pie', {
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      series: [{
        type: 'pie', radius: ['45%', '75%'], center: ['50%', '50%'],
        data: channel_breakdown.map(c => ({ name: c.channel, value: c.gmv })),
        label: { formatter: '{b}\n{d}%' },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.2)' } },
      }],
    });
  } else {
    document.getElementById('chart-channel-pie').innerHTML =
      '<div style="padding:40px;text-align:center;color:#999">渠道数据暂不可用</div>';
  }
  // Overview funnel
  if (funnel) {
    const steps = ['view_home', 'view_product', 'add_to_cart', 'checkout', 'pay_success'];
    const names = ['首页访问', '商品页浏览', '加入购物车', '提交结算', '支付成功'];
    const colors = ['#2b6fbb', '#16866f', '#d9822b', '#dd6b5f', '#8b4f3f'];
    const values = steps.map(s => funnel[s] || 0);
    renderChart('chart-overview-funnel', {
      tooltip: { trigger: 'item', formatter: '{b}: {c}' },
      series: [{
        type: 'funnel',
        left: '15%', right: '15%', top: 20, bottom: 20,
        minSize: '20%', maxSize: '100%', gap: 2,
        label: {
          show: true,
          position: 'inside',
          color: '#fff',
          fontWeight: 700,
          formatter: p => `${p.name}\n${fmtNum(p.value)}`,
        },
        data: steps.map((s, i) => ({
          name: names[i], value: values[i],
          itemStyle: { color: colors[i] },
        })),
      }],
    });
  }

  // Insights
  const allInsights = insights || [];
  renderInsights('overviewInsights', allInsights);

  // Populate filters
  populateOverviewFilters();
}

// ========== Funnel Diagnosis ==========
function renderFunnel() {
  const funnel = _allData?.funnel || {};

  const steps = [
    { key: 'view_home', name: '首页访问', color: '#2b6fbb' },
    { key: 'view_product', name: '商品页浏览', color: '#16866f' },
    { key: 'add_to_cart', name: '加入购物车', color: '#d9822b' },
    { key: 'checkout', name: '提交结算', color: '#dd6b5f' },
    { key: 'pay_success', name: '支付成功', color: '#8b4f3f' },
  ];

  const values = steps.map(s => funnel[s.key] || 0);
  const total = values[0] || 1;

  // Main funnel
  const funnelData = steps.map((s, i) => ({
    name: s.name, value: values[i],
    itemStyle: { color: s.color },
    label: {
      show: true, position: 'inside',
      formatter: `{name|${s.name}}\n{val|${fmtNum(values[i])} / ${(values[i]/total*100).toFixed(0)}%}`,
      rich: { name: { fontSize: 13, color: '#fff', fontWeight: 600 }, val: { fontSize: 12, color: 'rgba(255,255,255,0.85)' } },
    },
  }));

  renderChart('chart-funnel-main', {
    tooltip: {
      trigger: 'item',
      formatter: p => `${p.name}<br/>数量: ${fmtNum(p.value)}<br/>总转化率: ${(p.value/total*100).toFixed(1)}%`,
    },
    series: [{
      type: 'funnel', left: '12%', right: '12%', top: 20, bottom: 20,
      minSize: '15%', maxSize: '100%', gap: 4,
      data: funnelData,
    }],
  });

  // Loss list
  const lossItems = [];
  for (let i = 1; i < steps.length; i++) {
    const loss = values[i - 1] - values[i];
    const lossPct = values[i - 1] > 0 ? (loss / values[i - 1] * 100).toFixed(1) : 0;
    lossItems.push({
      stage: `${steps[i - 1].name} → ${steps[i].name}`,
      loss, lossPct,
    });
  }
  lossItems.sort((a, b) => b.loss - a.loss);

  document.getElementById('lossList').innerHTML = lossItems.map((item, i) => `
    <div class="loss-item">
      <span class="loss-label">${i + 1}. ${item.stage}</span>
      <span class="loss-value">流失 ${fmtNum(item.loss)}，阶段损失 ${item.lossPct}%</span>
    </div>
  `).join('');

  // Monthly conversion rate trend (replaces fake heatmaps with real data)
  const mft = _allData?.monthly_funnel_trend || [];
  if (mft.length > 0) {
    const months = mft.map(d => d.month);
    renderChart('chart-funnel-monthly-trend', {
      tooltip: {
        trigger: 'axis',
        formatter: params => {
          let html = `<strong>${params[0].axisValue}</strong><br/>`;
          params.forEach(p => {
            html += `${p.marker} ${p.seriesName}: <strong>${(p.value * 100).toFixed(1)}%</strong><br/>`;
          });
          return html;
        }
      },
      legend: { data: ['首页→商品页', '商品页→加购', '加购→结算', '结算→支付'], top: 10 },
      grid: { left: 60, right: 40, top: 50, bottom: 40 },
      xAxis: { type: 'category', data: months, axisLabel: { rotate: 45, fontSize: 11 } },
      yAxis: { type: 'value', axisLabel: { formatter: v => (v * 100).toFixed(0) + '%' }, min: 0 },
      series: [
        { name: '首页→商品页', type: 'line', data: mft.map(d => d.vp_rate), smooth: true, lineStyle: { width: 2.5 }, itemStyle: { color: '#2b6fbb' } },
        { name: '商品页→加购', type: 'line', data: mft.map(d => d.pc_rate), smooth: true, lineStyle: { width: 2.5 }, itemStyle: { color: '#16866f' } },
        { name: '加购→结算', type: 'line', data: mft.map(d => d.cc_rate), smooth: true, lineStyle: { width: 2.5 }, itemStyle: { color: '#d9822b' } },
        { name: '结算→支付', type: 'line', data: mft.map(d => d.cp_rate), smooth: true, lineStyle: { width: 2.5 }, itemStyle: { color: '#c94a4a' } },
      ],
    });
  } else {
    document.getElementById('chart-funnel-monthly-trend').innerHTML =
      '<div style="padding:40px;text-align:center;color:#999">月度漏斗趋势数据暂不可用</div>';
  }

  // Funnel insights
  const funnelInsightItems = (bh?.insights || []).filter(i =>
    i.includes('转化') || i.includes('漏斗') || i.includes('首页') || i.includes('商品页') || i.includes('加购') || i.includes('结算') || i.includes('支付')
  );
  if (funnelInsightItems.length === 0) funnelInsightItems.push('漏斗各环节转化率正常，继续保持');
  renderInsights('funnelInsights', funnelInsightItems);
}

function renderHeatmapChart(id, xLabels, yLabels, data, colors) {
  renderChart(id, {
    tooltip: {
      position: 'top',
      confine: true,
      formatter: p => `${yLabels[p.value[1]]}<br/>${xLabels[p.value[0]]}: <strong>${p.value[2]}</strong>`,
    },
    grid: { left: 46, right: 70, top: 26, bottom: 82, containLabel: true },
    xAxis: {
      type: 'category',
      data: xLabels,
      splitArea: { show: true },
      axisLabel: { fontSize: 11, interval: 0, margin: 12, color: '#667085' },
      axisTick: { alignWithLabel: true },
    },
    yAxis: {
      type: 'category',
      data: yLabels,
      splitArea: { show: true },
      axisLabel: { fontSize: 11, color: '#667085' },
    },
    visualMap: {
      min: 0,
      max: 100,
      show: false,
      inRange: { color: colors },
    },
    series: [{
      type: 'heatmap',
      data,
      label: { show: true, fontSize: 12, color: '#3f342d', fontWeight: 600 },
      emphasis: {
        itemStyle: { borderColor: '#fff', borderWidth: 2, shadowBlur: 8, shadowColor: 'rgba(16,24,40,0.18)' },
      },
    }],
  });
  renderHeatmapSliderLegend(id, colors);
}

function renderHeatmapSliderLegend(id, colors) {
  const dom = document.getElementById(id);
  if (!dom) return;
  dom.querySelector('.heatmap-slider-legend')?.remove();

  const legend = document.createElement('div');
  legend.className = 'heatmap-slider-legend';
  legend.style.setProperty('--heatmap-start', colors[0]);
  legend.style.setProperty('--heatmap-end', colors[colors.length - 1]);
  legend.innerHTML = `
    <span class="heatmap-scale heatmap-scale-min">0</span>
    <div class="heatmap-slider-track" style="background: linear-gradient(90deg, ${colors.join(', ')})">
      <span class="heatmap-slider-handle heatmap-slider-handle-min"></span>
      <span class="heatmap-slider-handle heatmap-slider-handle-max"></span>
    </div>
    <span class="heatmap-scale heatmap-scale-max">100</span>
  `;
  dom.appendChild(legend);
}

// ========== Customer ==========
function renderCustomer() {
  const fe = _subData['feature_engineering'];
  const cc = _subData['customer_clustering'];
  const rp = _subData['repurchase_prediction'];

  const rfmSum = fe?.summary || {};
  const rfmLabels = fe?.rfm_distribution?.labels || {};
  const totalUsers = rfmSum.total_users || 0;

  document.getElementById('rfmKpiGrid').innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">分析用户数</div>
      <div class="kpi-value">${fmtNum(totalUsers)}</div>
    </div>
    <div class="kpi-card accent-green">
      <div class="kpi-label">平均最近购买</div>
      <div class="kpi-value">${rfmSum.avg_recency || 0} 天</div>
    </div>
    <div class="kpi-card accent-purple">
      <div class="kpi-label">平均购买频次</div>
      <div class="kpi-value">${rfmSum.avg_frequency || 0} 次</div>
    </div>
    <div class="kpi-card accent-teal">
      <div class="kpi-label">平均消费金额</div>
      <div class="kpi-value">${fmtMoney(rfmSum.avg_monetary || 0)}</div>
    </div>
  `;

  // RFM Pie
  if (Object.keys(rfmLabels).length > 0) {
    const pieData = Object.entries(rfmLabels).map(([k, v]) => ({ name: k, value: v }));
    renderChart('chart-rfm-pie', {
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { orient: 'vertical', right: 10, top: 'center', textStyle: { fontSize: 11 } },
      series: [{
        type: 'pie', radius: ['35%', '65%'], center: ['40%', '50%'],
        data: pieData,
        label: { formatter: '{b}\n{d}%', fontSize: 10 },
      }],
    });
  }

  // Cluster bar
  const segments = cc?.segments || [];
  if (segments.length > 0) {
    renderSegmentBars('chart-cluster-bar', segments);
  }

  // Cohort Retention Heatmap
  const cohortMatrix = fe?.cohort_matrix || [];
  if (cohortMatrix.length > 0) {
    const cohortLabels = cohortMatrix.map(c => c.cohort);
    const maxPeriods = Math.max(...cohortMatrix.map(c => c.rates.length));
    const periodLabels = Array.from({length: maxPeriods}, (_, i) => `M${i}`);
    const heatData = [];
    cohortMatrix.forEach((c, ci) => {
      c.rates.forEach((rate, pi) => {
        heatData.push([pi, ci, rate]);
      });
    });
    renderChart('chart-cohort-heatmap', {
      tooltip: {
        position: 'top',
        formatter: p => `${cohortLabels[p.value[1]]}<br/>M${p.value[0]}: <strong>${(p.value[2] * 100).toFixed(1)}%</strong>`
      },
      grid: { left: 80, right: 60, top: 20, bottom: 60 },
      xAxis: {
        type: 'category', data: periodLabels,
        axisLabel: { fontSize: 11, color: '#667085' },
        name: '距首购月份', nameLocation: 'middle', nameGap: 35
      },
      yAxis: {
        type: 'category', data: cohortLabels,
        axisLabel: { fontSize: 11, color: '#667085' },
        name: '首次购买月份', nameLocation: 'middle', nameGap: 65
      },
      visualMap: {
        min: 0, max: 1, show: false,
        inRange: { color: ['#f7efe4', '#ead3b8', '#d9a46e', '#b86f42', '#6f3d2d'] }
      },
      series: [{
        type: 'heatmap', data: heatData,
        label: {
          show: true, fontSize: 11,
          formatter: p => (p.value[2] * 100).toFixed(0) + '%',
          color: p => p.value[2] > 0.3 ? '#fff' : '#3f342d',
          fontWeight: 600
        },
        emphasis: {
          itemStyle: { borderColor: '#fff', borderWidth: 2, shadowBlur: 8 }
        }
      }]
    });
  } else {
    document.getElementById('chart-cohort-heatmap').innerHTML =
      '<div style="padding:40px;text-align:center;color:#999">暂无Cohort数据</div>';
  }

  // Repurchase top users
  const hpUsers = rp?.high_potential_users || [];
  if (hpUsers.length > 0) {
    renderChart('chart-repurchase-top', {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: { type: 'category', data: hpUsers.map(u => u.user_id.substring(0, 12)), axisLabel: { fontSize: 10, rotate: 30 } },
      yAxis: { type: 'value', name: '评分', max: 100 },
      series: [{
        type: 'bar', data: hpUsers.map(u => u.score),
        itemStyle: { color: '#9b59b6' },
        label: { show: true, position: 'top', fontSize: 10, formatter: c => c.value.toFixed(0) },
      }],
      grid: { top: 10, right: 20, bottom: 50, left: 50 },
    });
  }

  // Model metrics
  const rpSummary = rp?.summary || {};
  const modelTypeMap = { 'rule_based_scoring': '综合评分模型' };
  const featureMap = { 'recency_score': '近度', 'frequency_score': '频次', 'monetary_score': '消费力', 'trend_score': '趋势' };
  if (Object.keys(rpSummary).length > 0) {
    const existingGrid = document.getElementById('rfmKpiGrid');
    if (existingGrid) {
      const modelHtml = `
        <div class="kpi-card accent-coral" style="--accent:var(--coral)">
          <div class="kpi-label">复购模型</div>
          <div class="kpi-value" style="font-size:18px">${modelTypeMap[rp?.model?.type] || rp?.model?.type || '评分模型'}</div>
          <div class="kpi-sub">综合评分 ≥ ${rp?.model?.threshold || 60} 判定为高潜</div>
        </div>
        <div class="kpi-card accent-green" style="--accent:var(--green)">
          <div class="kpi-label">高潜用户数</div>
          <div class="kpi-value">${fmtNum(rpSummary.high_potential_count || 0)}</div>
          <div class="kpi-sub">触达率 ${((rpSummary.touch_rate || 0) * 100).toFixed(1)}%</div>
        </div>
        <div class="kpi-card accent-orange" style="--accent:var(--orange)">
          <div class="kpi-label">预估 ROI</div>
          <div class="kpi-value">${(rpSummary.estimated_roi || 0).toFixed(2)}x</div>
          <div class="kpi-sub">维度: ${(rp?.model?.features || []).map(f => featureMap[f] || f).join('、')}</div>
        </div>
      `;
      existingGrid.insertAdjacentHTML('beforeend', modelHtml);
    }
  }

  const allInsights = [
    ...(fe?.insights || []),
    ...(cc?.insights || []),
    ...(rp?.insights || []),
  ];
  renderInsights('customerInsights', allInsights);
}

// ========== Product ==========
function renderProduct() {
  const ar = _subData['association_rules'];
  const rules = ar?.rules || [];

  if (rules.length > 0) {
    const topRules = rules.slice(0, 15);
    renderAssociationMatrix('chart-assoc-matrix', topRules);
  }

  document.getElementById('assocRulesTable').innerHTML = rules.length > 0 ? `
    <table>
      <thead><tr><th>前项</th><th>后项</th><th>支持度</th><th>共现次数</th><th>置信度</th><th>提升度</th><th>建议</th></tr></thead>
      <tbody>${rules.map(r => `
        <tr>
          <td>${r.antecedent}</td><td>${r.consequent}</td>
          <td>${r.support_pct != null ? r.support_pct.toFixed(2) + '%' : r.support.toFixed(4)}</td>
          <td>${r.pair_count || '-'}</td>
          <td>${(r.confidence * 100).toFixed(1)}%</td>
          <td class="${r.lift > 2 ? 'positive' : ''}">${r.lift}</td>
          <td><span class="tag ${r.lift > 2 ? 'tag-p2' : r.lift > 1.5 ? 'tag-p1' : 'tag-p0'}">${r.business_suggestion}</span></td>
        </tr>
      `).join('')}</tbody>
    </table>
  ` : '<div style="padding:20px;text-align:center;color:#999">暂无关联规则数据</div>';

  renderInsights('productInsights', ar?.insights || []);

  // CSV export for assoc rules
  if (rules.length > 0) {
    addExportBtn('assocRulesTable', () =>
      rules.map(r => ({
        前项: r.antecedent,
        后项: r.consequent,
        支持度: r.support,
        置信度: r.confidence,
        提升度: r.lift,
        建议: r.business_suggestion
      })),
      'association_rules.csv'
    );
  }
}

// ========== Forecast ==========
function renderForecast() {
  const sf = _subData['sales_forecast'];
  const fc = sf?.forecast || {};
  const mdc = sf?.monthly_decomposition || [];

  document.getElementById('forecastKpiGrid').innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">日均 GMV</div>
      <div class="kpi-value">${fmtMoney(fc.daily_avg_gmv || 0)}</div>
      <div class="kpi-sub">预测方法: ${sf?.method === 'moving_average_30d' ? '30天移动平均+线性趋势' : sf?.method || '移动平均'}</div>
    </div>
    <div class="kpi-card accent-orange">
      <div class="kpi-label">日波动 (CV)</div>
      <div class="kpi-value">${((fc.cv || 0) * 100).toFixed(2)}%</div>
      <div class="kpi-sub">RMSE: ${fmtMoney(fc.rmse || 0)}</div>
    </div>
    <div class="kpi-card accent-purple">
      <div class="kpi-label">安全库存金额</div>
      <div class="kpi-value">${fmtMoney(fc.safety_stock_gmv || 0)}</div>
      <div class="kpi-sub">MAE: ${fmtMoney(fc.mae || 0)}</div>
    </div>
    <div class="kpi-card accent-teal">
      <div class="kpi-label">预测精度</div>
      <div class="kpi-value">${fc.mape != null ? fc.mape.toFixed(1) + '%' : '-'}</div>
      <div class="kpi-sub">MAPE 越低越准确</div>
    </div>
  `;

  const next7 = fc.next_7d_gmv || [];
  const lower = fc.next_7d_lower || [];
  const upper = fc.next_7d_upper || [];
  if (next7.length > 0) {
    const days = Array.from({ length: 7 }, (_, i) => `D+${i + 1}`);
    renderChart('chart-forecast-gmv', {
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: days },
      yAxis: { type: 'value', scale: true, axisLabel: { formatter: fmtShort } },
      series: [
        { name: '预测 GMV', type: 'line', data: next7, itemStyle: { color: '#4facfe' }, areaStyle: { opacity: 0.1, color: '#4facfe' } },
        { name: '下限', type: 'line', data: lower, lineStyle: { type: 'dashed', color: '#bbb' }, itemStyle: { color: '#bbb' }, symbol: 'none' },
        { name: '上限', type: 'line', data: upper, lineStyle: { type: 'dashed', color: '#bbb' }, itemStyle: { color: '#bbb' }, symbol: 'none', areaStyle: { opacity: 0.08, color: '#bbb' } },
      ],
      legend: { data: ['预测 GMV', '下限', '上限'], bottom: 0 },
      grid: { top: 20, right: 20, bottom: 40, left: 60 },
    });
  }

  // Monthly decomposition chart
  if (mdc.length > 0) {
    const chartRow = document.querySelector('#page-forecast .chart-row');
    if (chartRow && chartRow.nextElementSibling?.classList?.contains('chart-row')) {
      // already exists, skip
    } else {
      const decompCard = document.createElement('div');
      decompCard.className = 'chart-card';
      decompCard.style.marginBottom = '20px';
      decompCard.innerHTML = `
        <div class="card-header"><h3>月度 GMV 趋势分解</h3><span class="card-hint">原始值与趋势线对比</span></div>
        <div class="chart-body chart-body-lg" id="chart-forecast-decomp"></div>
      `;
      const section = document.getElementById('page-forecast');
      const insightCard = section.querySelector('.chart-card:last-child');
      if (insightCard) {
        section.insertBefore(decompCard, insightCard);
      }
    }
    const months = mdc.map(d => d.month);
    renderChart('chart-forecast-decomp', {
      tooltip: { trigger: 'axis' },
      legend: { data: ['实际 GMV', '趋势线'], top: 10 },
      grid: { left: 70, right: 30, top: 50, bottom: 50 },
      xAxis: { type: 'category', data: months, axisLabel: { rotate: 45, fontSize: 10 } },
      yAxis: { type: 'value', axisLabel: { formatter: fmtShort } },
      series: [
        { name: '实际 GMV', type: 'bar', data: mdc.map(d => d.value), itemStyle: { color: '#a0c4e8' }, barMaxWidth: 20 },
        { name: '趋势线', type: 'line', data: mdc.map(d => d.trend), smooth: true, lineStyle: { width: 3, color: '#2b6fbb' }, itemStyle: { color: '#2b6fbb' }, symbol: 'circle', symbolSize: 6 },
      ]
    });
  }
}

// ========== Marketing ==========
function renderMarketing() {
  const ma = _subData['marketing_attribution'];
  const channels = ma?.channel_efficiency || [];
  const totalGmv = ma?.summary?.total_gmv || 0;
  const totalSpend = ma?.summary?.total_spend || 0;
  const overallRoas = ma?.summary?.overall_roas || 0;

  document.getElementById('marketingKpiGrid').innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">总 GMV</div>
      <div class="kpi-value">${fmtMoney(totalGmv)}</div>
    </div>
    <div class="kpi-card accent-orange">
      <div class="kpi-label">总广告花费</div>
      <div class="kpi-value">${fmtMoney(totalSpend)}</div>
    </div>
    <div class="kpi-card ${overallRoas > 2 ? 'accent-green' : 'accent-red'}">
      <div class="kpi-label">整体 ROAS</div>
      <div class="kpi-value">${overallRoas.toFixed(2)}</div>
      <div class="kpi-sub">${overallRoas > 2 ? '高于健康线' : '低于健康线'}</div>
    </div>
  `;

  if (channels.length > 0) {
    const roasMax = Math.max(...channels.map(c => c.roas || 0), 2);
    renderChart('chart-roas-bar', {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: { type: 'category', data: channels.map(c => c.channel) },
      yAxis: { type: 'value', name: 'ROAS', min: 0, max: Math.ceil(roasMax * 1.12) },
      series: [{
        type: 'bar',
        data: channels.map(c => ({
          value: c.roas,
          itemStyle: { color: c.roas > 2 ? '#2ecc71' : c.roas > 1 ? '#f39c12' : '#e74c3c' },
        })),
        label: { show: true, position: 'top', fontSize: 11 },
        markLine: {
          silent: true,
          symbol: ['circle', 'none'],
          data: [{
            yAxis: 2,
            label: {
              formatter: '健康线 2.0',
              position: 'insideEndTop',
              color: '#d92d20',
              backgroundColor: '#fff',
              padding: [2, 6],
              borderRadius: 4,
            },
          }],
          lineStyle: { color: '#f04438', type: 'dashed', width: 1.5 },
        },
      }],
      grid: { top: 34, right: 86, bottom: 48, left: 58, containLabel: true },
    });

    document.getElementById('channelEfficiencyTable').innerHTML = `
      <table>
        <thead><tr><th>渠道</th><th>GMV</th><th>花费</th><th>CTR</th><th>CVR</th><th>CPA</th><th>ROAS</th><th>建议</th></tr></thead>
        <tbody>${channels.map(c => `
          <tr>
            <td>${c.channel}</td><td>${fmtShort(c.gmv)}</td><td>${fmtShort(c.spend)}</td>
            <td>${(c.ctr * 100).toFixed(2)}%</td><td>${(c.cvr * 100).toFixed(2)}%</td>
            <td>${fmtMoney(c.cpa)}</td>
            <td class="${c.roas > 2 ? 'positive' : c.roas < 1 ? 'negative' : ''}">${c.roas.toFixed(2)}</td>
            <td><span class="tag ${c.action === '加投' ? 'tag-p2' : c.action === '维持' ? 'tag-p1' : 'tag-p0'}">${c.action}</span></td>
          </tr>
        `).join('')}</tbody>
      </table>
    `;
  }

  const budgetSuggestions = ma?.budget_suggestions || [];
  const allInsights = [
    ...(ma?.insights || []),
    ...budgetSuggestions.map(b => `${b.reason}（当前: ${fmtMoney(b.current_budget)} → 建议: ${fmtMoney(b.suggested_budget)}）`),
  ];
  renderInsights('marketingInsights', allInsights);

  // CSV export for channel efficiency
  if (channels.length > 0) {
    addExportBtn('channelEfficiencyTable', () =>
      channels.map(c => ({
        渠道: c.channel,
        GMV: c.gmv,
        花费: c.spend,
        CTR: (c.ctr * 100).toFixed(2) + '%',
        CVR: (c.cvr * 100).toFixed(2) + '%',
        CPA: c.cpa,
        ROAS: c.roas.toFixed(2),
        建议: c.action
      })),
      'channel_efficiency.csv'
    );
  }
}

// ========== Decision ==========
function renderDecision() {
  const db = _subData['decision_board'];
  const ds = db?.summary || {};
  const decisions = db?.decisions || [];
  const roadmap = db?.git_roadmap || [];

  const healthScore = ds.health_score || '未知';
  const emoji = healthScore === '良好' ? '\u2705' : healthScore === '预警' ? '\u26A0\uFE0F' : '\uD83D\uDCCA';

  document.getElementById('decisionSummary').innerHTML = `
    <div class="decision-card">
      <div class="dc-icon">${emoji}</div>
      <div class="dc-label">经营健康度</div>
      <div class="dc-value">${healthScore}</div>
    </div>
    <div class="decision-card">
      <div class="dc-icon">\uD83D\uDCC8</div>
      <div class="dc-label">最大增长机会</div>
      <div class="dc-value" style="font-size:13px">${ds.top_opportunity || '暂无'}</div>
    </div>
    <div class="decision-card">
      <div class="dc-icon">\uD83D\uDD34</div>
      <div class="dc-label">最大经营风险</div>
      <div class="dc-value" style="font-size:13px">${ds.top_risk || '暂无'}</div>
    </div>
  `;

  // WBS Gantt Chart
  if (roadmap.length > 0) {
    renderGanttChart(roadmap);
  }

  // Risk Matrix
  if (decisions.length > 0) {
    renderRiskMatrix(decisions, ds);
  }

  document.getElementById('decisionList').innerHTML = decisions.length > 0
    ? decisions.map(d => `
      <div class="decision-item">
        <div class="d-title">
          <span class="tag tag-${(d.priority || 'p2').toLowerCase()}">${d.priority}</span>
          ${d.title}
          <span style="font-size:11px;color:#999;margin-left:auto">${d.timeline || ''}</span>
        </div>
        <div class="d-body">${d.action || ''}</div>
        <div class="d-meta">
          <span>负责人: ${d.owner || '-'}</span>
          <span>预期收益: ${d.expected_impact || '-'}</span>
        </div>
      </div>
    `).join('')
    : '<div style="padding:20px;text-align:center;color:#999">暂无决策建议</div>';

  renderInsights('decisionInsights', db?.insights || []);
}

function renderGanttChart(roadmap) {
  const target = document.getElementById('decisionSummary');
  if (!target) return;

  const phases = [
    { label: 'V1', title: '需求分析', desc: '梳理两门课程知识点，确定RFM/Cohort/CRISP-DM等分析框架', color: '#dd6b5f' },
    { label: 'V2', title: '数据建模', desc: '生成10万+仿真电商数据，设计事实表+维度表数仓模型', color: '#d9822b' },
    { label: 'V3', title: '后端接口', desc: 'FastAPI构建10个子项目分析引擎，SQLite+VIEW数据层', color: '#16866f' },
    { label: 'V4', title: '可视化', desc: 'ECharts+SVG双引擎，11个Tab完整覆盖', color: '#2b6fbb' },
    { label: 'V5', title: '决策诊断', desc: 'WBS甘特图+风险矩阵+健康度评分决策看板', color: '#8162a8' },
    { label: 'V6', title: '联调交付', desc: '统一端口9002，CSV导出+筛选器+README', color: '#268a9a' },
  ];

  const existing = document.getElementById('gantt-chart-wrapper');
  if (existing) existing.remove();

  const wrapper = document.createElement('div');
  wrapper.id = 'gantt-chart-wrapper';
  wrapper.className = 'chart-card';
  wrapper.style.marginBottom = '16px';
  wrapper.innerHTML = `
    <div class="card-header"><h3>WBS 项目阶段甘特图</h3><span class="card-hint">V1 → V6 渐进式构建过程</span></div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;line-height:1.5">
      <tbody>
        ${phases.map((p, i) => `
        <tr style="border-bottom:1px solid #eee">
          <td style="padding:8px 10px;white-space:nowrap;font-weight:600;vertical-align:middle">
            <span style="display:inline-block;width:32px;height:22px;line-height:22px;border-radius:4px;background:${p.color};color:#fff;text-align:center;margin-right:6px;font-size:11px">${p.label}</span>
            ${p.title}
          </td>
          <td style="padding:8px 10px;color:#667085;font-size:11px">${p.desc}</td>
          <td style="padding:8px 6px;width:60px;text-align:right">
            <svg width="60" height="14" style="vertical-align:middle"><rect x="0" y="1" width="${60 - i * 8}" height="12" rx="6" fill="${p.color}" opacity="0.25"/></svg>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  `;
  target.parentNode.insertBefore(wrapper, target.nextSibling);
}

function renderRiskMatrix(decisions, ds) {
  // Build risk items from decisions
  const risks = decisions.map((d, i) => {
    const impactMap = { P0: 'high', P1: 'medium', P2: 'low' };
    const impact = impactMap[d.priority] || 'low';
    const prob = d.title.includes('紧急') || d.title.includes('下滑') ? 'high' :
                 d.title.includes('流失') || d.title.includes('优化') ? 'medium' : 'low';
    return { ...d, impact, probability: prob };
  });

  const riskMap = {
    'high#high': { label: '高风险', color: '#c94a4a', bg: '#fff1f1' },
    'high#medium': { label: '高风险', color: '#c94a4a', bg: '#fff1f1' },
    'medium#high': { label: '高风险', color: '#c94a4a', bg: '#fff1f1' },
    'high#low': { label: '中风险', color: '#d9822b', bg: '#fff7e6' },
    'medium#medium': { label: '中风险', color: '#d9822b', bg: '#fff7e6' },
    'low#high': { label: '中风险', color: '#d9822b', bg: '#fff7e6' },
    'medium#low': { label: '低风险', color: '#16866f', bg: '#eafaf3' },
    'low#medium': { label: '低风险', color: '#16866f', bg: '#eafaf3' },
    'low#low': { label: '低风险', color: '#16866f', bg: '#eafaf3' },
  };

  const highRisks = risks.filter(r => riskMap[`${r.impact}#${r.probability}`]?.label === '高风险');
  const medRisks = risks.filter(r => riskMap[`${r.impact}#${r.probability}`]?.label === '中风险');

  const existing = document.getElementById('risk-matrix-wrapper');
  if (existing) existing.remove();

  const wrapper = document.createElement('div');
  wrapper.id = 'risk-matrix-wrapper';
  wrapper.className = 'chart-card';
  wrapper.style.marginBottom = '20px';
  wrapper.innerHTML = `
    <div class="card-header"><h3>风险矩阵</h3><span class="card-hint">影响程度 × 发生概率 = 风险等级</span></div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>风险项</th><th>优先级</th><th>影响程度</th><th>发生概率</th><th>风险等级</th></tr>
        </thead>
        <tbody>
          ${[...highRisks, ...medRisks].slice(0, 8).map(r => {
            const key = `${r.impact}#${r.probability}`;
            const level = riskMap[key] || { label: '低风险', color: '#16866f' };
            return `
              <tr>
                <td>${r.title}</td>
                <td><span class="tag tag-${(r.priority || 'p2').toLowerCase()}">${r.priority}</span></td>
                <td>${r.impact === 'high' ? '高' : r.impact === 'medium' ? '中' : '低'}</td>
                <td>${r.probability === 'high' ? '高' : r.probability === 'medium' ? '中' : '低'}</td>
                <td><span class="tag" style="background:${level.bg};color:${level.color};border-color:${level.color}">${level.label}</span></td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
  const target = document.getElementById('decisionSummary');
  if (target && target.nextSibling) {
    target.parentNode.insertBefore(wrapper, target.nextSibling);
  }
}

// ========== Fulfillment ==========
function renderFulfillment() {
  const fa = _subData['fulfillment_analysis'];
  if (!fa) {
    document.getElementById('fulfillKpiGrid').innerHTML =
      '<div style="padding:20px;text-align:center;color:#999">履约数据加载中...</div>';
    return;
  }

  const f = fa.fulfillment || {};
  const totalOrders = f.total_orders || 0;
  const avgDelay = f.avg_delay_days || 0;
  const delayRate = (f.delay_rate || 0) * 100;
  const onTimeRate = (f.on_time_rate || 0) * 100;

  // KPI Cards
  document.getElementById('fulfillKpiGrid').innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">配送订单数</div>
      <div class="kpi-value">${fmtNum(totalOrders)}</div>
      <div class="kpi-sub">已发货/已送达订单</div>
    </div>
    <div class="kpi-card ${avgDelay > 1 ? 'accent-red' : 'accent-green'}">
      <div class="kpi-label">平均延迟</div>
      <div class="kpi-value">${avgDelay.toFixed(1)} 天</div>
      <div class="kpi-sub">${avgDelay > 1 ? '延迟偏高' : '配送良好'}</div>
    </div>
    <div class="kpi-card ${delayRate > 20 ? 'accent-red' : 'accent-teal'}">
      <div class="kpi-label">按时送达率</div>
      <div class="kpi-value">${onTimeRate.toFixed(1)}%</div>
      <div class="kpi-sub">延迟率 ${delayRate.toFixed(1)}%</div>
    </div>
    <div class="kpi-card accent-purple">
      <div class="kpi-label">商品评价数</div>
      <div class="kpi-value">${fmtNum(fa.total_reviews || 0)}</div>
      <div class="kpi-sub">来自 fact_product_review</div>
    </div>
  `;

  // Refund reasons chart
  const refundReasons = fa.refund_reasons || [];
  if (refundReasons.length > 0) {
    renderChart('chart-refund-reasons', {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 80, right: 40, top: 30, bottom: 60 },
      xAxis: {
        type: 'category',
        data: refundReasons.map(r => r.reason),
        axisLabel: { rotate: 25, fontSize: 11 }
      },
      yAxis: { type: 'value', name: '退款笔数' },
      series: [{
        type: 'bar',
        data: refundReasons.map(r => ({
          value: r.count,
          itemStyle: { color: '#c94a4a' }
        })),
        barMaxWidth: 40,
        label: { show: true, position: 'top', fontSize: 11, formatter: c => fmtNum(c.value) }
      }]
    });
  }

  // Review rating distribution chart
  const reviews = fa.reviews || [];
  if (reviews.length > 0) {
    const ratingData = [];
    for (let r = 1; r <= 5; r++) {
      const found = reviews.find(item => item.rating === r);
      ratingData.push({ rating: r, count: found ? found.count : 0 });
    }
    const colors = ['#c94a4a', '#d9822b', '#f0c040', '#a0c860', '#2ecc71'];
    renderChart('chart-review-rating', {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 60, right: 30, top: 30, bottom: 40 },
      xAxis: {
        type: 'category',
        data: ratingData.map(d => d.rating + '星'),
        axisLabel: { fontSize: 12 }
      },
      yAxis: { type: 'value', name: '评价数' },
      series: [{
        type: 'bar',
        data: ratingData.map((d, i) => ({
          value: d.count,
          itemStyle: { color: colors[i] }
        })),
        barMaxWidth: 52,
        label: { show: true, position: 'top', fontSize: 12, formatter: c => fmtNum(c.value) }
      }]
    });
  }

  // Top refund products table
  const topRefund = fa.top_refund_products || [];
  document.getElementById('topRefundTable').innerHTML = topRefund.length > 0 ? `
    <table>
      <thead>
        <tr><th>SKU ID</th><th>商品名称</th><th>品类</th><th>订单数</th><th>退款数</th><th>退款率</th></tr>
      </thead>
      <tbody>
        ${topRefund.map((p, i) => {
          const rate = (p.refund_rate * 100).toFixed(1);
          const high = parseFloat(rate) > 20;
          return `
            <tr>
              <td><code>${p.sku_id}</code></td>
              <td>${p.product_name}</td>
              <td>${p.category}</td>
              <td>${fmtNum(p.order_count)}</td>
              <td>${fmtNum(p.refund_count)}</td>
              <td class="${high ? 'negative' : ''}">${rate}%${high ? ' ▲' : ''}</td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>
  ` : '<div style="padding:20px;text-align:center;color:#999">暂无高退款率商品数据</div>';

  // Top low rated products table
  const topLowRated = fa.top_low_rated || [];
  document.getElementById('topLowRatedTable').innerHTML = topLowRated.length > 0 ? `
    <table>
      <thead>
        <tr><th>SKU ID</th><th>商品名称</th><th>品类</th><th>评价数</th><th>平均评分</th></tr>
      </thead>
      <tbody>
        ${topLowRated.map(p => {
          const low = p.avg_rating < 3;
          return `
            <tr>
              <td><code>${p.sku_id}</code></td>
              <td>${p.product_name}</td>
              <td>${p.category}</td>
              <td>${fmtNum(p.review_count)}</td>
              <td class="${low ? 'negative' : ''}">${p.avg_rating.toFixed(1)}${low ? ' ▼' : ''}</td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>
  ` : '<div style="padding:20px;text-align:center;color:#999">暂无低评分商品数据</div>';

  renderInsights('fulfillInsights', fa.insights || []);

  // CSV export buttons
  addExportBtn('topRefundTable', () =>
    (fa.top_refund_products || []).map(p => ({
      SKU_ID: p.sku_id,
      商品名称: p.product_name,
      品类: p.category,
      订单数: p.order_count,
      退款数: p.refund_count,
      退款率: (p.refund_rate * 100).toFixed(1) + '%'
    })),
    'top_refund_products.csv'
  );
  addExportBtn('topLowRatedTable', () =>
    (fa.top_low_rated || []).map(p => ({
      SKU_ID: p.sku_id,
      商品名称: p.product_name,
      品类: p.category,
      评价数: p.review_count,
      平均评分: p.avg_rating
    })),
    'top_low_rated_products.csv'
  );
}

// ========== Config ==========
function renderConfig() {
  document.getElementById('configBaseUrl').textContent = window.location.origin;
  document.getElementById('configDbPath').textContent = '/server/data/eshop.sqlite';

  const moduleNames = [
    { id: 'business_health', name: '经营健康诊断' },
    { id: 'feature_engineering', name: '用户建模宽表 (RFM)' },
    { id: 'customer_clustering', name: '客户分群' },
    { id: 'repurchase_prediction', name: '复购预测与触达名单' },
    { id: 'association_rules', name: '商品关联规则' },
    { id: 'sales_forecast', name: '销售预测与库存备货' },
    { id: 'marketing_attribution', name: '营销归因与预算建议' },
    { id: 'decision_board', name: '综合决策板' },
    { id: 'fulfillment_analysis', name: '履约售后分析' },
  ];

  const loaded = _allData ? true : false;
  document.getElementById('moduleStatusTable').innerHTML = `
    <table>
      <thead><tr><th>模块</th><th>状态</th><th>描述</th></tr></thead>
      <tbody>${moduleNames.map(m => {
        const data = _subData[m.id];
        const ok = data && Object.keys(data).length > 1;
        return `
          <tr>
            <td>${m.name}</td>
            <td><span class="tag ${ok ? 'tag-p2' : 'tag-p0'}">${ok ? '正常' : '无数据'}</span></td>
            <td>${data?.description || '-'}</td>
          </tr>
        `;
      }).join('')}</tbody>
    </table>
  `;
}

// ========== AI Assistant ==========
async function askAI(question) {
  const box = document.getElementById('aiChatBox');
  appendAIMessage('user', escapeHtml(question));

  const loadingId = `ai-loading-${Date.now()}`;
  box.innerHTML += `
    <div class="ai-message ai-system" id="${loadingId}">
      <div class="ai-avatar">\uD83E\uDD16</div>
      <div class="ai-bubble"><span class="ai-thinking">正在结合 dashboard 指标分析...</span></div>
    </div>
  `;
  box.scrollTop = box.scrollHeight;

  const result = await API.ai(question);
  const loading = document.getElementById(loadingId);
  const answer = result?.answer_html || generateAIAnswer(question);
  const badge = result?.source === 'external'
    ? `<div class="ai-source">模型接口：${escapeHtml(result.model || 'external')}</div>`
    : `<div class="ai-source">本地分析接口：${escapeHtml(result?.model || 'dashboard-local-analyst')}</div>`;

  if (loading) {
    loading.querySelector('.ai-bubble').innerHTML = `${answer}${badge}`;
  } else {
    appendAIMessage('system', `${answer}${badge}`);
  }
  box.scrollTop = box.scrollHeight;
}

function appendAIMessage(role, html) {
  const box = document.getElementById('aiChatBox');
  box.innerHTML += `
    <div class="ai-message ai-${role}">
      <div class="ai-avatar">${role === 'user' ? '\uD83D\uDC64' : '\uD83E\uDD16'}</div>
      <div class="ai-bubble">${html}</div>
    </div>
  `;
}

function generateAIAnswer(q) {
  if (!_allData) return '数据正在加载中，请稍后再试。';

  const { kpi, funnel, channel_breakdown } = _allData;
  const db = _subData['decision_board'];
  const cc = _subData['customer_clustering'];
  const rp = _subData['repurchase_prediction'];

  const gmv = kpi?.gmv || 0;
  const orders = kpi?.orders || 0;
  const aov = kpi?.aov || 0;
  const refundRate = (kpi?.refund_rate || 0) * 100;

  if (q.includes('健康') || q.includes('整体')) {
    const healthScore = db?.summary?.health_score || '未知';
    return `<p>根据当前数据分析，整体经营健康度为：<strong>${healthScore}</strong></p>
      <ul>
        <li>累计 GMV：<strong>${fmtMoney(gmv)} 元</strong></li>
        <li>订单数：<strong>${fmtNum(orders)}</strong></li>
        <li>客单价：<strong>${fmtMoney(aov)} 元</strong></li>
        <li>退款率：<strong>${refundRate.toFixed(2)}%</strong>${refundRate > 5 ? '（<span style="color:#e74c3c">高于警戒线，需关注</span>）' : '（处于健康范围）'}</li>
      </ul>
      ${db?.summary?.top_opportunity ? `<p><strong>最大增长机会：</strong>${db.summary.top_opportunity}</p>` : ''}
      ${db?.summary?.top_risk ? `<p><strong>最大经营风险：</strong>${db.summary.top_risk}</p>` : ''}`;
  }

  if (q.includes('漏斗') || q.includes('流失')) {
    const steps = ['首页访问', '商品页浏览', '加入购物车', '提交结算', '支付成功'];
    const keys = ['view_home', 'view_product', 'add_to_cart', 'checkout', 'pay_success'];
    let worst = { name: '', rate: 1 };
    const rates = [];
    for (let i = 1; i < keys.length; i++) {
      const prev = funnel?.[keys[i - 1]] || 0;
      const curr = funnel?.[keys[i]] || 0;
      const rate = prev > 0 ? curr / prev : 0;
      rates.push({ stage: `${steps[i - 1]} → ${steps[i]}`, rate });
      if (rate < worst.rate) worst = { name: `${steps[i - 1]} → ${steps[i]}`, rate };
    }
    return `<p>流量转化漏斗各环节表现：</p>
      <ul>${rates.map(r => `<li>${r.stage}：转化率 <strong>${(r.rate * 100).toFixed(1)}%</strong></li>`).join('')}</ul>
      <p><strong>流失最严重环节：</strong>${worst.name}（转化率仅 ${(worst.rate * 100).toFixed(1)}%）</p>
      <p>建议：针对该环节进行专项优化，如 A/B 测试页面布局、简化操作流程、优化加载速度。</p>`;
  }

  if (q.includes('用户') || q.includes('运营') || q.includes('分群')) {
    const segments = cc?.segments || [];
    let segText = segments.map(s => `${s.name}：${s.count}人（GMV占比 ${(s.gmv_share * 100).toFixed(1)}%）`).join('<br/>');
    return `<p>当前用户分群概况：</p>
      <p>${segText || '暂无聚类数据'}</p>
      ${segments.length > 0 ? `<p><strong>运营建议：</strong>优先维护高价值用户群，对沉睡用户启动唤醒计划，对潜力用户通过满减活动提升客单价。</p>` : ''}`;
  }

  if (q.includes('决策') || q.includes('建议')) {
    const decisions = db?.decisions || [];
    if (decisions.length === 0) return '<p>暂无决策建议数据。</p>';
    const top3 = decisions.slice(0, 3);
    return `<p>最重要的决策建议：</p>
      <ol>${top3.map(d => `<li><strong>[${d.priority}] ${d.title}</strong>：${d.action}</li>`).join('')}</ol>
      <p>详细建议请查看「综合诊断」页面。</p>`;
  }

  return `<p>关于「${q}」，以下是我基于当前数据的分析：</p>
    <p>当前平台 GMV 为 <strong>${fmtMoney(gmv)} 元</strong>，共 ${fmtNum(orders)} 笔订单，客单价 ${fmtMoney(aov)} 元，退款率 ${refundRate.toFixed(2)}%。</p>
    <p>建议您查看对应的分析模块获取更详细的信息。您也可以继续问我关于健康度、漏斗、用户分群或决策建议的问题。</p>`;
}

// ========== Helpers ==========
function prepareCustomChart(id, className) {
  const dom = document.getElementById(id);
  if (!dom) return null;
  const instance = echarts.getInstanceByDom(dom);
  if (instance) instance.dispose();
  dom.innerHTML = '';
  dom.classList.add('custom-viz');
  if (className) dom.classList.add(className);
  return dom;
}

function niceMax(value) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / pow;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * pow;
}

function svgTextLines(text, x, y, maxChars = 6, lineHeight = 15, attrs = '') {
  const safe = escapeHtml(text);
  if (safe.length <= maxChars) return `<text x="${x}" y="${y}" ${attrs}>${safe}</text>`;
  const lines = [];
  for (let i = 0; i < safe.length; i += maxChars) lines.push(safe.slice(i, i + maxChars));
  return `<text x="${x}" y="${y}" ${attrs}>${lines.map((line, i) =>
    `<tspan x="${x}" dy="${i === 0 ? 0 : lineHeight}">${line}</tspan>`).join('')}</text>`;
}

function renderSegmentBars(id, segments) {
  const dom = prepareCustomChart(id, 'cluster-chart');
  if (!dom) return;
  const data = segments.map((s, i) => ({
    label: s.name,
    value: Number(s.count || 0),
    color: ['#dd6b5f', '#16866f', '#8162a8', '#d9822b', '#268a9a'][i % 5],
  }));
  dom.innerHTML = renderSimpleBarSvg({
    data,
    yTitle: '人数',
    valueFormatter: fmtNum,
    height: 360,
    bottom: 78,
    top: 44,
    showLegend: false,
  });
}

function renderInventoryBars(id, cats) {
  const dom = prepareCustomChart(id, 'inventory-chart');
  if (!dom) return;
  const series = [
    { name: '日均 GMV', color: '#2b6fbb', values: cats.map(c => Number(c.daily_avg_gmv || 0)) },
    { name: '安全库存', color: '#d9822b', values: cats.map(c => Number(c.safety_stock || 0)) },
  ];
  dom.innerHTML = renderGroupedBarSvg({
    labels: cats.map(c => c.category),
    series,
    yTitle: '金额',
    valueFormatter: fmtShort,
  });
}

function renderSimpleBarSvg({ data, yTitle, valueFormatter, height = 360, top = 42, bottom = 72 }) {
  const width = 520;
  const margin = { top, right: 34, bottom, left: 76 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const maxVal = niceMax(Math.max(...data.map(d => d.value), 1) * 1.16);
  const ticks = Array.from({ length: 5 }, (_, i) => maxVal / 4 * i);
  const band = plotW / data.length;
  const barW = Math.min(110, band * 0.58);
  const grid = ticks.map(t => {
    const y = margin.top + plotH - (t / maxVal) * plotH;
    return `
      <line class="svg-grid" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>
      <text class="svg-tick" x="${margin.left - 12}" y="${y + 4}" text-anchor="end">${valueFormatter(t)}</text>
    `;
  }).join('');
  const bars = data.map((d, i) => {
    const x = margin.left + i * band + (band - barW) / 2;
    const h = Math.max(2, (d.value / maxVal) * plotH);
    const y = margin.top + plotH - h;
    const cx = margin.left + i * band + band / 2;
    return `
      <rect class="svg-bar" x="${x}" y="${y}" width="${barW}" height="${h}" rx="7" fill="${d.color}"></rect>
      <text class="svg-value" x="${cx}" y="${y - 8}" text-anchor="middle">${valueFormatter(d.value)}</text>
      ${svgTextLines(d.label, cx, margin.top + plotH + 25, 7, 15, 'class="svg-xlabel" text-anchor="middle"')}
    `;
  }).join('');
  return `
    <svg class="metric-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img">
      <text class="svg-axis-title" x="${margin.left}" y="24">${escapeHtml(yTitle)}</text>
      ${grid}
      <line class="svg-axis" x1="${margin.left}" y1="${margin.top + plotH}" x2="${width - margin.right}" y2="${margin.top + plotH}"></line>
      <line class="svg-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotH}"></line>
      ${bars}
    </svg>
  `;
}

function renderGroupedBarSvg({ labels, series, yTitle, valueFormatter }) {
  const width = 520;
  const height = 360;
  const margin = { top: 48, right: 34, bottom: 78, left: 86 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const maxVal = niceMax(Math.max(...series.flatMap(s => s.values), 1) * 1.16);
  const ticks = Array.from({ length: 5 }, (_, i) => maxVal / 4 * i);
  const band = plotW / labels.length;
  const groupW = Math.min(96, band * 0.62);
  const barW = groupW / series.length - 5;
  const grid = ticks.map(t => {
    const y = margin.top + plotH - (t / maxVal) * plotH;
    return `
      <line class="svg-grid" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>
      <text class="svg-tick" x="${margin.left - 12}" y="${y + 4}" text-anchor="end">${valueFormatter(t)}</text>
    `;
  }).join('');
  const groups = labels.map((label, i) => {
    const groupX = margin.left + i * band + (band - groupW) / 2;
    const cx = margin.left + i * band + band / 2;
    const bars = series.map((s, si) => {
      const value = s.values[i] || 0;
      const h = Math.max(2, (value / maxVal) * plotH);
      const x = groupX + si * (barW + 10);
      const y = margin.top + plotH - h;
      return `
        <rect class="svg-bar" x="${x}" y="${y}" width="${barW}" height="${h}" rx="6" fill="${s.color}">
          <title>${escapeHtml(label)} - ${escapeHtml(s.name)}: ${valueFormatter(value)}</title>
        </rect>
      `;
    }).join('');
    return `${bars}${svgTextLines(label, cx, margin.top + plotH + 25, 5, 15, 'class="svg-xlabel" text-anchor="middle"')}`;
  }).join('');
  const legend = series.map((s, i) => `
    <g transform="translate(${margin.left + i * 120}, ${height - 20})">
      <rect width="16" height="10" rx="3" fill="${s.color}"></rect>
      <text class="svg-legend-text" x="24" y="10">${escapeHtml(s.name)}</text>
    </g>
  `).join('');
  return `
    <svg class="metric-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img">
      <text class="svg-axis-title" x="${margin.left}" y="24">${escapeHtml(yTitle)}</text>
      ${grid}
      <line class="svg-axis" x1="${margin.left}" y1="${margin.top + plotH}" x2="${width - margin.right}" y2="${margin.top + plotH}"></line>
      <line class="svg-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotH}"></line>
      ${groups}
      ${legend}
    </svg>
  `;
}

function renderAssociationMatrix(id, rules) {
  const dom = prepareCustomChart(id, 'assoc-matrix');
  if (!dom) return;
  const width = 520;
  const height = 390;
  const margin = { top: 58, right: 54, bottom: 78, left: 92 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const supportValues = rules.map(r => Number(r.support || 0));
  const confidenceValues = rules.map(r => Number(r.confidence || 0));
  const liftValues = rules.map(r => Number(r.lift || 0));
  const supportMin = Math.min(...supportValues);
  const supportMax = Math.max(...supportValues);
  const supportPad = Math.max((supportMax - supportMin) * 0.24, supportMax * 0.06, 0.000004);
  const xMin = Math.max(0, supportMin - supportPad);
  const xMax = supportMax + supportPad;
  const yMax = Math.max(0.16, niceMax(Math.max(...confidenceValues, 0.01) * 1.12));
  const liftMax = Math.max(...liftValues, 1);
  const xTicks = Array.from({ length: 5 }, (_, i) => xMin + (xMax - xMin) / 4 * i);
  const yTicks = Array.from({ length: 5 }, (_, i) => yMax / 4 * i);
  const xScale = v => margin.left + ((v - xMin) / (xMax - xMin || 1)) * plotW;
  const yScale = v => margin.top + plotH - (v / yMax) * plotH;
  const gridY = yTicks.map(t => {
    const y = yScale(t);
    return `
      <line class="svg-grid" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>
      <text class="svg-tick" x="${margin.left - 12}" y="${y + 4}" text-anchor="end">${t.toFixed(2)}</text>
    `;
  }).join('');
  const gridX = xTicks.map(t => {
    const x = xScale(t);
    return `
      <line class="svg-grid" x1="${x}" y1="${margin.top}" x2="${x}" y2="${margin.top + plotH}"></line>
      <text class="svg-tick" x="${x}" y="${margin.top + plotH + 24}" text-anchor="middle">${t.toFixed(5)}</text>
    `;
  }).join('');
  const points = rules.map((r, i) => {
    const x = xScale(Number(r.support || 0));
    const y = yScale(Number(r.confidence || 0));
    const lift = Number(r.lift || 0);
    const radius = 8 + Math.sqrt(lift / liftMax) * 14;
    const color = lift > 2 ? '#2b6fbb' : lift > 1.5 ? '#d9822b' : '#16866f';
    return `
      <g class="assoc-point" transform="translate(${x}, ${y})">
        <circle r="${radius}" fill="${color}"></circle>
        <text class="assoc-point-label" y="4" text-anchor="middle">${i + 1}</text>
        <title>${escapeHtml(r.antecedent)} → ${escapeHtml(r.consequent)}
支持度: ${Number(r.support || 0).toFixed(5)}
置信度: ${Number(r.confidence || 0).toFixed(4)}
提升度: ${lift.toFixed(2)}</title>
      </g>
    `;
  }).join('');
  dom.innerHTML = `
    <svg class="metric-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img">
      <text class="svg-axis-title" x="${margin.left}" y="28">置信度</text>
      <text class="svg-axis-title" x="${width - 72}" y="${height - 20}">支持度</text>
      ${gridY}
      ${gridX}
      <line class="svg-axis" x1="${margin.left}" y1="${margin.top + plotH}" x2="${width - margin.right}" y2="${margin.top + plotH}"></line>
      <line class="svg-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotH}"></line>
      ${points}
      <g transform="translate(${margin.left}, ${height - 22})">
        <circle r="6" cx="0" cy="-4" fill="#2b6fbb"></circle>
        <text class="svg-legend-text" x="14" y="0">圆点大小代表提升度，数字对应右侧 Top 规则顺序</text>
      </g>
    </svg>
  `;
}

function renderChart(id, option) {
  const dom = document.getElementById(id);
  if (!dom) return;
  dom.classList.remove('custom-viz', 'assoc-matrix', 'inventory-chart', 'cluster-chart');
  let instance = echarts.getInstanceByDom(dom);
  if (!instance) {
    dom.innerHTML = '';
    instance = echarts.init(dom);
  }
  const themedOption = {
    color: ['#dd6b5f', '#16866f', '#d9822b', '#2b6fbb', '#8162a8', '#268a9a'],
    textStyle: { color: '#5f554c', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif' },
    ...option,
  };
  instance.setOption(themedOption, true);
  if (!dom._resizeBound) {
    dom._resizeBound = true;
    new ResizeObserver(() => instance?.resize()).observe(dom);
  }
}

function renderInsights(id, items) {
  const dom = document.getElementById(id);
  if (!dom) return;
  if (!items || items.length === 0) {
    dom.innerHTML = '<div style="padding:20px;text-align:center;color:#999">暂无洞察数据</div>';
    return;
  }
  dom.innerHTML = items.filter(Boolean).map(i => `<div class="insight-item">${i}</div>`).join('');
}

function fmtMoney(v) {
  if (v == null || isNaN(v)) return '¥0';
  if (Math.abs(v) >= 1e8) return `¥${(v / 1e8).toFixed(2)}亿`;
  if (Math.abs(v) >= 1e4) return `¥${(v / 1e4).toFixed(2)}万`;
  return `¥${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtNum(v) {
  if (v == null || isNaN(v)) return '0';
  return Number(v).toLocaleString('zh-CN');
}

function fmtShort(v) {
  if (v == null || isNaN(v)) return '0';
  if (Math.abs(v) >= 1e8) return `${(v / 1e8).toFixed(1)}亿`;
  if (Math.abs(v) >= 1e4) return `${(v / 1e4).toFixed(1)}万`;
  return v.toFixed(0);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ========== CSV Export ==========
function downloadCSV(rows, filename) {
  if (!rows || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map(row =>
      headers.map(h => {
        const v = row[h];
        if (v == null) return '';
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? '"' + s.replace(/"/g, '""') + '"'
          : s;
      }).join(',')
    ),
  ].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function addExportBtn(containerId, getRowsFn, filename) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const header = el.parentElement?.querySelector('.card-header');
  if (!header) return;
  header.querySelector('.btn-export')?.remove();
  const btn = document.createElement('button');
  btn.className = 'btn-export';
  btn.innerHTML = '&#x21E9; CSV';
  btn.title = '导出为CSV文件';
  btn.addEventListener('click', () => {
    const rows = getRowsFn();
    downloadCSV(rows, filename || 'export.csv');
  });
  const actions = header.querySelector('.card-header-actions');
  if (actions) {
    actions.appendChild(btn);
  } else {
    const wrap = document.createElement('div');
    wrap.className = 'card-header-actions';
    // Move existing hint into actions
    const hint = header.querySelector('.card-hint');
    if (hint) wrap.appendChild(hint);
    wrap.appendChild(btn);
    header.appendChild(wrap);
  }
}

// ========== Overview Filters ==========
function populateOverviewFilters() {
  if (!_allData) return;
  const { channel_breakdown, monthly_trend } = _allData;

  // Channel filter
  const chSelect = document.getElementById('channelFilter');
  if (chSelect && channel_breakdown?.length) {
    const existing = new Set(Array.from(chSelect.options).map(o => o.value));
    channel_breakdown.forEach(c => {
      if (!existing.has(c.channel)) {
        const opt = document.createElement('option');
        opt.value = c.channel;
        opt.textContent = c.channel;
        chSelect.appendChild(opt);
      }
    });
  }

  // Month filter
  const mSelect = document.getElementById('monthFilter');
  if (mSelect && monthly_trend?.length) {
    const existing = new Set(Array.from(mSelect.options).map(o => o.value));
    monthly_trend.forEach(m => {
      if (!existing.has(m.month)) {
        const opt = document.createElement('option');
        opt.value = m.month;
        opt.textContent = m.month;
        mSelect.appendChild(opt);
      }
    });
  }
}

function applyOverviewFilter() {
  if (!_allData) return;
  const channel = document.getElementById('channelFilter')?.value || '';
  const month = document.getElementById('monthFilter')?.value || '';

  // Filter channel pie data
  const origChannels = _allData.channel_breakdown || [];
  const filteredChannels = channel
    ? origChannels.filter(c => c.channel === channel)
    : origChannels;

  if (filteredChannels.length > 0) {
    renderChart('chart-channel-pie', {
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      series: [{
        type: 'pie', radius: ['45%', '75%'], center: ['50%', '50%'],
        data: filteredChannels.map(c => ({ name: c.channel, value: c.gmv })),
        label: { formatter: '{b}\n{d}%' },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.2)' } },
      }],
    });
  }

  // Filter monthly trend
  const origTrend = _allData.monthly_trend || [];
  const filteredTrend = month
    ? origTrend.filter(m => m.month === month)
    : origTrend;

  if (filteredTrend.length > 0) {
    renderChart('chart-monthly-trend', {
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: filteredTrend.map(m => m.month) },
      yAxis: { type: 'value', axisLabel: { formatter: fmtShort } },
      series: [
        { name: 'GMV', type: 'line', data: filteredTrend.map(m => m.gmv), smooth: true, areaStyle: { opacity: 0.15 }, itemStyle: { color: '#4facfe' } },
        { name: '订单数', type: 'line', data: filteredTrend.map(m => m.orders), smooth: true, itemStyle: { color: '#2ecc71' } },
      ],
      legend: { data: ['GMV', '订单数'], bottom: 0 },
      grid: { top: 20, right: 20, bottom: 40, left: 60 },
    });
  }

  // Wire export button for overview
  const btnExport = document.getElementById('btnExportOverview');
  if (btnExport) {
    btnExport.onclick = () => {
      const trend = filteredTrend;
      const { kpi } = _allData;
      const rows = [
        { metric: 'GMV', value: kpi?.gmv || 0 },
        { metric: '订单数', value: kpi?.orders || 0 },
        { metric: '买家数', value: kpi?.buyers || 0 },
        { metric: '客单价', value: kpi?.aov || 0 },
        { metric: '退款率', value: ((kpi?.refund_rate || 0) * 100).toFixed(2) + '%' },
        ...trend.map(m => ({ month: m.month, GMV: m.gmv, 订单数: m.orders })),
      ];
      downloadCSV(rows, 'overview_export.csv');
    };
  }
}
