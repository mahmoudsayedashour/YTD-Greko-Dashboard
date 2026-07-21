
// ═══════════════════ TOAST NOTIFICATIONS ═══════════════════
function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast ' + (type === 'error' ? 'error' : '');
  const icon = type === 'error' ? '❌' : '✅';
  toast.innerHTML = `<span class="toast-icon">${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toast-slide-out 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ═══════════════════ EXPORT UTILITIES ═══════════════════
function attachExportToolbars(container) {
  const tables = container.querySelectorAll('table.data-table');
  tables.forEach(table => {
    if (table.previousElementSibling && table.previousElementSibling.classList.contains('export-toolbar')) return;
    const toolbar = document.createElement('div');
    toolbar.className = 'export-toolbar';
    toolbar.innerHTML = `
      <button class="export-btn pdf">📄 PDF</button>
      <button class="export-btn excel">📊 Excel</button>
    `;
    table.parentNode.insertBefore(toolbar, table);

    toolbar.querySelector('.excel').addEventListener('click', () => {
      exportTableToExcel(table, (document.getElementById('page-title')?.innerText || 'Export'));
    });
    toolbar.querySelector('.pdf').addEventListener('click', () => {
      exportTableToPDF(table, (document.getElementById('page-title')?.innerText || 'Export'));
    });
  });
}

function exportTableToExcel(table, title) {
  try {
    const clone = table.cloneNode(true);
    clone.querySelectorAll('.nested-row').forEach(el => el.remove());
    clone.querySelectorAll('.expand-icon').forEach(el => el.remove());

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.table_to_sheet(clone, { raw: true });
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, title + '.xlsx');
    showToast('Excel exported successfully');
  } catch (err) {
    console.error(err);
    showToast('Export failed', 'error');
  }
}

function exportTableToPDF(table, title) {
  try {
    const clone = table.cloneNode(true);
    clone.querySelectorAll('.nested-row').forEach(el => el.remove());
    clone.querySelectorAll('.expand-icon').forEach(el => el.remove());

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape');
    
    // Add title
    doc.setFontSize(14);
    doc.text(title, 14, 15);
    
    // Add date
    doc.setFontSize(10);
    doc.setTextColor(150);
    const dateStr = 'Generated: ' + new Date().toLocaleString();
    doc.text(dateStr, 14, 22);

    doc.autoTable({
      html: clone,
      startY: 26,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [0, 230, 118], textColor: [0,0,0] },
      theme: 'grid'
    });
    
    doc.save(title + '.pdf');
    showToast('PDF generated successfully');
  } catch (err) {
    console.error(err);
    showToast('Export failed', 'error');
  }
}

// Global observer to attach toolbars to any new data-table
const observer = new MutationObserver((mutations) => {
  mutations.forEach(m => {
    if (m.addedNodes.length) {
      document.querySelectorAll('.page.active').forEach(attachExportToolbars);
    }
  });
});
// Wait for DOM
window.addEventListener('DOMContentLoaded', () => {
    observer.observe(document.body, { childList: true, subtree: true });
});

/* ============================================================
   GREKO EGYPT – YTD SALES DASHBOARD  •  app.js  (v4)
   Single global state, server-side data, full DAX pipeline.
   ============================================================ */
'use strict';

// ═══════════════════════════════════════════════════════════════
// GLOBAL STATE
// ═══════════════════════════════════════════════════════════════
const STATE = {
  measure:  'ton',                    // 'ton' | 'carton' | 'cups'
  period:   'ytd',                    // 'ytd' | 'q1' | 'q2' | 'jan' … 'jun'
  months:   [1,2,3,4,5,6],           // active months array (drives API call)
  page:     'home',
  data:     null,                     // window.GREKO_DATA – set after fetch
  loading:  false,
  chFilter: null,                     // channel filter for Channel page
  chTab:    'sales',                  // 'sales' | 'returns' | 'customers'
};

const PERIOD_MONTHS = {
  ytd: [1,2,3,4,5,6],
  q1:  [1,2,3],
  q2:  [4,5,6],
  jan: [1], feb: [2], mar: [3], apr: [4], may: [5], jun: [6],
};

// ═══════════════════════════════════════════════════════════════
// CHART.JS SETUP
// ═══════════════════════════════════════════════════════════════
Chart.register(ChartDataLabels);
Chart.defaults.color           = '#8899bb';
Chart.defaults.borderColor     = 'rgba(255,255,255,0.05)';
Chart.defaults.font.family     = 'Inter, sans-serif';
Chart.defaults.plugins.legend.labels.usePointStyle  = true;
Chart.defaults.plugins.legend.labels.pointStyleWidth = 10;
Chart.defaults.plugins.datalabels.display   = true;
Chart.defaults.plugins.datalabels.color     = '#fff';
Chart.defaults.plugins.datalabels.font      = { size: 10, weight: '600' };
Chart.defaults.plugins.datalabels.formatter = v => (!v || Math.abs(v) < 0.001) ? '' :
  v.toLocaleString('en', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const _charts = {};
function mkChart(id, cfg) {
  _charts[id]?.destroy();
  const el = document.getElementById(id);
  if (!el) return null;
  return (_charts[id] = new Chart(el, cfg));
}

const C = {
  blue: '#003087', blueL: '#0052CC', cyan: '#00B4D8', teal: '#0077B6',
  green: '#06D6A0', red: '#EF476F', gold: '#F4A261', orange: '#FFB703',
  purple: '#7B2D8B', gray: '#8899bb',
};
const CAT_COLORS = {
  'Plain': C.blueL, 'Tart & Fruit': C.green, 'Yopolis PRO': C.cyan,
  'Labneh': C.gold, 'Double Zero': C.purple, 'Greko': C.teal,
  'Cream Cheese': C.orange, 'Creams': C.red, 'Yopo Flip': '#3AE8FF',
  'Dips': '#A78BFA', 'Bucket': '#34D399', 'Delights': '#F472B6',
};
const catColor = c => CAT_COLORS[c] || C.gray;

// ═══════════════════════════════════════════════════════════════
// FORMATTERS  (single source of truth)
// ═══════════════════════════════════════════════════════════════
const fmt  = n => n == null || isNaN(n) ? '–' :
  n.toLocaleString('en', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtP = n => n == null || isNaN(n) ? '–' : (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
const trunc = s => s || '';
const wrapLabel = (s, maxLen = 25) => {
  if (!s) return '';
  if (s.length <= maxLen) return s;
  const words = s.split(' ');
  const lines = [];
  let current = '';
  for (const w of words) {
    if ((current + ' ' + w).trim().length > maxLen) {
      if (current) lines.push(current);
      current = w;
    } else {
      current = current ? current + ' ' + w : w;
    }
  }
  if (current) lines.push(current);
  return lines;
};

// ═══════════════════════════════════════════════════════════════
// CALCULATION HELPERS  (single engine – mirrors DAX)
// ═══════════════════════════════════════════════════════════════
const grow = (v26, v25) => v25 > 0 ? ((v26 - v25) / v25 * 100) : (v26 > 0 ? 100 : 0);
const ach  = (v, t)    => t > 0   ? (v / t * 100)             : 0;
const retP = (s, r)    => (s + r) > 0 ? (r / (s + r) * 100)  : 0;
const hasTgt = t       => t != null && t > 0;

// ═══════════════════════════════════════════════════════════════
// CHART OPTIONS
// ═══════════════════════════════════════════════════════════════
const barOpts = (iH = false) => ({
  indexAxis: iH ? 'y' : 'x',
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { grid: { color: 'rgba(255,255,255,0.05)', display: !iH }, ticks: { font: { size: 9 }, autoSkip: false } },
    y: { grid: { color: 'rgba(255,255,255,0.05)', display:  iH }, ticks: { font: { size: 9 }, autoSkip: false } },
  },
});
const lineOpts = () => ({
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { position: 'bottom' } },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 9 }, autoSkip: false } },
    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { font: { size: 9 } } },
  },
});

// ═══════════════════════════════════════════════════════════════
// UI COMPONENT HELPERS
// ═══════════════════════════════════════════════════════════════
function kpi(icon, label, value, change, accent, sub = '') {
  const chg = change != null
    ? `<span class="kpi-change ${change >= 0 ? 'up' : 'down'}">${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(1)}%</span>`
    : '';
  return `<div class="kpi-card ${accent}">
    <span class="kpi-icon">${icon}</span>
    <div class="kpi-value">${value}</div>
    <div class="kpi-label">${label}</div>
    ${sub ? `<div class="kpi-sub">${sub}</div>` : ''}
    ${chg}
  </div>`;
}

function card(title, sub, inner) {
  return `<div class="chart-card"><div class="chart-header"><div>
    <div class="chart-title">${title}</div>
    ${sub ? `<div class="chart-subtitle">${sub}</div>` : ''}
  </div></div>${inner}</div>`;
}

function cw(id, h = '280') {
  return `<div class="chart-container" style="height:${h}px"><canvas id="${id}"></canvas></div>`;
}

function badge(txt, cls) { return `<span class="badge ${cls}">${txt}</span>`; }

function achBadge(a) {
  return a == null ? badge('N/A', 'badge-gray')
    : badge(a.toFixed(1) + '%', a >= 90 ? 'badge-up' : a >= 70 ? 'badge-warn' : 'badge-down');
}

function progBar(label, pct, val, color) {
  return `<div class="progress-bar-wrap">
    <div class="progress-bar-header">
      <span class="progress-bar-label">${label}</span>
      <span class="progress-bar-val">${val}</span>
    </div>
    <div class="progress-bar-bg">
      <div class="progress-bar-fill" style="width:${Math.min(Math.max(pct, 0), 100)}%;background:${color}"></div>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
// SORTING
// ═══════════════════════════════════════════════════════════════
let currentSort = { field: 's26', desc: true };

function sortData(arr) {
  const m = STATE.measure;
  return [...arr].sort((a, b) => {
    let va, vb;
    switch (currentSort.field) {
      case 'name': va = a.name || a.product || a.category || a.customer || a.channel || ''; vb = b.name || b.product || b.category || b.customer || b.channel || ''; break;
      case 's25':  va = a[m].s25;  vb = b[m].s25;  break;
      case 's26':  va = a[m].s26;  vb = b[m].s26;  break;
      case 'r26':  va = a[m].r26;  vb = b[m].r26;  break;
      case 'grow': va = grow(a[m].s26, a[m].s25); vb = grow(b[m].s26, b[m].s25); break;
      case 'gAbs': va = (a[m].s26 || 0) - (a[m].s25 || 0); vb = (b[m].s26 || 0) - (b[m].s25 || 0); break;
      case 'retP': va = retP(a[m].s26, a[m].r26); vb = retP(b[m].s26, b[m].r26); break;
      case 'retP25': va = retP(a[m].s25, a[m].r25); vb = retP(b[m].s25, b[m].r25); break;
      case 'tgt26': va = a[m].tgt26 ?? 0; vb = b[m].tgt26 ?? 0; break;
      case 'ach26':va = hasTgt(a[m].tgt26) ? ach(a[m].s26, a[m].tgt26) : -1;
                   vb = hasTgt(b[m].tgt26) ? ach(b[m].s26, b[m].tgt26) : -1; break;
      default:     va = a[m]?.[currentSort.field] ?? 0; vb = b[m]?.[currentSort.field] ?? 0;
    }
    if (typeof va === 'string') return currentSort.desc ? vb.localeCompare(va) : va.localeCompare(vb);
    return currentSort.desc ? (vb || 0) - (va || 0) : (va || 0) - (vb || 0);
  });
}

function thSort(label, field) {
  const active = currentSort.field === field;
  const arrow  = active ? (currentSort.desc ? ' ↓' : ' ↑') : ' ⇅';
  return `<th data-sort="${field}" style="cursor:pointer;user-select:none">${label}<span style="opacity:0.4;font-size:10px">${arrow}</span></th>`;
}

function attachSort() {
  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const f = th.dataset.sort;
      if (currentSort.field === f) currentSort.desc = !currentSort.desc;
      else { currentSort.field = f; currentSort.desc = true; }
      renderPage();
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// DATA FETCHING
// ═══════════════════════════════════════════════════════════════
async function fetchData(months) {
  setLoaderText('Loading data from server…');
  const url = `/api/data?months=${months.join(',')}`;
  const res  = await fetch(url);
  if (!res.ok) {
    let rawText = '';
    try {
      rawText = await res.text();
      const errBody = JSON.parse(rawText);
      throw new Error(JSON.stringify(errBody, null, 2));
    } catch(e) {
      if (e.message.startsWith('{')) throw e;
      throw new Error(`API ${res.status} ${res.statusText} \nRaw Response: ${rawText.substring(0,200)}`);
    }
  }
  const data = await res.json();
  if (data.success === false) {
    throw new Error(JSON.stringify(data, null, 2));
  }
  
  // Clean customer names (remove [CODE] prefix)
  if (data.customer_data) {
    data.customer_data.forEach(c => {
      if (c.customer) c.customer = c.customer.replace(/^\[.*?\]\s*/, '').trim();
    });
  }
  
  return data;
}


// ═══════════════════════════════════════════════════════════════
// DRILL-DOWN LOGIC & CACHING
// ═══════════════════════════════════════════════════════════════
const API_CACHE = {};

async function fetchDrilldownData(params) {
  const qs = new URLSearchParams({ months: STATE.months.join(','), ...params }).toString();
  const url = `/api/data?${qs}`;
  if (API_CACHE[url]) return API_CACHE[url];
  
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API Error ${res.status}`);
  const data = await res.json();
  if (data.success === false) throw new Error(data.message);
  
  if (data.customer_data) {
    data.customer_data.forEach(c => {
      if (c.customer) c.customer = c.customer.replace(/^\[.*?\]\s*/, '').trim();
    });
  }
  API_CACHE[url] = data;
  return data;
}

let openRows = {}; // track by level 'L1', 'L2'

async function toggleRowLevel(rowId, level, colSpan, renderPromise) {
  const row = document.getElementById(rowId);
  if (!row) return;
  const isExpanded = row.classList.contains('expanded');
  
  // Close previously open row at this level
  if (openRows[level] && openRows[level] !== rowId) {
    const oldRow = document.getElementById(openRows[level]);
    if (oldRow) {
      oldRow.classList.remove('expanded');
      const oldNested = oldRow.nextElementSibling;
      if (oldNested && oldNested.classList.contains('nested-row')) {
        const content = oldNested.querySelector('.nested-content');
        if (content) content.classList.remove('open');
        setTimeout(() => oldNested.remove(), 400);
      }
    }
  }

  if (isExpanded) {
    // Collapse
    row.classList.remove('expanded');
    const nested = row.nextElementSibling;
    if (nested && nested.classList.contains('nested-row')) {
      const content = nested.querySelector('.nested-content');
      if (content) content.classList.remove('open');
      setTimeout(() => nested.remove(), 400);
    }
    openRows[level] = null;
  } else {
    // Expand
    row.classList.add('expanded');
    openRows[level] = rowId;
    
    const nestedRow = document.createElement('tr');
    nestedRow.className = 'nested-row';
    nestedRow.innerHTML = `
      <td colspan="${colSpan}" class="nested-td">
        <div class="nested-content" id="content-${rowId}">
          <div class="nested-card">
            <div style="text-align:center; padding: 20px; color: var(--text-muted);">
              <div class="spinner" style="margin: 0 auto 10px; border: 2px solid rgba(255,255,255,0.1); border-top-color: var(--accent-cyan); border-radius: 50%; width: 20px; height: 20px; animation: spin 1s linear infinite;"></div>
              Loading...
            </div>
          </div>
        </div>
      </td>
    `;
    row.insertAdjacentElement('afterend', nestedRow);
    const content = document.getElementById(`content-${rowId}`);
    // Force reflow and start CSS transition
    requestAnimationFrame(() => requestAnimationFrame(() => {
        if (content) content.classList.add('open');
    }));

    try {
      const html = await renderPromise();
      if (openRows[level] === rowId && content) {
        content.innerHTML = html;
        // Adjust max-height after content is loaded just in case
        content.style.maxHeight = '2000px'; 
      }
    } catch(e) {
      if (openRows[level] === rowId && content) {
        content.innerHTML = `<div class="nested-card" style="color:var(--accent-red); text-align:center;">Error: ${e.message}</div>`;
      }
    }
  }
}

function renderSummaryCard(title, kpis) {
  return `
    <div class="summary-card">
      <div class="summary-title">${title}</div>
      ${kpis.map(k => `
        <div class="summary-item">
          <span class="summary-label">${k.label}</span>
          <span class="summary-value" style="color: ${k.color || '#fff'}">${k.value}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderNestedProductTable(dataArray, title) {
  const M = STATE.measure;
  // sortData will sort the provided array.
  // We need to copy it so it doesn't mutate global if it's local data
  const items = sortData([...dataArray].map(p => ({ ...p, name: p.product })));
  const validItems = items.filter(p => p[M].s26 > 0 || p[M].s25 > 0);
  
  if (validItems.length === 0) {
     return `<div class="nested-card" style="text-align:center; padding:20px; color:var(--text-muted)">No products found for this selection.</div>`;
  }
  
  return `
    <div class="nested-card" style="margin:0; box-shadow:none; border:none; padding:0;">
        <div class="chart-header" style="margin-bottom: 12px; padding:0;">
          <div class="chart-title" style="font-size:12px; opacity:0.8;">📋 ${title}</div>
        </div>
        <div class="data-table-wrapper" style="max-height:400px;overflow-y:auto; border-radius: 8px;">
          <table class="data-table" style="margin:0;">
            <thead style="position:sticky; top:0; z-index:2; background:var(--bg-card);"><tr>
              <th>#</th>
              <th style="text-align:left">SKU</th>
              <th style="text-align:left">Category</th>
              <th class="num">Sales 25</th>
              <th class="num">Return 25 %</th>
              <th class="num">Target 26</th>
              <th class="num">Sales 26</th>
              <th class="num">Return 26 %</th>
              <th class="num">Ach %</th>
              <th class="num">Growth Ton</th>
              <th class="num">Growth %</th>
            </tr></thead>
            <tbody>
              ${validItems.map((p, i) => {
                const s25 = p[M].s25, s26 = p[M].s26, t26 = p[M].tgt26, r25 = p[M].r25, r26 = p[M].r26;
                const gAbs = s26 - s25;
                const g = grow(s26, s25);
                const a = hasTgt(t26) ? ach(s26, t26) : null;
                const rp25 = retP(s25, r25);
                const rp26 = retP(s26, r26);
                return `<tr>
                  <td>${i + 1}</td>
                  <td style="text-align:left">${p.product}</td>
                  <td style="text-align:left; color:${catColor(p.category)}">${p.category}</td>
                  <td class="num">${fmt(s25)}</td>
                  <td class="num">${rp25.toFixed(1)}%</td>
                  <td class="num">${hasTgt(t26) ? fmt(t26) : '–'}</td>
                  <td class="num" style="color:${C.cyan}">${fmt(s26)}</td>
                  <td class="num" style="color:${rp26 > 10 ? C.red : rp26 > 5 ? C.gold : C.green}">${rp26.toFixed(1)}%</td>
                  <td class="num">${achBadge(a)}</td>
                  <td class="num">${fmt(gAbs)}</td>
                  <td class="num">${badge(fmtP(g), g >= 0 ? 'badge-up' : 'badge-down')}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
    </div>
  `;
}


window.toggleCustomerRow = (rowId, customerName) => {
  toggleRowLevel(rowId, 'L1', 11, async () => {
    const data = await fetchDrilldownData({ customer: customerName });
    const M = STATE.measure;
    
    const catView = data.category_data.filter(c => c[M].s26 > 0 || c[M].s25 > 0);
    catView.sort((a,b) => b[M].s26 - a[M].s26);
    
    const tableHtml = `
      <div class="nested-card" style="margin:0; box-shadow:none; border:none; padding:0;">
        <div class="chart-header" style="margin-bottom: 12px; padding:0;">
          <div class="chart-title" style="font-size:12px; opacity:0.8;">📋 Category Summary – ${customerName}</div>
        </div>
        <div class="data-table-wrapper" style="max-height:400px;overflow-y:auto; border-radius: 8px;">
          <table class="data-table" style="margin:0;">
            <thead style="position:sticky; top:0; z-index:2; background:var(--bg-card);"><tr>
              <th>#</th>
              <th style="text-align:left">Category</th>
              <th class="num">Sales 25</th>
              <th class="num">Return 25 %</th>
              <th class="num">Target 26</th>
              <th class="num">Sales 26</th>
              <th class="num">Return 26 %</th>
              <th class="num">Ach %</th>
              <th class="num">Growth Ton</th>
              <th class="num">Growth %</th>
            </tr></thead>
            <tbody>${catView.map((c, i) => {
              const catId = `nested-cat-cust-${i}`;
              const s25 = c[M].s25, s26 = c[M].s26, t26 = c[M].tgt26, r25 = c[M].r25, r26 = c[M].r26;
              const gAbs = s26 - s25;
              const g = grow(s26, s25), a = hasTgt(t26) ? ach(s26, t26) : null;
              const rp25 = retP(s25, r25);
              const rp26 = retP(s26, r26);
              return `<tr id="${catId}" class="row-clickable" onclick="toggleCategoryRow('${catId}', '${c.category}', 'customer', '${customerName}')">
                <td><span class="expand-icon">▶</span> ${i + 1}</td>
                <td style="text-align:left; color:${catColor(c.category)}; font-weight:bold;">${c.category}</td>
                <td class="num">${fmt(s25)}</td>
                <td class="num">${rp25.toFixed(1)}%</td>
                <td class="num">${hasTgt(t26) ? fmt(t26) : '–'}</td>
                <td class="num" style="color:${C.cyan}">${fmt(s26)}</td>
                <td class="num" style="color:${rp26 > 10 ? C.red : rp26 > 5 ? C.gold : C.green}">${rp26.toFixed(1)}%</td>
                <td class="num">${achBadge(a)}</td>
                <td class="num">${fmt(gAbs)}</td>
                <td class="num">${badge(fmtP(g), g >= 0 ? 'badge-up' : 'badge-down')}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div>
      </div>
    `;
    
    const custRow = data.customer_data.find(c => c.customer === customerName);
    const s26 = custRow ? custRow[M].s26 : 0;
    const g = custRow ? grow(custRow[M].s26, custRow[M].s25) : 0;
    const a = custRow && hasTgt(custRow[M].tgt26) ? ach(custRow[M].s26, custRow[M].tgt26) : null;
    const catCount = catView.length;

    const summaryHtml = renderSummaryCard(customerName, [
      { label: 'Categories', value: catCount },
      { label: 'Sales 26', value: fmt(s26), color: C.cyan },
      { label: 'Growth %', value: fmtP(g), color: g >= 0 ? C.green : C.red },
      { label: 'Ach %', value: a != null ? a.toFixed(1) + '%' : 'N/A', color: a != null && a >= 100 ? C.green : C.gold }
    ]);

    return `<div class="nested-card">${summaryHtml}${tableHtml}</div>`;
  });
};

window.toggleCategoryRow = (rowId, categoryName, contextType = null, contextValue = null) => {
  const level = contextType ? 'L2' : 'L1';
  toggleRowLevel(rowId, level, 11, async () => {
    let sourceData = STATE.data;
    if (contextType === 'channel') {
       sourceData = await fetchDrilldownData({ channel: contextValue });
    } else if (contextType === 'customer') {
       sourceData = await fetchDrilldownData({ customer: contextValue });
    }
    const M = STATE.measure;
    const catRow = sourceData.category_data.find(c => c.category === categoryName);
    const s26 = catRow ? catRow[M].s26 : 0;
    const g = catRow ? grow(catRow[M].s26, catRow[M].s25) : 0;
    const rp26 = catRow ? retP(catRow[M].s26, catRow[M].r26) : 0;
    
    const catSkus = sourceData.product_data.filter(p => p.category === categoryName && (p[M].s26 > 0 || p[M].s25 > 0));

    const summaryHtml = renderSummaryCard(categoryName + (contextValue ? ` (${contextValue})` : ''), [
      { label: 'SKUs', value: catSkus.length },
      { label: 'Sales 26', value: fmt(s26), color: C.cyan },
      { label: 'Growth %', value: fmtP(g), color: g >= 0 ? C.green : C.red },
      { label: 'Return %', value: rp26 != null ? rp26.toFixed(1) + '%' : 'N/A', color: rp26 > 10 ? C.red : (rp26 > 5 ? C.gold : C.green) }
    ]);

    const tableHtml = renderNestedProductTable(catSkus, 'Category Product Matrix');
    return `<div class="nested-card">${summaryHtml}${tableHtml}</div>`;
  });
};

window.toggleChannelRow = (rowId, channelName) => {
  toggleRowLevel(rowId, 'L1', 11, async () => {
    const data = await fetchDrilldownData({ channel: channelName });
    const M = STATE.measure;
    
    const catView = data.category_data.filter(c => c[M].s26 > 0 || c[M].s25 > 0);
    catView.sort((a,b) => b[M].s26 - a[M].s26);
    
    const tableHtml = `
      <div class="nested-card" style="margin:0; box-shadow:none; border:none; padding:0;">
        <div class="chart-header" style="margin-bottom: 12px; padding:0;">
          <div class="chart-title" style="font-size:12px; opacity:0.8;">📋 Category Summary – ${channelName}</div>
        </div>
        <div class="data-table-wrapper" style="max-height:400px;overflow-y:auto; border-radius: 8px;">
          <table class="data-table" style="margin:0;">
            <thead style="position:sticky; top:0; z-index:2; background:var(--bg-card);"><tr>
              <th>#</th>
              <th style="text-align:left">Category</th>
              <th class="num">Sales 25</th>
              <th class="num">Return 25 %</th>
              <th class="num">Target 26</th>
              <th class="num">Sales 26</th>
              <th class="num">Return 26 %</th>
              <th class="num">Ach %</th>
              <th class="num">Growth Ton</th>
              <th class="num">Growth %</th>
            </tr></thead>
            <tbody>${catView.map((c, i) => {
              const catId = `nested-cat-${channelName.replace(/\s/g,'')}-${i}`;
              const s25 = c[M].s25, s26 = c[M].s26, t26 = c[M].tgt26, r25 = c[M].r25, r26 = c[M].r26;
              const gAbs = s26 - s25;
              const g = grow(s26, s25), a = hasTgt(t26) ? ach(s26, t26) : null;
              const rp25 = retP(s25, r25);
              const rp26 = retP(s26, r26);
              return `<tr id="${catId}" class="row-clickable" onclick="toggleCategoryRow('${catId}', '${c.category}', 'channel', '${channelName}')">
                <td><span class="expand-icon">▶</span> ${i + 1}</td>
                <td style="text-align:left; color:${catColor(c.category)}; font-weight:bold;">${c.category}</td>
                <td class="num">${fmt(s25)}</td>
                <td class="num">${rp25.toFixed(1)}%</td>
                <td class="num">${hasTgt(t26) ? fmt(t26) : '–'}</td>
                <td class="num" style="color:${C.cyan}">${fmt(s26)}</td>
                <td class="num" style="color:${rp26 > 10 ? C.red : rp26 > 5 ? C.gold : C.green}">${rp26.toFixed(1)}%</td>
                <td class="num">${achBadge(a)}</td>
                <td class="num">${fmt(gAbs)}</td>
                <td class="num">${badge(fmtP(g), g >= 0 ? 'badge-up' : 'badge-down')}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div>
      </div>
    `;
    
    return `<div class="nested-card">${tableHtml}</div>`;
  });
};

// ═══════════════════════════════════════════════════════════════
// PAGE ROUTING
// ═══════════════════════════════════════════════════════════════
const PAGE_TITLES = {
  home:      'YTD Sales Overview',
  ytd:       'SKU YTD Performance',
  products:  'Category Analysis',
  customers: 'Customer Analysis',
  channels:  'Channel Analysis',
  returns:   'Returns Analysis',
  growth:    'Growth Analysis',
  ai:        '🤖 AI Business Assistant'
};

function go(page) {
  if (!PAGE_TITLES[page]) return;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('active', el.id === `page-${page}`));
  document.getElementById('page-title').textContent = PAGE_TITLES[page];
  STATE.page = page;
  if (STATE.data) renderPage();
  document.getElementById('sidebar').classList.remove('open');
}

function renderPage() {
  const D = STATE.data;
  if (!D) return;
  currentSort = { field: 's26', desc: true }; // reset sort on page change
  switch (STATE.page) {
    case 'home':      pgHome(D);      break;
    case 'ytd':       pgYTD(D);       break;
    case 'products':  pgProducts(D);  break;
    case 'customers': pgCustomers(D); break;
    case 'channels':  pgChannels(D);  break;
    case 'returns':   pgReturns(D);   break;
    case 'growth':    pgGrowth(D);    break;
    case 'ai':        pgAiAssistant(); break;
  }
  if (STATE.page !== 'ai') attachSort();
}

// ═══════════════════════════════════════════════════════════════
// EXECUTIVE INSIGHTS HELPER
// ═══════════════════════════════════════════════════════════════
function renderInsightsBar(insights) {
  if (!insights || insights.length === 0) return '';
  const html = insights.join('<span style="margin: 0 15px; opacity: 0.3; color: white;">|</span>');
  return `
    <div class="insights-bar">
      <div class="insights-label">Executive Insights</div>
      <div class="ticker-wrap">
        <div class="ticker-content">
          ${html}
        </div>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// HOME  (Executive + Year Comparison merged)
// ═══════════════════════════════════════════════════════════════
function pgHome(D) {
  const m  = D.meta;
  const M  = STATE.measure;
  const mm = m[M];

  const g    = grow(mm.s26, mm.s25);
  const a26  = hasTgt(mm.tgt26) ? ach(mm.s26, mm.tgt26) : null;
  const a25  = hasTgt(mm.tgt25) ? ach(mm.s25, mm.tgt25) : null;
  const rp26 = retP(mm.s26, mm.r26);
  const rp25 = retP(mm.s25, mm.r25);

  // Sales variance (Year-over-Year)
  const variance     = mm.s26 - mm.s25;
  const retVariance  = mm.r26 - mm.r25;

  const cats = [...D.category_data].filter(c => c[M].s26 > 0 || c[M].s25 > 0)
                                    .sort((a, b) => b[M].s26 - a[M].s26);

  // Calculate Insights dynamically
  const topCat = [...D.category_data].sort((a, b) => b[M].s26 - a[M].s26)[0];
  const topSku = [...D.product_data].sort((a, b) => b[M].s26 - a[M].s26)[0];
  const topCust = [...D.customer_data].sort((a, b) => b[M].s26 - a[M].s26)[0];
  const topChan = [...D.channel_data].sort((a, b) => b[M].s26 - a[M].s26)[0];
  const lowCat = [...D.category_data].filter(c => c[M].s26 > 0).sort((a, b) => a[M].s26 - b[M].s26)[0];
  const rrImp = rp25 - rp26;

  const insights = [
    `📈 Sales Growth: <span style="color:${g >= 0 ? C.green : C.red}">${fmtP(g)}</span>`,
    `🎯 Achievement: <span style="color:${C.cyan}">${a26 != null ? a26.toFixed(1) + '%' : 'N/A'}</span>`,
    `↘ Return Rate Improvement: <span style="color:${rrImp >= 0 ? C.green : C.red}">${rrImp > 0 ? '+' : ''}${rrImp.toFixed(1)}%</span>`,
    `🏆 Best Category: <span style="color:${C.gold}">${topCat ? topCat.category : 'N/A'}</span>`,
    `⭐ Top SKU: <span style="color:${C.gold}">${topSku ? trunc(topSku.product, 25) : 'N/A'}</span>`,
    `👤 Top Customer: <span style="color:${C.gold}">${topCust ? trunc(topCust.customer, 25) : 'N/A'}</span>`,
    `🏪 Top Channel: <span style="color:${C.gold}">${topChan ? topChan.channel : 'N/A'}</span>`,
    `⚠ Lowest Category: <span style="color:${C.red}">${lowCat ? lowCat.category : 'N/A'}</span>`
  ];

  document.getElementById('page-home').innerHTML = `
    ${renderInsightsBar(insights)}

    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr)">
      ${kpi('💰', `Sales 2026`, fmt(mm.s26), null, 'cyan', `Target: ${hasTgt(mm.tgt26) ? fmt(mm.tgt26) : 'N/A'}`)}
      ${kpi('📅', `Sales 2025`, fmt(mm.s25), null, 'blue', `Target: ${hasTgt(mm.tgt25) ? fmt(mm.tgt25) : 'N/A'}`)}
      ${kpi('🎯', 'Achievement 26 %', a26 != null ? a26.toFixed(1) + '%' : 'N/A', a26 != null ? a26 - 100 : null, 'cyan', `2025: ${a25 != null ? a25.toFixed(1) + '%' : 'N/A'}`)}
      ${kpi('📈', 'Growth %', fmtP(g), g, 'green', `Δ ${fmt(variance)}`)}
      ${kpi('↩️', 'Return 26', fmt(mm.r26), null, 'red', `2025: ${fmt(mm.r25)}`)}
      ${kpi('📉', 'Return Rate 26', rp26.toFixed(1) + '%', -(rp26 - rp25), 'red', `Was: ${rp25.toFixed(1)}%`)}
      ${kpi('🔄', 'Partial Returns 26', fmt(mm.partial26), null, 'gold', `2025: ${fmt(mm.partial25)}`)}
      ${kpi('👥', 'Customers 25 VS 26', m.customers_26.toString(), m.customers_26 - m.customers_25, 'blue', `2025: ${m.customers_25}`)}
    </div>

    <div class="chart-grid cols-2" style="margin-top:20px">
      ${card('📊 Sales by Category', 'Contribution 2026', cw('ch-h-cat', '300'))}
      ${card('📅 Monthly Sales Trend', '2025 vs 2026', cw('ch-h-mon', '300'))}
    </div>
    <div class="chart-grid cols-2" style="margin-top:20px">
      ${card('📈 Category Growth', '2025 vs 2026', cw('ch-h-catgrow', '280'))}
      ${card('↩️ Top 10 Categories by Return %', 'Highest Return Rates', cw('ch-h-ret', '280'))}
    </div>
    <div class="chart-grid cols-1" style="margin-top:20px">
      ${card('📊 Cumulative Sales', 'YTD Accumulation', cw('ch-h-cum', '300'))}
    </div>
  `;

  setTimeout(() => {
    // Doughnut
    mkChart('ch-h-cat', { type: 'doughnut',
      data: { labels: cats.map(c => wrapLabel(c.category)),
        datasets: [{ data: cats.map(c => c[M].s26), backgroundColor: cats.map(c => catColor(c.category)), borderWidth: 1, borderColor: '#0a1628' }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } },
    });

    // Monthly trend
    const md = [...D.monthly_data].filter(x => STATE.months.includes(x.month_id)).sort((a, b) => a.month_id - b.month_id);
    mkChart('ch-h-mon', { type: 'line',
      data: { labels: md.map(x => x.month_short),
        datasets: [
          { label: '2025', data: md.map(x => x[M].s25), borderColor: C.blueL, borderWidth: 2, fill: false, pointRadius: 4 },
          { label: '2026', data: md.map(x => x[M].s26), borderColor: C.cyan,  borderWidth: 2.5, fill: false, pointRadius: 4 },
          { label: 'Target 26', data: md.map(x => x[M].tgt26), borderColor: C.gold, borderDash: [4, 4], borderWidth: 1.5, fill: false, pointRadius: 0, datalabels: { display: false } },
        ] },
      options: lineOpts(),
    });

    // Category growth
    mkChart('ch-h-catgrow', { type: 'bar',
      data: { labels: cats.map(c => wrapLabel(c.category)),
        datasets: [
          { label: '2025', data: cats.map(c => c[M].s25), backgroundColor: C.blueL + 'BB', borderRadius: 3,
            datalabels: { formatter: v => fmt(v), color: '#fff', align: 'center', anchor: 'center' } },
          { label: '2026', data: cats.map(c => c[M].s26), backgroundColor: cats.map(c => catColor(c.category) + 'BB'), borderRadius: 3,
            datalabels: {
              labels: {
                value: { formatter: v => fmt(v), color: '#fff', align: 'center', anchor: 'center' },
                growth: {
                  formatter: (v, ctx) => fmtP(grow(cats[ctx.dataIndex][M].s26, cats[ctx.dataIndex][M].s25)),
                  color: ctx => grow(cats[ctx.dataIndex][M].s26, cats[ctx.dataIndex][M].s25) >= 0 ? C.green : C.red,
                  font: { weight: 'bold', size: 11 },
                  align: 'top', anchor: 'end'
                }
              }
            }
          },
        ] },
      options: { ...barOpts(), plugins: { legend: { position: 'top' } } },
    });

    // Top Categories by Return %
    const retCats = [...cats].filter(c => c[M].s26 > 0).map(c => ({
      name: c.category,
      rp: retP(c[M].s26, c[M].r26)
    })).sort((a,b) => b.rp - a.rp).slice(0, 10);
    mkChart('ch-h-ret', { type: 'bar',
      data: { labels: retCats.map(c => wrapLabel(c.name)),
        datasets: [{ data: retCats.map(c => c.rp),
          backgroundColor: C.red + 'CC',
          borderRadius: 4, datalabels: { formatter: v => v.toFixed(1) + '%' } }] },
      options: barOpts(),
    });

    // Cumulative
    const mdAll = [...D.monthly_data].filter(x => STATE.months.includes(x.month_id)).sort((a, b) => a.month_id - b.month_id);
    let c25 = 0, c26 = 0;
    mkChart('ch-h-cum', { type: 'line',
      data: { labels: mdAll.map(x => x.month_short),
        datasets: [
          { label: '2025 Cumulative', data: mdAll.map(x => (c25 += x[M].s25, c25)), borderColor: C.blueL, backgroundColor: C.blueL + '11', fill: true, borderWidth: 2 },
          { label: '2026 Cumulative', data: mdAll.map(x => (c26 += x[M].s26, c26)), borderColor: C.cyan,  backgroundColor: C.cyan  + '11', fill: true, borderWidth: 2.5 },
        ] },
      options: lineOpts(),
    });
  }, 50);
}

// ═══════════════════════════════════════════════════════════════
// YTD PERFORMANCE
// ═══════════════════════════════════════════════════════════════
function pgYTD(D) {
  const M = STATE.measure;
  const items = sortData(D.product_data.map(p => ({ ...p, name: p.product })));

  const validItems = items.filter(p => p[M].s26 > 0 || p[M].s25 > 0);
  const bestSku = [...validItems].sort((a, b) => b[M].s26 - a[M].s26)[0];
  const highGrowSku = [...validItems].sort((a, b) => (b[M].s26 - b[M].s25) - (a[M].s26 - a[M].s25))[0];
  const highRetSku = [...validItems].sort((a, b) => retP(b[M].s26, b[M].r26) - retP(a[M].s26, a[M].r26))[0];
  const bestAchSku = [...validItems].filter(p => hasTgt(p[M].tgt26)).sort((a, b) => ach(b[M].s26, b[M].tgt26) - ach(a[M].s26, a[M].tgt26))[0];

  const insights = [
    `⭐ Best Selling SKU: <span style="color:${C.gold}">${bestSku ? trunc(bestSku.product, 25) : 'N/A'}</span>`,
    `📈 Highest Growth SKU: <span style="color:${C.green}">${highGrowSku ? trunc(highGrowSku.product, 25) : 'N/A'}</span>`,
    `↩️ Highest Return SKU: <span style="color:${C.red}">${highRetSku ? trunc(highRetSku.product, 25) : 'N/A'}</span>`,
    `🎯 Best Achievement SKU: <span style="color:${C.cyan}">${bestAchSku ? trunc(bestAchSku.product, 25) : 'N/A'}</span>`
  ];

  document.getElementById('page-ytd').innerHTML = `
    ${renderInsightsBar(insights)}
    <div class="chart-card">
      <div class="chart-header"><div class="chart-title">📋 Full YTD Product Matrix</div></div>
      <div class="data-table-wrapper" style="max-height:500px;overflow-y:auto">
        <table class="data-table">
          <thead><tr>
            <th>#</th>
            ${thSort('SKU', 'name')}
            ${thSort('Sales 25', 's25')}
            ${thSort('Return 25 %', 'retP25')}
            ${thSort('Target 26', 'tgt26')}
            ${thSort('Sales 26', 's26')}
            ${thSort('Return 26 %', 'retP')}
            ${thSort('Ach %', 'ach26')}
            ${thSort('Growth Ton', 'gAbs')}
            ${thSort('Growth %', 'grow')}
          </tr></thead>
          <tbody>
            ${items.filter(p => p[M].s25 > 0 || p[M].s26 > 0).map((p, i) => {
              const s25 = p[M].s25, s26 = p[M].s26, t26 = p[M].tgt26, r25 = p[M].r25, r26 = p[M].r26;
              const gAbs = s26 - s25;
              const g = grow(s26, s25);
              const a = hasTgt(t26) ? ach(s26, t26) : null;
              const rp25 = retP(s25, r25);
              const rp26 = retP(s26, r26);
              return `<tr>
                <td>${i + 1}</td>
                <td>${p.product}</td>
                <td class="num">${fmt(s25)}</td>
                <td class="num">${rp25.toFixed(1)}%</td>
                <td class="num">${hasTgt(t26) ? fmt(t26) : '–'}</td>
                <td class="num" style="color:${C.cyan}">${fmt(s26)}</td>
                <td class="num" style="color:${rp26 > 10 ? C.red : rp26 > 5 ? C.gold : C.green}">${rp26.toFixed(1)}%</td>
                <td class="num">${achBadge(a)}</td>
                <td class="num">${fmt(gAbs)}</td>
                <td class="num">${badge(fmtP(g), g >= 0 ? 'badge-up' : 'badge-down')}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// PRODUCTS
// ═══════════════════════════════════════════════════════════════
function pgProducts(D) {
  const M     = STATE.measure;
  const prods = sortData(D.product_data.filter(p => p[M].s26 > 0 || p[M].s25 > 0));
  const top10Cats = sortData([...D.category_data]).sort((a,b) => b[M].s26 - a[M].s26).slice(0, 10);
  const cg    = [...D.category_data].sort((a, b) => b[M].s26 - a[M].s26);

  const bestCat = cg[0];
  const highGrowCat = [...cg].sort((a, b) => (b[M].s26 - b[M].s25) - (a[M].s26 - a[M].s25))[0];
  const highRetCat = [...cg].sort((a, b) => retP(b[M].s26, b[M].r26) - retP(a[M].s26, a[M].r26))[0];
  const bestAchCat = [...cg].filter(c => hasTgt(c[M].tgt26)).sort((a, b) => ach(b[M].s26, b[M].tgt26) - ach(a[M].s26, a[M].tgt26))[0];

  const insights = [
    `🏆 Best Category: <span style="color:${C.gold}">${bestCat ? bestCat.category : 'N/A'}</span>`,
    `📈 Highest Growth Category: <span style="color:${C.green}">${highGrowCat ? highGrowCat.category : 'N/A'}</span>`,
    `↩️ Highest Return Category: <span style="color:${C.red}">${highRetCat ? highRetCat.category : 'N/A'}</span>`,
    `🎯 Best Achievement Category: <span style="color:${C.cyan}">${bestAchCat ? bestAchCat.category : 'N/A'}</span>`
  ];

  document.getElementById('page-products').innerHTML = `
    ${renderInsightsBar(insights)}
    <div class="chart-grid cols-2">
      ${card('🏆 Top 10 Categories by Sales 2026', 'By absolute sales', cw('ch-p-top', '300'))}
      ${card('↩️ Top 10 Categories by Return %', 'Highest Return Rates', cw('ch-p-ret', '300'))}
    </div>
    <div class="chart-grid cols-1" style="margin-top:20px">
      ${card('📊 Category Performance', 'Sales & Achievement 2026', cw('ch-p-catsum', '300'))}
    </div>
    <div class="chart-card" style="margin-top:20px">
      <div class="chart-header"><div class="chart-title">📋 Category Summary</div></div>
      <table class="data-table">
        <thead><tr>
          <th>#</th>
          ${thSort('Category', 'name')}
          ${thSort('Sales 25', 's25')}
          ${thSort('Return 25 %', 'retP25')}
          ${thSort('Target 26', 'tgt26')}
          ${thSort('Sales 26', 's26')}
          ${thSort('Return 26 %', 'retP')}
          ${thSort('Ach %', 'ach26')}
          ${thSort('Growth Ton', 'gAbs')}
          ${thSort('Growth %', 'grow')}
        </tr></thead>
        <tbody>${sortData(D.category_data.map(c => ({ ...c, name: c.category }))).map((c, i) => {
          const rowId = `row-cat-${i}`;
          const s25 = c[M].s25, s26 = c[M].s26, t26 = c[M].tgt26, r25 = c[M].r25, r26 = c[M].r26;
          const gAbs = s26 - s25;
          const g = grow(s26, s25);
          const a = hasTgt(t26) ? ach(s26, t26) : null;
          const rp25 = retP(s25, r25);
          const rp26 = retP(s26, r26);
          return `<tr id="${rowId}" class="row-clickable" onclick="toggleCategoryRow('${rowId}', '${c.category}')">
            <td><span class="expand-icon">▶</span> ${i + 1}</td>
            <td style="color:${catColor(c.category)}"><strong>${c.category}</strong></td>
            <td class="num">${fmt(s25)}</td>
            <td class="num">${rp25.toFixed(1)}%</td>
            <td class="num">${hasTgt(t26) ? fmt(t26) : '–'}</td>
            <td class="num" style="color:${C.cyan}">${fmt(s26)}</td>
            <td class="num" style="color:${rp26 > 10 ? C.red : rp26 > 5 ? C.gold : C.green}">${rp26.toFixed(1)}%</td>
            <td class="num">${achBadge(a)}</td>
            <td class="num">${fmt(gAbs)}</td>
            <td class="num">${badge(fmtP(g), g >= 0 ? 'badge-up' : 'badge-down')}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>
  `;
  setTimeout(() => {
    mkChart('ch-p-top', { type: 'bar',
      data: { labels: top10Cats.map(c => wrapLabel(c.category)), datasets: [{ data: top10Cats.map(c => c[M].s26), backgroundColor: C.cyan + 'BB', borderRadius: 4 }] },
      options: barOpts(true),
    });
    const pRetCats = [...cg].filter(c => c[M].s26 > 0).map(c => ({
      name: c.category,
      rp: retP(c[M].s26, c[M].r26)
    })).sort((a,b) => b.rp - a.rp).slice(0, 10);
    mkChart('ch-p-ret', { type: 'bar',
      data: { labels: pRetCats.map(c => c.name),
        datasets: [{ data: pRetCats.map(c => c.rp),
          backgroundColor: C.red + 'CC',
          borderRadius: 4, datalabels: { formatter: v => v.toFixed(1) + '%' } }] },
      options: barOpts(true),
    });
    mkChart('ch-p-catsum', { type: 'bar',
      data: { labels: cg.map(c => wrapLabel(c.category)),
        datasets: [
          { label: '2025', data: cg.map(c => c[M].s25), backgroundColor: C.blueL + 'AA', borderRadius: 3 },
          { label: '2026', data: cg.map(c => c[M].s26), backgroundColor: cg.map(c => catColor(c.category) + 'CC'), borderRadius: 3 },
        ] },
      options: { ...barOpts(), plugins: { legend: { position: 'top' } } },
    });
  }, 50);
}

// ═══════════════════════════════════════════════════════════════
// CUSTOMERS
// ═══════════════════════════════════════════════════════════════
function pgCustomers(D) {
  const M  = STATE.measure;
  const cs = D.customer_data.filter(c => c[M].s26 > 0 || c[M].s25 > 0);

  const top10SalesArr = [...cs].sort((a,b) => b[M].s26 - a[M].s26).slice(0, 10);
  const top10SalesVal = top10SalesArr.reduce((sum, c) => sum + c[M].s26, 0);
  const totalCompanySales26 = D.meta[M].s26;
  const top10ContribPct = totalCompanySales26 ? (top10SalesVal / totalCompanySales26) * 100 : 0;
  
  const top10RetArr = [...cs].filter(c => c[M].r26 > 0).sort((a,b) => b[M].r26 - a[M].r26).slice(0, 10);
  const top10RetVal = top10RetArr.reduce((sum, c) => sum + c[M].r26, 0);

  const topSellingCust = top10SalesArr[0];
  const topRetCust = top10RetArr[0];
  const topPartialCust = [...cs].filter(c => c[M].partial26 > 0).sort((a,b) => b[M].partial26 - a[M].partial26)[0];

  const unitLabel = M === 'ton' ? 'Ton' : M === 'carton' ? 'Carton' : 'Cups';

  const insights = [
    `🏆 Top 10 Customers Sales: <span style="color:${C.gold}">${fmt(top10SalesVal)}</span> ${unitLabel}`,
    `📊 Top 10 Customers Contribution: <span style="color:${C.cyan}">${top10ContribPct.toFixed(1)}%</span> of total company sales`,
    `↩ Top 10 Customers Returns: <span style="color:${C.red}">${fmt(top10RetVal)}</span> ${unitLabel}`,
    `👤 Top Selling Customer: <span style="color:${C.cyan}">${topSellingCust ? trunc(topSellingCust.customer, 25) : 'N/A'}</span>`,
    `🔄 Top Return Customer: <span style="color:${C.red}">${topRetCust ? trunc(topRetCust.customer, 25) : 'N/A'}</span>`,
    `📦 Top Partial Return Customer: <span style="color:${C.gold}">${topPartialCust ? trunc(topPartialCust.customer, 25) : 'N/A'}</span>`
  ];

  // Classify
  const csSorted = [...cs].sort((a,b) => b[M].s26 - a[M].s26);
  const silverLen = Math.floor(csSorted.length * 0.3);
  const silver = csSorted.slice(10, 10 + silverLen);
  const bronze = csSorted.slice(10 + silverLen);
  
  const lost = D.customer_data.filter(c => c[M].s25 > 0 && c[M].s26 === 0);

  document.getElementById('page-customers').innerHTML = `
    ${renderInsightsBar(insights)}
    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr)">
      ${kpi('🥇', 'Gold (Top 10)', '10', null, 'gold', 'Best returning customers')}
      ${kpi('🥈', 'Silver', silver.length.toString(), null, 'cyan', 'Next 30%')}
      ${kpi('🥉', 'Bronze', bronze.length.toString(), null, 'blue', 'Remaining returning')}
      ${kpi('❌', 'Lost Customers', lost.length.toString(), null, 'red', 'Purchased 25, zero 26')}
    </div>
    <div class="chart-grid cols-2">
      ${card('🏆 Top 10 Customers (Gold)', 'By sales 2026', cw('ch-c-top', '300'))}
      ${card('↩️ Top 10 by Return Ton', 'Sorted by Return Ton ↓', cw('ch-c-ret', '300'))}
    </div>
    <div class="chart-card" style="margin-top:20px">
      <div class="chart-header"><div class="chart-title">📋 Customer Detail Table</div></div>
      <div class="data-table-wrapper" style="max-height:400px;overflow-y:auto">
        <table class="data-table">
          <thead><tr>
            <th>#</th>
            ${thSort('Customer', 'name')}
            ${thSort('Sales 25', 's25')}
            ${thSort('Return 25 %', 'retP25')}
            ${thSort('Sales 26', 's26')}
            ${thSort('Return 26 %', 'retP')}
            ${thSort('Growth Ton', 'gAbs')}
            ${thSort('Growth %', 'grow')}
          </tr></thead>
          <tbody>${sortData(cs.map(c => ({ ...c, name: c.customer }))).map((c, i) => {
            const rowId = `row-cust-${i}`;
            const s25 = c[M].s25, s26 = c[M].s26, t26 = c[M].tgt26, r25 = c[M].r25, r26 = c[M].r26;
            const gAbs = s26 - s25;
            const g = grow(s26, s25), a = hasTgt(t26) ? ach(s26, t26) : null;
            const rp25 = retP(s25, r25);
            const rp26 = retP(s26, r26);
            const tier = i < 10 ? '🥇' : i < 10 + silver.length ? '🥈' : '🥉';
            return `<tr id="${rowId}" class="row-clickable" onclick="toggleCustomerRow('${rowId}', '${c.customer}')">
              <td><span class="expand-icon">▶</span> ${tier} ${i + 1}</td>
              <td><strong>${trunc(c.customer, 28)}</strong></td>
              <td class="num">${fmt(s25)}</td>
              <td class="num">${rp25.toFixed(1)}%</td>
              <td class="num" style="color:${C.cyan}">${fmt(s26)}</td>
              <td class="num" style="color:${rp26 > 10 ? C.red : rp26 > 5 ? C.gold : C.green}">${rp26.toFixed(1)}%</td>
              <td class="num">${fmt(gAbs)}</td>
              <td class="num">${badge(fmtP(g), g >= 0 ? 'badge-up' : 'badge-down')}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>
    </div>
    <div class="chart-card" style="margin-top:20px">
      <div class="chart-header"><div class="chart-title">❌ Lost Customers</div></div>
      <div class="data-table-wrapper" style="max-height:250px;overflow-y:auto">
        <table class="data-table">
          <thead><tr><th>#</th><th>Customer</th><th>Channel</th><th class="num">Sales 25</th><th class="num">Returns 25</th></tr></thead>
          <tbody>${lost.map((c, i) => `<tr><td>${i + 1}</td><td>${trunc(c.customer, 28)}</td><td>${c.channel || '–'}</td><td class="num">${fmt(c[M].s25)}</td><td class="num">${fmt(c[M].r25)}</td></tr>`).join('')}</tbody>
        </table>
      </div>
    </div>
  `;
  setTimeout(() => {
    mkChart('ch-c-top', { type: 'bar',
      data: { labels: csSorted.slice(0, 10).map(c => wrapLabel(c.customer)), datasets: [{ data: csSorted.slice(0, 10).map(c => c[M].s26), backgroundColor: C.gold + 'CC', borderRadius: 4 }] },
      options: barOpts(true),
    });
    const topRet = [...cs].filter(c => c[M].r26 > 0).sort((a, b) => b[M].r26 - a[M].r26).slice(0, 10);
    mkChart('ch-c-ret', { type: 'bar',
      data: { labels: topRet.map(c => wrapLabel(c.customer)), datasets: [{ data: topRet.map(c => c[M].r26), backgroundColor: C.red + 'CC', borderRadius: 4 }] },
      options: barOpts(true),
    });
  }, 50);
}

// ═══════════════════════════════════════════════════════════════
// CHANNELS
// ═══════════════════════════════════════════════════════════════
function pgChannels(D) {
  const M    = STATE.measure;
  const tab  = STATE.chTab;
  const validChannels = ['KA', 'KR', 'Online', 'B2B', 'TT', 'DIS'];
  const chs  = sortData(D.channel_data.filter(c => validChannels.includes(c.channel) && (c[M].s26 > 0 || c[M].s25 > 0)).map(c => ({ ...c, name: c.channel })));
  const filtCh = STATE.chFilter;
  const chList = validChannels;

  const bestChan = [...chs].sort((a, b) => b[M].s26 - a[M].s26)[0];
  const highGrow = [...chs].filter(c => c[M].s25 > 0).sort((a,b) => grow(b[M].s26, b[M].s25) - grow(a[M].s26, a[M].s25))[0] || [...chs].sort((a,b) => (b[M].s26 - b[M].s25) - (a[M].s26 - a[M].s25))[0];
  const lowRet = [...chs].sort((a, b) => retP(a[M].s26, a[M].r26) - retP(b[M].s26, b[M].r26))[0];

  const insights = [
    `🏪 Best Channel: <span style="color:${C.gold}">${bestChan ? bestChan.channel : 'N/A'}</span>`,
    `📈 Highest Growth Channel: <span style="color:${C.green}">${highGrow ? highGrow.channel : 'N/A'}</span>`,
    `↘ Lowest Return Channel: <span style="color:${C.cyan}">${lowRet ? lowRet.channel : 'N/A'}</span>`
  ];

  document.getElementById('page-channels').innerHTML = `
    ${renderInsightsBar(insights)}
    <div class="channel-controls">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <label style="font-size:12px;color:#8899bb">Channel:</label>
        <select id="ch-filter-sel" class="ch-select">
          <option value="">All Channels</option>
          ${chList.map(c => `<option value="${c}" ${filtCh === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="ch-tabs">
      <button class="ch-tab ${tab === 'sales'     ? 'active' : ''}" data-tab="sales">📊 Sales</button>
      <button class="ch-tab ${tab === 'returns'   ? 'active' : ''}" data-tab="returns">↩️ Returns</button>
      <button class="ch-tab ${tab === 'customers' ? 'active' : ''}" data-tab="customers">👥 Customers</button>
    </div>
    <div id="ch-tab-content"></div>
  `;

  // Tab events
  document.querySelectorAll('.ch-tab').forEach(btn => {
    btn.addEventListener('click', () => { STATE.chTab = btn.dataset.tab; pgChannels(D); });
  });

  // Channel filter
  document.getElementById('ch-filter-sel').addEventListener('change', e => {
    STATE.chFilter = e.target.value || null;
    pgChannels(D);
  });

  const view = filtCh ? chs.filter(c => c.channel === filtCh) : chs;

  if (tab === 'sales') {
    document.getElementById('ch-tab-content').innerHTML = `
      <div class="chart-grid cols-2">
        ${card('📊 Sales by Channel', '2025 vs 2026', cw('ch-ch-bars', '300'))}
        ${card('📈 Growth by Channel', 'Year over Year %', cw('ch-ch-grow', '300'))}
      </div>
      <div class="chart-card" style="margin-top:20px">
        <div class="chart-header"><div class="chart-title">📋 Channel Sales Table</div></div>
        <table class="data-table">
          <thead><tr>
            <th>#</th>
            ${thSort('Channel', 'name')}
            ${thSort('Sales 25', 's25')}
            ${thSort('Return 25 %', 'retP25')}
            ${thSort('Target 26', 'tgt26')}
            ${thSort('Sales 26', 's26')}
            ${thSort('Return 26 %', 'retP')}
            ${thSort('Ach %', 'ach26')}
            ${thSort('Growth Ton', 'gAbs')}
            ${thSort('Growth %', 'grow')}
          </tr></thead>
          <tbody>${sortData(view.map(c => ({ ...c, name: c.channel }))).map((c, i) => {
            const rowId = `row-chan-${i}`;
            const s25 = c[M].s25, s26 = c[M].s26, t26 = c[M].tgt26, r25 = c[M].r25, r26 = c[M].r26;
            const gAbs = s26 - s25;
            const g = grow(s26, s25), a = hasTgt(t26) ? ach(s26, t26) : null;
            const rp25 = retP(s25, r25);
            const rp26 = retP(s26, r26);
            return `<tr id="${rowId}" class="row-clickable" onclick="toggleChannelRow('${rowId}', '${c.channel}')">
              <td><span class="expand-icon">▶</span> ${i + 1}</td>
              <td><strong>${c.channel}</strong></td>
              <td class="num">${fmt(s25)}</td>
              <td class="num">${rp25.toFixed(1)}%</td>
              <td class="num">${hasTgt(t26) ? fmt(t26) : '–'}</td>
              <td class="num" style="color:${C.cyan}">${fmt(s26)}</td>
              <td class="num" style="color:${rp26 > 10 ? C.red : rp26 > 5 ? C.gold : C.green}">${rp26.toFixed(1)}%</td>
              <td class="num">${achBadge(a)}</td>
              <td class="num">${fmt(gAbs)}</td>
              <td class="num">${badge(fmtP(g), g >= 0 ? 'badge-up' : 'badge-down')}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>
      <div id="ch-sku-details"></div>
    `;
    setTimeout(() => {
      mkChart('ch-ch-bars', { type: 'bar',
        data: { labels: view.map(c => c.channel),
          datasets: [
            { label: '2025', data: view.map(c => c[M].s25), backgroundColor: C.blueL + 'CC', borderRadius: 3 },
            { label: '2026', data: view.map(c => c[M].s26), backgroundColor: C.cyan  + 'CC', borderRadius: 3 },
          ] },
        options: { ...barOpts(), plugins: { legend: { position: 'top' } } },
      });
      mkChart('ch-ch-grow', { type: 'bar',
        data: { labels: view.map(c => c.channel),
          datasets: [{ data: view.map(c => grow(c[M].s26, c[M].s25)),
            backgroundColor: view.map(c => grow(c[M].s26, c[M].s25) >= 0 ? C.green + 'CC' : C.red + 'CC'),
            borderRadius: 4, datalabels: { formatter: v => fmtP(v) } }] },
        options: barOpts(),
      });
    }, 50);

    const renderTables = (data, chName) => {
      const skuView = data.product_data.filter(c => c[M].s26 > 0 || c[M].s25 > 0);
      skuView.sort((a,b) => b[M].s26 - a[M].s26);
      
      const catView = data.category_data.filter(c => c[M].s26 > 0 || c[M].s25 > 0);
      catView.sort((a,b) => b[M].s26 - a[M].s26);

      const titleSuffix = chName ? chName : 'All Channels';

      return `
        <div class="chart-card" style="margin-top:20px">
          <div class="chart-header"><div class="chart-title">📋 Category Summary – ${titleSuffix}</div></div>
          <table class="data-table">
            <thead><tr>
              <th style="text-align:left">Category</th>
              <th style="text-align:right">Sales 25</th>
              <th style="text-align:right">Return 25 %</th>
              <th style="text-align:right">Target 26</th>
              <th style="text-align:right">Sales 26</th>
              <th style="text-align:right">Return 26 %</th>
              <th style="text-align:center">Achievement 26 %</th>
              <th style="text-align:right">Growth Ton</th>
              <th style="text-align:center">Growth %</th>
            </tr></thead>
            <tbody>${catView.map(c => {
              const s25 = c[M].s25, s26 = c[M].s26, t26 = c[M].tgt26, r25 = c[M].r25, r26 = c[M].r26;
              const gAbs = s26 - s25;
              const g = grow(s26, s25), a = hasTgt(t26) ? ach(s26, t26) : null;
              const rp25 = retP(s25, r25);
              const rp26 = retP(s26, r26);
              return `<tr>
                <td style="text-align:left; color:${catColor(c.category)}; font-weight:bold;">${c.category}</td>
                <td class="num">${fmt(s25)}</td>
                <td class="num">${rp25.toFixed(1)}%</td>
                <td class="num">${hasTgt(t26) ? fmt(t26) : '–'}</td>
                <td class="num" style="color:${C.cyan}">${fmt(s26)}</td>
                <td class="num" style="color:${rp26 > 10 ? C.red : rp26 > 5 ? C.gold : C.green}">${rp26.toFixed(1)}%</td>
                <td class="num">${achBadge(a)}</td>
                <td class="num">${fmt(gAbs)}</td>
                <td class="num">${badge(fmtP(g), g >= 0 ? 'badge-up' : 'badge-down')}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div>

        <div class="chart-card" style="margin-top:20px">
          <div class="chart-header"><div class="chart-title">📋 Full YTD Product Matrix – ${titleSuffix}</div></div>
          <table class="data-table">
            <thead><tr>
              <th style="text-align:left">SKU</th>
              <th style="text-align:left">Category</th>
              <th style="text-align:right">Sales 25</th>
              <th style="text-align:right">Return 25 %</th>
              <th style="text-align:right">Target 26</th>
              <th style="text-align:right">Sales 26</th>
              <th style="text-align:right">Return 26 %</th>
              <th style="text-align:center">Achievement 26 %</th>
              <th style="text-align:right">Growth Ton</th>
              <th style="text-align:center">Growth %</th>
            </tr></thead>
            <tbody>${skuView.map(c => {
              const s25 = c[M].s25, s26 = c[M].s26, t26 = c[M].tgt26, r25 = c[M].r25, r26 = c[M].r26;
              const gAbs = s26 - s25;
              const g = grow(s26, s25), a = hasTgt(t26) ? ach(s26, t26) : null;
              const rp25 = retP(s25, r25);
              const rp26 = retP(s26, r26);
              return `<tr>
                <td style="text-align:left"><strong>${c.product}</strong><br><span style="font-size:10px;opacity:0.6">${c.code}</span></td>
                <td style="text-align:left; color:${catColor(c.category)}; font-weight:bold;">${c.category}</td>
                <td class="num">${fmt(s25)}</td>
                <td class="num">${rp25.toFixed(1)}%</td>
                <td class="num">${hasTgt(t26) ? fmt(t26) : '–'}</td>
                <td class="num" style="color:${C.cyan}">${fmt(s26)}</td>
                <td class="num" style="color:${rp26 > 10 ? C.red : rp26 > 5 ? C.gold : C.green}">${rp26.toFixed(1)}%</td>
                <td class="num">${achBadge(a)}</td>
                <td class="num">${fmt(gAbs)}</td>
                <td class="num">${badge(fmtP(g), g >= 0 ? 'badge-up' : 'badge-down')}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div>
      `;
    };

    if (filtCh) {
      document.getElementById('ch-sku-details').innerHTML = `<div class="chart-card" style="margin-top:20px; text-align:center; padding:40px; color:${C.gray}">Loading details for ${filtCh}...</div>`;
      fetch(`/api/data?months=${STATE.months.join(',')}&channel=${encodeURIComponent(filtCh)}`)
        .then(res => res.json())
        .then(data => {
          document.getElementById('ch-sku-details').innerHTML = renderTables(data, filtCh);
        })
        .catch(err => {
          document.getElementById('ch-sku-details').innerHTML = `<div class="chart-card" style="margin-top:20px; text-align:center; padding:20px; color:${C.red}">Error loading details: ${err.message}</div>`;
          console.error(err);
        });
    } else {
      document.getElementById('ch-sku-details').innerHTML = renderTables(D, null);
    }

  } else if (tab === 'returns') {
    document.getElementById('ch-tab-content').innerHTML = `
      <div class="chart-grid cols-2">
        ${card('↩️ Returns by Channel', '2025 vs 2026', cw('ch-ch-ret', '300'))}
        ${card('📉 Return Rate %', 'By channel', cw('ch-ch-retp', '300'))}
      </div>
    `;
    setTimeout(() => {
      mkChart('ch-ch-ret', { type: 'bar',
        data: { labels: view.map(c => c.channel),
          datasets: [
            { label: '2025', data: view.map(c => c[M].r25), backgroundColor: C.blueL + 'AA', borderRadius: 3 },
            { label: '2026', data: view.map(c => c[M].r26), backgroundColor: C.red + 'CC',   borderRadius: 3 },
          ] },
        options: { ...barOpts(), plugins: { legend: { position: 'top' } } },
      });
      mkChart('ch-ch-retp', { type: 'bar',
        data: { labels: view.map(c => c.channel),
          datasets: [{ data: view.map(c => retP(c[M].s26, c[M].r26)),
            backgroundColor: view.map(c => retP(c[M].s26, c[M].r26) > 10 ? C.red + 'CC' : C.green + 'CC'),
            borderRadius: 4, datalabels: { formatter: v => v.toFixed(1) + '%' } }] },
        options: barOpts(),
      });
    }, 50);

  } else {
    // Customers tab
    document.getElementById('ch-tab-content').innerHTML = `
      <div class="chart-grid cols-2">
        ${card('👥 Customers per Channel', '2025 vs 2026', cw('ch-ch-custs', '300'))}
        ${card('👥 Customer Count Change', 'Δ 2026 vs 2025', cw('ch-ch-custΔ', '300'))}
      </div>
    `;
    setTimeout(() => {
      mkChart('ch-ch-custs', { type: 'bar',
        data: { labels: view.map(c => c.channel),
          datasets: [
            { label: '2025', data: view.map(c => c.customers_25 || 0), backgroundColor: C.blueL + 'CC', borderRadius: 3 },
            { label: '2026', data: view.map(c => c.customers_26 || 0), backgroundColor: C.cyan  + 'CC', borderRadius: 3 },
          ] },
        options: { ...barOpts(), plugins: { legend: { position: 'top' } } },
      });
      mkChart('ch-ch-custΔ', { type: 'bar',
        data: { labels: view.map(c => c.channel),
          datasets: [{ data: view.map(c => (c.customers_26 || 0) - (c.customers_25 || 0)),
            backgroundColor: view.map(c => ((c.customers_26 || 0) - (c.customers_25 || 0)) >= 0 ? C.green + 'CC' : C.red + 'CC'),
            borderRadius: 4, datalabels: { formatter: v => (v >= 0 ? '+' : '') + v } }] },
        options: barOpts(),
      });
    }, 50);
  }
}

// ═══════════════════════════════════════════════════════════════
// RETURNS
// ═══════════════════════════════════════════════════════════════
function pgReturns(D) {
  const M    = STATE.measure;
  const cats = [...D.category_data].filter(c => c[M].r25 > 0 || c[M].r26 > 0).sort((a, b) => b[M].r26 - a[M].r26);
  const topRetSkus = sortData([...D.product_data]).sort((a, b) => b[M].r26 - a[M].r26).slice(0, 10);

  const highRetCat = [...D.category_data].filter(c => c[M].r26 > 0).sort((a, b) => b[M].r26 - a[M].r26)[0];
  const highRetSku = [...D.product_data].filter(c => c[M].r26 > 0).sort((a, b) => b[M].r26 - a[M].r26)[0];
  const mm = D.meta[M];
  const overallRetP = retP(mm.s26, mm.r26);

  const insights = [
    `↩️ Highest Return Category: <span style="color:${C.red}">${highRetCat ? highRetCat.category : 'N/A'}</span>`,
    `↩️ Highest Return SKU: <span style="color:${C.red}">${highRetSku ? trunc(highRetSku.product, 25) : 'N/A'}</span>`,
    `📉 Lowest Return Rate: <span style="color:${C.cyan}">${overallRetP.toFixed(1)}%</span>`,
    `🔄 Partial Returns: <span style="color:${C.gold}">${fmt(mm.partial26)}</span>`
  ];

  document.getElementById('page-returns').innerHTML = `
    ${renderInsightsBar(insights)}
    <div class="chart-grid cols-2">
      ${card('📅 Monthly Return Trend', '2025 vs 2026', cw('ch-r-mon', '300'))}
      ${card('🗂️ Return Volume by Category', '', cw('ch-r-cat', '300'))}
    </div>
    <div class="chart-grid cols-2" style="margin-top:20px">
      ${card('📦 Top 10 SKU by Return Ton', 'Absolute Returns', cw('ch-r-skus', '300'))}
      ${card('📊 Partial Returns by Category', '', cw('ch-r-partial', '300'))}
    </div>
    <div class="chart-card" style="margin-top:20px">
      <div class="chart-header"><div class="chart-title">📋 Return Details (Category Level)</div></div>
      <table class="data-table">
        <thead><tr>
          <th>Category</th><th class="num">Return 25</th><th class="num">Return 26</th>
          <th class="num">Ret% 25</th><th class="num">Ret% 26</th>
        </tr></thead>
        <tbody>${cats.map(c => {
          const r25 = c[M].r25, r26 = c[M].r26;
          const rp25 = retP(c[M].s25, r25), rp26 = retP(c[M].s26, r26);
          return `<tr>
            <td style="color:${catColor(c.category)}">${c.category}</td>
            <td class="num">${fmt(r25)}</td>
            <td class="num" style="color:${C.red}">${fmt(r26)}</td>
            <td class="num">${rp25.toFixed(1)}%</td>
            <td class="num" style="color:${rp26 > rp25 ? C.red : C.green}">${rp26.toFixed(1)}%</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>
  `;
  setTimeout(() => {
    const md = [...D.monthly_data].filter(x => STATE.months.includes(x.month_id)).sort((a, b) => a.month_id - b.month_id);
    mkChart('ch-r-mon', { type: 'line',
      data: { labels: md.map(x => x.month_short),
        datasets: [
          { label: '2025', data: md.map(x => x[M].r25), borderColor: C.blueL, fill: false, borderWidth: 2 },
          { label: '2026', data: md.map(x => x[M].r26), borderColor: C.red,   fill: false, borderWidth: 2.5 },
        ] },
      options: lineOpts(),
    });
    mkChart('ch-r-cat', { type: 'bar',
      data: { labels: cats.map(c => c.category),
        datasets: [
          { label: '2025', data: cats.map(c => c[M].r25), backgroundColor: C.blueL + 'AA', borderRadius: 3 },
          { label: '2026', data: cats.map(c => c[M].r26), backgroundColor: C.red   + 'CC', borderRadius: 3 },
        ] },
      options: { ...barOpts(), plugins: { legend: { position: 'top' } } },
    });
    mkChart('ch-r-skus', { type: 'bar',
      data: { labels: topRetSkus.map(c => wrapLabel(c.product)), datasets: [{ data: topRetSkus.map(c => c[M].r26), backgroundColor: C.red + 'CC', borderRadius: 4 }] },
      options: barOpts(true),
    });
    mkChart('ch-r-partial', { type: 'bar',
      data: { labels: cats.map(c => c.category),
        datasets: [{ data: cats.map(c => c[M].partial26 ?? 0), backgroundColor: C.orange + 'CC', borderRadius: 4, label: 'Partial' }] },
      options: { ...barOpts(), plugins: { legend: { display: false } } },
    });
  }, 50);
}

// ═══════════════════════════════════════════════════════════════
// GROWTH
// ═══════════════════════════════════════════════════════════════
function pgGrowth(D) {
  const M    = STATE.measure;
  const cats = sortData(D.category_data.map(c => ({ ...c, name: c.category }))).filter(c => c[M].s25 > 0 || c[M].s26 > 0);

  const fastCat = [...D.category_data].filter(c => c[M].s26 > 0).sort((a, b) => (b[M].s26 - b[M].s25) - (a[M].s26 - a[M].s25))[0];
  const fastSku = [...D.product_data].filter(c => c[M].s26 > 0).sort((a, b) => (b[M].s26 - b[M].s25) - (a[M].s26 - a[M].s25))[0];
  const fastCust = [...D.customer_data].filter(c => c[M].s26 > 0).sort((a, b) => (b[M].s26 - b[M].s25) - (a[M].s26 - a[M].s25))[0];
  const fastChan = [...D.channel_data].filter(c => c[M].s26 > 0).sort((a, b) => (b[M].s26 - b[M].s25) - (a[M].s26 - a[M].s25))[0];

  const insights = [
    `📈 Fastest Growing Category: <span style="color:${C.green}">${fastCat ? fastCat.category : 'N/A'}</span>`,
    `📈 Fastest Growing SKU: <span style="color:${C.green}">${fastSku ? trunc(fastSku.product, 25) : 'N/A'}</span>`,
    `📈 Fastest Growing Customer: <span style="color:${C.green}">${fastCust ? trunc(fastCust.customer, 25) : 'N/A'}</span>`,
    `📈 Fastest Growing Channel: <span style="color:${C.green}">${fastChan ? fastChan.channel : 'N/A'}</span>`
  ];

  document.getElementById('page-growth').innerHTML = `
    ${renderInsightsBar(insights)}
    <div class="chart-grid cols-2">
      ${card('📊 Growth Variance by Category', 'Absolute Δ (2026 − 2025)', cw('ch-g-cat', '350'))}
      ${card('📈 Growth % by Category', 'Relative Δ', cw('ch-g-catp', '350'))}
    </div>
    <div class="chart-card" style="margin-top:20px">
      <div class="chart-header"><div class="chart-title">📋 Growth Detail Table</div></div>
      <table class="data-table">
        <thead><tr>
          ${thSort('Category', 'name')}
          ${thSort('Sales 25', 's25')}
          ${thSort('Sales 26', 's26')}
          ${thSort('Growth Δ', 'grow')}
          ${thSort('Achievement', 'ach26')}
        </tr></thead>
        <tbody>${cats.map(c => {
          const g = grow(c[M].s26, c[M].s25);
          const a = hasTgt(c[M].tgt26) ? ach(c[M].s26, c[M].tgt26) : null;
          return `<tr>
            <td style="color:${catColor(c.category)}">${c.category}</td>
            <td class="num">${fmt(c[M].s25)}</td>
            <td class="num" style="color:${C.cyan}">${fmt(c[M].s26)}</td>
            <td class="num">${badge(fmtP(g), g >= 0 ? 'badge-up' : 'badge-down')}</td>
            <td class="num">${achBadge(a)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>
  `;
  setTimeout(() => {
    const sorted = [...cats].sort((a, b) => (b[M].s26 - b[M].s25) - (a[M].s26 - a[M].s25));
    mkChart('ch-g-cat', { type: 'bar',
      data: { labels: sorted.map(c => wrapLabel(c.category)),
        datasets: [{ data: sorted.map(c => c[M].s26 - c[M].s25),
          backgroundColor: sorted.map(c => c[M].s26 >= c[M].s25 ? C.green + 'CC' : C.red + 'CC'),
          borderRadius: 4, datalabels: { formatter: v => (v >= 0 ? '+' : '') + fmt(v) } }] },
      options: barOpts(true),
    });
    const sortedP = [...cats].sort((a, b) => grow(b[M].s26, b[M].s25) - grow(a[M].s26, a[M].s25));
    mkChart('ch-g-catp', { type: 'bar',
      data: { labels: sortedP.map(c => wrapLabel(c.category)),
        datasets: [{ data: sortedP.map(c => grow(c[M].s26, c[M].s25)),
          backgroundColor: sortedP.map(c => grow(c[M].s26, c[M].s25) >= 0 ? C.green + 'CC' : C.red + 'CC'),
          borderRadius: 4, datalabels: { formatter: v => fmtP(v) } }] },
      options: barOpts(true),
    });
  }, 50);
}

// ═══════════════════════════════════════════════════════════════
// MONTHLY
// ═══════════════════════════════════════════════════════════════
function pgMonthly(D) {
  const M  = STATE.measure;
  const md = [...D.monthly_data].sort((a, b) => a.month_id - b.month_id);
  document.getElementById('page-monthly').innerHTML = `
    <div class="chart-grid cols-1">
      ${card('📅 Monthly Detail', 'Sales 2025 vs 2026 vs Target', cw('ch-m-bar', '350'))}
    </div>
    <div class="chart-card" style="margin-top:20px">
      <table class="data-table">
        <thead><tr>
          <th>Month</th>
          <th class="num">Sales 25</th><th class="num">Sales 26</th>
          <th class="num">Growth</th>
          <th class="num">Target 26</th><th class="num">Ach%</th>
          <th class="num">Return 26</th>
        </tr></thead>
        <tbody>${md.map(x => {
          const s25 = x[M].s25, s26 = x[M].s26, t26 = x[M].tgt26, r26 = x[M].r26;
          const g = grow(s26, s25), a = hasTgt(t26) ? ach(s26, t26) : null;
          return `<tr>
            <td><strong>${x.month_name}</strong> ${x.in_ytd ? badge('YTD', 'badge-new') : ''}</td>
            <td class="num">${fmt(s25)}</td>
            <td class="num" style="color:${C.cyan}">${fmt(s26)}</td>
            <td class="num">${badge(fmtP(g), g >= 0 ? 'badge-up' : 'badge-down')}</td>
            <td class="num">${hasTgt(t26) ? fmt(t26) : '–'}</td>
            <td class="num">${achBadge(a)}</td>
            <td class="num" style="color:${C.red}">${fmt(r26)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>
  `;
  setTimeout(() => {
    mkChart('ch-m-bar', { type: 'bar',
      data: { labels: md.map(x => x.month_short),
        datasets: [
          { label: '2025', data: md.map(x => x[M].s25), backgroundColor: C.blueL + 'AA', borderRadius: 3 },
          { label: '2026', data: md.map(x => x[M].s26), backgroundColor: C.cyan  + 'CC', borderRadius: 3 },
          { label: 'Target 26', data: md.map(x => x[M].tgt26), type: 'line', borderColor: C.gold, borderDash: [4, 4], fill: false, pointRadius: 0, datalabels: { display: false } },
        ] },
      options: { ...barOpts(), plugins: { legend: { position: 'top' } } },
    });
  }, 50);
}

// ═══════════════════════════════════════════════════════════════
// QUARTERLY
// ═══════════════════════════════════════════════════════════════
function pgQuarterly(D) {
  const M  = STATE.measure;
  const qm = STATE.period === 'q1' ? [1,2,3] : STATE.period === 'q2' ? [4,5,6] : STATE.months;
  const fil = [...D.monthly_data].filter(x => qm.includes(x.month_id)).sort((a, b) => a.month_id - b.month_id);

  let s25 = 0, s26 = 0, t26 = 0, r25 = 0, r26 = 0;
  fil.forEach(x => { s25 += x[M].s25; s26 += x[M].s26; if (x[M].tgt26) t26 += x[M].tgt26; r25 += x[M].r25; r26 += x[M].r26; });
  const g = grow(s26, s25), a = hasTgt(t26) ? ach(s26, t26) : null;

  document.getElementById('page-quarterly').innerHTML = `
    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr)">
      ${kpi('💰', 'Sales 2026', fmt(s26), null, 'cyan', `Target: ${hasTgt(t26) ? fmt(t26) : 'N/A'}`)}
      ${kpi('📅', 'Sales 2025', fmt(s25), null, 'blue', '')}
      ${kpi('📈', 'Growth', fmtP(g), g, 'green', '')}
      ${kpi('🎯', 'Achievement', a != null ? a.toFixed(1) + '%' : 'N/A', a != null ? a - 100 : null, 'cyan', '')}
    </div>
    <div class="chart-grid cols-2" style="margin-top:20px">
      ${card('📊 Sales by Month', '', cw('ch-q-sales', '300'))}
      ${card('↩️ Returns by Month', '', cw('ch-q-ret', '300'))}
    </div>
  `;
  setTimeout(() => {
    mkChart('ch-q-sales', { type: 'bar',
      data: { labels: fil.map(x => x.month_short),
        datasets: [
          { label: '2025', data: fil.map(x => x[M].s25), backgroundColor: C.blueL + 'AA', borderRadius: 3 },
          { label: '2026', data: fil.map(x => x[M].s26), backgroundColor: C.cyan  + 'CC', borderRadius: 3 },
        ] },
      options: { ...barOpts(), plugins: { legend: { position: 'top' } } },
    });
    mkChart('ch-q-ret', { type: 'bar',
      data: { labels: fil.map(x => x.month_short),
        datasets: [
          { label: '2025', data: fil.map(x => x[M].r25), backgroundColor: C.blueL + 'AA', borderRadius: 3 },
          { label: '2026', data: fil.map(x => x[M].r26), backgroundColor: C.red   + 'CC', borderRadius: 3 },
        ] },
      options: { ...barOpts(), plugins: { legend: { position: 'top' } } },
    });
  }, 50);
}

// ═══════════════════════════════════════════════════════════════
// LOADING UI
// ═══════════════════════════════════════════════════════════════
function setLoaderText(t) {
  const el = document.getElementById('loader-text');
  if (el) el.textContent = t;
}
function showLoader() {
  const ov = document.getElementById('loading-overlay');
  if (ov) { ov.classList.remove('hidden'); ov.style.display = ''; }
}
function hideLoader() {
  const ov = document.getElementById('loading-overlay');
  if (ov) { ov.classList.add('hidden'); setTimeout(() => { if (ov.classList.contains('hidden')) ov.style.display = 'none'; }, 500); }
}

// ═══════════════════════════════════════════════════════════════
// AUTHENTICATION
// ═══════════════════════════════════════════════════════════════
const AUTH_USER = 'GrekoEgypt';
const AUTH_PASS = 'Greko@2026';
let IS_LOGGED_IN = false;

function isLoggedIn() { return IS_LOGGED_IN; }

function showLogin() {
  hideLoader();
  document.getElementById('login-page').style.display = '';
  document.getElementById('dashboard').style.display  = 'none';
}

function showDashboard() {
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('dashboard').style.display  = '';
}

function setupAuth() {
  const btn  = document.getElementById('login-btn');
  const uInp = document.getElementById('login-user');
  const pInp = document.getElementById('login-pass');
  const err  = document.getElementById('login-error');

  function doLogin() {
    const u = uInp.value.trim();
    const p = pInp.value;
    if (u === AUTH_USER && p === AUTH_PASS) {
      IS_LOGGED_IN = true;
      err.style.display = 'none';
      showDashboard();
      loadAndRender();
    } else {
      err.style.display = '';
      pInp.value = '';
      pInp.focus();
    }
  }

  btn.addEventListener('click', doLogin);
  [uInp, pInp].forEach(inp => inp.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); }));

  document.getElementById('logout-btn').addEventListener('click', () => {
    IS_LOGGED_IN = false;
    location.reload();
  });
}

// ═══════════════════════════════════════════════════════════════
// MAIN LOAD & RENDER
// ═══════════════════════════════════════════════════════════════
async function loadAndRender() {
  showLoader();
  setLoaderText('Fetching data…');
  try {
    STATE.data = await fetchData(STATE.months);
    const period = STATE.data.meta.period || '';
    document.getElementById('ytd-label-top').textContent = period;
    document.getElementById('last-update').textContent   = period;
    hideLoader();
    go('home');
  } catch (e) {
    console.error('Load error:', e);
    const txt = document.getElementById('loader-text');
    txt.style.whiteSpace = 'pre-wrap';
    txt.style.textAlign = 'left';
    txt.style.fontFamily = 'monospace';
    txt.style.fontSize = '12px';
    txt.style.maxWidth = '80vw';
    txt.textContent = e.message || 'Error loading data.';
    document.getElementById('loading-overlay').classList.add('error');
  }
}

async function reloadForPeriod() {
  showLoader();
  setLoaderText('Loading…');
  try {
    STATE.data = await fetchData(STATE.months);
    const period = STATE.data.meta.period || '';
    document.getElementById('ytd-label-top').textContent = period;
    document.getElementById('last-update').textContent   = period;
    hideLoader();
    renderPage();
  } catch (e) {
    console.error('Reload error:', e);
    const txt = document.getElementById('loader-text');
    txt.style.whiteSpace = 'pre-wrap';
    txt.style.textAlign = 'left';
    txt.style.fontFamily = 'monospace';
    txt.style.fontSize = '12px';
    txt.style.maxWidth = '80vw';
    txt.textContent = e.message || 'Error loading data.';
    document.getElementById('loading-overlay').classList.add('error');
  }
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
function init() {
  setupAuth();

  // ── Period slicer ────────────────────────────────────────────
  document.querySelectorAll('#period-slicer .measure-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      document.querySelectorAll('#period-slicer .measure-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      STATE.period = e.target.dataset.period;
      STATE.months = PERIOD_MONTHS[STATE.period] || [1,2,3,4,5,6];
      reloadForPeriod();
    });
  });

  // ── Measure slicer ───────────────────────────────────────────
  document.querySelectorAll('#measure-slicer .measure-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      document.querySelectorAll('#measure-slicer .measure-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      STATE.measure = e.target.dataset.measure;
      currentSort = { field: 's26', desc: true };
      renderPage();
    });
  });

  // ── Nav ──────────────────────────────────────────────────────
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', e => { e.preventDefault(); go(el.dataset.page); });
  });

  // ── Mobile sidebar ───────────────────────────────────────────
  document.getElementById('menu-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  // ── Initial load ─────────────────────────────────────────────
  if (!isLoggedIn()) {
    showLogin();
    return;
  }

  showDashboard();
  loadAndRender();
}

document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', init)
  : init();

// ---------------------------------------------------------------

// ═══════════════════════════════════════════════════════════════
// AI BUSINESS ASSISTANT PAGE
// ═══════════════════════════════════════════════════════════════
(function () {
  /* ── State ─────────────────────────────────────────────────── */
  let AI_HISTORY  = [];   // { role:'user'|'assistant', text, time }
  let AI_LOADING  = false;
  let AI_RENDERED = false;

  const CHIPS = [
    { label: 'Executive Summary', prompt: 'Give me an executive summary of the current data.' },
    { label: 'Monthly Performance', prompt: 'Analyze the monthly performance trends.' },
    { label: 'Compare Categories', prompt: 'Compare sales across different categories.' },
    { label: 'Top Customers', prompt: 'Who are our top customers?' },
    { label: 'Top Products', prompt: 'What are the top selling products?' },
    { label: 'Return Analysis', prompt: 'Analyze the product returns.' },
    { label: 'Growth Analysis', prompt: 'Provide a growth analysis.' },
    { label: 'Sales Forecast', prompt: 'What is the sales forecast based on this data?' },
    { label: 'Business Risks', prompt: 'Identify key business risks in this data.' },
    { label: 'Management Report', prompt: 'Draft a short management report.' },
    { label: 'Action Plan', prompt: 'Suggest an action plan.' },
    { label: 'Generate Email', prompt: 'Generate an email to the sales team summarizing this data.' },
    { label: 'Generate PowerPoint Summary', prompt: 'Generate bullet points for a PowerPoint presentation.' },
    { label: 'Generate Meeting Notes', prompt: 'Generate meeting notes discussing these results.' },
    { label: 'Generate Executive Insights', prompt: 'Give me the top 3 executive insights.' },
    { label: '📑 Generate Executive Report', prompt: 'Generate a professional management report containing:\\n- Executive Summary\\n- KPI Highlights\\n- Best Performers\\n- Weak Performers\\n- Risks\\n- Opportunities\\n- Recommended Actions\\n- Conclusion' }
  ];

  /* ── Simple Markdown → HTML renderer ───────────────────────── */
  function escHtml(t) {
    return String(t)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function parseTable(block) {
    const rows = block.trim().split('\n').filter(r => r.trim().startsWith('|'));
    if (rows.length < 2) return escHtml(block);
    const headers = rows[0].split('|').map(h => h.trim()).filter(Boolean);
    const body    = rows.slice(2); // skip the separator row
    const ths = headers.map(h => `<th>${h}</th>`).join('');
    const trs = body.map(r => {
      const cells = r.split('|').map(c => c.trim()).filter(Boolean);
      return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
    }).join('');
    return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
  }

  function renderMarkdown(text) {
    if (!text) return '';
    // Strip weird artifacts
    text = text.replace(/^---$/gm, '');
    text = text.replace(/U([0-9A-Fa-f]{4,8})/gi, (m, g) => {
       try { return String.fromCodePoint(parseInt(g, 16)); } catch(e) { return m; }
    });
    // Use marked library
    let html = '';
    if (window.marked) {
        html = marked.parse(text);
    } else {
        html = text; // Fallback
    }
    return html;
  }

  /* ── DOM helpers ────────────────────────────────────────────── */
  function nowTime() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function appendMsg(role, html, timeStr) {
    const list = document.getElementById('ai-messages-list');
    if (!list) return;
    // Remove empty-state placeholder
    const empty = list.querySelector('.ai-empty');
    if (empty) empty.remove();

    const isUser = (role === 'user');
    const avatar  = isUser ? '\U0001f464' : '\U0001f916';
    const copyBtn = isUser ? '' : `
      <div class="ai-export-group">
        <button class="ai-copy-btn" onclick="window.aiCopyMsg(this)" title="Copy">\u{1F4CB} Copy</button>
        <button class="ai-copy-btn" onclick="window.aiExportPdf(this)" title="Export PDF">📄 PDF</button>
      </div>
    `;

    const wrap = document.createElement('div');
    wrap.className = `ai-msg ${role}`;
    wrap.innerHTML = `
      <div class="ai-msg-avatar">${avatar}</div>
      <div class="ai-msg-body">
        <div class="ai-msg-bubble">${html}${copyBtn}</div>
        <div class="ai-msg-time">${timeStr}</div>
      </div>`;
    list.appendChild(wrap);
    list.scrollTop = list.scrollHeight;
  }

  function setTyping(on) {
    const typing = document.getElementById('ai-typing-row');
    if (typing) {
      typing.style.display = on ? 'flex' : 'none';
      typing.innerHTML = `
        <div class="ai-msg-avatar">\u{1F916}</div>
        <div class="ai-msg-bubble" style="display:flex;align-items:center;">
            <div class="inline-loader"></div> <span style="font-size:14px;color:var(--text-muted);">Processing...</span>
        </div>
      `;
    }
    const btn = document.getElementById('ai-send-btn');
    if (btn) btn.disabled = on;
    AI_LOADING = on;
  }

  /* ── Send message ───────────────────────────────────────────── */
  async function sendMessage(userText) {
    userText = (userText || '').trim();
    if (!userText || AI_LOADING) return;

    const t = nowTime();
    AI_HISTORY.push({ role: 'user', text: userText, time: t });
    appendMsg('user', escHtml(userText), t);

    const inp = document.getElementById('ai-input');
    if (inp) { inp.value = ''; inp.style.height = 'auto'; }

    setTyping(true);

    try {
      const payload = {
        message:  userText,
        history:  AI_HISTORY.slice(-10).map(h => ({
          role: h.role === 'user' ? 'user' : 'model',
          text: h.text,
        })),
        fullData: STATE.data || null,
        filters: {
          period:   STATE.period   || 'ytd',
          measure:  STATE.measure  || 'ton',
          channel:  (STATE.chFilter  && STATE.chFilter  !== 'all') ? STATE.chFilter  : 'All Channels',
          category: (STATE.caFilter  && STATE.caFilter  !== 'all') ? STATE.caFilter  : 'All Categories',
        },
      };

      const res  = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok || json.error) {
        throw new Error(json.error || `Server error (${res.status})`);
      }

      const aiT = nowTime();
      AI_HISTORY.push({ role: 'assistant', text: json.reply, time: aiT });
      appendMsg('assistant', renderMarkdown(json.reply), aiT);

    } catch (err) {
      const errT = nowTime();
      const msg  = `\u26a0\ufe0f **Error:** ${err.message || 'Unable to reach AI service. Please try again.'}`;
      AI_HISTORY.push({ role: 'assistant', text: msg, time: errT });
      appendMsg('assistant', renderMarkdown(msg), errT);
    } finally {
      setTyping(false);
      const list = document.getElementById('ai-messages-list');
      if (list) list.scrollTop = list.scrollHeight;
    }
  }

  /* ── Render page (idempotent) ───────────────────────────────── */
  window.pgAiAssistant = function () {
    const container = document.getElementById('page-ai');
    if (!container) return;

    if (AI_RENDERED) {
      const list = document.getElementById('ai-messages-list');
      if (list) list.scrollTop = list.scrollHeight;
      return;
    }
    AI_RENDERED = true;

    const chipsHtml = CHIPS.map(c => {
      const safe = c.prompt.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      return `<button class="ai-chip" onclick="window.aiChipClick('${safe}')">${c.label}</button>`;
    }).join('');

    container.innerHTML = `
      <div class="ai-page">

        <div class="ai-header">
          <div class="ai-header-top">
            <div class="ai-title">
              <div class="ai-title-icon">\U0001f916</div>
              <div class="ai-title-text">
                <h2>AI Business Assistant</h2>
                <p>Powered by Google Gemini &middot; Senior Business Analyst</p>
              </div>
            </div>
            <div class="ai-status">
              <div class="ai-status-dot"></div>
              AI Online
            </div>
          </div>
          <div class="ai-chips">${chipsHtml}</div>
        </div>

        <div class="ai-messages" id="ai-messages-list">
          <div class="ai-empty">
            <div class="ai-empty-icon">\U0001f916</div>
            <div class="ai-empty-title">Ask me anything about the dashboard</div>
            <div class="ai-empty-sub">I analyze your live sales data and provide professional business insights.</div>
          </div>
        </div>

        <div id="ai-typing-row" class="ai-typing" style="display:none; padding:0 24px 8px; align-items:center; gap:10px;">
          <div class="ai-msg-avatar">\U0001f916</div>
          <div class="ai-typing-dots"><span></span><span></span><span></span></div>
        </div>

        <div class="ai-input-bar">
          <div class="ai-input-row">
            <div class="ai-input-wrap">
              <textarea id="ai-input"
                placeholder="Ask any business question, e.g. Why did sales drop in Q1?"
                rows="1"></textarea>
            </div>
            <button id="ai-send-btn" class="ai-send-btn" onclick="window.aiSend()">
              &#9654; Send
            </button>
            <button class="ai-clear-btn" onclick="window.aiClear()" title="Clear conversation">
              \U0001f5d1
            </button>
          </div>
          <div class="ai-input-hint">Press Enter to send &middot; Shift+Enter for new line</div>
        </div>

      </div>`;

    /* Attach input listeners */
    const inp = document.getElementById('ai-input');
    if (inp) {
      inp.addEventListener('input', () => {
        inp.style.height = 'auto';
        inp.style.height = Math.min(inp.scrollHeight, 120) + 'px';
      });
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window.aiSend(); }
      });
      inp.focus();
    }
  };

  /* ── Global handlers ────────────────────────────────────────── */
  window.aiSend = function () {
    const inp = document.getElementById('ai-input');
    if (inp) sendMessage(inp.value);
  };

  window.aiChipClick = function (prompt) {
    sendMessage(prompt);
  };

  window.aiClear = function () {
    AI_HISTORY = [];
    const list = document.getElementById('ai-messages-list');
    if (list) {
      list.innerHTML = `
        <div class="ai-empty">
          <div class="ai-empty-icon">\U0001f916</div>
          <div class="ai-empty-title">Conversation cleared</div>
          <div class="ai-empty-sub">Ask me anything about the dashboard data.</div>
        </div>`;
    }
  };

  window.aiCopyMsg = function(btn) {
    const bubble = btn.closest('.ai-msg-bubble');
    const clone = bubble.cloneNode(true);
    const btns = clone.querySelector('.ai-export-group');
    if (btns) btns.remove();
    const textToCopy = clone.innerText || clone.textContent;
    navigator.clipboard.writeText(textToCopy).then(() => {
        showToast('Copied to clipboard');
    }).catch(err => {
        console.error('Could not copy text: ', err);
        showToast('Failed to copy', 'error');
    });
  };

  // ═══════════════════ AI EXPORT FUNCTIONS ═══════════════════
  window.aiExportPdf = function(btn) {
    const bubble = btn.closest('.ai-msg-bubble');
    const clone = bubble.cloneNode(true);
    const btns = clone.querySelector('.ai-export-group');
    if (btns) btns.remove();
    
    const wrapper = document.createElement('div');
    wrapper.style.padding = '40px';
    wrapper.style.fontFamily = 'Inter, sans-serif';
    wrapper.innerHTML = `
        <h1 style="color:#00e676; margin-bottom: 5px;">Greko Egypt</h1>
        <h3 style="color:#555; margin-top: 0;">AI Business Assistant Report</h3>
        <p style="color:#888; font-size:12px;">Generated: ${new Date().toLocaleString()}</p>
        <hr style="border:1px solid #eee; margin-bottom:20px;">
        <div style="font-size:14px; line-height:1.6; color:#000;">
            ${clone.innerHTML}
        </div>
        <hr style="border:1px solid #eee; margin-top:40px;">
        <p style="color:#888; font-size:10px; text-align:center;">Generated by Greko Egypt AI Business Assistant</p>
    `;
    
    html2pdf().set({
        margin: 10,
        filename: 'AI_Report.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(wrapper).save().then(() => showToast('AI Report exported as PDF'));
  };

}());
