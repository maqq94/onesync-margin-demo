'use strict';
let DATA = null;

const $ = s => document.querySelector(s);
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
const sar = n => (n == null ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
const pct = n => (n == null ? '—' : n + '%');
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function load(refresh) {
  $('#loading').classList.remove('hidden');
  $('#refreshBtn').disabled = true;
  try {
    const res = await fetch('onesync-data.json');
    DATA = await res.json();
    setConn(true, DATA.meta);
    render();
  } catch (e) {
    setConn(false);
    $('#loading').textContent = 'Could not reach Odoo: ' + e.message;
    return;
  } finally {
    $('#refreshBtn').disabled = false;
  }
  $('#loading').classList.add('hidden');
}

function setConn(ok, meta) {
  $('#connName').textContent = ok ? 'Live' : 'Offline';
  $('#connSub').textContent = ok ? ((meta.odooDb || 'Odoo') + ' · read-only') : 'Odoo unreachable';
  $('#connText').textContent = ok ? 'Live Odoo' : 'Odoo unreachable';
  $('#connDot2').style.color = ok ? 'var(--accent-sage)' : 'var(--accent-crimson)';
}

function kpiCard(value, label, brand) {
  const c = el('div', 'kpi' + (brand ? ' brand' : ''));
  c.appendChild(el('div', 'label', esc(label)));
  c.appendChild(el('div', 'value', esc(value)));
  return c;
}

function render() {
  const r = DATA.result, k = r.kpis, m = DATA.meta;

  $('#heroHead').textContent = `Odoo shows ${pct(k.erpBlendedFoodCostPct)} food cost. Reality is ${pct(k.trueBlendedFoodCostPct)}.`;
  $('#heroCopy').textContent = `OneSync rebuilt the true cost of ${k.totalItems} menu items from their recipes — a hidden gap of ${pct(k.hiddenCostGapPct)} the ERP never showed.`;

  const kpis = $('#kpis'); kpis.innerHTML = '';
  kpis.appendChild(kpiCard(pct(k.erpBlendedFoodCostPct), 'ERP-reported food cost'));
  kpis.appendChild(kpiCard(pct(k.trueBlendedFoodCostPct), 'OneSync TRUE food cost', true));
  kpis.appendChild(kpiCard(k.negativeMarginCount, 'Items sold at a loss'));
  kpis.appendChild(kpiCard(k.reconstructedCount + k.missingCostCount, 'No real cost in ERP'));

  renderItems();

  // Alerts
  const ab = $('#alertBadge');
  if (r.alerts.length) { ab.hidden = false; ab.textContent = r.alerts.length; } else ab.hidden = true;
  const al = $('#alertsList'); al.innerHTML = '';
  if (!r.alerts.length) al.appendChild(el('div', 'alert', '<div class="bar"></div><div>No alerts — every item priced and within target.</div>'));
  r.alerts.forEach(a => {
    const n = el('div', 'alert ' + a.level);
    n.appendChild(el('div', 'bar'));
    const b = el('div');
    b.appendChild(el('div', 'type', esc(a.type)));
    b.appendChild(el('div', 'item', esc(a.item)));
    b.appendChild(el('div', 'detail', esc(a.detail)));
    n.appendChild(b); al.appendChild(n);
  });

  // Digest
  const d = r.digest;
  $('#digestLead').innerHTML = `Your ERP reports a blended food cost of <b>${pct(k.erpBlendedFoodCostPct)}</b>, but the real number is <b>${pct(k.trueBlendedFoodCostPct)}</b> — a hidden gap of <b>${pct(k.hiddenCostGapPct)}</b>. <b>${d.breachingCount}</b> items are above the ${m.target}% target. <b>${k.negativeMarginCount}</b> are sold at a loss.`;
  const dl = $('#digestLeaks'); dl.innerHTML = '';
  if (!d.topLeaks.length) dl.appendChild(el('tr', null, '<td>No leaks detected.</td>'));
  d.topLeaks.forEach(i => dl.appendChild(el('tr', null,
    `<td>${esc(i.name)}</td><td class="num">${pct(i.trueFoodPct)} food cost</td><td class="num ${i.marginSar < 0 ? 'neg' : ''}">${sar(i.marginSar)} SAR/unit</td>`)));
  const dc = $('#digestCats'); dc.innerHTML = '';
  d.categories.slice(0, 10).forEach(c => dc.appendChild(el('tr', null,
    `<td>${esc(c.name)}</td><td class="num">${c.items} items</td><td class="num">${pct(c.avgFoodPct)} avg food cost</td>`)));

  // Branches
  const bb = $('#branchBody'); bb.innerHTML = '';
  if (!r.branches.rows.length) bb.appendChild(el('tr', null, '<td colspan="5">No POS branch data in Odoo yet.</td>'));
  r.branches.rows.forEach(b => bb.appendChild(el('tr', null,
    `<td>${esc(b.name)}</td><td class="num">${b.orders}</td><td class="num">${sar(b.sales)}</td><td class="num">${sar(b.avgTicket)}</td><td>${b.anomaly ? '<span class="badge s-over">Anomaly</span>' : '<span class="badge s-ok">Normal</span>'}</td>`)));

  $('#footMeta').textContent = `Pulled ${new Date(m.pulledAt).toLocaleString()} · ${m.counts.templates} items · ${m.counts.boms} recipes · ${m.counts.branches} branches`
    + (m.notes && m.notes.length ? ` · ${m.notes.length} model(s) unavailable` : '');
}

function statusTag(i) {
  if (i.flags.includes('negative_margin')) return '<span class="badge s-loss">Loss</span>';
  if (i.flags.includes('cost_missing')) return '<span class="badge s-missing">No cost set</span>';
  if (i.flags.includes('reconstructed')) return '<span class="badge s-rebuilt">Cost rebuilt</span>';
  if (i.flags.includes('thin_margin')) return '<span class="badge s-over">Over target</span>';
  return '<span class="badge s-ok">Healthy</span>';
}

function renderItems() {
  const q = ($('#search').value || '').toLowerCase();
  const rows = DATA.result.items
    .filter(i => !q || i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q))
    .sort((a, b) => (a.marginPct == null ? 1 : b.marginPct == null ? -1 : a.marginPct - b.marginPct));
  const body = $('#itemsBody'); body.innerHTML = '';
  rows.slice(0, 400).forEach(i => {
    const tr = el('tr');
    tr.innerHTML = `<td>${esc(i.name)}</td><td>${esc(i.category)}</td>`
      + `<td class="num">${sar(i.price)}</td><td class="num">${sar(i.storedCost)}</td><td class="num">${sar(i.trueCost)}</td>`
      + `<td class="num">${pct(i.trueFoodPct)}</td>`
      + `<td class="num ${i.marginSar < 0 ? 'neg' : 'pos'}">${sar(i.marginSar)} (${pct(i.marginPct)})</td>`
      + `<td>${statusTag(i)}</td>`;
    body.appendChild(tr);
  });
}

// ---- AI Copilot ----
const SUGGESTIONS = [
  'Which 5 items lose the most money?',
  'What is my real food cost vs what Odoo shows?',
  'Which category is hurting my margin most?',
  'Give me 3 actions to fix my margins this week.',
  'Which branch has the lowest average ticket?'
];
function initAi() {
  $('#aiModel').textContent = 'on the operator’s machine';
  const chips = $('#aiChips'); chips.innerHTML = '';
  SUGGESTIONS.forEach(s => {
    const c = el('button', 'chip', esc(s)); c.type = 'button';
    c.addEventListener('click', () => askAi(s));
    chips.appendChild(c);
  });
  $('#aiForm').addEventListener('submit', e => { e.preventDefault(); const q = $('#aiQ').value.trim(); if (q) askAi(q); });
}
function aiBubble(text, cls) {
  const b = el('div', 'ai-msg ' + cls, esc(text));
  $('#aiThread').appendChild(b);
  $('#aiThread').scrollTop = $('#aiThread').scrollHeight;
  return b;
}
let aiBusy = false;
async function askAi(q) {
  if (aiBusy) return;
  aiBusy = true; $('#aiSend').disabled = true; $('#aiQ').value = '';
  aiBubble(q, 'me');
  // Static cloud build: the Copilot runs on the operator's own machine (local AI),
  // so it isn't reachable from this hosted version. The data screens use real numbers.
  aiBubble('The OneSync Copilot runs on the operator’s own machine (private local AI), so it isn’t available on this public demo. Every other screen — dashboard, alerts, weekly digest, branches — is real data from Odoo. Ask the team for a live Copilot session.', 'bot');
  aiBusy = false; $('#aiSend').disabled = false;
}

// ---- Nav ----
const CRUMBS = { dashboard: 'Margin Dashboard', alerts: 'Alerts', digest: 'Weekly Digest', branches: 'Branches', ai: 'AI Copilot' };
document.querySelectorAll('.smart-nav-link').forEach(t => t.addEventListener('click', e => {
  e.preventDefault();
  document.querySelectorAll('.smart-nav-link').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
  t.classList.add('active');
  const tab = t.dataset.tab;
  $('#' + tab).classList.remove('hidden');
  $('#crumb').textContent = CRUMBS[tab] || '';
  $('#mainContent').scrollTop = 0;
}));
$('#search').addEventListener('input', () => DATA && renderItems());
$('#refreshBtn').addEventListener('click', () => load(true));
$('#sidebarToggle').addEventListener('click', () => $('#appSidebar').classList.toggle('open'));

initAi();
load(false);
