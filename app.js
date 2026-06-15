'use strict';
let DATA = null;
const expanded = new Set();
let currentBucket = 'menu';
const BUCKETS = [
  { key: 'menu', label: 'Menu', title: 'Every menu item by true margin', note: 'The headline numbers above are computed over these menu items only.' },
  { key: 'production', label: 'Production', title: 'Production sub-recipes', note: 'Internal prep recipes, priced ~1 SAR as placeholders. Not sold directly, so excluded from the menu numbers.' },
  { key: 'modifier', label: 'Modifiers', title: '“Extra” add-on modifiers', note: 'Add-on “Extra” items. Excluded from the menu blended food cost.' },
  { key: 'review', label: 'Needs review', title: 'Needs review — auto-excluded', note: 'Excluded from the menu automatically — each row shows why. Fix it in Odoo and it joins the menu.' }
];

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

  renderToggle();
  renderItems();
  renderRecs();

  // Alerts — badge = distinct alert TYPES, not raw row count (247 rows looks like spam)
  const ab = $('#alertBadge');
  const typeCount = new Set(r.alerts.map(a => a.type)).size;
  if (typeCount) { ab.hidden = false; ab.textContent = typeCount; } else ab.hidden = true;
  const al = $('#alertsList'); al.innerHTML = '';
  if (!r.alerts.length) al.appendChild(el('div', 'alert', '<div class="bar"></div><div>No alerts — every item priced and within target.</div>'));
  r.alerts.forEach(a => {
    const n = el('div', 'alert ' + a.level);
    n.appendChild(el('div', 'bar'));
    const b = el('div');
    b.appendChild(el('div', 'type', esc(a.type)));
    b.appendChild(el('div', 'item', esc(a.item)));
    b.appendChild(el('div', 'detail', esc(a.detail)));
    if (a.draftPo && a.draftPo.count) {
      b.appendChild(el('div', 'detail draft-po', `Tied to ${a.draftPo.count} purchase orders still in draft — about ${fmtSar(a.draftPo.sar)} SAR of stock never received.`));
    }
    if (a.group && a.affected && a.affected.length) {
      const exp = el('details', 'alert-expander');
      exp.appendChild(el('summary', null, `Show all ${a.count} affected ingredients`));
      const list = el('div', 'affected-list');
      list.innerHTML = a.affected.map(x => `<div class="aff-row"><span>${esc(x.name)}</span><span class="num neg">${x.qty}</span></div>`).join('');
      exp.appendChild(list);
      b.appendChild(exp);
    }
    n.appendChild(b); al.appendChild(n);
  });

  // Digest
  const d = r.digest;
  $('#digestLead').innerHTML = `Your ERP reports a blended food cost of <b>${pct(k.erpBlendedFoodCostPct)}</b>, but the real number is <b>${pct(k.trueBlendedFoodCostPct)}</b> — a hidden gap of <b>${pct(k.hiddenCostGapPct)}</b>. <b>${d.breachingCount}</b> items are above the ${m.target}% target. <b>${k.negativeMarginCount}</b> are sold at a loss.`;
  const dl = $('#digestLeaks'); dl.innerHTML = '';
  if (!d.topLeaks.length) dl.appendChild(el('tr', null, '<td>No leaks detected.</td>'));
  d.topLeaks.forEach(i => dl.appendChild(el('tr', null,
    `<td>${esc(i.name)}</td><td class="num neg"><b>${sar(i.leakMonth)} SAR/mo</b></td><td class="num">${pct(i.trueFoodPct)} food cost</td><td class="num">${i.units}/mo sold</td>`)));
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

const q3 = n => (n == null ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 3 }));

// Inline recipe breakdown for one item: ingredients sorted by cost share, summing to true unit cost.
function breakdownHTML(i) {
  if (!i.hasRecipe || !i.recipeParts || !i.recipeParts.length) {
    const why = (i.flags && i.flags.includes('cost_missing'))
      ? 'No recipe in Odoo and no stored cost — the true margin can’t be computed until a cost is set.'
      : 'No recipe in Odoo for this item. The cost shown is the ERP stored cost.';
    return `<div class="bd-empty">${why}</div>`;
  }
  const parts = i.recipeParts.map(p => ({ ...p })).sort((a, b) => b.lineCost - a.lineCost);
  const total = parts.reduce((s, p) => s + p.lineCost, 0);
  const yieldQty = (total > 0 && i.trueCost > 0) ? (total / i.trueCost) : 1;
  let rows = '';
  parts.forEach(p => {
    const share = total > 0 ? (p.lineCost / total * 100) : 0;
    const perUnit = p.lineCost / (yieldQty || 1);
    rows += `<tr>
      <td class="bd-name">${esc(p.name)}</td>
      <td class="num">${q3(p.qty)}</td>
      <td class="num">${sar(p.unitCost)}</td>
      <td class="num">${sar(perUnit)}</td>
      <td class="bd-share"><span class="bar"><span style="width:${Math.min(100, share).toFixed(1)}%"></span></span><b>${share.toFixed(1)}%</b></td>
    </tr>`;
  });
  return `<div class="bd">
    <table class="bd-table">
      <thead><tr><th>Ingredient</th><th class="num">Qty</th><th class="num">Unit cost</th><th class="num">Line cost</th><th>Share of cost</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td><b>True unit cost</b></td><td></td><td></td>
        <td class="num"><b>${sar(i.trueCost)} SAR</b></td>
        <td>Food cost <b>${i.trueFoodPct == null ? '—' : i.trueFoodPct + '%'}</b> of ${sar(i.price)} SAR price</td>
      </tr></tfoot>
    </table>
    ${yieldQty > 1.5 ? `<div class="bd-note">Recipe yields ~${Math.round(yieldQty)} units; line costs shown per unit.</div>` : ''}
  </div>`;
}

function renderToggle() {
  const counts = DATA.result.bucketCounts || {};
  const wrap = $('#bucketToggle'); wrap.innerHTML = '';
  BUCKETS.forEach(b => {
    const btn = el('button', 'bucket-tab' + (b.key === currentBucket ? ' active' : '') + (b.key === 'review' ? ' review' : ''),
      `${b.label} <span class="bcount">${counts[b.key] || 0}</span>`);
    btn.type = 'button';
    btn.addEventListener('click', () => { currentBucket = b.key; expanded.clear(); renderToggle(); renderItems(); updateBucketMeta(); });
    wrap.appendChild(btn);
  });
  updateBucketMeta();
}
function updateBucketMeta() {
  const b = BUCKETS.find(x => x.key === currentBucket) || BUCKETS[0];
  $('#tableTitle').textContent = b.title;
  $('#bucketNote').textContent = b.note;
}

function renderItems() {
  const q = ($('#search').value || '').toLowerCase();
  const rows = DATA.result.items
    .filter(i => i.bucket === currentBucket)
    .filter(i => !q || i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q))
    .sort((a, b) => (a.marginPct == null ? 1 : b.marginPct == null ? -1 : a.marginPct - b.marginPct));
  const body = $('#itemsBody'); body.innerHTML = '';
  if (!rows.length) { body.appendChild(el('tr', null, '<td colspan="8" class="bd-empty">Nothing in this view.</td>')); return; }
  rows.slice(0, 400).forEach(i => {
    const open = expanded.has(i.id);
    const tr = el('tr', 'item-row' + (open ? ' open' : ''));
    tr.dataset.id = i.id;
    const caret = i.hasRecipe ? '<span class="caret">▸</span>' : '<span class="caret blank"></span>';
    const statusCell = currentBucket === 'review'
      ? `<span class="rev-reason">${esc(i.reviewReason || 'Needs review')}</span>`
      : statusTag(i);
    tr.innerHTML = `<td>${caret}${esc(i.name)}</td><td>${esc(i.category)}</td>`
      + `<td class="num">${sar(i.price)}</td><td class="num">${sar(i.storedCost)}</td><td class="num">${sar(i.trueCost)}</td>`
      + `<td class="num">${pct(i.trueFoodPct)}</td>`
      + `<td class="num ${i.marginSar < 0 ? 'neg' : 'pos'}">${sar(i.marginSar)} (${pct(i.marginPct)})</td>`
      + `<td>${statusCell}</td>`;
    body.appendChild(tr);
    if (open) {
      const dr = el('tr', 'bd-row');
      dr.innerHTML = `<td colspan="8">${breakdownHTML(i)}</td>`;
      body.appendChild(dr);
    }
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

// ---- Recommendations (v2) ----
const REC_STATES = ['New', 'Reviewed', 'Applied', 'Dismissed'];
const REC_TYPE_LABEL = { R1: 'Re-portion', R2: 'Reprice', R3: 'Stale cost', R4: 'Re-source', R5: 'Rebalance' };
let recFilter = 'all';
const fmtSar = n => (n == null ? '—' : Math.round(Number(n)).toLocaleString('en-US'));
const recStore = () => { try { return JSON.parse(localStorage.getItem('onesync_rec_states') || '{}'); } catch (_) { return {}; } };
const recSave = s => { try { localStorage.setItem('onesync_rec_states', JSON.stringify(s)); } catch (_) {} };
const recKey = r => r.type + '|' + r.title;

function renderRecs() {
  const r = DATA.result, roll = r.recRollup || {}, recs = r.recommendations || [];
  if (!$('#recHeadline')) return;
  $('#recHeadline').innerHTML =
    `<div class="rec-hero-label">Recoverable margin — cost-side, verified, no price changes</div>
     <div class="rec-hero-num">~${fmtSar(roll.recoverablePerMonth)} <span>SAR / month</span></div>
     <div class="rec-hero-sub">across <b>${recs.filter(x => x.cls === 'recoverable').length}</b> actions, about ${fmtSar(roll.recoverableAnnual)} SAR/year. This is the number we defend — fix costs, trim portions, switch to a supplier you already use.</div>
     <div class="rec-secondary">
       <span class="sec-label">Theoretical ceiling — before any volume response, not bankable:</span>
       <span class="rchip pricing">+${fmtSar(roll.pricingUpsidePerMonth)}/mo if prices were raised</span>
       <span class="rchip scenario">+${fmtSar(roll.scenarioPerMonth)}/mo menu-mix scenarios</span>
     </div>
     <div class="rec-advisory">${roll.count} recommendations · advisory only, never auto-applied</div>`;

  const types = ['all', 'R3', 'R2', 'R1', 'R5', 'R4'];
  const filt = $('#recFilter'); filt.innerHTML = '';
  types.forEach(t => {
    const n = t === 'all' ? recs.length : recs.filter(x => x.type === t).length;
    const b = el('button', 'rfilter' + (recFilter === t ? ' active' : ''), `${t === 'all' ? 'All' : REC_TYPE_LABEL[t]} <span class="bcount">${n}</span>`);
    b.type = 'button'; b.addEventListener('click', () => { recFilter = t; renderRecs(); });
    filt.appendChild(b);
  });

  const states = recStore();
  const list = $('#recList'); list.innerHTML = '';
  const shown = recs.filter(x => recFilter === 'all' || x.type === recFilter);
  if (!shown.length) { list.appendChild(el('div', 'bd-empty', 'No recommendations in this filter.')); return; }
  shown.forEach(rec => {
    const key = recKey(rec), st = states[key] || 'New';
    const card = el('article', 'rec-card cls-' + rec.cls + (st === 'Dismissed' ? ' dismissed' : '') + (st === 'Applied' ? ' applied' : ''));
    const sar = rec.sar.perMonth != null ? `${fmtSar(Math.abs(rec.sar.perMonth))} <span>SAR/mo</span>` : '';
    const annual = rec.sar.annual != null ? `~${fmtSar(Math.abs(rec.sar.annual))}/yr` : '';
    const whyRows = rec.why.map(w => {
      const val = Array.isArray(w.value) ? '<ul>' + w.value.map(v => `<li>${esc(v)}</li>`).join('') + '</ul>' : esc(w.value);
      return `<div class="why-row"><span class="why-label">${esc(w.label)}</span><span class="why-val">${val}</span></div>`;
    }).join('');
    card.innerHTML =
      `<div class="rec-top">
         <span class="rec-badge t-${rec.type}">${REC_TYPE_LABEL[rec.type]}${rec.scenario ? ' · scenario' : ''}</span>
         <div class="rec-impact">${sar}<small>${annual}</small></div>
       </div>
       <div class="rec-title">${esc(rec.title)}</div>
       <div class="rec-sub">${esc(rec.subtitle || '')}</div>
       <button class="rec-why-toggle" type="button">Why ▸</button>
       <div class="rec-why hidden">${whyRows}<div class="rec-guard">⚠ ${esc(rec.guardrail || '')}</div></div>
       <div class="rec-states">${REC_STATES.map(s => `<button type="button" class="rec-state${s === st ? ' on' : ''}" data-s="${s}">${s}</button>`).join('')}</div>`;
    card.querySelector('.rec-why-toggle').addEventListener('click', e => {
      const w = card.querySelector('.rec-why'); w.classList.toggle('hidden');
      e.target.textContent = w.classList.contains('hidden') ? 'Why ▸' : 'Why ▾';
    });
    card.querySelectorAll('.rec-state').forEach(btn => btn.addEventListener('click', () => {
      const s = recStore(); s[key] = btn.dataset.s; recSave(s); renderRecs();
    }));
    list.appendChild(card);
  });
}

// ---- Nav ----
const CRUMBS = { dashboard: 'Margin Dashboard', recs: 'Recommendations', alerts: 'Alerts', digest: 'Weekly Digest', branches: 'Branches', ai: 'AI Copilot' };
document.querySelectorAll('.smart-nav-link').forEach(t => t.addEventListener('click', e => {
  e.preventDefault();
  document.querySelectorAll('.smart-nav-link').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
  t.classList.add('active');
  const tab = t.dataset.tab;
  $('#' + tab).classList.remove('hidden');
  $('#crumb').textContent = CRUMBS[tab] || '';
  $('#mainContent').scrollTop = 0;
  setMenu(false); // close the mobile menu after picking a tab
}));
$('#search').addEventListener('input', () => DATA && renderItems());
$('#itemsBody').addEventListener('click', e => {
  const tr = e.target.closest('.item-row');
  if (!tr || !tr.dataset.id) return;
  const id = Number(tr.dataset.id);
  if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
  renderItems();
});
$('#refreshBtn').addEventListener('click', () => load(true));
function setMenu(open) {
  $('#appSidebar').classList.toggle('open', open);
  $('#sidebarBackdrop').classList.toggle('show', open);
}
$('#sidebarToggle').addEventListener('click', () => setMenu(!$('#appSidebar').classList.contains('open')));
$('#sidebarClose').addEventListener('click', () => setMenu(false));
$('#sidebarBackdrop').addEventListener('click', () => setMenu(false));

initAi();
load(false);
