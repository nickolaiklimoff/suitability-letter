// ─── State ───────────────────────────────────────────────────────────────────

let clients = {};       // { id: { name, profile, letters[] } }
let currentClientId = null;
let currentStep = 0;
const TOTAL_STEPS = 7;
let isDirty = false;

// ─── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  loadFromStorage();
  renderClientList();
  buildProfileForm();
  initLetterForm();
  renderSteps();
  // Restore benchmark from localStorage
  try {
    const stored = localStorage.getItem('suitability-benchmark');
    if (stored) {
      _benchmark = JSON.parse(stored);
      const label = document.getElementById('benchmarkLoadedLabel');
      if (label) { label.textContent = '✓ Loaded'; label.style.color = '#3b6d11'; }
    }
  } catch(e) {}
});

// ─── Storage ─────────────────────────────────────────────────────────────────

function loadFromStorage() {
  try {
    const raw = localStorage.getItem('suitability-clients');
    if (raw) clients = JSON.parse(raw);
  } catch (e) { clients = {}; }
}

function saveToStorage() {
  localStorage.setItem('suitability-clients', JSON.stringify(clients));
}

// ─── Client list ─────────────────────────────────────────────────────────────

function renderClientList() {
  const el = document.getElementById('clientList');
  el.innerHTML = '';
  Object.entries(clients).forEach(([id, c]) => {
    const div = document.createElement('div');
    div.className = 'client-item' + (id === currentClientId ? ' active' : '');
    div.textContent = c.name || 'Unnamed client';
    div.onclick = () => selectClient(id);
    el.appendChild(div);
  });
}

function newClient() {
  const id = 'c_' + Date.now();
  clients[id] = { name: 'New client', profile: {}, letters: [] };
  saveToStorage();
  selectClient(id);
  renderClientList();
}

function selectClient(id) {
  currentClientId = id;
  renderClientList();
  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('appContent').classList.remove('hidden');
  switchTab('report', document.querySelector('.tab'));
  loadProfileForm();
  resetLetterForm();
}

function resetLetterForm() {
  currentStep = 0;
  showStep(0);

  // Clear text fields
  ['l-date','l-rationale','l-documents','l-docDate','l-modelName','l-deviationReason'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  // Clear tables
  ['l-existingRows','l-investRows','l-modelRows','l-deviationRows','l-newRows'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });

  // Clear status messages
  ['existingStatus','investRatingStatus','importModelStatus'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });

  // Reset WAAR
  const wb = document.getElementById('waar-before');
  const wa = document.getElementById('waar-after');
  if (wb) wb.textContent = '—';
  if (wa) wa.textContent = '—';

  // Reset radios
  const meetspeak = document.querySelector('input[name="meetspeak"][value="meet"]');
  if (meetspeak) meetspeak.checked = true;
  const wouldNotReview = document.querySelector('input[name="wouldReview"][value="would not"]');
  if (wouldNotReview) wouldNotReview.checked = true;
  const concOk = document.querySelector('input[name="concentration"][value="ok"]');
  if (concOk) concOk.checked = true;

  // Reset checkboxes
  ['l-hasDeviation','l-waarBreach','l-taa','rev-maturity','rev-nonadv','rev-leverage','rev-ir56'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.checked = false;
  });
  const devBlock = document.getElementById('deviationBlock');
  if (devBlock) devBlock.classList.add('hidden');

  // Reset file inputs
  ['importExistingFile','importModel','importInvestFile'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  // Reset transaction ratings
  window._transactionRatings = [];

  // Add initial empty rows
  addInvestRow();
  addExistingRow();
  addModelRow();
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

function switchTab(name, btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
  if (btn) btn.classList.add('active');
  else {
    const tabs = document.querySelectorAll('.tab');
    const idx = ['report','letter','profile','history'].indexOf(name);
    if (tabs[idx]) tabs[idx].classList.add('active');
  }
  document.getElementById('tab-' + name).classList.remove('hidden');
  if (name === 'history') renderHistory();
  if (name === 'report') initReportTab();
}

// ─── Profile form ─────────────────────────────────────────────────────────────

function buildProfileForm() {
  buildRadioGroup('p-riskTolerance', RISK_TOLERANCE);
  buildRadioGroup('p-investmentObjective', INVESTMENT_OBJECTIVES);
  buildRadioGroup('p-financialGoal', FINANCIAL_GOALS);
  buildRadioGroup('p-timeHorizon', TIME_HORIZONS);
  buildCheckboxGroup('p-knowledge', KNOWLEDGE_PRODUCTS);
  buildRadioGroup('p-abilityToBearLosses', ABILITY_TO_BEAR_LOSSES);
}

function buildRadioGroup(id, options) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = options.map(o => `
    <label class="radio-opt block">
      <input type="radio" name="${id}" value="${o.value}" onchange="markDirty()" />
      <span><strong>${o.label}</strong>${o.desc ? ' — ' + o.desc : ''}</span>
    </label>`).join('');
}

function buildCheckboxGroup(id, items) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = items.map(item => `
    <label class="checkbox-opt">
      <input type="checkbox" name="${id}" value="${item}" onchange="markDirty()" />
      <span>${item}</span>
    </label>`).join('');
}

function loadProfileForm() {
  const client = clients[currentClientId];
  if (!client) return;
  const p = client.profile || {};

  document.getElementById('p-name').value = client.name || '';

  setRadio('p-riskTolerance', p.riskTolerance);
  setRadio('p-investmentObjective', p.investmentObjective);
  setRadio('p-financialGoal', p.financialGoal);
  setRadio('p-timeHorizon', p.timeHorizon);
  setCheckboxes('p-knowledge', p.knowledge || []);
  setRadio('p-abilityToBearLosses', p.abilityToBearLosses);

  isDirty = false;
  document.getElementById('savedMsg').classList.add('hidden');
}

function setRadio(name, value) {
  if (!value) return;
  const el = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (el) el.checked = true;
}

function setCheckboxes(name, values) {
  document.querySelectorAll(`input[name="${name}"]`).forEach(cb => {
    cb.checked = values.includes(cb.value);
  });
}

function getRadio(name) {
  const el = document.querySelector(`input[name="${name}"]:checked`);
  return el ? el.value : null;
}

function getCheckboxes(name) {
  return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(cb => cb.value);
}

function markDirty() { isDirty = true; }

function saveProfile() {
  const client = clients[currentClientId];
  if (!client) return;
  const name = document.getElementById('p-name').value.trim() || 'Unnamed client';
  client.name = name;
  client.profile = {
    riskTolerance:      getRadio('p-riskTolerance'),
    investmentObjective:getRadio('p-investmentObjective'),
    financialGoal:      getRadio('p-financialGoal'),
    timeHorizon:        getRadio('p-timeHorizon'),
    knowledge:          getCheckboxes('p-knowledge'),
    abilityToBearLosses:getRadio('p-abilityToBearLosses')
  };
  saveToStorage();
  renderClientList();
  isDirty = false;
  const msg = document.getElementById('savedMsg');
  msg.classList.remove('hidden');
  setTimeout(() => msg.classList.add('hidden'), 2000);
}

// ─── Letter form ──────────────────────────────────────────────────────────────

function initLetterForm() {
  addInvestRow();
  addExistingRow();
  addModelRow();
}

function renderSteps() {
  const el = document.getElementById('letterSteps');
  if (!el) return;
  const labels = ['Meeting','Recommendation','Documents','Portfolio & WAAR','Model portfolio','Conditions','Review'];
  el.innerHTML = labels.map((l, i) => {
    const cls = i < currentStep ? 'done' : i === currentStep ? 'active' : '';
    const line = i > 0 ? `<div class="step-line${i <= currentStep ? ' done' : ''}"></div>` : '';
    return `${line}<div class="step-dot ${cls}" title="${l}">${i < currentStep ? '✓' : i+1}</div>`;
  }).join('');
}

function showStep(n) {
  document.querySelectorAll('.letter-step').forEach((el, i) => {
    el.classList.toggle('hidden', i !== n);
  });
  document.getElementById('btnBack').style.display = n === 0 ? 'none' : '';
  const isLast = n === TOTAL_STEPS - 1;
  document.getElementById('btnNext').classList.toggle('hidden', isLast);
  document.getElementById('btnGenerate').classList.toggle('hidden', !isLast);
  renderSteps();
  if (n === 3) updateWAAR();
}

function nextStep() {
  if (currentStep < TOTAL_STEPS - 1) { currentStep++; showStep(currentStep); }
}

function prevStep() {
  if (currentStep > 0) { currentStep--; showStep(currentStep); }
}

// ─── Dynamic table rows ───────────────────────────────────────────────────────

function addInvestRow(name='', isin='', amount='', fee='0') {
  const tbody = document.getElementById('l-investRows');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" placeholder="Product name" value="${escVal(name)}" /></td>
    <td><input type="text" placeholder="e.g. IE00B6R52259" value="${escVal(isin)}" style="width:130px" /></td>
    <td><input type="number" placeholder="Amount USD" value="${escVal(amount)}" /></td>
    <td><input type="text" placeholder="0" value="${escVal(fee)}" style="width:80px" /></td>
    <td><button class="btn-remove" onclick="this.closest('tr').remove()">×</button></td>`;
  tbody.appendChild(tr);
}

function escVal(s) { return (s||'').replace(/"/g,'&quot;'); }

function addPortfolioRow(prefix) {
  const tbody = document.getElementById(`l-${prefix}Rows`);
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" placeholder="Product / ISIN" /></td>
    <td><input type="text" placeholder="USD" style="width:60px" /></td>
    <td><input type="number" placeholder="Amount" oninput="updateWAAR()" /></td>
    <td><input type="number" placeholder="1–6" min="1" max="6" step="0.5" oninput="updateWAAR()" style="width:60px" /></td>
    <td><button class="btn-remove" onclick="this.closest('tr').remove();updateWAAR()">×</button></td>`;
  tbody.appendChild(tr);
}

function addModelRow() {
  const tbody = document.getElementById('l-modelRows');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" placeholder="e.g. Global Equities" /></td>
    <td><input type="number" placeholder="%" min="0" max="100" /></td>
    <td><button class="btn-remove" onclick="this.closest('tr').remove()">×</button></td>`;
  tbody.appendChild(tr);
}

function addDeviationRow() {
  const tbody = document.getElementById('l-deviationRows');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" placeholder="e.g. Global Equities" /></td>
    <td><input type="number" placeholder="%" min="0" max="100" /></td>
    <td><button class="btn-remove" onclick="this.closest('tr').remove()">×</button></td>`;
  tbody.appendChild(tr);
}

function toggleDeviation() {
  const show = document.getElementById('l-hasDeviation').checked;
  document.getElementById('deviationBlock').classList.toggle('hidden', !show);
  if (show && document.getElementById('l-deviationRows').children.length === 0) addDeviationRow();
}

// ─── Collect letter data ──────────────────────────────────────────────────────

function collectLetterData() {
  const client = clients[currentClientId];
  const p = client.profile || {};

  const { waarBefore, waarAfter, irBefore, irAfter } = updateWAAR();

  const investRows = Array.from(document.querySelectorAll('#l-investRows tr')).map(tr => {
    const i = tr.querySelectorAll('input');
    const amt = parseFloat(i[2]?.value) || 0;
    return {
      product: i[0]?.value,
      isin: i[1]?.value,
      amount: amt ? `USD ${amt.toLocaleString('en-US', {minimumFractionDigits:2})}` : '',
      fee: i[3]?.value || '0'
    };
  }).filter(r => r.product);

  const modelRows = Array.from(document.querySelectorAll('#l-modelRows tr')).map(tr => {
    const i = tr.querySelectorAll('input');
    return { asset: i[0]?.value, pct: i[1]?.value };
  }).filter(r => r.asset);

  const deviationRows = Array.from(document.querySelectorAll('#l-deviationRows tr')).map(tr => {
    const i = tr.querySelectorAll('input');
    return { asset: i[0]?.value, pct: i[1]?.value };
  }).filter(r => r.asset);

  const reviewReasons = [];
  if (document.getElementById('rev-maturity')?.checked) reviewReasons.push('maturity');
  if (document.getElementById('rev-nonadv')?.checked)   reviewReasons.push('nonadv');
  if (document.getElementById('rev-leverage')?.checked) reviewReasons.push('leverage');
  if (document.getElementById('rev-ir56')?.checked)     reviewReasons.push('ir56');

  return {
    client,
    profile: p,
    date:           document.getElementById('l-date')?.value || '',
    meetSpeak:      document.querySelector('input[name="meetspeak"]:checked')?.value || 'meet',
    rationale:      document.getElementById('l-rationale')?.value || '',
    investRows,
    documents:      document.getElementById('l-documents')?.value || '',
    docDate:        document.getElementById('l-docDate')?.value || '',
    modelName:      document.getElementById('l-modelName')?.value || '',
    modelRows,
    hasDeviation:   document.getElementById('l-hasDeviation')?.checked || false,
    deviationReason:document.getElementById('l-deviationReason')?.value || '',
    deviationRows,
    concentration:  document.querySelector('input[name="concentration"]:checked')?.value || 'ok',
    waarBreach:     document.getElementById('l-waarBreach')?.checked || false,
    taa:            document.getElementById('l-taa')?.checked || false,
    wouldReview:    document.querySelector('input[name="wouldReview"]:checked')?.value || 'would not',
    reviewReasons,
    waarBefore,
    waarAfter,
    irBefore,
    irAfter
  };
}

// ─── Build letter text ────────────────────────────────────────────────────────

function buildLetter(d) {
  const p = d.profile;

  const rtOption = RISK_TOLERANCE.find(o => o.value === p.riskTolerance);
  const objOption = INVESTMENT_OBJECTIVES.find(o => o.value === p.investmentObjective);
  const goalOption = FINANCIAL_GOALS.find(o => o.value === p.financialGoal);
  const horizonOption = TIME_HORIZONS.find(o => o.value === p.timeHorizon);
  const abilityOption = ABILITY_TO_BEAR_LOSSES.find(o => o.value === p.abilityToBearLosses);

  const dateStr = d.date ? new Date(d.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '[date]';
  const docDateStr = d.docDate ? new Date(d.docDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '[date]';

  const investTable = tableHtml(
    ['Investment product', 'ISIN', 'Investment amount', 'Advisory fee'],
    d.investRows.map(r => [r.product, r.isin || '', r.amount, r.fee || '0'])
  );

  const modelTable = tableHtml(
    ['Model Portfolio Asset Allocation', 'Percentage (%)'],
    d.modelRows.map(r => [r.asset, r.pct + '%'])
  );

  const deviationTable = d.hasDeviation ? tableHtml(
    ['Selected Asset Allocation', 'Percentage (%)'],
    d.deviationRows.map(r => [r.asset, r.pct + '%'])
  ) : '';

  const reviewReasonTexts = d.reviewReasons.map(k => `• ${TEXT.reviewReasons[k]}`).join('\n\n');

  let letter = `Dear ${d.client.name || 'Client'},\n\n`;

  letter += TEXT.intro
    .replace('{MEETSPEAK}', d.meetSpeak)
    .replace('{DATE}', dateStr) + '\n\n';

  letter += `Risk tolerance\n${rtOption ? rtOption.desc : ''}\n\n`;
  letter += `Primary investment objective\n${objOption ? objOption.desc : ''}\n\n`;
  letter += `Financial goal\n${goalOption ? goalOption.label.replace(/^Option \d+ — /, '') : ''}\n\n`;
  letter += `The maximum time horizon you are considering for this relationship is\n${horizonOption ? horizonOption.label.replace(/^Option \d+ — /, '') : ''}\n\n`;

  letter += `Investment knowledge and experience\nYou confirmed that you have knowledge and/or experience in the following investment products:\n${(p.knowledge || []).join(', ')}\n\n`;

  letter += `Your financial situation (including your ability to bear losses)\nConsidering your financial situation, including your current assets, liabilities, and the percentage of your liquid net worth you wish to invest, you have confirmed that the following best describes your ability to bear losses:\n${abilityOption ? abilityOption.label.replace(/^Option \d+ — /, '') + ': ' + abilityOption.desc : ''}\n\n`;

  letter += `${TEXT.recommendationIntro}\n\n${d.rationale}\n\n`;
  letter += investTable + '\n\n';
  letter += TEXT.feeNote + '\n\n';

  letter += `Risks Associated with Alternative Mutual Funds\n${TEXT.altMutualFundsRisk}\n\n`;

  letter += `Concentration risk\n${d.concentration === 'ok' ? TEXT.concentrationOk : TEXT.concentrationBreach}\n\n`;

  letter += `Leveraged investments risk\n${TEXT.leveragedRisk}\n\n`;
  letter += `Margin Call Risk\n${TEXT.marginCallRisk}\n\n`;

  letter += `You confirmed that you have received and reviewed ${d.documents} which was sent/handed to you on ${docDateStr}. These documents are a crucial part of your recommendation, and I am happy to answer any questions you might have about them.\n\n`;

  letter += `${TEXT.modelPortfolioIntro}\n\n`;
  letter += `${d.modelName}\n` + modelTable + '\n\n';

  if (d.hasDeviation) {
    letter += `After reviewing my recommendation for the Model Portfolio Allocation, you requested changes to the asset allocation to account for ${d.deviationReason}. The amendments you proposed remain within an acceptable range for your risk tolerance and are still considered suitable for your objectives for the reasons outlined previously. However, please be aware that these changes involve deviating from the originally recommended asset allocation, which was tailored to your needs.\n\nFor the reasons discussed above, the final portfolio which you have selected for your investment is as follows:\n\n`;
    letter += deviationTable + '\n\n';
  }

  letter += `${TEXT.waarExplanation}\n\n`;
  const wBefore = d.waarBefore ? (d.waarBefore.toFixed ? d.waarBefore.toFixed(2) : String(d.waarBefore)) : '—';
  const wAfter  = d.waarAfter  ? (d.waarAfter.toFixed  ? d.waarAfter.toFixed(2)  : String(d.waarAfter))  : '—';
  letter += `For your reference:\n• The risk level of your portfolio before the transaction is ${wBefore}.\n• The risk level of your portfolio after the transaction will be ${wAfter}.\n\n`;

  if (d.waarBreach) {
    letter += `${TEXT.waarBreachText}\n\n`;
  }

  if (d.taa) {
    letter += `Transaction against advice\n${TEXT.taaText}\n\n`;
  }

  letter += `Taxation\n${TEXT.taxation}\n\n`;
  letter += `General investment risk\n${TEXT.generalRisk}\n\n`;

  letter += `Periodic Assessment of Suitability\n${TEXT.periodicAssessmentIntro}\n\nTaking into account all relevant information, we believe the recommended investment ${d.wouldReview} likely require you to seek a periodic review of your arrangements. We have reached this conclusion based on the following reasons:\n\n${reviewReasonTexts}\n\n`;

  letter += `${TEXT.closing}\n\n${TEXT.signature}`;

  return letter;
}

function tableHtml(headers, rows) {
  const head = headers.map(h => `<th>${h}</th>`).join('');
  const body = rows.map(row => `<tr>${row.map(c => `<td>${c || ''}</td>`).join('')}</tr>`).join('');
  return `<table class="letter-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

// ─── Generate ─────────────────────────────────────────────────────────────────

async function generateLetter() {
  const data = collectLetterData();
  const letterText = buildLetter(data);

  // Save to history
  const client = clients[currentClientId];
  if (!client.letters) client.letters = [];
  client.letters.unshift({
    id: Date.now(),
    date: new Date().toISOString(),
    text: letterText,
    meetingDate: data.date
  });
  saveToStorage();

  // Show modal
  const output = document.getElementById('letterOutput');
  output.innerHTML = buildLetterHTML(letterText);

  document.getElementById('letterModal').classList.remove('hidden');
}

function buildLetterHTML(text) {
  const parts = text.split(/(<table[\s\S]*?<\/table>)/);
  return parts.map(part => {
    if (part.startsWith('<table')) return part;
    return part.split(/\n\n+/).map(para => {
      para = para.trim();
      if (!para) return '';
      const lines = para.split('\n');
      if (lines.length === 1) return '<p>' + esc(lines[0]) + '</p>';
      if (lines[0].length < 80 && !lines[0].startsWith('\u2022') && !lines[0].startsWith('-')) {
        return '<p><strong>' + esc(lines[0]) + '</strong><br>' + lines.slice(1).map(l => esc(l)).join('<br>') + '</p>';
      }
      return '<p>' + lines.map(l => esc(l)).join('<br>') + '</p>';
    }).join('');
  }).join('');
}

function esc(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function closeModal() {
  document.getElementById('letterModal').classList.add('hidden');
}

function copyLetter() {
  const data = collectLetterData();
  const text = buildLetter(data);
  navigator.clipboard.writeText(text).then(() => alert('Letter copied to clipboard'));
}

// ─── History ──────────────────────────────────────────────────────────────────

function renderHistory() {
  switchHistoryTab('letters');
}

function switchHistoryTab(tab) {
  document.getElementById('historyList').classList.toggle('hidden', tab !== 'letters');
  document.getElementById('reportHistoryList').classList.toggle('hidden', tab !== 'reports');
  document.getElementById('hist-tab-letters').style.fontWeight = tab === 'letters' ? '700' : '';
  document.getElementById('hist-tab-reports').style.fontWeight = tab === 'reports' ? '700' : '';

  if (tab === 'letters') renderLetterHistory();
  else renderReportHistory();
}

function renderLetterHistory() {
  const client = clients[currentClientId];
  const el = document.getElementById('historyList');
  if (!client?.letters?.length) {
    el.innerHTML = '<div class="empty-history">No letters generated yet for this client.</div>';
    return;
  }
  el.innerHTML = client.letters.map((l, i) => `
    <div class="history-item">
      <div class="history-meta">
        <span class="history-date">${new Date(l.date).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })}</span>
        ${l.meetingDate ? `<span class="history-meeting">Meeting: ${new Date(l.meetingDate).toLocaleDateString('en-GB')}</span>` : ''}
      </div>
      <button class="btn-secondary" onclick="viewHistoryLetter(${i})">View letter</button>
    </div>`).join('');
}

function renderReportHistory() {
  const client = clients[currentClientId];
  const el = document.getElementById('reportHistoryList');
  if (!client?.reports?.length) {
    el.innerHTML = '<div class="empty-history">No saved portfolio reports yet for this client.</div>';
    return;
  }
  el.innerHTML = [...client.reports].reverse().map((r, i) => {
    const realIdx = client.reports.length - 1 - i;
    return `
    <div class="history-item">
      <div class="history-meta">
        <span class="history-date">${new Date(r.savedAt).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })}</span>
        <span class="history-meeting">Data: ${r.dataDate || '—'} · Portfolio: ${r.totalValue || '—'}</span>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn-secondary" onclick="viewSavedReport(${realIdx})">View</button>
        <button class="btn-secondary" onclick="deleteSavedReport(${realIdx})" style="color:#a32d2d">Delete</button>
      </div>
    </div>`;
  }).join('');
}

function saveCurrentReport() {
  const client = clients[currentClientId];
  if (!client) return;
  const html = document.getElementById('r-reportContent')?.innerHTML;
  if (!html) { alert('No report to save.'); return; }
  if (!client.reports) client.reports = [];
  const cfg = window._lastReportConfig || {};
  const pd  = window._lastPortfolioData;
  client.reports.push({
    savedAt:    new Date().toISOString(),
    dataDate:   cfg.dataDate || '',
    totalValue: pd ? '$' + Math.round(pd.totalValue).toLocaleString('en-US') : '',
    html,
  });
  saveToStorage();
  // Flash button
  const btn = event.target;
  btn.textContent = '✓ Saved!';
  btn.style.background = '#3b6d11';
  setTimeout(() => { btn.textContent = '💾 Save Report'; btn.style.background = ''; }, 1800);
}

function viewSavedReport(i) {
  const client = clients[currentClientId];
  const report = client.reports[i];
  if (!report) return;
  const modalContent = document.getElementById('reportModalContent');
  modalContent.innerHTML = report.html;
  // Make exportReportToWord use modal content
  window._savedReportViewEl = modalContent;
  document.getElementById('reportModal').classList.remove('hidden');
}

function deleteSavedReport(i) {
  if (!confirm('Delete this saved report?')) return;
  clients[currentClientId].reports.splice(i, 1);
  saveToStorage();
  renderReportHistory();
}



function viewHistoryLetter(i) {
  const client = clients[currentClientId];
  const letter = client.letters[i];
  const output = document.getElementById('letterOutput');
  output.innerHTML = buildLetterHTML(letter.text);
  document.getElementById('letterModal').classList.remove('hidden');
}

// ─── Portfolio import handlers ────────────────────────────────────────────────

async function handlePortfolioImport(input, prefix) {
  const file = input.files[0];
  if (!file) return;
  const statusEl = document.getElementById(`import${prefix.charAt(0).toUpperCase()+prefix.slice(1)}Status`);
  statusEl.textContent = 'Parsing...';
  statusEl.style.color = '#999';
  try {
    const holdings = await parsePortfolioExcel(file);
    renderImportedHoldings(holdings, prefix);
    statusEl.textContent = `✓ ${holdings.length} holdings imported`;
    statusEl.style.color = '#3b6d11';
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
    statusEl.style.color = '#a32d2d';
  }
}

// Auto-build new portfolio = existing holdings + investments from Step 2
function buildNewFromExisting() {
  const existing = readPortfolioRows('existing');
  const tbody = document.getElementById('l-newRows');
  tbody.innerHTML = '';

  // Copy existing
  existing.forEach(h => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" value="${escAttr(h.product)}" /></td>
      <td><input type="text" value="${h.currency || 'USD'}" style="width:60px" /></td>
      <td><input type="number" value="${h.amount}" oninput="updateWAAR()" /></td>
      <td><input type="number" value="${h.riskRating}" min="1" max="6" step="0.5" style="width:55px" oninput="updateWAAR()" /></td>
      <td><button class="btn-remove" onclick="this.closest('tr').remove();updateWAAR()">×</button></td>`;
    tbody.appendChild(tr);
  });

  // Add Step 2 investments with auto risk rating
  const investRows = Array.from(document.querySelectorAll('#l-investRows tr')).map(tr => {
    const inputs = tr.querySelectorAll('input');
    return { product: inputs[0]?.value, amount: parseFloat(inputs[1]?.value) || 0 };
  }).filter(r => r.product && r.amount > 0);

  investRows.forEach(r => {
    const rr = RISK_RULES.etf(r.product);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" value="${escAttr(r.product)}" /></td>
      <td><input type="text" value="USD" style="width:60px" /></td>
      <td><input type="number" value="${r.amount}" oninput="updateWAAR()" /></td>
      <td><input type="number" value="${rr}" min="1" max="6" step="0.5" style="width:55px;color:#185fa5" oninput="updateWAAR()" title="Auto-assigned" /></td>
      <td><button class="btn-remove" onclick="this.closest('tr').remove();updateWAAR()">×</button></td>`;
    tbody.appendChild(tr);
  });

  updateWAAR();

  const status = document.getElementById('importNewStatus');
  if (status) {
    status.textContent = `✓ Built: ${existing.length} existing + ${investRows.length} new`;
    status.style.color = '#3b6d11';
  }
}

function escAttr(s) { return (s||'').replace(/"/g,'&quot;'); }

// ─── Portfolio Report handlers ────────────────────────────────────────────────

let _benchmark = null; // stored after monthly upload

function initReportTab() {
  // Pre-fill IR from client profile
  const client = clients[currentClientId];
  if (!client?.profile?.riskTolerance) return;
  const ir = client.profile.riskTolerance.replace(/IR(\d+)-.*/, 'IR$1');
  const radio = document.querySelector(`input[name="r-ir"][value="${ir}"]`);
  if (radio) radio.checked = true;
}

window.loadBenchmarkFile = async function(input) {
  const file = input.files[0];
  if (!file) return;
  const label = document.getElementById('benchmarkLoadedLabel');
  if (label) { label.textContent = 'Loading...'; label.style.color = '#854f0b'; }
  try {
    _benchmark = await parseBenchmarkExcel(file);
    try { localStorage.setItem('suitability-benchmark', JSON.stringify(_benchmark)); } catch(e) {}
    const month = file.name.match(/\w+_\d{4}/)?.[0] || file.name.replace('.xlsx','');
    if (label) { label.textContent = '✓ ' + month; label.style.color = '#3b6d11'; }
  } catch(e) {
    if (label) { label.textContent = 'Error'; label.style.color = '#a32d2d'; }
    alert('Error loading benchmark: ' + e.message);
  }
};

window.runPortfolioReport = async function() {
  const portfolioInput = document.getElementById('r-portfolioFile');
  if (!portfolioInput.files[0]) { alert('Please upload the cbonds portfolio export.'); return; }

  // Try to load benchmark from localStorage if not in memory
  if (!_benchmark) {
    try {
      const stored = localStorage.getItem('suitability-benchmark');
      if (stored) _benchmark = JSON.parse(stored);
    } catch(e) {}
  }

  if (!_benchmark) { alert('Please upload the IR benchmark file first.'); return; }

  const btn = document.querySelector('.btn-generate');
  btn.textContent = 'Generating...';
  btn.disabled = true;

  try {
    const portfolioData = await parseCbondsExport(portfolioInput.files[0]);
    const clientIR = document.querySelector('input[name="r-ir"]:checked')?.value || 'IR3';
    const client = clients[currentClientId] || { name: 'Client', profile: {} };

    // Get IR ratings from Claude for each holding
    const apiKey = document.getElementById('apiKey').value.trim();
    let irRatings = {};
    if (apiKey) {
      irRatings = await assignPortfolioRatings(portfolioData.holdings, apiKey);
    }

    const analytics = calculatePortfolioAnalytics(portfolioData, irRatings, clientIR);

    const reportDate = document.getElementById('r-reportDate').value
      ? new Date(document.getElementById('r-reportDate').value).toLocaleDateString('en-GB', {day:'numeric',month:'long',year:'numeric'})
      : new Date().toLocaleDateString('en-GB', {day:'numeric',month:'long',year:'numeric'});
    const dataDate = document.getElementById('r-dataDate').value
      ? new Date(document.getElementById('r-dataDate').value).toLocaleDateString('en-GB', {day:'numeric',month:'long',year:'numeric'})
      : reportDate;

    const chartSrc = document.getElementById('r-chartImg')?.src || '';
    window._lastPortfolioData = portfolioData;
    window._lastReportConfig  = { clientIR, client, benchmark: _benchmark, reportDate, dataDate, chartSrc };
    const html = generatePortfolioReport(portfolioData, analytics, _benchmark, clientIR, client, reportDate, dataDate, chartSrc);
    document.getElementById('r-reportContent').innerHTML = html;
    document.getElementById('r-reportOutput').classList.remove('hidden');
    document.getElementById('r-reportOutput').scrollIntoView({ behavior: 'smooth' });

  } catch(e) {
    alert('Error generating report: ' + e.message);
  }

  btn.textContent = 'Generate report ↗';
  btn.disabled = false;
};

async function assignPortfolioRatings(holdings, apiKey) {
  const list = holdings.map((h,i) => `${i+1}. ${h.name} (${h.type})`).join('\n');
  const prompt = `Assign IR risk ratings (1-6) to each holding per Orion Ridge Capital methodology:
- Govt bonds developed <5yr=1, 5-10yr=2, >10yr=3
- IG corp bonds ≤10yr=2, >10yr=3, HY bonds=4
- Broad/sector equity ETFs developed=3, HY/EM bond ETFs=4
- Large-cap equities developed=4

Holdings:
${list}

Return ONLY JSON: {"ratings": [{"index":1,"rating":2}, ...]}`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await resp.json();
    const text = data.content?.[0]?.text || '';
    const clean = text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
    const result = JSON.parse(clean);
    const ratings = {};
    (result.ratings || []).forEach((r, i) => {
      if (holdings[r.index - 1]) ratings[holdings[r.index - 1].name] = r.rating;
    });
    return ratings;
  } catch(e) {
    return {};
  }
}

// ─── Chart image handlers ─────────────────────────────────────────────────────
window.previewChart = function(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('r-chartImg').src = e.target.result;
    document.getElementById('r-chartFileName').textContent = file.name;
    document.getElementById('r-chartPreview').style.display = 'block';
    document.getElementById('r-clearChart').style.display = '';
  };
  reader.readAsDataURL(file);
};

window.clearChart = function() {
  document.getElementById('r-chartFile').value = '';
  document.getElementById('r-chartImg').src = '';
  document.getElementById('r-chartFileName').textContent = '';
  document.getElementById('r-chartPreview').style.display = 'none';
  document.getElementById('r-clearChart').style.display = 'none';
};
