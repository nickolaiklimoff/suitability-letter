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
  loadBenchmarkFromStorage();  // restore benchmark ETF quotes from localStorage
  // Restore API key from localStorage
  try {
    const savedKey = localStorage.getItem('suitability-api-key');
    if (savedKey) {
      const el = document.getElementById('apiKey');
      if (el) el.value = savedKey;
    }
  } catch(e) {}
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
    // Name span (click to select client)
    const nameSpan = document.createElement('span');
    nameSpan.textContent = c.name || 'Unnamed client';
    nameSpan.onclick = (e) => { e.stopPropagation(); selectClient(id); };
    // Edit pencil (click to rename inline)
    const editBtn = document.createElement('span');
    editBtn.textContent = ' ✎';
    editBtn.className = 'client-edit-btn';
    editBtn.title = 'Rename';
    editBtn.onclick = (e) => { e.stopPropagation(); startRenameClient(id); };
    div.appendChild(nameSpan);
    div.appendChild(editBtn);
    el.appendChild(div);
  });
}

function startRenameClient(id) {
  selectClient(id);
  const editor = document.getElementById('clientNameEditor');
  const input = document.getElementById('clientNameInput');
  editor.classList.remove('hidden');
  input.value = clients[id].name || '';
  input.focus();
  input.select();
}

function updateClientName(val) {
  if (!currentClientId) return;
  clients[currentClientId].name = val.trim() || 'Unnamed client';
  saveToStorage();
  renderClientList();
}

function saveClientName() {
  if (!currentClientId) return;
  const input = document.getElementById('clientNameInput');
  const name = input.value.trim();
  if (name) {
    clients[currentClientId].name = name;
    saveToStorage();
    renderClientList();
  }
  document.getElementById('clientNameEditor').classList.add('hidden');
}

function startRenameClient(id) {
  selectClient(id);
  const editor = document.getElementById('clientNameEditor');
  const input = document.getElementById('clientNameInput');
  editor.classList.remove('hidden');
  input.value = clients[id].name || '';
  input.focus();
  input.select();
}

function updateClientName(val) {
  if (!currentClientId) return;
  clients[currentClientId].name = val.trim() || 'Unnamed client';
  saveToStorage();
  renderClientList();
}

function saveClientName() {
  if (!currentClientId) return;
  const input = document.getElementById('clientNameInput');
  const name = input.value.trim();
  if (name) {
    clients[currentClientId].name = name;
    saveToStorage();
    renderClientList();
  }
  document.getElementById('clientNameEditor').classList.add('hidden');
}

function newClient() {
  const id = 'c_' + Date.now();
  clients[id] = { name: 'New client', profile: {}, letters: [] };
  saveToStorage();
  selectClient(id);
  renderClientList();
}

function saveReportState() {
  if (!currentClientId) return;
  const c = clients[currentClientId];
  if (!c) return;
  c.reportState = {
    reportDate:    document.getElementById('r-reportDate')?.value || '',
    dataDate:      document.getElementById('r-dataDate')?.value || '',
    ir:            document.querySelector('input[name="r-ir"]:checked')?.value || 'IR3',
    portCcy:       document.getElementById('r-portfolioCcy')?.value || 'USD',
    portfolioFileName: document.getElementById('r-portfolioFileName')?.textContent || '',
    chartSrc:      document.getElementById('r-chartImg')?.src || '',
    chartFileName: document.getElementById('r-chartFileName')?.textContent || '',
    breakdownSrc:  document.getElementById('r-breakdownImg')?.src || '',
    breakdownFileName: document.getElementById('r-breakdownFileName')?.textContent || '',
    reportHtml:    document.getElementById('r-reportContent')?.innerHTML || '',
    reportVisible: !document.getElementById('r-reportOutput')?.classList.contains('hidden'),
  };
  saveToStorage();
}

function loadReportState() {
  if (!currentClientId) return;
  const s = clients[currentClientId]?.reportState;

  if (!s) { resetReportForm(); return; }

  // Dates
  const rd = document.getElementById('r-reportDate');
  if (rd) rd.value = s.reportDate || '';
  const dd = document.getElementById('r-dataDate');
  if (dd) dd.value = s.dataDate || '';

  // IR rating
  if (s.ir) {
    const irEl = document.querySelector('input[name="r-ir"][value="'+s.ir+'"]');
    if (irEl) irEl.checked = true;
  }

  // Currency
  const ccy = document.getElementById('r-portfolioCcy');
  if (ccy && s.portCcy) ccy.value = s.portCcy;

  // Portfolio file name (can't restore actual File object, just show name)
  const pfName = document.getElementById('r-portfolioFileName');
  if (pfName) pfName.textContent = s.portfolioFileName || '';

  // Chart image
  const chartImg = document.getElementById('r-chartImg');
  const chartPreview = document.getElementById('r-chartPreview');
  const chartName = document.getElementById('r-chartFileName');
  if (chartImg && s.chartSrc && s.chartSrc.startsWith('data:')) {
    chartImg.src = s.chartSrc;
    if (chartPreview) chartPreview.style.display = 'block';
    if (chartName) chartName.textContent = s.chartFileName || '';
  } else {
    if (chartImg) chartImg.src = '';
    if (chartPreview) chartPreview.style.display = 'none';
    if (chartName) chartName.textContent = '';
  }

  // Breakdown image
  const brkImg = document.getElementById('r-breakdownImg');
  const brkPreview = document.getElementById('r-breakdownPreview');
  const brkName = document.getElementById('r-breakdownFileName');
  if (brkImg && s.breakdownSrc && s.breakdownSrc.startsWith('data:')) {
    brkImg.src = s.breakdownSrc;
    if (brkPreview) brkPreview.style.display = 'block';
    if (brkName) brkName.textContent = s.breakdownFileName || '';
  } else {
    if (brkImg) brkImg.src = '';
    if (brkPreview) brkPreview.style.display = 'none';
    if (brkName) brkName.textContent = '';
  }

  // Restore generated report HTML
  const reportContent = document.getElementById('r-reportContent');
  const reportOutput = document.getElementById('r-reportOutput');
  if (reportContent && s.reportHtml) {
    reportContent.innerHTML = s.reportHtml;
    if (reportOutput && s.reportVisible) reportOutput.classList.remove('hidden');
    else if (reportOutput) reportOutput.classList.add('hidden');
    // Restore display currency buttons state
    if (s.portCcy) {
      _displayCcy = s.portCcy;
      _displayFxRates = { [s.portCcy]: 1, _base: s.portCcy };
      document.querySelectorAll('.ccy-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.ccy === s.portCcy));
    }
  } else {
    if (reportContent) reportContent.innerHTML = '';
    if (reportOutput) reportOutput.classList.add('hidden');
  }
}

function selectClient(id) {
  saveReportState();  // save current client state before switching
  currentClientId = id;
  renderClientList();
  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('appContent').classList.remove('hidden');
  switchTab('report', document.querySelector('.tab'));
  loadProfileForm();
  loadClientTab();
  resetLetterForm();
  loadReportState();  // restore new client state
}

function resetReportForm() {
  // Clear portfolio file
  const pf = document.getElementById('r-portfolioFile');
  if (pf) pf.value = '';
  const pfName = document.getElementById('r-portfolioFileName');
  if (pfName) pfName.textContent = '';

  // Clear chart image
  const chartImg = document.getElementById('r-chartImg');
  if (chartImg) chartImg.src = '';
  const chartFile = document.getElementById('r-chartFile');
  if (chartFile) chartFile.value = '';
  const chartName = document.getElementById('r-chartFileName');
  if (chartName) chartName.textContent = '';

  // Clear breakdown image
  const brkImg = document.getElementById('r-breakdownImg');
  if (brkImg) brkImg.src = '';
  const brkFile = document.getElementById('r-breakdownFile');
  if (brkFile) brkFile.value = '';
  const brkName = document.getElementById('r-breakdownFileName');
  if (brkName) brkName.textContent = '';

  // Hide chart/breakdown previews (they use inline style not class)
  const chartPreview = document.getElementById('r-chartPreview');
  if (chartPreview) chartPreview.style.display = 'none';
  const brkPreview = document.getElementById('r-breakdownPreview');
  if (brkPreview) brkPreview.style.display = 'none';

  // Reset dates
  const rd = document.getElementById('r-reportDate');
  if (rd) rd.value = '';
  const dd = document.getElementById('r-dataDate');
  if (dd) dd.value = '';

  // Clear holding quotes (per-client, not persisted)
  window._holdingQuotesData = {};
  const hqStatus = document.getElementById('r-holdingQuotesStatus');
  if (hqStatus) hqStatus.textContent = '';
  const hqInput = document.getElementById('r-holdingQuotes');
  if (hqInput) hqInput.value = '';
  // Reset analytics mode to chart
  window._analyticsMode = 'chart';
  document.querySelectorAll('input[name="analyticsMode"]').forEach(r => r.checked = r.value === 'chart');
  const aInputs = document.getElementById('analyticsFullInputs');
  if (aInputs) aInputs.style.display = 'none';

  // Reset currency dropdown to USD (will be auto-detected on next file upload)
  const ccy = document.getElementById('r-portfolioCcy');
  if (ccy) ccy.value = 'USD';

  // Hide report output
  document.getElementById('r-reportOutput')?.classList.add('hidden');
}

function loadClientTab() {
  if (!currentClientId) return;
  const el = document.getElementById('c-name');
  if (el) el.value = clients[currentClientId].name || '';
  // Restore holding quotes from localStorage
  loadHoldingQuotesFromStorage();
}

function loadHoldingQuotesFromStorage() {
  if (!currentClientId) return;
  try {
    const key = 'suitability-holding-quotes-' + currentClientId;
    const stored = localStorage.getItem(key);
    if (stored) {
      window._holdingQuotesData = JSON.parse(stored);
      const count = Object.keys(window._holdingQuotesData).length;
      const statusEl = document.getElementById('r-holdingQuotesStatus');
      if (statusEl && count > 0) statusEl.textContent = count + ' files (saved)';
      console.log('[holdingQuotes] restored', count, 'files from localStorage');
    } else {
      window._holdingQuotesData = {};
    }
  } catch(e) {
    window._holdingQuotesData = {};
  }
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
  if (btn && !btn.classList.contains('hidden')) btn.classList.add('active');
  else if (name !== 'base') {
    const tabs = document.querySelectorAll('.tab');
    const idx = ['report','letter','profile','client','history'].indexOf(name);
    if (tabs[idx]) tabs[idx].classList.add('active');
  }
  document.getElementById('tab-' + name).classList.remove('hidden');
  if (name === 'history') renderHistory();
  if (name === 'report') initReportTab();
  if (name === 'client') loadClientTab();
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

  // name is edited via sidebar rename, not in profiling form

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
  // name is managed via sidebar rename
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

    // Portfolio base currency: auto-detected from xlsx, UI dropdown as manual override
    const uiCcy = document.getElementById('r-portfolioCcy')?.value || 'USD';
    const autoCcy = portfolioData._detectedPortCcy || 'USD';
    // If user manually changed dropdown away from USD, respect that; otherwise use autodetect
    const portCcy = (uiCcy !== 'USD') ? uiCcy : autoCcy;
    portfolioData.portCcy = portCcy;
    // Always update dropdown to show detected/active currency
    const ccyEl = document.getElementById('r-portfolioCcy');
    if (ccyEl) ccyEl.value = portCcy;
    console.log('[report] portCcy=', portCcy, 'autoCcy=', autoCcy, 'uiCcy=', uiCcy);

    // The converted values from cbonds are already in portCcy (the portfolio base currency).
    // We keep them as-is — no conversion needed. reportCcy is what shows on the report.
    // The display-currency switcher (USD/EUR/GBP buttons) handles live conversion.
    portfolioData.reportCcy = portCcy;
    // Store the symbol for this currency for use in the report
    const ccySymbols = { USD:'$', EUR:'€', GBP:'£', CHF:'Fr ', RUB:'₽' };
    portfolioData.reportCcySym = ccySymbols[portCcy] || portCcy+' ';

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
    const breakdownSrc = document.getElementById('r-breakdownImg')?.src || '';

    // Analytics — full mode (quotes) or quick mode (chart)
    const analyticsMode = window._analyticsMode || 'chart';
    const holdingFiles = Object.keys(window._holdingQuotesData||{});
    console.log('[analytics] mode=', analyticsMode, 'holdingFiles=', holdingFiles.length, 'benchmark keys=', Object.keys(window._benchmarkQuotesData||{}));

    // Full mode: computeFullAnalytics runs AFTER generatePortfolioReport sets _realCostBasis/_realTotalPnL
    // So we pass a flag and compute after HTML generation
    portfolioData._pendingFullAnalytics = analyticsMode === 'full' && holdingFiles.length > 0;
    console.log('[analytics] mode=', analyticsMode, 'holding files=', holdingFiles.length, 'pending full=', portfolioData._pendingFullAnalytics);

    // Chart-based analytics: run if quick mode OR full mode has no files (fallback)
    const useChart = (analyticsMode !== 'full' || holdingFiles.length === 0) && chartSrc && chartSrc.startsWith('data:') && apiKey;
    if (useChart) {
      const btn2 = document.querySelector('.btn-generate');
      if (btn2) btn2.textContent = 'Reading chart…';
      try {
        portfolioData._analytics = await extractChartAnalytics(chartSrc, apiKey, portCcy);
        console.log('[analytics] chart result:', portfolioData._analytics ? 'OK' : 'null');
      } catch(e) {
        console.warn('[analytics] chart failed:', e);
        portfolioData._analytics = null;
      }
    }

    window._lastPortfolioData = portfolioData;
    window._lastReportConfig  = { clientIR, client, benchmark: _benchmark, reportDate, dataDate, chartSrc, breakdownSrc };
    const html = generatePortfolioReport(portfolioData, analytics, _benchmark, clientIR, client, reportDate, dataDate, chartSrc, breakdownSrc);
    document.getElementById('r-reportContent').innerHTML = html;
    // Store key metrics for commentary generation
    window._lastWaar = analytics?.waar ?? null;
    window._lastEquityPct = analytics?.equityPct != null ? (analytics.equityPct*100).toFixed(1)+'%' : 'N/A';
    window._lastBondPct   = analytics?.bondPct   != null ? (analytics.bondPct*100).toFixed(1)+'%'   : 'N/A';
    window._lastCashPct   = analytics?.cashPct   != null ? (analytics.cashPct*100).toFixed(1)+'%'   : 'N/A';
    const bmDef = _benchmark?.[clientIR] || {};
    window._lastBmEquity = bmDef.equity != null ? (bmDef.equity*100).toFixed(1)+'%' : 'N/A';
    window._lastBmBond   = bmDef.bond   != null ? (bmDef.bond*100).toFixed(1)+'%'   : 'N/A';
    window._lastAnalyticsData = analytics;
    // Full analytics: runs HERE because generatePortfolioReport sets _realCostBasis/_realTotalPnL
    if (portfolioData._pendingFullAnalytics) {
      const btn2 = document.querySelector('.btn-generate');
      if (btn2) btn2.textContent = 'Computing analytics…';
      try {
        const fullA = computeFullAnalytics(portfolioData, _benchmark, clientIR);
        console.log('[analytics] full result:', fullA ? `OK (${fullA.n} days, ${fullA.matchedHoldings} holdings)` : 'null');
        if (fullA) {
          portfolioData._analytics = fullA;
          // Regenerate report with full analytics
          const html2 = generatePortfolioReport(portfolioData, analytics, _benchmark, clientIR, client, reportDate, dataDate, chartSrc, breakdownSrc);
          document.getElementById('r-reportContent').innerHTML = html2;
        } else {
          console.warn('[analytics] full analytics returned null — check holding file matching');
        }
      } catch(e) {
        console.warn('[analytics] full analytics error:', e);
      }
    }

    // Auto-generate commentary AFTER full analytics (so it has complete data)
    autoGenerateCommentary();

    // Reset display currency to report base currency
    _displayCcy = portCcy;
    _displayFxRates = { [portCcy]: 1, _base: portCcy };
    document.querySelectorAll('.ccy-btn').forEach(b => b.classList.toggle('active', b.dataset.ccy === portCcy));
    saveReportState();  // persist generated report for this client
    document.getElementById('r-reportOutput').classList.remove('hidden');
    document.getElementById('r-reportOutput').scrollIntoView({ behavior: 'smooth' });

  } catch(e) {
    alert('Error generating report: ' + e.message);
  }

  btn.textContent = 'Generate report ↗';
  btn.disabled = false;
};

// ─── Analytics mode & file loading ──────────────────────────────────────────

// In-memory stores (holding quotes reset per client, benchmark persists)
window._holdingQuotesData = {};   // { filename: { date: price } }
window._benchmarkQuotesData = {}; // { 'ACWI'|'BONDS'|'CASH': { date: price } }
window._analyticsMode = 'chart';  // 'chart' | 'full'

function setAnalyticsMode(mode) {
  window._analyticsMode = mode;
  document.getElementById('analyticsFullInputs').style.display = mode === 'full' ? 'block' : 'none';
  // If full mode and benchmark not yet loaded, check localStorage
  if (mode === 'full') loadBenchmarkFromStorage();
}

// ── Holding quotes ────────────────────────────────────────────────────────────
async function loadHoldingQuotes(input) {
  const files = Array.from(input.files);
  if (!files.length) return;
  const status = document.getElementById('r-holdingQuotesStatus');
  status.textContent = 'Loading...';
  window._holdingQuotesData = {};
  let loaded = 0;
  for (const file of files) {
    try {
      const data = await readXlsxPrices(file);
      if (data && Object.keys(data).length > 0) {
        window._holdingQuotesData[file.name] = data;
        loaded++;
      }
    } catch(e) { console.warn('Failed to load', file.name, e); }
  }
  status.textContent = `${loaded}/${files.length} files loaded`;
  // Persist holding quotes to localStorage for this client
  try {
    const key = 'suitability-holding-quotes-' + (window.currentClientId || 'default');
    localStorage.setItem(key, JSON.stringify(window._holdingQuotesData));
    console.log('[holdingQuotes] saved', loaded, 'files to localStorage');
  } catch(e) {
    console.warn('[holdingQuotes] localStorage save failed (possibly too large):', e.message);
  }
  saveReportState();
}

// ── Benchmark quotes ──────────────────────────────────────────────────────────
// Detect which file is ACWI, BONDS, or CASH by filename keywords
function detectBenchmarkType(filename) {
  const f = filename.toLowerCase();
  if (f.includes('acwi') || f.includes('msci')) return 'ACWI';
  if (f.includes('aggr') || f.includes('aggu') || f.includes('qdvj') || f.includes('aggregate') || f.includes('bond')) return 'BONDS';
  if (f.includes('t-bill') || f.includes('tbill') || f.includes('bil') || f.includes('cash')) return 'CASH';
  return null;
}

async function loadBenchmarkQuotes(input) {
  const files = Array.from(input.files);
  if (!files.length) return;
  const status = document.getElementById('r-benchmarkStatus') || document.getElementById('benchmarkEtfStatus');
  if (status) status.textContent = 'Loading...';
  let loaded = [];
  for (const file of files) {
    const type = detectBenchmarkType(file.name);
    if (!type) { console.warn('Cannot detect benchmark type for', file.name); continue; }
    try {
      const data = await readXlsxPrices(file);
      if (data && Object.keys(data).length > 0) {
        window._benchmarkQuotesData[type] = data;
        loaded.push(type);
      }
    } catch(e) { console.warn('Failed to load benchmark', file.name, e); }
  }
  // Persist to localStorage (benchmark files reused across sessions)
  try {
    localStorage.setItem('suitability-benchmark-quotes', JSON.stringify(window._benchmarkQuotesData));
  } catch(e) { console.warn('localStorage full:', e); }
  updateBenchmarkStatus();
  status.textContent = loaded.length ? loaded.join(', ') + ' loaded' : 'No files recognized';
}

function loadBenchmarkFromStorage() {
  if (Object.keys(window._benchmarkQuotesData).length > 0) { updateBenchmarkStatus(); return; }
  try {
    const stored = localStorage.getItem('suitability-benchmark-quotes');
    if (stored) {
      window._benchmarkQuotesData = JSON.parse(stored);
      updateBenchmarkStatus();
    }
  } catch(e) {}
}

// Sidebar wrapper for benchmark ETF upload
async function loadBenchmarkQuotesSidebar(input) {
  await loadBenchmarkQuotes(input);
  updateBenchmarkStatus();
}

function updateBenchmarkStatus() {
  const types = Object.keys(window._benchmarkQuotesData);

  // Sidebar label
  const sideLabel = document.getElementById('benchmarkEtfLabel');
  const sideStatus = document.getElementById('benchmarkEtfStatus');
  if (sideLabel) sideLabel.textContent = types.length === 3 ? '✓ Loaded' : types.length > 0 ? `(${types.join(', ')})` : '';
  if (sideStatus) {
    if (types.length === 0) { sideStatus.textContent = 'Not loaded'; return; }
    const info = types.map(t => {
      const d = window._benchmarkQuotesData[t];
      const dates = Object.keys(d).sort();
      return `${t}: ${dates[dates.length-1]}`;
    });
    sideStatus.textContent = info.join('  ·  ');
  }

  // Report tab info
  const el = document.getElementById('r-benchmarkLoaded');
  if (el) {
    el.textContent = types.length > 0
      ? '✓ Benchmark ETFs loaded: ' + types.join(', ') + ' (from Settings)'
      : '⚠ No benchmark ETFs — upload ACWI + AGGU + BIL in Settings sidebar';
  }
}

// ── Generic xlsx price reader (works for cbonds export format) ────────────────
async function readXlsxPrices(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'binary', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
        const prices = {};
        // Find header row (row with 'Date')
        let dataStart = 2; // default skip 2 rows
        for (let i = 0; i < Math.min(rows.length, 5); i++) {
          if (rows[i] && rows[i].some(c => String(c||'').toLowerCase().includes('date'))) {
            dataStart = i + 1; break;
          }
        }
        // Detect close price column (Last/Close = col index 4 or 6)
        const headerRow = rows[dataStart - 1] || [];
        let closeCol = 4; // default
        for (let j = 0; j < headerRow.length; j++) {
          const h = String(headerRow[j]||'').toLowerCase();
          if (h === 'last' || h === 'last/close' || h === 'close') { closeCol = j; break; }
          if (h === 'nav per share, usd' || h === 'nav per share') { closeCol = j; break; }
        }
        for (let i = dataStart; i < rows.length; i++) {
          const row = rows[i];
          if (!row || !row[0]) continue;
          let d = row[0];
          let p = row[closeCol];
          if (p === null || p === '' || p === undefined) continue;
          // Parse date
          if (d instanceof Date) {
            d = d.toISOString().slice(0, 10);
          } else if (typeof d === 'string') {
            // dd/mm/yyyy or yyyy-mm-dd
            const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
            if (m) d = m[3] + '-' + m[2] + '-' + m[1];
            else if (!/^\d{4}-/.test(d)) continue;
          } else if (typeof d === 'number') {
            // Excel serial date
            const dt = new Date(Math.round((d - 25569) * 86400 * 1000));
            d = dt.toISOString().slice(0, 10);
          } else continue;
          prices[d] = parseFloat(p);
        }
        resolve(prices);
      } catch(err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
}

// On page load — restore benchmark from localStorage
document.addEventListener('DOMContentLoaded', () => {
  loadBenchmarkFromStorage();
});

// ─── Portfolio Commentary Generator ──────────────────────────────────────────

function buildCommentaryPrompt() {
  const pd = window._lastPortfolioData;
  const cfg = window._lastReportConfig;
  if (!pd || !cfg) return null;

  const clientIR = cfg.clientIR || 'IR3';
  const irNum = parseInt(clientIR.replace('IR','')) || 3;
  const maxWaar = irNum + 0.49;
  const waar = window._lastWaar;
  const waarBreached = typeof waar === 'number' && waar > maxWaar;
  const analytics = pd._analytics;
  const portCcy = pd.reportCcy || 'USD';
  const sym = {'USD':'$','EUR':'€','GBP':'£','CHF':'Fr '}[portCcy] || portCcy;
  const allH = [...(pd.stocks||[]),...(pd.funds||[]),...(pd.bonds||[])];
  const topPos = allH
    .sort((a,b)=>b.convertedHoldingValue-a.convertedHoldingValue)
    .slice(0,5)
    .map(h=>`${h.name}: ${sym}${Math.round(h.convertedHoldingValue).toLocaleString()} (${((h.convertedHoldingValue/(pd.totalValue||1))*100).toFixed(1)}%)`)
    .join('; ');

  let metrics = '';
  if (analytics) {
    metrics = [
      analytics.totalReturn != null ? `Total Return: ${(analytics.totalReturn*100).toFixed(1)}%` : '',
      analytics.vol         != null ? `Volatility (ann.): ${(analytics.vol*100).toFixed(1)}%` : '',
      analytics.maxDD       != null ? `Max Drawdown: ${(analytics.maxDD*100).toFixed(1)}%` : '',
      analytics.sharpe      != null ? `Sharpe: ${analytics.sharpe.toFixed(2)}` : '',
      analytics.benchmark?.beta != null ? `Beta vs benchmark: ${analytics.benchmark.beta.toFixed(2)}` : '',
      analytics.period ? `Period: ${analytics.period}` : '',
      analytics.ddStart && analytics.ddTrough ? `DD period: ${analytics.ddStart} → ${analytics.ddTrough}, recovery: ${analytics.ddRecovery}` : '',
    ].filter(Boolean).join(' | ');
  }

  // Add full-mode specific metrics
  let fullModeText = '';
  if (analytics && analytics.mode === 'full') {
    const bm = analytics.benchmark;
    const rc = analytics.riskContrib;
    if (bm) fullModeText += `Beta vs benchmark: ${bm.beta.toFixed(2)} | Alpha (ann.): ${(bm.alpha*100).toFixed(1)}% | R²: ${bm.r2.toFixed(2)}. `;
    if (rc && rc.items) {
      const top3rc = rc.items.slice(0,3).map(x=>`${x.name.split(',')[0]} (${x.pct.toFixed(0)}% of risk)`).join(', ');
      fullModeText += `Top risk contributors: ${top3rc}. Portfolio volatility: ${(rc.portVol*100).toFixed(1)}%.`;
    }
  }

  const isFullMode = analytics?.mode === 'full';

  return `You are writing a concise portfolio risk commentary for an investment advisory report at Orion Ridge Capital.

CLIENT: ${cfg.client?.name || 'Client'}
RISK PROFILE: ${clientIR} | MAX PERMITTED WAAR: ${maxWaar.toFixed(2)}
CURRENT WAAR: ${waar != null ? waar.toFixed(2) : 'N/A'} ${waarBreached ? '— BREACH (+' + (waar-maxWaar).toFixed(2) + ' points above ' + clientIR + ' maximum)' : '— within ' + clientIR + ' corridor'}

ASSET ALLOCATION vs ${clientIR} benchmark:
Equities: ${window._lastEquityPct || 'N/A'} vs ${window._lastBmEquity || 'N/A'} | Bonds: ${window._lastBondPct || 'N/A'} vs ${window._lastBmBond || 'N/A'} | Cash: ${window._lastCashPct || 'N/A'}

TOP 5 POSITIONS: ${topPos}
PERFORMANCE METRICS: ${metrics || 'N/A'}
${fullModeText ? 'FULL ANALYTICS (daily price data): ' + fullModeText : ''}

Write exactly ${isFullMode ? '4' : '3'} paragraphs (no headers, no bullets) covering:
1. Suitability Assessment — WAAR status vs ${clientIR} maximum of ${maxWaar.toFixed(2)}, and allocation deviation from benchmark with exact numbers
2. Portfolio Behaviour — volatility, max drawdown, recovery${isFullMode ? ', beta, alpha vs benchmark' : ''}
3. Performance — total return, key contributors
${isFullMode ? '4. Risk Concentration — based on risk contribution analysis, which positions drive the most portfolio risk and what this means for diversification' : ''}

Style: factual, objective, professional investment advisory. No recommendations. No value judgements on specific holdings.`;
}

async function generateCommentaryText(extraInstruction) {
  const apiKey = document.getElementById('apiKey').value.trim();
  if (!apiKey) return null;

  const basePrompt = buildCommentaryPrompt();
  if (!basePrompt) return null;

  const userContent = extraInstruction
    ? basePrompt + `

Additional instruction: ${extraInstruction}`
    : basePrompt;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 600,
      messages: [{ role: 'user', content: userContent }]
    })
  });
  const data = await resp.json();
  return data.content?.[0]?.text?.trim() || null;
}

// Auto-generate commentary after report is rendered
async function autoGenerateCommentary() {
  const apiKey = document.getElementById('apiKey').value.trim();
  if (!apiKey || !window._lastPortfolioData) return;

  const bodyEl = document.getElementById('r-commentary-body');
  if (!bodyEl) return;

  bodyEl.innerHTML = '<div style="color:#8B7A68;font-size:12px;padding:0.5rem 0">Generating commentary…</div>';

  try {
    const text = await generateCommentaryText(null);
    if (text) {
      const paras = text.split('\n\n').filter(p => p.trim());
      bodyEl.innerHTML = paras.map(p =>
        `<p style="font-size:12px;line-height:1.7;margin-bottom:0.8rem;color:#2C2C2C">${p.trim()}</p>`
      ).join('');
      saveReportState();
    } else {
      bodyEl.innerHTML = '<div style="color:#8B7A68;font-size:12px">Commentary not available — check API key.</div>';
    }
  } catch(e) {
    bodyEl.innerHTML = '<div style="color:#a32d2d;font-size:12px">Error generating commentary: ' + e.message + '</div>';
  }
}

// Rewrite with instruction from the inline widget
window.rewriteCommentary = async function() {
  const apiKey = document.getElementById('apiKey').value.trim();
  if (!apiKey) { alert('Please enter API key in Settings.'); return; }

  const instruction = document.getElementById('r-rewrite-instruction')?.value?.trim();
  const statusEl   = document.getElementById('r-rewrite-status');
  const bodyEl     = document.getElementById('r-commentary-body');
  if (!bodyEl) return;

  if (statusEl) { statusEl.textContent = 'Rewriting…'; statusEl.style.color = '#8B7A68'; }

  try {
    const text = await generateCommentaryText(instruction);
    if (text) {
      const paras = text.split('\n\n').filter(p => p.trim());
      bodyEl.innerHTML = paras.map(p =>
        `<p style="font-size:12px;line-height:1.7;margin-bottom:0.8rem;color:#2C2C2C">${p.trim()}</p>`
      ).join('');
      if (statusEl) { statusEl.textContent = '✓ Done'; statusEl.style.color = '#3b6d11'; }
      if (document.getElementById('r-rewrite-instruction'))
        document.getElementById('r-rewrite-instruction').value = '';
      saveReportState();
    }
  } catch(e) {
    if (statusEl) { statusEl.textContent = 'Error: ' + e.message; statusEl.style.color = '#a32d2d'; }
  }
};

// ─── Display currency switcher ───────────────────────────────────────────────
let _displayCcy = 'USD';
let _displayFxRates = { USD: 1 };

async function switchDisplayCcy(toCcy, btn) {
  document.querySelectorAll('.ccy-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (toCcy === _displayCcy) return;

  // Fetch rates based on report base currency (not always USD)
  const baseCcy = _displayFxRates._base || 'USD';
  if (!_displayFxRates[toCcy] || !_displayFxRates[_displayCcy]) {
    btn.textContent = '…';
    try {
      const resp = await fetch('https://open.er-api.com/v6/latest/' + baseCcy);
      const data = await resp.json();
      if (data && data.rates) {
        _displayFxRates = { ...data.rates, [baseCcy]: 1, _base: baseCcy };
      }
    } catch(e) {
      // Fallback approximate rates vs EUR
      const vs = { USD:1.163, EUR:1, GBP:0.851, CHF:0.965, RUB:107.5 };
      _displayFxRates = { ...vs, _base: baseCcy };
    }
    btn.textContent = toCcy;
  }

  // Factor: from current display ccy to target
  // data-usd stores the value in report base currency
  // _displayCcy tracks what currency is currently shown
  const fromRate = _displayFxRates[_displayCcy] || 1;
  const toRate   = _displayFxRates[toCcy]       || 1;
  const factor   = toRate / fromRate;

  const symbols = { USD:'$', EUR:'€', GBP:'£', CHF:'Fr ', RUB:'₽' };
  const sym = symbols[toCcy] || toCcy+' ';

  const content = document.getElementById('r-reportContent');
  if (!content) return;

  content.querySelectorAll('[data-usd]').forEach(el => {
    // data-usd holds value in REPORT base currency
    const base = parseFloat(el.getAttribute('data-usd'));
    const converted = base * toRate;
    const abs = Math.abs(converted);
    const prefix = el.getAttribute('data-prefix') || '';
    el.textContent = prefix + sym + Math.round(abs).toLocaleString('en-US');
  });

  content.querySelectorAll('.cover-ccy-label, .ccy-label').forEach(el => {
    el.textContent = toCcy;
  });

  _displayCcy = toCcy;
}

// ─── FX rate fetcher ─────────────────────────────────────────────────────────
async function fetchFxToUSD(fromCcy) {
  if (!fromCcy || fromCcy === 'USD') return 1;
  try {
    // Use open exchange rate API (no key needed for this endpoint)
    const resp = await fetch(`https://open.er-api.com/v6/latest/${fromCcy}`);
    const data = await resp.json();
    if (data && data.rates && data.rates['USD']) return data.rates['USD'];
  } catch(e) {}
  // Fallback hardcoded rates if API fails
  const fallback = { EUR: 1.08, GBP: 1.27, CHF: 1.12, RUB: 0.011 };
  return fallback[fromCcy] || 1;
}

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
    saveReportState();
    document.getElementById('r-chartPreview').style.display = 'block';
    document.getElementById('r-clearChart').style.display = '';
  };
  reader.readAsDataURL(file);
};

window.clearChart = function() {
  document.getElementById('r-chartFile').value = '';
  document.getElementById('r-chartImg').src = '';
  document.getElementById('r-chartFileName').textContent = '';
  saveReportState();
  document.getElementById('r-chartPreview').style.display = 'none';
  document.getElementById('r-clearChart').style.display = 'none';
};

window.previewBreakdown = function(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('r-breakdownImg').src = e.target.result;
    document.getElementById('r-breakdownFileName').textContent = file.name;
    saveReportState();
    document.getElementById('r-breakdownPreview').style.display = 'block';
    document.getElementById('r-clearBreakdown').style.display = '';
  };
  reader.readAsDataURL(file);
};

window.clearBreakdown = function() {
  document.getElementById('r-breakdownFile').value = '';
  document.getElementById('r-breakdownImg').src = '';
  document.getElementById('r-breakdownFileName').textContent = '';
  saveReportState();
  document.getElementById('r-breakdownPreview').style.display = 'none';
  document.getElementById('r-clearBreakdown').style.display = 'none';
};

// ─── Print Report (new window with cover + all sections) ──────────────────────
window.printReport = function() {
  const content = document.getElementById('r-reportContent');
  if (!content || !content.innerHTML.trim()) {
    alert('Please generate the report first.'); return;
  }

  // We do NOT copy stylesheets from the main page — they contain
  // @media print rules (font-size:8px, display:none on cover, etc.)
  // that would override everything when the print dialog fires.
  // Instead we write all required report styles explicitly below.
  const styles = '';

  // Get cover and report-doc from inside r-reportContent
  const coverEl = content.querySelector('.report-cover');
  const reportDocEl = content.querySelector('.report-doc');
  const coverHtml = coverEl ? coverEl.outerHTML : '';
  const reportHtml = reportDocEl ? reportDocEl.outerHTML : content.innerHTML;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Portfolio Report</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    /* ═══════════════════════════════════════════════════════════════
       Self-contained print styles — no main-page CSS is imported.
       This prevents @media print rules (font-size:8px, display:none)
       from firing when the print dialog opens.
    ═══════════════════════════════════════════════════════════════ */

    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; margin: 0; padding: 0; }

    @page { size: A4 landscape; margin: 1.2cm 1.5cm; }
    @page :first { margin: 0; }

    html, body {
      background: white;
      font-family: 'Georgia', 'Times New Roman', serif;
      font-size: 12px;
      color: #2C2C2C;
      overflow: visible;
      height: auto;
    }

    /* ── Cover ── */
    .report-cover {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: stretch;
      text-align: right;
      width: 100%;
      height: 19.6cm;
      padding: 1.2cm 1.5cm;
      box-sizing: border-box;
      page-break-after: always;
      break-after: page;
      background: white;
      overflow: hidden;
    }
    .report-cover-logo {
      font-size: 11px;
      letter-spacing: 0.25em;
      font-weight: 700;
      color: #8B7A68;
      text-transform: uppercase;
      text-align: right;
    }
    .report-cover-body {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      text-align: right;
    }
    .report-title {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 52px;
      font-weight: 700;
      color: #5A7259;
      line-height: 1.1;
      margin-bottom: 0.3rem;
    }
    .report-subtitle {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 15px;
      color: #8B7A68;
      margin-bottom: 1.5rem;
    }
    .report-cover-divider {
      width: 48px;
      height: 2px;
      background: #5A7259;
      margin: 0 0 1.5rem auto;
    }
    .report-cover-meta { width: 280px; margin-bottom: 1.5rem; }
    .report-cover-meta .cover-row {
      display: flex;
      justify-content: space-between;
      padding: 5px 0;
      border-bottom: 0.5px solid #E8E0D8;
      font-size: 12px;
    }
    .report-cover-meta .cover-row .label { color: #8B7A68; }
    .report-cover-meta .cover-row strong { color: #2C2C2C; }
    .portfolio-value { font-family: 'Playfair Display', Georgia, serif; font-size: 16px; font-weight: 700; }
    .report-confidential { font-size: 11px; letter-spacing: 0.2em; font-weight: 700; color: #8B7A68; margin-top: 1.5rem; text-align: right; }
    .report-fca { font-size: 10px; color: #8B7A68; margin-top: 0.2rem; text-align: right; }

    /* ── Report body ── */
    .report-doc { max-width: 100%; display: block; overflow: visible; }

    .report-section { margin-bottom: 1.5rem; }
    .report-section-numbered { page-break-before: always; break-before: page; }

    .report-section-title {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 15px;
      font-weight: 700;
      color: #5A7259;
      margin-bottom: 0.6rem;
      padding-bottom: 4px;
      border-bottom: 1.5px solid #5A7259;
    }

    /* ── Tables ── */
    .report-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 0.5rem; }
    .report-table th {
      background: #5A7259;
      color: #fff;
      padding: 5px 8px;
      text-align: left;
      font-weight: 600;
      font-size: 11px;
      border: none;
    }
    .report-table td { padding: 4px 8px; border-bottom: 0.5px solid #E8E0D8; font-size: 11px; }
    .report-table tbody tr:nth-child(even) { background: #F5F0EB; }
    .report-table tbody tr:last-child td { border-bottom: 1px solid #5A7259; }
    .report-table th, .report-table td { white-space: nowrap; }
    .report-table td:first-child { white-space: normal; max-width: 220px; }

    /* ── Profile table ── */
    .profile-table { width: 100%; border-collapse: collapse; }
    .profile-table td { padding: 5px 10px; font-size: 12px; border-bottom: 0.5px solid #E8E0D8; }
    .profile-table tbody tr:nth-child(even) { background: #F5F0EB; }
    .profile-label { font-weight: 600; width: 160px; color: #8B7A68; font-size: 12px; }

    /* ── Disclaimer ── */
    .report-disclaimer {
      font-size: 10px;
      color: #5C5148;
      line-height: 1.6;
      padding: 1rem 1.2rem;
      background: #FAF7F4;
      border-top: 2px solid #5A7259;
      margin-top: 2rem;
    }
    .report-disclaimer p { margin: 0 0 0.5rem; }
    .report-disclaimer-title { font-size: 12px; font-weight: 700; color: #5A7259; margin: 0.6rem 0 0.3rem; }
    .report-disclaimer-footer { margin-top: 0.8rem; padding-top: 0.6rem; border-top: 0.5px solid #D4C9BE; font-size: 9px; color: #8B7A68; }

    .no-print { display: none !important; }
  </style>
</head>
<body>
  ${coverHtml}
  ${reportHtml}
  <script>
    // Wait for fonts + any lazy images to settle before printing
    window.addEventListener('load', function() {
      setTimeout(function() { window.print(); }, 1500);
    });
  <\/script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=1200,height=900');
  if (!w) { alert('Pop-up blocked — please allow pop-ups for this page and try again.'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
};

// ─── BASE PORTFOLIOS ──────────────────────────────────────────────────────────

const BP_BM_WEIGHTS = {
  eq:{IR1:0,    IR2:0.20,IR3:0.60,IR4:0.80,IR5:0.90,IR6:1.00},
  bd:{IR1:0.10, IR2:0.40,IR3:0.40,IR4:0.20,IR5:0.10,IR6:0.00},
  ca:{IR1:0.90, IR2:0.40,IR3:0.00,IR4:0.00,IR5:0.00,IR6:0.00}
};
const BP_IRS = ['IR1','IR2','IR3','IR4','IR5','IR6'];

const BP_SECTORS = [
  {label:'Financials',w:0.164},{label:'Info Tech',w:0.287},{label:'Health Care',w:0.096},
  {label:'Consumer Discretionary',w:0.068},{label:'Industrials',w:0.120},
  {label:'Communication Services',w:0.098},{label:'Consumer Staples',w:0.026},
  {label:'Energy',w:0.051},{label:'Materials',w:0.047},{label:'Utilities',w:0.027},{label:'Real Estate',w:0.017}
];
const BP_BOND_SEGS = [
  {label:'Government',w:0.755},{label:'Investment Grade',w:0.195},{label:'High-Yield',w:0.018},{label:'EM Debt',w:0.031}
];

const BP_BCA_ITEMS = [
  {section:'Global Asset Allocation'},
  {key:'gaa_eq',  label:'Equities',            prev:'neutral',     curr:'overweight'},
  {key:'gaa_fi',  label:'Fixed Income',         prev:'neutral',     curr:'neutral'},
  {key:'gaa_ca',  label:'Cash',                 prev:'neutral',     curr:'underweight'},
  {section:'Global Equities*'},
  {key:'eq_us',   label:'US',                   prev:'overweight',  curr:'overweight'},
  {key:'eq_eu',   label:'Euro Area',            prev:'overweight',  curr:'overweight'},
  {key:'eq_jp',   label:'Japan',                prev:'neutral',     curr:'neutral'},
  {key:'eq_ca',   label:'Canada',               prev:'neutral',     curr:'neutral'},
  {key:'eq_au',   label:'Australia',            prev:'neutral',     curr:'neutral'},
  {key:'eq_uk',   label:'UK',                   prev:'neutral',     curr:'neutral'},
  {key:'eq_cn',   label:'China',                prev:'neutral',     curr:'neutral'},
  {key:'eq_em',   label:'EM Ex China',          prev:'neutral',     curr:'overweight'},
  {section:'Global Fixed Income**'},
  {key:'fi_gov',  label:'Government',           prev:'neutral',     curr:'neutral'},
  {key:'fi_ig',   label:'Investment Grade',     prev:'overweight',  curr:'overweight'},
  {key:'fi_hy',   label:'High-Yield',           prev:'overweight',  curr:'overweight'},
  {key:'fi_em',   label:'EM Debt',              prev:'neutral',     curr:'neutral'},
  {key:'fi_dur',  label:'Duration',             prev:'neutral',     curr:'neutral'},
  {key:'fi_inf',  label:'Inflation-linked',     prev:'neutral',     curr:'neutral'},
  {section:'Global Sectors'},
  {key:'sec_fin', label:'Financials',           prev:'overweight',  curr:'overweight'},
  {key:'sec_it',  label:'Info Tech',            prev:'overweight',  curr:'overweight'},
  {key:'sec_hc',  label:'Health Care',          prev:'neutral',     curr:'neutral'},
  {key:'sec_cs2', label:'Communications Serv.', prev:'overweight',  curr:'overweight'},
  {key:'sec_ind', label:'Industrials',          prev:'neutral',     curr:'neutral'},
  {key:'sec_cd',  label:'Consumer Disc.',       prev:'neutral',     curr:'overweight'},
  {key:'sec_cst', label:'Consumer Staples',     prev:'neutral',     curr:'neutral'},
  {key:'sec_en',  label:'Energy',               prev:'overweight',  curr:'neutral'},
  {key:'sec_mat', label:'Materials',            prev:'neutral',     curr:'overweight'},
  {key:'sec_re',  label:'Real Estate',          prev:'neutral',     curr:'neutral'},
  {key:'sec_ut',  label:'Utilities',            prev:'neutral',     curr:'neutral'},
  {section:'Currencies'},
  {key:'fx_usd',  label:'USD',                  prev:'neutral',     curr:'neutral'},
  {key:'fx_eur',  label:'EUR',                  prev:'underweight', curr:'underweight'},
  {key:'fx_jpy',  label:'JPY',                  prev:'neutral',     curr:'neutral'},
  {key:'fx_gbp',  label:'GBP',                  prev:'neutral',     curr:'neutral'},
  {key:'fx_aud',  label:'AUD',                  prev:'neutral',     curr:'neutral'},
  {key:'fx_cad',  label:'CAD',                  prev:'neutral',     curr:'neutral'},
  {key:'fx_chf',  label:'CHF',                  prev:'neutral',     curr:'neutral'},
  {key:'fx_cny',  label:'CNY',                  prev:'neutral',     curr:'neutral'},
  {key:'fx_em',   label:'EM Currencies',        prev:'neutral',     curr:'overweight'},
];

// State
let _bpEtfData = {}; // {ACWI:{ret1y,vol1y,ret3y,vol3y}, AGGU:{...}, BIL:{...}}
let _bpBcaViews = {}; // {key: {prev, curr}}

function openBasePortfolios() {
  // Find Base Portfolios tab button and click it
  const btn = document.getElementById('tab-btn-base');
  if (btn) btn.click();
}

// Init BCA views state from defaults
function bpInitBcaViews() {
  if (Object.keys(_bpBcaViews).length > 0) return;
  BP_BCA_ITEMS.forEach(item => {
    if (item.key) _bpBcaViews[item.key] = {prev: item.prev, curr: item.curr};
  });
  // Try to load from localStorage
  try {
    const stored = localStorage.getItem('suitability-bp-bca-views');
    if (stored) _bpBcaViews = JSON.parse(stored);
  } catch(e) {}
}

function bpRenderBcaTable() {
  bpInitBcaViews();
  const wrap = document.getElementById('bp-bca-table-wrap');
  if (!wrap) return;

  const VIEWS = ['overweight','neutral','underweight'];
  const pillCss = {
    overweight: 'background:#e8f5e9;color:#2e7d32;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600',
    neutral:    'background:#f5f5f5;color:#666;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600',
    underweight:'background:#ffebee;color:#c62828;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600'
  };

  let html = `<table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr>
      <th style="text-align:left;padding:0 8px 8px;font-size:10px;color:var(--text3);font-weight:500;width:44%"></th>
      <th style="text-align:center;padding:0 8px 8px;font-size:10px;color:var(--text3);font-weight:500">Previous</th>
      <th style="text-align:center;padding:0 8px 8px;font-size:10px;color:var(--text3);font-weight:500">Current</th>
    </tr></thead><tbody>`;

  BP_BCA_ITEMS.forEach(item => {
    if (item.section) {
      html += `<tr><td colspan="3" style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--text3);padding:8px 8px 3px;border-top:1px solid var(--border);background:var(--bg2)">${item.section}</td></tr>`;
      return;
    }
    const view = _bpBcaViews[item.key] || {prev: item.prev, curr: item.curr};
    const changed = view.prev !== view.curr;
    const changedBadge = changed ? `<span style="background:#e3f2fd;color:#1565c0;font-size:9px;padding:1px 5px;border-radius:3px;margin-left:4px;font-weight:600">changed</span>` : '';

    const prevOpts = VIEWS.map(v => `<option value="${v}"${view.prev===v?' selected':''}>${v.charAt(0).toUpperCase()+v.slice(1)}</option>`).join('');
    const currOpts = VIEWS.map(v => `<option value="${v}"${view.curr===v?' selected':''}>${v.charAt(0).toUpperCase()+v.slice(1)}</option>`).join('');

    html += `<tr style="border-top:0.5px solid var(--border)">
      <td style="padding:4px 8px">${item.label}${changedBadge}</td>
      <td style="text-align:center;padding:4px 8px">
        <select data-key="${item.key}" data-field="prev" onchange="bpUpdateView(this)" style="font-size:11px;padding:2px 4px;border:1px solid var(--border);border-radius:4px;background:var(--bg2);color:var(--text1)">${prevOpts}</select>
      </td>
      <td style="text-align:center;padding:4px 8px">
        <select data-key="${item.key}" data-field="curr" onchange="bpUpdateView(this)" style="font-size:11px;padding:2px 4px;border:1px solid var(--border);border-radius:4px;background:var(--bg2);color:var(--text1)">${currOpts}</select>
      </td>
    </tr>`;
  });

  html += '</tbody></table>';
  wrap.innerHTML = html;
}

window.bpUpdateView = function(sel) {
  const key = sel.dataset.key, field = sel.dataset.field;
  if (!_bpBcaViews[key]) _bpBcaViews[key] = {};
  _bpBcaViews[key][field] = sel.value;
  try { localStorage.setItem('suitability-bp-bca-views', JSON.stringify(_bpBcaViews)); } catch(e) {}
  // Re-render to update changed badge
  bpRenderBcaTable();
};

window.bpLoadEtfQuotes = async function(input) {
  const files = Array.from(input.files);
  const status = document.getElementById('bp-etf-status');
  if (status) status.textContent = 'Loading...';

  function calcMetrics(prices) {
    if (prices.length < 3) return {};
    const rets = [];
    for (let i=1;i<prices.length;i++) { if(prices[i-1]>0) rets.push((prices[i]-prices[i-1])/prices[i-1]); }
    const annRet = r => r.length ? ((r.reduce((a,v)=>a*(1+v),1)**(12/r.length))-1)*100 : null;
    const annVol = r => { if(r.length<2)return null; const m=r.reduce((a,v)=>a+v,0)/r.length; return Math.sqrt(r.reduce((a,v)=>a+(v-m)**2,0)/(r.length-1)*12)*100; };
    const l12=rets.slice(-12), l36=rets.slice(-36);
    return { ret1y:annRet(l12), vol1y:annVol(l12), ret3y:l36.length>=33?annRet(l36):null, vol3y:l36.length>=33?annVol(l36):null };
  }

  let done = 0;
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target.result), {type:'array'});
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, {header:1});
        let hi = -1;
        for (let i=0;i<Math.min(5,rows.length);i++) {
          if (rows[i].some(c=>String(c).trim().toLowerCase()==='last')) { hi=i; break; }
        }
        if (hi >= 0) {
          const hdrs = rows[hi].map(c=>String(c).trim().toLowerCase());
          const lc=hdrs.indexOf('last'), dc=hdrs.indexOf('date');
          const monthly = {};
          rows.slice(hi+1).forEach(r => {
            if (!r[lc]||isNaN(parseFloat(r[lc]))) return;
            const d = new Date(String(r[dc]).split('/').reverse().join('-'));
            const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
            monthly[k] = parseFloat(r[lc]);
          });
          const prices = Object.keys(monthly).sort().map(k=>monthly[k]);
          const m = calcMetrics(prices);
          const fn = file.name.toLowerCase();
          let key = null;
          if (fn.includes('acwi')||fn.includes('msci')) key = 'ACWI';
          else if (fn.includes('aggr')||fn.includes('aggu')||fn.includes('aggregate')||fn.includes('bond')) key = 'AGGU';
          if (key) _bpEtfData[key] = m;
        }
      } catch(e) {}
      done++;
      if (done === files.length) {
        try { localStorage.setItem('suitability-bp-etf', JSON.stringify(_bpEtfData)); } catch(e) {}
        const keys = Object.keys(_bpEtfData).filter(k=>k!=='BIL');
        if (status) status.textContent = `Loaded: ${keys.join(', ')} · Fetching cash rates from FRED...`;
        bpFetchFredGS1(status);
      }
    };
    reader.readAsArrayBuffer(file);
  });
};

async function bpFetchFredGS1(statusEl) {
  try {
    // FRED doesn't allow direct browser fetch (CORS). Use their public API with api_key param.
    // Free FRED API key - public data endpoint
    const url = 'https://api.stlouisfed.org/fred/series/observations?series_id=GS1&api_key=e0e58d3f6e3042c5c2b46dc7a3c8b00e&file_type=json&frequency=m&observation_start=2021-01-01';
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('FRED API error');
    const json = await resp.json();
    const obs = json.observations || [];

    const monthly = {};
    obs.forEach(o => {
      if (o.value === '.') return;
      const k = o.date.slice(0, 7);
      monthly[k] = parseFloat(o.value);
    });

    const sorted = Object.keys(monthly).sort();
    const yields = sorted.map(k => monthly[k]);

    function calcCashMetrics(ylds) {
      if (ylds.length < 3) return {};
      const changes = [];
      for (let i=1;i<ylds.length;i++) changes.push(ylds[i]-ylds[i-1]);
      function avgYield(ys) { return ys.reduce((a,v)=>a+v,0)/ys.length; }
      function stdDevChanges(ch) {
        if (ch.length<2) return null;
        const m=ch.reduce((a,v)=>a+v,0)/ch.length;
        return Math.sqrt(ch.reduce((a,v)=>a+(v-m)**2,0)/(ch.length-1)*12);
      }
      const last12y=ylds.slice(-12), last36y=ylds.slice(-36);
      const last12c=changes.slice(-12), last36c=changes.slice(-36);
      return {
        ret1y: avgYield(last12y),
        vol1y: stdDevChanges(last12c),
        ret3y: last36y.length>=33 ? avgYield(last36y) : null,
        vol3y: last36c.length>=33 ? stdDevChanges(last36c) : null,
      };
    }

    const m = calcCashMetrics(yields);
    _bpEtfData['BIL'] = m;
    try { localStorage.setItem('suitability-bp-etf', JSON.stringify(_bpEtfData)); } catch(e) {}

    const etfKeys = Object.keys(_bpEtfData).filter(k=>k!=='BIL');
    if (statusEl) {
      statusEl.textContent = `${etfKeys.length ? 'Loaded: '+etfKeys.join(', ')+' · ' : ''}Cash: US 1Y Treasury avg ${m.ret1y?.toFixed(2)}% (FRED GS1)`;
      statusEl.style.color = '#3b6d11';
    }
    bpUpdateSidebarStatus();
  } catch(err) {
    // Fallback: use hardcoded recent GS1 data (updated June 2026)
    // Source: FRED GS1, monthly averages
    const GS1_HARDCODED = {
      '2021-01':0.07,'2021-02':0.07,'2021-03':0.07,'2021-04':0.08,'2021-05':0.05,'2021-06':0.07,
      '2021-07':0.07,'2021-08':0.08,'2021-09':0.08,'2021-10':0.10,'2021-11':0.10,'2021-12':0.19,
      '2022-01':0.30,'2022-02':0.55,'2022-03':1.00,'2022-04':1.34,'2022-05':1.89,'2022-06':2.06,
      '2022-07':2.65,'2022-08':3.02,'2022-09':3.28,'2022-10':3.89,'2022-11':4.43,'2022-12':4.73,
      '2023-01':4.68,'2023-02':4.69,'2023-03':4.93,'2023-04':4.68,'2023-05':4.68,'2023-06':4.91,
      '2023-07':5.24,'2023-08':5.37,'2023-09':5.37,'2023-10':5.44,'2023-11':5.42,'2023-12':5.28,
      '2024-01':4.96,'2024-02':4.79,'2024-03':4.92,'2024-04':4.99,'2024-05':5.14,'2024-06':5.16,
      '2024-07':5.11,'2024-08':4.90,'2024-09':4.43,'2024-10':4.03,'2024-11':4.20,'2024-12':4.33,
      '2025-01':4.23,'2025-02':4.18,'2025-03':4.19,'2025-04':4.06,'2025-05':3.95,'2025-06':4.09,
      '2025-07':4.06,'2025-08':4.08,'2025-09':3.89,'2025-10':3.66,'2025-11':3.61,'2025-12':3.66,
      '2026-01':3.54,'2026-02':3.51,'2026-03':3.48,'2026-04':3.67,'2026-05':3.69
    };
    const sorted = Object.keys(GS1_HARDCODED).sort();
    const yields = sorted.map(k => GS1_HARDCODED[k]);

    function calcCashMetrics(ylds) {
      if (ylds.length < 3) return {};
      const changes = [];
      for (let i=1;i<ylds.length;i++) changes.push(ylds[i]-ylds[i-1]);
      function avgYield(ys) { return ys.reduce((a,v)=>a+v,0)/ys.length; }
      function stdDevChanges(ch) {
        if (ch.length<2) return null;
        const m=ch.reduce((a,v)=>a+v,0)/ch.length;
        return Math.sqrt(ch.reduce((a,v)=>a+(v-m)**2,0)/(ch.length-1)*12);
      }
      const last12y=ylds.slice(-12), last36y=ylds.slice(-36);
      const last12c=changes.slice(-12), last36c=changes.slice(-36);
      return {
        ret1y: avgYield(last12y),
        vol1y: stdDevChanges(last12c),
        ret3y: last36y.length>=33 ? avgYield(last36y) : null,
        vol3y: last36c.length>=33 ? stdDevChanges(last36c) : null,
      };
    }

    const m = calcCashMetrics(yields);
    _bpEtfData['BIL'] = m;
    try { localStorage.setItem('suitability-bp-etf', JSON.stringify(_bpEtfData)); } catch(e) {}

    const etfKeys = Object.keys(_bpEtfData).filter(k=>k!=='BIL');
    if (statusEl) {
      statusEl.textContent = `${etfKeys.length ? 'Loaded: '+etfKeys.join(', ')+' · ' : ''}Cash: US 1Y Treasury avg ${m.ret1y?.toFixed(2)}% (FRED GS1, hardcoded Jun 2026)`;
      statusEl.style.color = '#3b6d11';
    }
    bpUpdateSidebarStatus();
  }
}

function bpCalcPortfolioWeights(ir3eq, ir3bd, ir3ca) {
  const dEq = ir3eq - BP_BM_WEIGHTS.eq.IR3;
  const dBd = ir3bd - BP_BM_WEIGHTS.bd.IR3;
  const W = {};
  BP_IRS.forEach(ir => {
    const bmEq=BP_BM_WEIGHTS.eq[ir], bmBd=BP_BM_WEIGHTS.bd[ir];
    let eq,bd,ca;
    if (ir==='IR6') { eq=1;bd=0;ca=0; }
    else if (ir==='IR3') { eq=ir3eq;bd=ir3bd;ca=ir3ca; }
    else if (ir==='IR1'||ir==='IR2') {
      const sEq=BP_BM_WEIGHTS.eq.IR3>0?bmEq/BP_BM_WEIGHTS.eq.IR3:0;
      const sBd=BP_BM_WEIGHTS.bd.IR3>0?bmBd/BP_BM_WEIGHTS.bd.IR3:0;
      eq=Math.max(0,bmEq+dEq*sEq); bd=Math.max(0,bmBd+dBd*sBd); ca=Math.max(0,1-eq-bd);
    } else { eq=bmEq; bd=bmBd; ca=BP_BM_WEIGHTS.ca[ir]; }
    W[ir] = {eq,bd,ca};
  });
  return W;
}

window.bpSaveAndGenerate = function() {
  const ir3eq = parseFloat(document.getElementById('bp-ir3-eq').value)/100;
  const ir3bd = parseFloat(document.getElementById('bp-ir3-bd').value)/100;
  const ir3ca = parseFloat(document.getElementById('bp-ir3-ca').value)/100;
  const rets = {
    eq: {'12M': parseFloat(document.getElementById('bp-ret-eq-12m').value), '5Y': parseFloat(document.getElementById('bp-ret-eq-5y').value)},
    bd: {'12M': parseFloat(document.getElementById('bp-ret-bd-12m').value), '5Y': parseFloat(document.getElementById('bp-ret-bd-5y').value)},
    ca: {'12M': parseFloat(document.getElementById('bp-ret-ca-12m').value), '5Y': parseFloat(document.getElementById('bp-ret-ca-5y').value)}
  };
  const source = document.getElementById('bp-bca-source').value || 'BCA Research GAA';

  const W = bpCalcPortfolioWeights(ir3eq, ir3bd, ir3ca);

  // Save to localStorage so report tab can use it
  const bpData = {ir3eq, ir3bd, ir3ca, rets, W, source, etf: _bpEtfData, bcaViews: _bpBcaViews, updatedAt: new Date().toISOString()};
  try { localStorage.setItem('suitability-bp-data', JSON.stringify(bpData)); } catch(e) {}

  // Also build _benchmark object for report tab compatibility
  _benchmark = {};
  BP_IRS.forEach(ir => {
    _benchmark[ir] = {
      equities: W[ir].eq,
      bonds:    W[ir].bd,
      cash:     W[ir].ca,
      sectors:  {},
      bondSegments: {}
    };
    BP_SECTORS.forEach(s => { _benchmark[ir].sectors[s.label] = W[ir].eq * s.w; });
    BP_BOND_SEGS.forEach(s => { _benchmark[ir].bondSegments[s.label] = W[ir].bd * s.w; });
  });
  try { localStorage.setItem('suitability-benchmark', JSON.stringify(_benchmark)); } catch(e) {}

  // Render table
  bpRenderOutputTable(W, rets, source);
  bpUpdateSidebarStatus();
  alert('Saved ✓  Base Portfolios data is now used by Portfolio Report.');
};

function bpRenderOutputTable(W, rets, source) {
  const out = document.getElementById('bp-table-output');
  if (!out) return;

  const BRAND = '#5A7259';
  const BRAND_HDR = '#EAF0EA';
  const BRAND_DARK = '#3d4f3c';
  const fmtW = v => v < 0.00005 ? '<span style="color:#aaa">—</span>' : (v*100).toFixed(2)+'%';
  const fmtR = (v, w) => {
    if (w === 0) return '<span style="color:#aaa">—</span>';
    const col = v*w >= 0 ? '#2e7d32' : '#c62828';
    return `<span style="color:${col};font-weight:500">${v*w>=0?'+':''}${(v*w).toFixed(1)}%</span>`;
  };
  const fmtV = (v, isRet) => {
    if (v == null || isNaN(v)) return '<span style="color:#aaa">—</span>';
    const col = isRet ? (v >= 0 ? '#2e7d32' : '#c62828') : BRAND_DARK;
    return `<span style="color:${col}">${v.toFixed(2)}%</span>`;
  };

  const ETF_META = [
    {key:'ACWI', label:'Equities', isin:'US4642882579', name:'iShares MSCI ACWI ETF', type:'eq'},
    {key:'AGGU', label:'Bonds',    isin:'IE00BZ043R46', name:'AGGU – iShares Core Global Aggregate Bond ETF', type:'bd'},
    {key:'BIL',  label:'Cash',     isin:'GS1',          name:'US 1-Year Treasury CMT — avg yield (FRED GS1)', type:'ca'},
  ];

  function weighted(metric, ir) {
    let sum=0, ok=false;
    ETF_META.forEach(e => {
      const w = BP_BM_WEIGHTS[e.type][ir];
      const v = (_bpEtfData[e.key]||{})[metric];
      if (v!=null&&!isNaN(v)&&w>0) { sum+=w*v; ok=true; }
    });
    return ok ? sum : null;
  }

  // Styles
  const TS = `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;border-collapse:collapse;width:100%`;
  const TH_IR = `text-align:right;padding:6px 8px;font-size:11px;font-weight:600;color:white;background:${BRAND};white-space:nowrap`;
  const TH_IR3 = `text-align:right;padding:6px 8px;font-size:11px;font-weight:600;color:white;background:${BRAND_DARK};white-space:nowrap`;
  const TD_R = `text-align:right;padding:5px 8px;border-bottom:0.5px solid #e8e5e0`;
  const TD_R3 = `text-align:right;padding:5px 8px;border-bottom:0.5px solid #e8e5e0;background:#f5f8f5`;
  const SEC_HDR = `font-family:'Playfair Display',Georgia,serif;font-size:13px;font-weight:700;color:white;background:${BRAND};padding:7px 10px;letter-spacing:0.02em`;
  const SUB_HDR = `font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:${BRAND};background:${BRAND_HDR};padding:5px 10px;border-bottom:1px solid #d4e4d4`;

  let h = `<div style="overflow-x:auto;border:1px solid #d4d0c8;border-radius:6px;overflow:hidden">
  <table style="${TS}">
  <thead><tr>
    <th style="text-align:left;padding:6px 10px;font-size:11px;font-weight:600;color:white;background:${BRAND};width:16%"></th>
    <th style="text-align:left;padding:6px 8px;font-size:11px;font-weight:600;color:white;background:${BRAND};width:12%">ISIN</th>
    <th style="text-align:left;padding:6px 8px;font-size:11px;font-weight:600;color:white;background:${BRAND}"></th>
    ${BP_IRS.map(ir => `<th style="${ir==='IR3'?TH_IR3:TH_IR}">${ir}</th>`).join('')}
  </tr></thead><tbody>`;

  // ── BENCHMARKS ──
  h += `<tr><td colspan="9" style="${SEC_HDR}">Benchmarks</td></tr>`;
  ETF_META.forEach(e => {
    h += `<tr style="background:white">
      <td style="padding:6px 10px;font-weight:600;font-size:12px;color:${BRAND_DARK};border-bottom:0.5px solid #e8e5e0">
        ${e.key} <span style="font-weight:400;font-size:10px;color:#888;margin-left:4px">${e.label}</span>
      </td>
      <td style="padding:6px 8px;font-size:10px;color:#888;border-bottom:0.5px solid #e8e5e0">${e.isin}</td>
      <td style="padding:6px 8px;font-size:11px;color:#555;border-bottom:0.5px solid #e8e5e0">${e.name}</td>`;
    BP_IRS.forEach(ir => {
      const w = BP_BM_WEIGHTS[e.type][ir];
      h += `<td style="${ir==='IR3'?TD_R3:TD_R}">${w>0?(w*100).toFixed(0)+'%':'<span style="color:#aaa">—</span>'}</td>`;
    });
    h += '</tr>';
  });
  // Metric rows under benchmarks
  [{key:'ret1y',label:'1y return',isRet:true},{key:'ret3y',label:'3y return (ann.)',isRet:true},
   {key:'vol1y',label:'1y volatility',isRet:false},{key:'vol3y',label:'3y volatility (ann.)',isRet:false}
  ].forEach(m => {
    h += `<tr style="background:#fafaf8"><td style="padding:3px 10px 3px 18px;font-size:11px;color:#777;border-bottom:0.5px solid #ece9e3">${m.label}</td><td style="border-bottom:0.5px solid #ece9e3"></td><td style="border-bottom:0.5px solid #ece9e3"></td>`;
    BP_IRS.forEach(ir => {
      const bg = ir==='IR3' ? 'background:#f5f8f5;' : 'background:#fafaf8;';
      h += `<td style="text-align:right;padding:3px 8px;border-bottom:0.5px solid #ece9e3;${bg}">${fmtV(weighted(m.key,ir),m.isRet)}</td>`;
    });
    h += '</tr>';
  });

  // ── PORTFOLIO WEIGHTS ──
  h += `<tr><td colspan="9" style="${SEC_HDR}">Portfolio weights <span style="font-size:10px;font-weight:400;opacity:0.8">based on BCA Research GAA</span></td></tr>`;
  [{key:'eq',label:'Equities'},{key:'bd',label:'Bonds'},{key:'ca',label:'Cash'}].forEach(a => {
    h += `<tr style="background:white"><td style="padding:6px 10px;font-weight:600;color:${BRAND_DARK};border-bottom:0.5px solid #e8e5e0" colspan="3">${a.label}</td>`;
    BP_IRS.forEach(ir => {
      h += `<td style="${ir==='IR3'?TD_R3:TD_R};font-weight:600">${fmtW(W[ir][a.key])}</td>`;
    });
    h += '</tr>';
    h += `<tr style="background:#fafaf8"><td style="padding:2px 10px 4px 18px;font-size:10px;color:#888;border-bottom:0.5px solid #ece9e3" colspan="3">Benchmark</td>`;
    BP_IRS.forEach(ir => {
      const bg = ir==='IR3' ? 'background:#f5f8f5;' : 'background:#fafaf8;';
      h += `<td style="text-align:right;padding:2px 8px 4px;font-size:10px;color:#888;border-bottom:0.5px solid #ece9e3;${bg}">${(BP_BM_WEIGHTS[a.key][ir]*100).toFixed(0)}%</td>`;
    });
    h += '</tr>';
  });

  // ── EQUITY SECTORS ──
  h += `<tr><td colspan="9" style="${SUB_HDR}">Equity sectors</td></tr>`;
  BP_SECTORS.forEach(s => {
    h += `<tr style="background:white"><td style="padding:4px 10px 4px 18px;font-size:11px;color:#444;border-bottom:0.5px solid #ece9e3" colspan="3">${s.label}</td>`;
    BP_IRS.forEach(ir => {
      h += `<td style="${ir==='IR3'?TD_R3:TD_R}">${fmtW(W[ir].eq*s.w)}</td>`;
    });
    h += '</tr>';
  });
  h += `<tr style="background:${BRAND_HDR}"><td style="padding:5px 10px;font-weight:600;font-size:11px;color:${BRAND_DARK};border-bottom:1px solid #c8dac8" colspan="3">Total equities</td>`;
  BP_IRS.forEach(ir => {
    h += `<td style="text-align:right;padding:5px 8px;font-weight:600;font-size:11px;color:${BRAND_DARK};border-bottom:1px solid #c8dac8;${ir==='IR3'?'background:#deeede;':''}">${fmtW(W[ir].eq)}</td>`;
  });
  h += '</tr>';

  // ── BOND SEGMENTS ──
  h += `<tr><td colspan="9" style="${SUB_HDR}">Bond segments</td></tr>`;
  BP_BOND_SEGS.forEach(s => {
    h += `<tr style="background:white"><td style="padding:4px 10px 4px 18px;font-size:11px;color:#444;border-bottom:0.5px solid #ece9e3" colspan="3">${s.label}</td>`;
    BP_IRS.forEach(ir => {
      h += `<td style="${ir==='IR3'?TD_R3:TD_R}">${fmtW(W[ir].bd*s.w)}</td>`;
    });
    h += '</tr>';
  });
  h += `<tr style="background:${BRAND_HDR}"><td style="padding:5px 10px;font-weight:600;font-size:11px;color:${BRAND_DARK};border-bottom:1px solid #c8dac8" colspan="3">Total bonds</td>`;
  BP_IRS.forEach(ir => {
    h += `<td style="text-align:right;padding:5px 8px;font-weight:600;font-size:11px;color:${BRAND_DARK};border-bottom:1px solid #c8dac8;${ir==='IR3'?'background:#deeede;':''}">${fmtW(W[ir].bd)}</td>`;
  });
  h += '</tr>';

  // ── CASH ──
  h += `<tr style="background:white"><td style="padding:5px 10px;font-weight:600;color:${BRAND_DARK};border-bottom:0.5px solid #e8e5e0" colspan="3">Cash</td>`;
  BP_IRS.forEach(ir => {
    h += `<td style="${ir==='IR3'?TD_R3:TD_R};font-weight:600">${fmtW(W[ir].ca)}</td>`;
  });
  h += '</tr>';

  // ── RETURNS ──
  [{key:'12M',label:'Indicative returns — 12 months'},{key:'5Y',label:'Indicative returns — 5 years'}].forEach(p => {
    h += `<tr><td colspan="9" style="${SEC_HDR}">${p.label}</td></tr>`;
    [{key:'eq',label:'Equities'},{key:'bd',label:'Bonds'},{key:'ca',label:'Cash'}].forEach(a => {
      h += `<tr style="background:#fafaf8"><td style="padding:4px 10px 4px 18px;font-size:11px;color:#666;border-bottom:0.5px solid #ece9e3" colspan="3">${a.label}</td>`;
      BP_IRS.forEach(ir => {
        const bg = ir==='IR3' ? 'background:#f5f8f5;' : 'background:#fafaf8;';
        h += `<td style="text-align:right;padding:4px 8px;border-bottom:0.5px solid #ece9e3;${bg}">${fmtR(rets[a.key][p.key], W[ir][a.key])}</td>`;
      });
      h += '</tr>';
    });
    h += `<tr style="background:${BRAND_HDR}"><td style="padding:6px 10px;font-weight:600;color:${BRAND_DARK};border-bottom:1px solid #c8dac8" colspan="3">Portfolio total</td>`;
    BP_IRS.forEach(ir => {
      let t=0; ['eq','bd','ca'].forEach(k=>{t+=W[ir][k]*rets[k][p.key];});
      const col = t>=0?'#2e7d32':'#c62828';
      h += `<td style="text-align:right;padding:6px 8px;font-weight:600;color:${col};border-bottom:1px solid #c8dac8;${ir==='IR3'?'background:#deeede;':''}">${t>=0?'+':''}${t.toFixed(1)}%</td>`;
    });
    h += '</tr>';
  });

  h += '</tbody></table></div>';
  out.innerHTML = h;

  document.getElementById('bp-footnotes').innerHTML =
    `<span style="color:${BRAND};font-weight:500">Source:</span> ${source}. Sector/segment weights based on BCA Research GAA benchmark proportions, scaled by IR equity/bond allocation. Equity return: BCA Equity Allocation (Sectors) GAA performance. Bond return: BCA Bond Allocation GAA performance. Cash return: avg US 1-Year Treasury CMT (GS1), Federal Reserve H.15 via FRED. All returns are indicative only and do not constitute investment advice.`;
}

window.bpDownloadXlsx = function() {
  const stored = localStorage.getItem('suitability-bp-data');
  if (!stored) { alert('Generate table first.'); return; }
  const bp = JSON.parse(stored);
  const W = bp.W;
  const rets = bp.rets;
  const source = bp.source || 'BCA Research GAA';
  const etf = _bpEtfData || {};

  const IRS = ['IR1','IR2','IR3','IR4','IR5','IR6'];
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Base Portfolios (mirrors the on-screen table) ──
  const d = [];
  const fmtPct = v => v == null ? '—' : parseFloat((v*100).toFixed(4));
  const fmtRet = v => v == null ? '—' : parseFloat(v.toFixed(2));

  const header = ['', 'ISIN', 'Name / description', ...IRS];

  // BENCHMARKS
  d.push(['BENCHMARKS', '', '', ...IRS.map(ir => ir)]);
  d.push(header);

  const ETF_META = [
    {label:'ACWI', isin:'US4642882579', name:'iShares MSCI ACWI ETF', type:'eq'},
    {label:'AGGU', isin:'IE00BZ043R46', name:'AGGU – iShares Core Global Aggregate Bond UCITS ETF USD Hedged', type:'bd'},
    {label:'BIL',  isin:'GS1',          name:'US 1-Year Treasury CMT – avg yield (FRED GS1)', type:'ca'},
  ];

  ETF_META.forEach(e => {
    d.push([e.label, e.isin, e.name, ...IRS.map(ir => {
      const w = BP_BM_WEIGHTS[e.type][ir];
      return w > 0 ? fmtPct(w) : '—';
    })]);
  });

  // Weighted benchmark metrics
  function weightedMetric(metric, ir) {
    let sum = 0, ok = false;
    ETF_META.forEach(e => {
      const w = BP_BM_WEIGHTS[e.type][ir];
      const v = (etf[e.label] || {})[metric];
      if (v != null && !isNaN(v) && w > 0) { sum += w * v; ok = true; }
    });
    return ok ? parseFloat(sum.toFixed(2)) : '—';
  }

  d.push(['1y return (ann.)', '', '', ...IRS.map(ir => weightedMetric('ret1y', ir))]);
  d.push(['3y return (ann.)', '', '', ...IRS.map(ir => weightedMetric('ret3y', ir))]);
  d.push(['1y volatility', '', '', ...IRS.map(ir => weightedMetric('vol1y', ir))]);
  d.push(['3y volatility', '', '', ...IRS.map(ir => weightedMetric('vol3y', ir))]);
  d.push([]);

  // PORTFOLIO WEIGHTS
  d.push(['PORTFOLIO WEIGHTS *']);
  d.push(['', '', '', ...IRS]);
  d.push(['Equities', '', '', ...IRS.map(ir => fmtPct(W[ir].eq))]);
  d.push(['  Benchmark', '', '', ...IRS.map(ir => fmtPct(BP_BM_WEIGHTS.eq[ir]))]);
  d.push(['Bonds', '', '', ...IRS.map(ir => fmtPct(W[ir].bd))]);
  d.push(['  Benchmark', '', '', ...IRS.map(ir => fmtPct(BP_BM_WEIGHTS.bd[ir]))]);
  d.push(['Cash', '', '', ...IRS.map(ir => fmtPct(W[ir].ca))]);
  d.push(['  Benchmark', '', '', ...IRS.map(ir => fmtPct(BP_BM_WEIGHTS.ca[ir]))]);
  d.push([]);

  // EQUITY SECTORS
  d.push(['EQUITY SECTORS *']);
  d.push(['', '', '', ...IRS]);
  BP_SECTORS.forEach(s => {
    d.push([s.label, '', '', ...IRS.map(ir => fmtPct(W[ir].eq * s.w))]);
  });
  d.push(['Total equities', '', '', ...IRS.map(ir => fmtPct(W[ir].eq))]);
  d.push([]);

  // BOND SEGMENTS
  d.push(['BOND SEGMENTS *']);
  d.push(['', '', '', ...IRS]);
  BP_BOND_SEGS.forEach(s => {
    d.push([s.label, '', '', ...IRS.map(ir => fmtPct(W[ir].bd * s.w))]);
  });
  d.push(['Total bonds', '', '', ...IRS.map(ir => fmtPct(W[ir].bd))]);
  d.push([]);

  // CASH
  d.push(['CASH']);
  d.push(['Cash', '', '', ...IRS.map(ir => fmtPct(W[ir].ca))]);
  d.push([]);

  // INDICATIVE RETURNS
  [['12M', '12-month return'], ['5Y', '5-year return']].forEach(([key, label]) => {
    d.push([`INDICATIVE RETURN — ${label} **`]);
    d.push(['', '', '', ...IRS]);
    d.push(['Equities **', '', '', ...IRS.map(ir => W[ir].eq === 0 ? '—' : fmtRet(W[ir].eq * rets.eq[key]))]);
    d.push(['Bonds **', '', '', ...IRS.map(ir => W[ir].bd === 0 ? '—' : fmtRet(W[ir].bd * rets.bd[key]))]);
    d.push(['Cash ***', '', '', ...IRS.map(ir => W[ir].ca === 0 ? '—' : fmtRet(W[ir].ca * rets.ca[key]))]);
    d.push(['Portfolio total', '', '', ...IRS.map(ir => {
      let t = 0;
      ['eq','bd','ca'].forEach(k => { t += W[ir][k] * rets[k][key]; });
      return fmtRet(t);
    })]);
    d.push([]);
  });

  // Footnotes
  d.push([`* Sector/segment weights based on BCA Research GAA benchmark proportions (${source}), scaled by IR equity/bond allocation.`]);
  d.push([`** Equity: BCA Equity Allocation (Sectors) GAA. Bond: BCA Bond Allocation GAA. Source: ${source}.`]);
  d.push([`*** Cash: avg US 1-Year Treasury CMT (GS1). Source: Federal Reserve H.15 via FRED. Returns are indicative only.`]);

  const ws = XLSX.utils.aoa_to_sheet(d);
  // Set column widths
  ws['!cols'] = [{wch:32},{wch:14},{wch:52},{wch:9},{wch:9},{wch:9},{wch:9},{wch:9},{wch:9}];
  XLSX.utils.book_append_sheet(wb, ws, 'Base Portfolios');

  // ── Sheet 2: for reporting IR3 (kept for app compatibility) ──
  const ir3 = W.IR3;
  const ir3Data = [
    ['','','Asset classes'],['','','Equities',ir3.eq],['','','Bonds',ir3.bd],['','','Cash',ir3.ca],[],
    ['','','Equities - sectors allocation'],
    ...BP_SECTORS.map(s => ['','',s.label, ir3.eq*s.w]),
    [],
    ['','','Bond segments allocation'],
    ...BP_BOND_SEGS.map(s => ['','',s.label, ir3.bd*s.w]),
    [],['','','Cash'],['','','Cash',ir3.ca]
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ir3Data), 'for reporting IR3');

  // ── Sheet 3: for reporting IR6 ──
  const ir6Data = BP_SECTORS.map(s => ['',s.label, W.IR6.eq*s.w]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ir6Data), 'for reporting IR6');

  const month = new Date().toLocaleDateString('en-GB',{month:'long',year:'numeric'}).replace(' ','_');
  XLSX.writeFile(wb, `${month}_Base_Portfolios.xlsx`);
};

function bpUpdateSidebarStatus() {
  const el = document.getElementById('basePortfoliosSidebarStatus');
  if (!el) return;
  const stored = localStorage.getItem('suitability-bp-data');
  if (stored) {
    const bp = JSON.parse(stored);
    const d = new Date(bp.updatedAt);
    el.innerHTML = `<span style="color:#3b6d11;font-weight:500">✓ Updated ${d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</span>`;
  } else {
    el.textContent = 'Not yet configured';
  }
}

// Init on page load
(function bpInit() {
  // Load saved ETF data
  try {
    const s = localStorage.getItem('suitability-bp-etf');
    if (s) {
      _bpEtfData = JSON.parse(s);
      // Validate BIL data - if ret1y < 1% it's likely old BIL price data, not GS1 yield
      if (_bpEtfData['BIL'] && _bpEtfData['BIL'].ret1y != null && _bpEtfData['BIL'].ret1y < 1.0) {
        delete _bpEtfData['BIL']; // will refetch from FRED on open
      }
    }
  } catch(e) {}
  // Load saved BCA views
  try {
    const s = localStorage.getItem('suitability-bp-bca-views');
    if (s) _bpBcaViews = JSON.parse(s);
  } catch(e) {}
  // Restore _benchmark from bp-data if needed
  try {
    const bpStored = localStorage.getItem('suitability-bp-data');
    const bmStored = localStorage.getItem('suitability-benchmark');
    if (bpStored && !bmStored) {
      const bp = JSON.parse(bpStored);
      const W = bp.W;
      _benchmark = {};
      BP_IRS.forEach(ir => {
        _benchmark[ir] = { equities:W[ir].eq, bonds:W[ir].bd, cash:W[ir].ca, sectors:{}, bondSegments:{} };
        BP_SECTORS.forEach(s => { _benchmark[ir].sectors[s.label] = W[ir].eq*s.w; });
        BP_BOND_SEGS.forEach(s => { _benchmark[ir].bondSegments[s.label] = W[ir].bd*s.w; });
      });
    }
  } catch(e) {}
  setTimeout(bpUpdateSidebarStatus, 100);
})();

window.bpOpen = function() {
  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('appContent').classList.add('hidden');
  document.getElementById('basePortfoliosPanel').classList.remove('hidden');
  bpRestoreState();
  const st = document.getElementById('bp-etf-status');
  const etfKeys = Object.keys(_bpEtfData).filter(k => k !== 'BIL');
  // Auto-fetch FRED if BIL missing or stale
  if (!_bpEtfData['BIL'] || _bpEtfData['BIL'].ret1y == null) {
    if (st) st.textContent = `${etfKeys.length ? 'Loaded: '+etfKeys.join(', ')+' · ' : ''}Fetching cash rates from FRED...`;
    bpFetchFredGS1(st);
  } else {
    if (st) {
      st.textContent = `${etfKeys.length ? 'Loaded: '+etfKeys.join(', ')+' · ' : ''}Cash: US 1Y Treasury avg ${_bpEtfData['BIL'].ret1y.toFixed(2)}% (FRED GS1)`;
      st.style.color = '#3b6d11';
    }
  }
  try {
    const t = localStorage.getItem('suitability-bp-takeaway');
    if (t) {
      const pst = document.getElementById('bp-pdf-status');
      if (pst) { pst.textContent = '✓ Views loaded from previous session'; pst.style.color = '#3b6d11'; }
    }
  } catch(e) {}
};

window.bpClose = function() {
  document.getElementById('basePortfoliosPanel').classList.add('hidden');
  // Restore previous state — show client content if one was selected
  if (window.currentClientId) {
    document.getElementById('appContent').classList.remove('hidden');
  } else {
    document.getElementById('emptyState').classList.remove('hidden');
  }
};

function bpRestoreState() {
  try {
    const s = localStorage.getItem('suitability-bp-data');
    if (s) {
      const bp = JSON.parse(s);
      document.getElementById('bp-ir3-eq').value = (bp.ir3eq*100).toFixed(1);
      document.getElementById('bp-ir3-bd').value = (bp.ir3bd*100).toFixed(1);
      document.getElementById('bp-ir3-ca').value = (bp.ir3ca*100).toFixed(1);
      document.getElementById('bp-ret-eq-12m').value = bp.rets.eq['12M'];
      document.getElementById('bp-ret-eq-5y').value  = bp.rets.eq['5Y'];
      document.getElementById('bp-ret-bd-12m').value = bp.rets.bd['12M'];
      document.getElementById('bp-ret-bd-5y').value  = bp.rets.bd['5Y'];
      document.getElementById('bp-ret-ca-12m').value = bp.rets.ca['12M'];
      document.getElementById('bp-ret-ca-5y').value  = bp.rets.ca['5Y'];
      if (bp.source) document.getElementById('bp-bca-source').value = bp.source;
      bpRenderOutputTable(bp.W, bp.rets, bp.source);
    }
  } catch(e) {}
}

// ─── BASE PORTFOLIOS — PDF & TEXT PARSING ────────────────────────────────────

window.bpLoadBcaPdf = async function(input) {
  const file = input.files[0];
  if (!file) return;
  const status = document.getElementById('bp-pdf-status');
  status.textContent = 'Reading PDF...';
  status.style.color = '#854f0b';

  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const bytes = new Uint8Array(e.target.result);
      const apiKey = localStorage.getItem('suitability-api-key');
      if (!apiKey) { status.textContent = 'Add API key in Settings first'; status.style.color = '#a32d2d'; return; }

      status.textContent = 'Extracting views via AI...';

      // Extract text from PDF using basic pattern matching on the binary
      // Convert bytes to string to find readable text
      let pdfText = '';
      for (let i = 0; i < Math.min(bytes.byteLength, 80000); i++) {
        const c = bytes[i];
        if (c >= 32 && c < 127) pdfText += String.fromCharCode(c);
        else if (c === 10 || c === 13) pdfText += ' ';
      }
      // Keep only printable ASCII segments of 4+ chars
      const textChunks = pdfText.match(/[\x20-\x7E]{4,}/g) || [];
      const cleanText = textChunks.join(' ').slice(0, 12000);

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 4000,
          messages: [{
            role: 'user',
            content: `This is extracted text from a BCA Research Global Asset Allocation monthly report. Extract the investment views and return ONLY valid JSON, no markdown:\n\n${cleanText}\n\nReturn this exact JSON structure:\n{\n  "reportTitle": "string",\n  "reportDate": "string",\n  "topTakeaway": "1-2 sentence top takeaway",\n  "source": "BCA Research GAA, [Month Year]",\n  "views": {\n    "gaa_eq": {"prev":"neutral|overweight|underweight","curr":"..."},\n    "gaa_fi": {"prev":"...","curr":"..."},\n    "gaa_ca": {"prev":"...","curr":"..."},\n    "eq_us": {"prev":"...","curr":"..."},\n    "eq_eu": {"prev":"...","curr":"..."},\n    "eq_jp": {"prev":"...","curr":"..."},\n    "eq_ca": {"prev":"...","curr":"..."},\n    "eq_au": {"prev":"...","curr":"..."},\n    "eq_uk": {"prev":"...","curr":"..."},\n    "eq_cn": {"prev":"...","curr":"..."},\n    "eq_em": {"prev":"...","curr":"..."},\n    "fi_gov": {"prev":"...","curr":"..."},\n    "fi_ig": {"prev":"...","curr":"..."},\n    "fi_hy": {"prev":"...","curr":"..."},\n    "fi_em": {"prev":"...","curr":"..."},\n    "fi_dur": {"prev":"...","curr":"..."},\n    "fi_inf": {"prev":"...","curr":"..."},\n    "sec_fin": {"prev":"...","curr":"..."},\n    "sec_it": {"prev":"...","curr":"..."},\n    "sec_hc": {"prev":"...","curr":"..."},\n    "sec_cs2": {"prev":"...","curr":"..."},\n    "sec_ind": {"prev":"...","curr":"..."},\n    "sec_cd": {"prev":"...","curr":"..."},\n    "sec_cst": {"prev":"...","curr":"..."},\n    "sec_en": {"prev":"...","curr":"..."},\n    "sec_mat": {"prev":"...","curr":"..."},\n    "sec_re": {"prev":"...","curr":"..."},\n    "sec_ut": {"prev":"...","curr":"..."},\n    "fx_usd": {"prev":"...","curr":"..."},\n    "fx_eur": {"prev":"...","curr":"..."},\n    "fx_jpy": {"prev":"...","curr":"..."},\n    "fx_gbp": {"prev":"...","curr":"..."},\n    "fx_aud": {"prev":"...","curr":"..."},\n    "fx_cad": {"prev":"...","curr":"..."},\n    "fx_chf": {"prev":"...","curr":"..."},\n    "fx_cny": {"prev":"...","curr":"..."},\n    "fx_em": {"prev":"...","curr":"..."}\n  }\n}\nUse only: overweight, neutral, underweight. If not found use neutral.`
          }]
        })
      });

      const data = await resp.json();
      console.log('HTTP status:', resp.status);
      console.log('API response:', JSON.stringify(data).slice(0, 1000));
      if (!resp.ok) throw new Error(`API error ${resp.status}: ${data.error?.message || JSON.stringify(data)}`);
      const text = data.content?.map(c => c.text || '').join('') || '';
      console.log('Text response:', text.slice(0, 500));
      let clean = text.replace(/```json|```/g, '').trim();

      // Extract just the JSON object if there's surrounding text
      const jsonStart = clean.indexOf('{');
      const jsonEnd = clean.lastIndexOf('}');
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        clean = clean.slice(jsonStart, jsonEnd + 1);
      }

      let parsed;
      try {
        parsed = JSON.parse(clean);
      } catch(jsonErr) {
        // Try to recover truncated JSON by extracting what we can
        // Extract views object manually
        const viewsMatch = clean.match(/"views"\s*:\s*(\{[\s\S]*)/);
        if (viewsMatch) {
          // Try to parse partial views
          let viewsStr = viewsMatch[1];
          // Close any unclosed objects
          const opens = (viewsStr.match(/\{/g)||[]).length;
          const closes = (viewsStr.match(/\}/g)||[]).length;
          for (let i=0; i<opens-closes; i++) viewsStr += '}';
          try {
            const views = JSON.parse(viewsStr);
            parsed = { views, reportDate: file.name, topTakeaway: '', source: 'BCA Research GAA' };
          } catch(e2) {
            throw new Error('Could not parse response. Try uploading again.');
          }
        } else {
          throw new Error('Invalid response format. Try again.');
        }
      }

      // Apply views
      if (parsed.views) {
        Object.entries(parsed.views).forEach(([k, v]) => { _bpBcaViews[k] = v; });
        try { localStorage.setItem('suitability-bp-bca-views', JSON.stringify(_bpBcaViews)); } catch(e) {}
      }
      if (parsed.source) {
        document.getElementById('bp-bca-source').value = parsed.source;
      }
      // Store top takeaway for use in commentary
      if (parsed.topTakeaway) {
        try { localStorage.setItem('suitability-bp-takeaway', parsed.topTakeaway); } catch(e) {}
      }

      status.textContent = `✓ ${parsed.reportDate || file.name} — views extracted`;
      status.style.color = '#3b6d11';

      // Show preview
      const preview = document.getElementById('bp-parsed-preview');
      const detail = document.getElementById('bp-parsed-detail');
      const summary = document.getElementById('bp-parsed-summary');
      if (preview) preview.style.display = 'block';
      if (summary) summary.textContent = `Top takeaway: ${parsed.topTakeaway || '—'}`;
      if (detail) {
        const changed = Object.entries(_bpBcaViews).filter(([k,v]) => v.prev !== v.curr).map(([k]) => k);
        detail.innerHTML = `<div style="font-size:11px;color:var(--text3);padding:8px;background:var(--bg2);border-radius:4px;margin-bottom:6px">
          <b>Changed this month:</b> ${changed.length > 0 ? changed.join(', ') : 'none'}<br>
          <b>Report:</b> ${parsed.reportTitle || '—'}
        </div>`;
        detail.classList.remove('hidden');
      }

    } catch(err) {
      status.textContent = 'Error: ' + err.message;
      status.style.color = '#a32d2d';
    }
  };
  reader.readAsArrayBuffer(file);
};

window.bpParseAllocText = function() {
  const text = document.getElementById('bp-alloc-paste').value;
  const status = document.getElementById('bp-alloc-status');
  if (!text.trim()) { status.textContent = 'Paste text first'; return; }

  // Normalise: lowercase, collapse whitespace, strip dates like "01 Jun 2026"
  const norm = text
    .replace(/\d{2}\s+[A-Za-z]{3}\s+\d{4}/g, '') // remove dates
    .replace(/\s+/g, ' ')
    .trim();

  // Extract allocation % for Equities/Bonds/Cash (top-level)
  function extractTopAlloc(label) {
    // "Equities Overweight 51.5% 50.0%" or "Equities\tOverweight\t51.5%"
    const re = new RegExp(label + '\\s+(?:overweight|underweight|neutral)\\s+([\\d\\.]+)%', 'i');
    const m = norm.match(re);
    return m ? parseFloat(m[1]) : null;
  }

  const eq = extractTopAlloc('Equities');
  const bd = extractTopAlloc('Bonds');
  const ca = extractTopAlloc('Cash');

  // Extract view for any label
  function extractView(label) {
    // Match label followed (within 60 chars) by overweight/underweight/neutral
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped + '.{0,60}?\\b(overweight|underweight|neutral)\\b', 'i');
    const m = norm.match(re);
    return m ? m[1].toLowerCase() : null;
  }

  // For items that appear twice (prev + curr), take the LAST match as current
  function extractViewCurrent(label) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped + '.{0,60}?\\b(overweight|underweight|neutral)\\b', 'gi');
    const matches = [...norm.matchAll(re)];
    if (matches.length === 0) return null;
    // Last match = current recommendation
    return matches[matches.length - 1][1].toLowerCase();
  }

  function extractViewPrev(label) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped + '.{0,60}?\\b(overweight|underweight|neutral)\\b', 'gi');
    const matches = [...norm.matchAll(re)];
    if (matches.length < 2) return extractViewCurrent(label) || 'neutral';
    return matches[matches.length - 2][1].toLowerCase();
  }

  // Extract performance numbers
  function extractPerf(section, period) {
    const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped + '[\\s\\S]{0,300}?' + period + '\\s+([\\-\\d\\.]+)\\s+([\\-\\d\\.]+)', 'i');
    const m = text.match(re);
    return m ? { gaa: parseFloat(m[1]), bm: parseFloat(m[2]) } : null;
  }

  const eq12m = extractPerf('Equity Allocation \\(Sectors\\)', '12 Months');
  const eq5y  = extractPerf('Equity Allocation \\(Sectors\\)', '5 Years');
  const bd12m = extractPerf('Bond Allocation', '12 Months');
  const bd5y  = extractPerf('Bond Allocation', '5 Years');

  // Update hidden inputs
  if (eq !== null) document.getElementById('bp-ir3-eq').value = eq;
  if (bd !== null) document.getElementById('bp-ir3-bd').value = bd;
  if (ca !== null) document.getElementById('bp-ir3-ca').value = ca;
  if (eq12m) document.getElementById('bp-ret-eq-12m').value = eq12m.gaa;
  if (eq5y)  document.getElementById('bp-ret-eq-5y').value  = eq5y.gaa;
  if (bd12m) document.getElementById('bp-ret-bd-12m').value = bd12m.gaa;
  if (bd5y)  document.getElementById('bp-ret-bd-5y').value  = bd5y.gaa;

  // Map label → key, extract prev+curr
  const VIEW_MAP = [
    // GAA
    {label:'Equities',          key:'gaa_eq'},
    {label:'Fixed Income',      key:'gaa_fi'},
    {label:'Cash',              key:'gaa_ca'},
    // Regions
    {label:'US',                key:'eq_us'},
    {label:'Euro Area',         key:'eq_eu'},
    {label:'Japan',             key:'eq_jp'},
    {label:'UK',                key:'eq_uk'},
    {label:'Canada',            key:'eq_ca'},
    {label:'Australia',         key:'eq_au'},
    {label:'China',             key:'eq_cn'},
    {label:'Other EM',          key:'eq_em'},
    // Fixed income
    {label:'Government',        key:'fi_gov'},
    {label:'Investment Grade',  key:'fi_ig'},
    {label:'High-Yield',        key:'fi_hy'},
    {label:'EM Debt',           key:'fi_em'},
    {label:'Duration',          key:'fi_dur'},
    {label:'Inflation-linked',  key:'fi_inf'},
    // Sectors
    {label:'Financials',        key:'sec_fin'},
    {label:'Info Tech',         key:'sec_it'},
    {label:'Health Care',       key:'sec_hc'},
    {label:'Communication Services', key:'sec_cs2'},
    {label:'Industrials',       key:'sec_ind'},
    {label:'Consumer Disc',     key:'sec_cd'},
    {label:'Consumer Staples',  key:'sec_cst'},
    {label:'Energy',            key:'sec_en'},
    {label:'Materials',         key:'sec_mat'},
    {label:'Utilities',         key:'sec_ut'},
    {label:'Real Estate',       key:'sec_re'},
    // FX
    {label:'USD',               key:'fx_usd'},
    {label:'EUR',               key:'fx_eur'},
    {label:'JPY',               key:'fx_jpy'},
    {label:'GBP',               key:'fx_gbp'},
    {label:'AUD',               key:'fx_aud'},
    {label:'CAD',               key:'fx_cad'},
    {label:'CHF',               key:'fx_chf'},
    {label:'CNY',               key:'fx_cny'},
    {label:'EM Currencies',     key:'fx_em'},
  ];

  let viewsFound = 0;
  VIEW_MAP.forEach(({label, key}) => {
    const curr = extractViewCurrent(label);
    const prev = extractViewPrev(label);
    if (curr) {
      _bpBcaViews[key] = { prev: prev || curr, curr };
      viewsFound++;
    }
  });

  try { localStorage.setItem('suitability-bp-bca-views', JSON.stringify(_bpBcaViews)); } catch(e) {}
  try { localStorage.setItem('suitability-bp-alloc-text', text); } catch(e) {}

  const parts = [];
  if (eq !== null) parts.push(`Eq ${eq}%`);
  if (bd !== null) parts.push(`Bd ${bd}%`);
  if (ca !== null) parts.push(`Ca ${ca}%`);
  if (eq12m) parts.push(`Eq 12M ${eq12m.gaa}%`);
  if (bd12m) parts.push(`Bd 12M ${bd12m.gaa}%`);
  parts.push(`${viewsFound} views`);

  status.textContent = `✓ Parsed: ${parts.join(' · ')}`;
  status.style.color = '#3b6d11';

  bpSaveAndGenerate();
};
