let trendChart = null;
let funnelChart = null;

function fmtAmount(v) {
    if (v == null) return '--';
    return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtInt(v) {
    if (v == null) return '--';
    return Number(v).toLocaleString('zh-CN');
}

function fmtPct(v) {
    if (v == null) return '--';
    return (Number(v) * 100).toFixed(2) + '%';
}

async function loadData() {
    try {
        const healthResp = await fetch('/health');
        const health = await healthResp.json();
        document.getElementById('dbStatus').textContent =
            health.database === 'connected' ? '数据库已连接' : '数据库未找到';
    } catch (e) {
        document.getElementById('dbStatus').textContent = '服务不可用';
    }

    try {
        const resp = await fetch('/api/summary');
        const data = await resp.json();

        document.getElementById('computedAt').textContent = '计算时间: ' + (data.computed_at || '--');

        renderKpi(data.kpi);
        renderTrend(data.monthly_trend);
        renderFunnel(data.funnel, data.funnel_rates);
        renderChannels(data.channel_efficiency);
        renderDecisions(data.decisions);
        renderHealth(data.decisions);

    } catch (e) {
        console.error('Failed to load summary:', e);
        document.getElementById('kpiGmv').textContent = '加载失败';
    }

    try {
        const subResp = await fetch('/api/subprojects');
        const subData = await subResp.json();
        renderSubprojects(subData.subprojects);
    } catch (e) {
        console.error('Failed to load subprojects:', e);
    }

    try {
        const dbResp = await fetch('/api/decision-board');
        const dbData = await dbResp.json();
        renderGitRoadmap(dbData.git_roadmap);
    } catch (e) {
        console.error('Failed to load decision board:', e);
    }
}

function renderKpi(kpi) {
    if (!kpi) return;
    document.getElementById('kpiGmv').textContent = '¥' + fmtAmount(kpi.gmv);
    document.getElementById('kpiOrders').textContent = fmtInt(kpi.orders);
    document.getElementById('kpiBuyers').textContent = fmtInt(kpi.buyers);
    document.getElementById('kpiAov').textContent = '¥' + fmtAmount(kpi.aov);
    document.getElementById('kpiRefund').textContent = fmtPct(kpi.refund_rate);
}

function renderTrend(trend) {
    if (!trend || trend.length === 0) return;
    const ctx = document.getElementById('trendChart').getContext('2d');
    if (trendChart) trendChart.destroy();

    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: trend.map(t => t.month),
            datasets: [{
                label: 'GMV (万元)',
                data: trend.map(t => (t.gmv || 0) / 10000),
                borderColor: '#667eea',
                backgroundColor: 'rgba(102,126,234,0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 4
            }, {
                label: '订单数',
                data: trend.map(t => t.orders || 0),
                borderColor: '#48bb78',
                backgroundColor: 'rgba(72,187,120,0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                yAxisID: 'y1'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } },
            scales: {
                y: { title: { display: true, text: 'GMV (万元)' } },
                y1: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: '订单数' } }
            }
        }
    });
}

function renderFunnel(funnel, rates) {
    if (!funnel) return;
    const ctx = document.getElementById('funnelChart').getContext('2d');
    if (funnelChart) funnelChart.destroy();

    const labels = ['首页浏览', '商品页浏览', '加入购物车', '结算', '支付成功'];
    const keys = ['view_home', 'view_product', 'add_to_cart', 'checkout', 'pay_success'];
    const values = keys.map(k => funnel[k] || 0);
    const maxVal = Math.max(...values, 1);

    funnelChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '事件数',
                data: values,
                backgroundColor: ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#48bb78'],
                borderRadius: 6
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            const val = ctx.raw;
                            const rate = maxVal > 0 ? (val / maxVal * 100).toFixed(1) : '0';
                            return '事件数: ' + fmtInt(val) + ' (' + rate + '%)';
                        }
                    }
                }
            },
            scales: {
                x: { title: { display: true, text: '事件数' } }
            }
        }
    });
}

function renderChannels(channels) {
    if (!channels || channels.length === 0) {
        document.querySelector('#channelTable tbody').innerHTML =
            '<tr><td colspan="9" style="text-align:center;color:#a0aec0;">暂无渠道数据</td></tr>';
        return;
    }
    const tbody = document.querySelector('#channelTable tbody');
    tbody.innerHTML = channels.map(c =>
        '<tr>' +
        '<td>' + (c.channel || '--') + '</td>' +
        '<td>¥' + fmtAmount(c.gmv) + '</td>' +
        '<td>' + fmtInt(c.orders) + '</td>' +
        '<td>¥' + fmtAmount(c.spend) + '</td>' +
        '<td>' + fmtPct(c.ctr) + '</td>' +
        '<td>' + fmtPct(c.cvr) + '</td>' +
        '<td>¥' + fmtAmount(c.cpa) + '</td>' +
        '<td>' + (c.roas != null ? Number(c.roas).toFixed(2) : '--') + '</td>' +
        '<td>' + (c.action || '--') + '</td>' +
        '</tr>'
    ).join('');
}

function renderSubprojects(subprojects) {
    if (!subprojects || subprojects.length === 0) return;
    const container = document.getElementById('subprojectCards');
    container.innerHTML = subprojects.map(sp =>
        '<div class="subproject-card" onclick="viewSubproject(\'' + sp.id + '\')">' +
        '<h3>' + sp.title + '</h3>' +
        '<p>' + sp.description + '</p>' +
        '<span class="method-tag">' + (sp.method || '--') + '</span>' +
        '</div>'
    ).join('');
}

function renderDecisions(decisions) {
    if (!decisions || decisions.length === 0) {
        document.getElementById('decisionsList').innerHTML =
            '<p style="color:#a0aec0;">暂无决策建议</p>';
        return;
    }
    document.getElementById('decisionsList').innerHTML = decisions.map(d =>
        '<div class="decision-item ' + d.priority + '">' +
        '<div class="decision-title">' +
        '<span class="priority-badge ' + (d.priority || '').toLowerCase() + '">' + (d.priority || '') + '</span>' +
        d.title +
        '</div>' +
        '<div class="decision-meta">' +
        (d.action ? '<p>' + d.action + '</p>' : '') +
        (d.expected_impact ? '<p>预期: ' + d.expected_impact + '</p>' : '') +
        (d.owner ? '<span>负责人: ' + d.owner + '</span>' : '') +
        (d.timeline ? '<span> | 时间: ' + d.timeline + '</span>' : '') +
        '</div>' +
        '</div>'
    ).join('');
}

function renderHealth(decisions) {
    if (!decisions) return;
    const p0Count = decisions.filter(d => d.priority === 'P0').length;
    const badge = document.getElementById('healthBadge');
    if (p0Count >= 2) {
        badge.textContent = '经营状态：预警';
        badge.className = 'health-badge alert';
    } else if (p0Count === 1) {
        badge.textContent = '经营状态：一般';
        badge.className = 'health-badge warning';
    } else {
        badge.textContent = '经营状态：良好';
        badge.className = 'health-badge good';
    }
}

function renderGitRoadmap(roadmap) {
    if (!roadmap || roadmap.length === 0) return;
    document.getElementById('gitRoadmap').innerHTML = roadmap.map(m =>
        '<div class="git-milestone">' +
        '<div class="milestone-dot"></div>' +
        '<div class="milestone-tag">' + (m.milestone || '') + '</div>' +
        '<div class="milestone-desc">' + (m.description || '') + '</div>' +
        '</div>'
    ).join('');
}

async function viewSubproject(id) {
    try {
        const resp = await fetch('/api/subprojects/' + id);
        const data = await resp.json();
        const modal = document.createElement('div');
        modal.className = 'modal-overlay active';
        modal.innerHTML =
            '<div class="modal-content">' +
            '<button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button>' +
            '<h2>' + (data.title || id) + '</h2>' +
            '<p style="color:#718096;margin:8px 0 16px;">' + (data.description || '') + '</p>' +
            '<div style="max-height:60vh;overflow-y:auto;"><pre style="background:#f7fafc;padding:12px;border-radius:6px;font-size:0.8rem;white-space:pre-wrap;">' +
            JSON.stringify(data, null, 2) +
            '</pre></div>' +
            '</div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', function(e) {
            if (e.target === modal) modal.remove();
        });
    } catch (e) {
        alert('加载详情失败: ' + e.message);
    }
}

async function reloadData() {
    try {
        await fetch('/api/reload', { method: 'POST' });
    } catch (e) {}
    await loadData();
}

document.addEventListener('DOMContentLoaded', loadData);
