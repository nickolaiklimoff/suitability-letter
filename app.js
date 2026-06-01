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
    // _realCostBasis and _realTotalPnL set inside generatePortfolioReport

    if (analyticsMode === 'full' && Object.keys(window._holdingQuotesData||{}).length > 0) {
      const btn2 = document.querySelector('.btn-generate');
      if (btn2) btn2.textContent = 'Computing analytics…';
      try {
        portfolioData._analytics = computeFullAnalytics(portfolioData, _benchmark, clientIR);
        console.log('[analytics] full mode result:', portfolioData._analytics);
      } catch(e) {
        console.warn('[analytics] full mode failed:', e);
        portfolioData._analytics = null;
      }
    }

    // Fallback to chart-based analytics if no quotes or full mode failed
    if (!portfolioData._analytics && chartSrc && chartSrc.startsWith('data:') && apiKey) {
      const btn2 = document.querySelector('.btn-generate');
      if (btn2) btn2.textContent = 'Reading chart…';
      try {
        portfolioData._analytics = await extractChartAnalytics(chartSrc, apiKey, portCcy);
        console.log('[analytics] chart mode result:', portfolioData._analytics);
      } catch(e) {
        console.warn('[analytics] chart mode failed:', e);
        portfolioData._analytics = null;
      }
    }

    window._lastPortfolioData = portfolioData;
    window._lastReportConfig  = { clientIR, client, benchmark: _benchmark, reportDate, dataDate, chartSrc, breakdownSrc };
    const html = generatePortfolioReport(portfolioData, analytics, _benchmark, clientIR, client, reportDate, dataDate, chartSrc, breakdownSrc);
    document.getElementById('r-reportContent').innerHTML = html;
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
  // Save to client reportState
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
  const status = document.getElementById('r-benchmarkStatus');
  status.textContent = 'Loading...';
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
