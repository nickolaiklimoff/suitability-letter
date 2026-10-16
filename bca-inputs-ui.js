// UI for the "BCA GAA inputs" card (macro panel). Parser: bca-inputs.js.
let _bcaiData = null;

function bcaiEsc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
const BCAI_VIEW_COLOR = { Overweight: '#1b6e3c', Underweight: '#a32020', Neutral: '#444' };

function bcaiTable(title, rows) {
  if (!rows.length) return '';
  let h = `<div style="font-size:13px;font-weight:600;color:var(--text1);margin:12px 0 4px">${bcaiEsc(title)}</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px"><tr style="text-align:left;color:var(--text2)">
    <th style="padding:4px 6px">Name</th><th>View</th><th style="text-align:right">Allocation %</th><th style="text-align:right">Benchmark %</th><th style="padding-left:12px">Latest research</th></tr>`;
  rows.forEach(r => {
    const chg = r.changed ? ` <span style="color:var(--text3)">(was ${bcaiEsc(r.prev_view)}, ${bcaiEsc(r.changed)})</span>` : '';
    h += `<tr style="border-top:1px solid var(--border)"><td style="padding:4px 6px;color:var(--text1)">${bcaiEsc(r.name)}</td>
      <td style="color:${BCAI_VIEW_COLOR[r.view] || '#444'};font-weight:600">${bcaiEsc(r.view)}${chg}</td>
      <td style="text-align:right">${r.allocation.toFixed(1)}</td><td style="text-align:right">${r.benchmark.toFixed(1)}</td>
      <td style="padding-left:12px;color:var(--text2)">${bcaiEsc(r.research)}</td></tr>`;
  });
  return h + '</table>';
}

function bcaiPerfTable(perf) {
  const groups = Object.keys(perf || {});
  if (!groups.length) return '';
  let h = `<div style="font-size:13px;font-weight:600;color:var(--text1);margin:12px 0 4px">Track record (GAA vs benchmark, %)</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px"><tr style="text-align:left;color:var(--text2)"><th style="padding:4px 6px">Portfolio</th>`;
  ['YTD', '12 Months', '5 Years'].forEach(p => h += `<th style="text-align:right">${p} GAA / Bmk / Diff</th>`);
  h += '</tr>';
  groups.forEach(g => {
    h += `<tr style="border-top:1px solid var(--border)"><td style="padding:4px 6px;color:var(--text1)">${bcaiEsc(g)}</td>`;
    ['YTD', '12 Months', '5 Years'].forEach(p => {
      const x = perf[g][p];
      h += `<td style="text-align:right">${x ? `${x.gaa} / ${x.benchmark} / ${x.diff}` : '-'}</td>`;
    });
    h += '</tr>';
  });
  return h + '</table>';
}

function bcaiParseClick() {
  const st = document.getElementById('bcai-status');
  _bcaiData = parseBcaInputs(document.getElementById('bcai-text').value);
  const checks = bcaInputsChecks(_bcaiData);
  const allOk = checks.every(c => c.ok);
  let html = checks.map(c => `<div style="font-size:12px;color:${c.ok ? '#2e7d52' : '#c62828'}">${c.ok ? '✓' : '✗'} ${bcaiEsc(c.msg)}</div>`).join('');
  html += bcaiTable('Asset allocation', _bcaiData.assets) + bcaiTable('Equity allocation by country', _bcaiData.regions)
        + bcaiTable('Bond allocation', _bcaiData.bonds) + bcaiTable('Global sector allocation', _bcaiData.sectors)
        + bcaiPerfTable(_bcaiData.performance);
  document.getElementById('bcai-preview').innerHTML = html;
  document.getElementById('bcai-save').disabled = !allOk;
  st.style.color = allOk ? '#2e7d52' : '#c62828';
  st.textContent = allOk ? 'Read OK. Check the tables, enter quarter and report date, then save.' : 'Something is missing in the pasted text. Paste the full page.';
  if (!document.getElementById('bcai-quarter').value && typeof committeeCurrentQuarter === 'function') {
    document.getElementById('bcai-quarter').value = committeeCurrentQuarter();
  }
}

// Views in the shape generate_ic_pack.py reads (data/bca_views.json)
function bcaiBuildViews(d, prevViews) {
  const pick = (rows, name) => (rows.find(r => r.name === name) || {}).view || 'Neutral';
  const views = {
    global_allocation: { Equities: pick(d.assets, 'Equities'), 'Fixed Income': pick(d.assets, 'Fixed Income'), Cash: pick(d.assets, 'Cash') },
    regional_equities: {}, fixed_income: {}, equity_sectors: {},
    duration: (prevViews && prevViews.duration) || 'Neutral',   // not on this page; keep the last one
    bca_only: {},
  };
  const regionMap = { US: 'US', 'Euro Area': 'Euro Area', Japan: 'Japan', UK: 'UK', China: 'China' };
  d.regions.forEach(r => {
    if (regionMap[r.name]) views.regional_equities[regionMap[r.name]] = r.view;
    else views.bca_only[r.name === 'Other EM' ? 'EM Ex China' : r.name] = r.view;
  });
  d.bonds.forEach(r => views.fixed_income[r.name] = r.view);
  d.sectors.forEach(r => views.equity_sectors[r.name] = r.view);
  return views;
}

function bcaiApplyToBasePortfolios(d) {
  const norm = (rows, target) => {
    const tot = rows.reduce((s, r) => s + r.allocation, 0) || 100;
    target.forEach(t => { const r = rows.find(x => x.name === t.label); if (r) t.w = parseFloat((r.allocation / tot).toFixed(4)); });
  };
  norm(d.sectors, BP_SECTORS);
  norm(d.bonds, BP_BOND_SEGS);
  _bpBenchSecW = BP_SECTORS.map(s => s.w); _bpBenchSegW = BP_BOND_SEGS.map(s => s.w);
  // views table in Base Portfolios
  const keyMap = { Equities: 'gaa_eq', 'Fixed Income': 'gaa_fi', Cash: 'gaa_ca', US: 'eq_us', 'Euro Area': 'eq_eu', Japan: 'eq_jp', Canada: 'eq_ca', Australia: 'eq_au', UK: 'eq_uk', China: 'eq_cn', 'Other EM': 'eq_em',
    Government: 'fi_gov', 'Investment Grade': 'fi_ig', 'High Yield': 'fi_hy', 'EM Debt': 'fi_em',
    Financials: 'sec_fin', 'Info Tech': 'sec_it', 'Health Care': 'sec_hc', 'Communication Services': 'sec_cs2', Industrials: 'sec_ind',
    'Consumer Discretionary': 'sec_cd', 'Consumer Staples': 'sec_cst', Energy: 'sec_en', Materials: 'sec_mat', 'Real Estate': 'sec_re', Utilities: 'sec_ut' };
  bpInitBcaViews();
  [d.assets, d.regions, d.bonds, d.sectors].forEach(rows => rows.forEach(r => {
    const k = keyMap[r.name];
    if (k) _bpBcaViews[k] = { prev: r.prev_view.toLowerCase(), curr: r.view.toLowerCase() };
  }));
  lsSet('suitability-bp-bca-views', JSON.stringify(_bpBcaViews));
  if (typeof bpRenderBcaTable === 'function') bpRenderBcaTable();
}

async function bcaiSave() {
  const st = document.getElementById('bcai-status');
  const token = macroToken();
  if (!token) { alert('Enter the GitHub token first (Macro panel).'); return; }
  const quarter = document.getElementById('bcai-quarter').value.trim();
  const date = document.getElementById('bcai-date').value;
  if (!_bcaiData) { alert('Read the text first.'); return; }
  if (!quarter || !date) { alert('Enter the quarter and the BCA report date. The IC Pack cites them.'); return; }
  st.style.color = 'var(--text3)'; st.textContent = '⏳ Saving...';
  try {
    const d = _bcaiData;
    const inputs = { quarter, report_date: date, as_of_text: d.as_of_text, source: 'BCA Research, Global Asset Allocation',
      saved_at: new Date().toISOString(), assets: d.assets, regions: d.regions, bonds: d.bonds, sectors: d.sectors, performance: d.performance };
    const f1 = await committeeFetchFile(token, 'data/bca_inputs.json');
    await committeePutFile(token, 'data/bca_inputs.json', JSON.stringify(inputs, null, 2) + '\n', f1.sha, `BCA GAA inputs: ${quarter}, report ${date}`);
    const f2 = await committeeFetchFile(token, 'data/bca_views.json');
    let prev = null; try { prev = f2.text ? JSON.parse(f2.text).views : null; } catch (e) {}
    const viewsPayload = { quarter, source: inputs.source, as_of: date, frozen_for_quarter: true, saved_at: inputs.saved_at, views: bcaiBuildViews(d, prev) };
    await committeePutFile(token, 'data/bca_views.json', JSON.stringify(viewsPayload, null, 2) + '\n', f2.sha, `BCA views locked: ${quarter}, report ${date}`);
    bcaiApplyToBasePortfolios(d);
    st.style.color = '#2e7d52';
    st.textContent = `✓ Saved for ${quarter}. Run Update (Weights tab) and Generate IC Pack to use it. Base Portfolios already has the recommended weights.`;
    document.getElementById('bcai-saved').textContent = `Saved: ${quarter}, report date ${date}.`;
  } catch (e) { st.style.color = '#c62828'; st.textContent = `✗ ${e.message}`; }
}

// Show what is currently saved
async function bcaiLoadSaved() {
  try {
    const token = macroToken(); if (!token) return;
    const f = await committeeFetchFile(token, 'data/bca_inputs.json');
    if (!f.text) { document.getElementById('bcai-saved').textContent = 'Nothing saved yet.'; return; }
    const j = JSON.parse(f.text);
    document.getElementById('bcai-saved').textContent = `Currently saved: ${j.quarter}, report date ${j.report_date || 'not recorded'}.`;
  } catch (e) {}
}
document.addEventListener('DOMContentLoaded', () => setTimeout(bcaiLoadSaved, 1500));
