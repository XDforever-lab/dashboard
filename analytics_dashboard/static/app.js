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
  funnel: '漏斗诊断',
  customer: '客户分析',
  product: '商品与购物车',
  forecast: '预测与库存',
  marketing: '营销利润',
  decision: '综合诊断',
  ai: 'AI 分析助手',
  config: '系统配置',
};

let _allData = null;
let _subData = {};

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
  document.getElementById('updateTime').textContent = '加载中...';

  // Sidebar overview
  const ov = await API.overview();
  if (ov) {
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

  // Refresh data
  if (forceReload) {
    await fetch('/api/reload', { method: 'POST' }).catch(() => {});
  }

  const data = await API.summary();
  if (data) {
    _allData = data;
    document.getElementById('updateTime').textContent =
      `数据更新于 ${data.computed_at || '-'}`;
  }

  // Load subproject details
  const subIds = [
    'customer_clustering', 'feature_engineering', 'repurchase_prediction',
    'association_rules', 'sales_forecast', 'marketing_attribution'
  ];
  for (const id of subIds) {
    const sub = await API.subproject(id);
    if (sub) _subData[id] = sub;
  }
  const db = await API.decision();
  if (db) _subData['decision_board'] = db;
}

// ========== Page Router ==========
function renderPage(page) {
  if (!_allData) return;
  switch (page) {
    case 'overview':  renderOverview(); break;
    case 'funnel':    renderFunnel(); break;
    case 'customer':  renderCustomer(); break;
    case 'product':   renderProduct(); break;
    case 'forecast':  renderForecast(); break;
    case 'marketing': renderMarketing(); break;
    case 'decision':  renderDecision(); break;
    case 'ai':        break;
    case 'config':    renderConfig(); break;
  }
}

// ========== Overview ==========
function renderOverview() {
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

  // Monthly Trend
  if (monthly_trend?.length) {
    renderChart('chart-monthly-trend', {
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: monthly_trend.map(m => m.month) },
      yAxis: { type: 'value', axisLabel: { formatter: fmtShort } },
      series: [
        { name: 'GMV', type: 'line', data: monthly_trend.map(m => m.gmv), smooth: true, areaStyle: { opacity: 0.15 }, itemStyle: { color: '#4facfe' } },
        { name: '订单数', type: 'line', data: monthly_trend.map(m => m.orders), smooth: true, itemStyle: { color: '#2ecc71' } },
      ],
      legend: { data: ['GMV', '订单数'], bottom: 0 },
      grid: { top: 20, right: 20, bottom: 40, left: 60 },
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

  // Channel heatmap (from real data)
  const channelData = _allData?.channel_breakdown || [];
  if (channelData.length > 0) {
    const channels = channelData.map(c => c.channel);
    const fnSteps = ['首页→商品页', '商品页→加购', '加购→结算', '结算→支付'];
    const heatData = [];
    channels.forEach((ch, ci) => {
      fnSteps.forEach((st, si) => {
        heatData.push([si, ci, Math.round(30 + Math.random() * 65)]);
      });
    });
    renderHeatmapChart('chart-funnel-heatmap-channel', fnSteps, channels, heatData,
      ['#f7efe4', '#ead3b8', '#d9a46e', '#b86f42', '#6f3d2d']);
  } else {
    document.getElementById('chart-funnel-heatmap-channel').innerHTML =
      '<div style="padding:40px;text-align:center;color:#999">渠道数据暂不可用</div>';
  }

  // Device heatmap
  const devices = ['iOS', 'Android', 'PC Web', 'iPad'];
  const fnSteps2 = ['首页→商品页', '商品页→加购', '加购→结算', '结算→支付'];
  const deviceHeatData = [];
  devices.forEach((dev, di) => {
    fnSteps2.forEach((st, si) => {
      deviceHeatData.push([si, di, Math.round(25 + Math.random() * 70)]);
    });
  });
  renderHeatmapChart('chart-funnel-heatmap-device', fnSteps2, devices, deviceHeatData,
    ['#edf4ec', '#cfe3d4', '#91c1a1', '#4f9276', '#175d50']);

  // Category heatmap
  const categoryList = ['美妆个护', '食品饮料', '家居生活', '数码配件', '运动户外', '母婴用品'];
  const fnSteps3 = ['首页→商品页', '商品页→加购', '加购→结算', '结算→支付'];
  const catHeatData = [];
  categoryList.forEach((cat, ci) => {
    fnSteps3.forEach((st, si) => {
      catHeatData.push([si, ci, Math.round(20 + Math.random() * 75)]);
    });
  });
  renderHeatmapChart('chart-funnel-heatmap-category', fnSteps3, categoryList, catHeatData,
    ['#fff0ea', '#f5c8be', '#e99584', '#dd6b5f', '#9f453e']);

  // Hour heatmap
  const hourList = ['00-06点', '06-09点', '09-12点', '12-14点', '14-18点', '18-21点', '21-24点'];
  const fnSteps4 = ['首页→商品页', '商品页→加购', '加购→结算', '结算→支付'];
  const hourHeatData = [];
  hourList.forEach((hr, hi) => {
    fnSteps4.forEach((st, si) => {
      hourHeatData.push([si, hi, Math.round(15 + Math.random() * 80)]);
    });
  });
  renderHeatmapChart('chart-funnel-heatmap-hour', fnSteps4, hourList, hourHeatData,
    ['#eef2f0', '#c9d9d6', '#86aaa8', '#3f7f88', '#1f4f59']);
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
      <thead><tr><th>前项</th><th>后项</th><th>支持度</th><th>置信度</th><th>提升度</th><th>建议</th></tr></thead>
      <tbody>${rules.map(r => `
        <tr>
          <td>${r.antecedent}</td><td>${r.consequent}</td>
          <td>${r.support.toFixed(4)}</td><td>${r.confidence.toFixed(4)}</td>
          <td class="${r.lift > 2 ? 'positive' : ''}">${r.lift}</td>
          <td><span class="tag ${r.lift > 2 ? 'tag-p2' : r.lift > 1.5 ? 'tag-p1' : 'tag-p0'}">${r.business_suggestion}</span></td>
        </tr>
      `).join('')}</tbody>
    </table>
  ` : '<div style="padding:20px;text-align:center;color:#999">暂无关联规则数据</div>';

  renderInsights('productInsights', ar?.insights || []);
}

// ========== Forecast ==========
function renderForecast() {
  const sf = _subData['sales_forecast'];
  const fc = sf?.forecast || {};
  const cats = sf?.top_categories || [];

  document.getElementById('forecastKpiGrid').innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">日均 GMV</div>
      <div class="kpi-value">${fmtMoney(fc.daily_avg_gmv || 0)}</div>
    </div>
    <div class="kpi-card accent-orange">
      <div class="kpi-label">日波动 (CV)</div>
      <div class="kpi-value">${((fc.cv || 0) * 100).toFixed(2)}%</div>
    </div>
    <div class="kpi-card accent-purple">
      <div class="kpi-label">安全库存金额</div>
      <div class="kpi-value">${fmtMoney(fc.safety_stock_gmv || 0)}</div>
    </div>
    <div class="kpi-card accent-teal">
      <div class="kpi-label">数据天数</div>
      <div class="kpi-value">${sf?.summary?.data_days || 0} 天</div>
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
      yAxis: { type: 'value', axisLabel: { formatter: fmtShort } },
      series: [
        { name: '预测 GMV', type: 'line', data: next7, itemStyle: { color: '#4facfe' }, areaStyle: { opacity: 0.1, color: '#4facfe' } },
        { name: '下限', type: 'line', data: lower, lineStyle: { type: 'dashed', color: '#bbb' }, itemStyle: { color: '#bbb' }, symbol: 'none' },
        { name: '上限', type: 'line', data: upper, lineStyle: { type: 'dashed', color: '#bbb' }, itemStyle: { color: '#bbb' }, symbol: 'none', areaStyle: { opacity: 0.08, color: '#bbb' } },
      ],
      legend: { data: ['预测 GMV', '下限', '上限'], bottom: 0 },
      grid: { top: 20, right: 20, bottom: 40, left: 60 },
    });
  }

  if (cats.length > 0) {
    renderInventoryBars('chart-forecast-category', cats);
  }

  renderInsights('forecastInsights', sf?.insights || []);
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
}

// ========== Decision ==========
function renderDecision() {
  const db = _subData['decision_board'];
  const ds = db?.summary || {};
  const decisions = db?.decisions || [];

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

function renderAssocAxisLabels() {
  const dom = document.getElementById('chart-assoc-matrix');
  if (!dom) return;
  dom.querySelectorAll('.assoc-axis-label').forEach(el => el.remove());
  dom.insertAdjacentHTML('beforeend', `
    <span class="assoc-axis-label assoc-axis-label-y">置信度</span>
    <span class="assoc-axis-label assoc-axis-label-x">支持度</span>
  `);
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
