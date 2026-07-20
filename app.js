// ─── State ───────────────────────────────────────────────────────────────────

let clients = {};       // { id: { name, profile, letters[] } }
let currentClientId = null;
let currentStep = 0;
const TOTAL_STEPS = 7;
let isDirty = false;

function lsSet(key, value) {
  let ok = false;
  try {
    localStorage.setItem(key, value);
    // Read back and verify — some browsers/conditions can silently truncate
    // or fail a write without throwing, so don't just trust a clean setItem.
    ok = (localStorage.getItem(key) === value);
    if (!ok) throw new Error('write did not verify on read-back');
  } catch (e) {
    console.error('localStorage save failed for', key, e);
    alert('⚠️ Failed to save "' + key + '" — browser storage is full.\n\n' +
          'This change will NOT persist after reload. Free up space (e.g. remove unused client breakdown images) and try again.\n\n' + e.message);
  }
  updateStorageHealthBar();
  return ok;
}

function updateStorageHealthBar() {
  const el = document.getElementById('storageHealthBar');
  if (!el) return;
  try {
    let bytes = 0;
    for (const k in localStorage) {
      if (!Object.prototype.hasOwnProperty.call(localStorage, k)) continue;
      bytes += (k.length + (localStorage[k]||'').length) * 2; // UTF-16
    }
    // Browsers typically cap localStorage around 5MB/origin; used as a
    // conservative reference point since there's no exact quota API for it.
    const ASSUMED_QUOTA = 5 * 1024 * 1024;
    const pct = Math.min(100, Math.round((bytes / ASSUMED_QUOTA) * 100));
    const kb = Math.round(bytes / 1024);
    let color = 'var(--text3)', label = 'OK';
    if (pct >= 90) { color = '#a32d2d'; label = 'FULL — saves may fail'; }
    else if (pct >= 70) { color = '#b8860b'; label = 'getting full'; }
    el.innerHTML = `<span style="color:${color}">● Storage: ${kb} KB (~${pct}%) ${label}</span>`;
  } catch (e) { el.innerHTML = ''; }
}

// ─── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await loadFromStorage();
  await loadProspects();
  await loadBusinessTasks();
  await loadMeetings();
  updateStorageHealthBar();
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
  crmShowTodayTasks();
});

// ─── Storage ─────────────────────────────────────────────────────────────────
// Client data (incl. base64 chart/breakdown images and generated report HTML)
// is stored in IndexedDB instead of localStorage: localStorage caps out around
// 5-10MB per origin and a handful of clients with uploaded images blows past
// that quota ("setItem exceeded the quota"). IndexedDB's quota is typically a
// large share of free disk space, so this removes the practical ceiling.

const IDB_NAME = 'suitability-db';
const IDB_STORE = 'kv';
let _idbHandle = null;

function idbOpen() {
  if (_idbHandle) return _idbHandle;
  _idbHandle = new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _idbHandle;
}

async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadFromStorage() {
  try {
    const fromIdb = await idbGet('suitability-clients');
    if (fromIdb) { clients = fromIdb; return; }
  } catch (e) {
    console.error('IndexedDB read failed, falling back to localStorage', e);
  }
  // First run after upgrade (or IndexedDB unavailable): migrate any existing
  // localStorage data into IndexedDB, then free up the localStorage quota.
  try {
    const raw = localStorage.getItem('suitability-clients');
    if (raw) {
      clients = JSON.parse(raw);
      try {
        await idbSet('suitability-clients', clients);
        localStorage.removeItem('suitability-clients');
      } catch (e) {
        console.error('Migration to IndexedDB failed, keeping localStorage copy', e);
      }
    }
  } catch (e) { clients = clients || {}; }
}

function saveToStorage() {
  idbSet('suitability-clients', clients).catch(err => {
    console.error('Failed to save client data', err);
    alert('Error saving client data: ' + err.message);
  });
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
    reportDate:    new Date().toLocaleDateString('en-GB', {day:'numeric',month:'long',year:'numeric'}),
    dataDate:      new Date().toLocaleDateString('en-GB', {day:'numeric',month:'long',year:'numeric'}),
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
    const reportDate = new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
  const dataDate = new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});

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
  saveReportState();
  currentClientId = id;
  renderClientList();
  // Hide all panels
  ['basePortfoliosPanel','dailyBriefPanel','settingsPanel'].forEach(id => {
    document.getElementById(id)?.classList.add('hidden');
  });
  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('appContent').classList.remove('hidden');
  switchTab('report', document.querySelector('.tab'));
  loadProfileForm();
  loadClientTab();
  resetLetterForm();
  loadReportState();
  loadDepositData();
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
    const reportDate = new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
  const dataDate = new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});

  // Save current holding quotes to in-memory cache before switching client
  if (currentClientId && window._holdingQuotesData && Object.keys(window._holdingQuotesData).length > 0) {
    if (!window._holdingQuotesCache) window._holdingQuotesCache = {};
    window._holdingQuotesCache[currentClientId] = window._holdingQuotesData;
  }
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
  // Restore holding quotes from localStorage / memory cache
  loadHoldingQuotesFromStorage();
  // If quotes available, restore full analytics mode
  if (window._holdingQuotesData && Object.keys(window._holdingQuotesData).length > 0) {
    window._analyticsMode = 'full';
    document.querySelectorAll('input[name="analyticsMode"]').forEach(r => r.checked = r.value === 'full');
    const aInputs = document.getElementById('analyticsFullInputs');
    if (aInputs) aInputs.style.display = 'block';
  }
}

function loadHoldingQuotesFromStorage() {
  if (!currentClientId) return;
  // Check in-memory cache first (survives Tracking Prevention blocking localStorage)
  if (window._holdingQuotesCache && window._holdingQuotesCache[currentClientId]) {
    window._holdingQuotesData = window._holdingQuotesCache[currentClientId];
    const count = Object.keys(window._holdingQuotesData).length;
    const statusEl = document.getElementById('r-holdingQuotesStatus');
    if (statusEl && count > 0) statusEl.textContent = count + ' files (cached)';
    console.log('[holdingQuotes] restored', count, 'files from memory cache');
    return;
  }
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
  if (name === 'rebalance') setTimeout(rbInit, 50);
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

function escVal(s) { return String(s||'').replace(/"/g,'&quot;'); }

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
    lsSet('suitability-benchmark', JSON.stringify(_benchmark));
    const month = file.name.match(/\w+_\d{4}/)?.[0] || file.name.replace('.xlsx','');
    if (label) { label.textContent = '✓ ' + month; label.style.color = '#3b6d11'; }
  } catch(e) {
    if (label) { label.textContent = 'Error'; label.style.color = '#a32d2d'; }
    alert('Error loading benchmark: ' + e.message);
  }
};

window.runPortfolioReport = async function() {
  const portfolioInput = document.getElementById('r-portfolioFile');
  const depositsOnly = document.getElementById('r-depositsOnly')?.checked;
  if (!portfolioInput.files[0] && !depositsOnly) { alert('Please upload the cbonds portfolio export.'); return; }

  // Try to load benchmark from localStorage if not in memory
  if (!_benchmark) {
    try {
      const stored = localStorage.getItem('suitability-benchmark');
      if (stored) _benchmark = JSON.parse(stored);
    } catch(e) {}
  }

  if (!_benchmark) { alert('Please upload the IR benchmark file first (or generate Base Portfolios).'); return; }

  const btn = document.querySelector('.btn-generate');
  btn.textContent = 'Generating...';
  btn.disabled = true;

  try {
    // ── Deposits-only mode: build empty portfolio ──
    if (depositsOnly && !portfolioInput.files[0]) {
      const clientIR = document.querySelector('input[name="r-clientIR"]:checked')?.value || 'IR3';
      const showClientName = document.getElementById('r-showClientName')?.checked !== false;
      const depositData = getDepositData();
      const reportDate = new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
      const emptyPortfolio = {
        stocks:[], funds:[], bonds:[], totalValue:0,
        reportCcy:'USD', reportCcySym:'$',
        couponRows:[], divRows:[], tradeRows:[],
        _analytics: null,
      };
      const html = await generatePortfolioReport(emptyPortfolio, null, _benchmark, clientIR, clients[currentClientId] || {name:'Client'}, reportDate, reportDate, null, null, showClientName, depositData);
      window._lastPortfolioData = emptyPortfolio;
      window._lastReportConfig  = { clientIR, client: clients[currentClientId] || {name:'Client'}, benchmark: _benchmark, reportDate, dataDate: reportDate, depositsOnly: true, depositData };
      window._lastWaar = null;
      document.getElementById('r-reportContent').innerHTML = html;
      document.getElementById('r-reportOutput').classList.remove('hidden');
      document.getElementById('r-reportOutput').scrollIntoView({ behavior: 'smooth' });
      btn.textContent = 'Generate report ↗';
      btn.disabled = false;
      autoGenerateCommentary();
      return;
    }

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
    const apiKey = (document.getElementById('apiKey')?.value || localStorage.getItem('suitability-api-key') || '').trim();
    let irRatings = {};
    if (apiKey) {
      irRatings = await assignPortfolioRatings(portfolioData.holdings, apiKey);
    }

    // Set depositData BEFORE analytics so computeAnalytics can read window._lastDepositData
    const depositData = getDepositData();
    window._lastDepositData = depositData;

    const analytics = await calculatePortfolioAnalytics(portfolioData, irRatings, clientIR, apiKey);

    const reportDate = new Date().toLocaleDateString('en-GB', {day:'numeric',month:'long',year:'numeric'});
    const dataDate = reportDate;

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
    const showClientName = document.getElementById('r-showClientName')?.checked !== false;
    const inceptionDate  = document.getElementById('r-inceptionDate')?.value || null;
    window._inceptionDate = inceptionDate;
    const html = await generatePortfolioReport(portfolioData, analytics, _benchmark, clientIR, client, reportDate, dataDate, chartSrc, breakdownSrc, showClientName, depositData);
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
          const showClientName2 = document.getElementById('r-showClientName')?.checked !== false;
          const html2 = await generatePortfolioReport(portfolioData, analytics, _benchmark, clientIR, client, reportDate, dataDate, chartSrc, breakdownSrc, showClientName2);
          document.getElementById('r-reportContent').innerHTML = html2;
        } else {
          console.warn('[analytics] full analytics returned null — check holding file matching');
        }
      } catch(e) {
        console.warn('[analytics] full analytics error:', e);
      }
    }

    // Auto-generate commentary AFTER full analytics (so it has complete data)
    if (document.getElementById('r-generateCommentary')?.checked !== false) {
      autoGenerateCommentary();
    }

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

  // ── Deposits-only mode ──────────────────────────────────────────────────────
  if (cfg.depositsOnly) {
    const dd = cfg.depositData || {};
    const ca = (dd.currentAccounts || []).map(r => `${r.ccy} ${r.amount.toLocaleString()}`).join(', ') || 'none';
    const td = (dd.timeDeposits || []).map(r => `${r.ccy} ${r.amount.toLocaleString()}`).join(', ') || 'none';

    // BCA context
    let bcaContext = '';
    try {
      const views = _bpBcaViews && Object.keys(_bpBcaViews).length > 0 ? _bpBcaViews : null;
      const bpData = JSON.parse(localStorage.getItem('suitability-bp-data') || '{}');
      const source = bpData.source || 'BCA Research GAA';
      if (views) {
        const LABELS = {
          gaa_eq:'Equities',gaa_fi:'Fixed Income',gaa_ca:'Cash',
          eq_us:'US',eq_eu:'Euro Area',eq_jp:'Japan',eq_uk:'UK',eq_cn:'China',eq_em:'EM ex China',
          fi_gov:'Government Bonds',fi_ig:'Investment Grade',fi_hy:'High Yield',fi_em:'EM Debt',
          sec_fin:'Financials',sec_it:'Info Tech',sec_hc:'Health Care',sec_cs2:'Communication Services',
          sec_ind:'Industrials',sec_cd:'Consumer Discretionary',sec_cst:'Consumer Staples',
          sec_en:'Energy',sec_mat:'Materials',
        };
        const ow = [], uw = [], changed = [];
        Object.entries(views).forEach(([k,v]) => {
          if (!LABELS[k]) return;
          if (v.curr==='overweight') ow.push(LABELS[k]);
          if (v.curr==='underweight') uw.push(LABELS[k]);
          if (v.prev!==v.curr) changed.push(`${LABELS[k]}: ${v.prev}→${v.curr}`);
        });
        bcaContext = `\nHOUSE VIEW (${source}):\nOverweight: ${ow.join(', ')||'none'}\nUnderweight: ${uw.join(', ')||'none'}\n${changed.length?'Changes: '+changed.join('; '):''}`;
      }
      const takeaway = localStorage.getItem('suitability-bp-takeaway');
      if (takeaway) bcaContext += `\nTop takeaway: ${takeaway}`;
      const reportText = document.getElementById('bp-report-text')?.value || localStorage.getItem('suitability-bp-alloc-text') || '';
      if (reportText.length > 100) bcaContext += `\n\nBCA REPORT EXCERPT:\n${reportText.slice(0,2500)}`;
    } catch(e) {}

    const bm = (cfg.benchmark || {})[clientIR] || {};
    const bmEq = ((bm.equities||0)*100).toFixed(0);
    const bmBd = ((bm.bonds||0)*100).toFixed(0);
    const bmCa = ((bm.cash||0)*100).toFixed(0);

    return `You are writing a portfolio advisory commentary for an investment report at Orion Ridge Capital.

The client currently holds NO securities portfolio — only cash and deposits:
- Current accounts: ${ca}
- Time deposits: ${td}

CLIENT RISK PROFILE: ${clientIR}
${clientIR} BENCHMARK ALLOCATION: Equities ${bmEq}%, Bonds ${bmBd}%, Cash ${bmCa}%
${bcaContext}

Write exactly 3 paragraphs (no headers, no bullets):
1. Current position — describe the client's current holdings (cash and deposits). Note that the portfolio is entirely in cash/deposits with 0% allocation to equities and bonds, which represents a significant deviation from the ${clientIR} benchmark of ${bmEq}% equities and ${bmBd}% bonds.
2. House view & market context — briefly summarise Orion Ridge Capital's current market outlook based on the BCA research context. Which asset classes, regions and sectors does the house favour?
3. Recommended action — give specific, actionable recommendations on how to deploy the available capital to build a portfolio aligned with the ${clientIR} benchmark and current house view. Name specific asset classes, approximate target allocations, and priority areas based on overweight recommendations.

Style: professional investment advisory. Do not mention the client's name. Third person ("the client", "the portfolio"). Concrete numbers and percentages.`;
  }
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

  // ── BCA Research context ──
  let bcaContext = '';
  try {
    // Views (from screenshot parse)
    const views = _bpBcaViews && Object.keys(_bpBcaViews).length > 0 ? _bpBcaViews : null;
    const bpData = JSON.parse(localStorage.getItem('suitability-bp-data') || '{}');
    const bcaSource = bpData.source || 'BCA Research GAA';

    if (views) {
      const LABELS = {
        gaa_eq:'Equities', gaa_fi:'Fixed Income', gaa_ca:'Cash',
        eq_us:'US Equities', eq_eu:'Euro Area', eq_jp:'Japan', eq_uk:'UK', eq_cn:'China', eq_em:'EM ex China',
        fi_gov:'Government Bonds', fi_ig:'Investment Grade', fi_hy:'High Yield', fi_em:'EM Debt',
        sec_fin:'Financials', sec_it:'Info Tech', sec_hc:'Health Care', sec_cs2:'Communication Services',
        sec_ind:'Industrials', sec_cd:'Consumer Discretionary', sec_cst:'Consumer Staples',
        sec_en:'Energy', sec_mat:'Materials', sec_re:'Real Estate', sec_ut:'Utilities',
        fx_usd:'USD', fx_eur:'EUR', fx_gbp:'GBP'
      };
      const ow = [], uw = [], changed = [];
      Object.entries(views).forEach(([k, v]) => {
        if (!LABELS[k]) return;
        if (v.curr === 'overweight') ow.push(LABELS[k]);
        if (v.curr === 'underweight') uw.push(LABELS[k]);
        if (v.prev !== v.curr) changed.push(`${LABELS[k]}: ${v.prev} → ${v.curr}`);
      });
      bcaContext = `\nORION RIDGE CAPITAL HOUSE VIEW (source: ${bcaSource}):
Overweight: ${ow.join(', ') || 'none'}
Underweight: ${uw.join(', ') || 'none'}
${changed.length ? 'Changes this month: ' + changed.join('; ') : 'No changes this month'}`;
    }

    // Full report text for additional context
    const reportText = document.getElementById('bp-report-text')?.value ||
                       localStorage.getItem('suitability-bp-alloc-text') || '';
    const takeaway = localStorage.getItem('suitability-bp-takeaway') || '';
    if (takeaway) bcaContext += `\nBCA Top Takeaway: ${takeaway}`;
    if (reportText && reportText.length > 100) {
      // Include first 3000 chars of report for market context
      bcaContext += `\n\nBCA REPORT CONTEXT (excerpt):\n${reportText.slice(0, 3000)}`;
    }
  } catch(e) {}

  const hasBcaViews = bcaContext.length > 0;

  return `You are writing a concise portfolio commentary for an investment advisory report at Orion Ridge Capital.

CLIENT RISK PROFILE: ${clientIR} | MAX PERMITTED WAAR: ${maxWaar.toFixed(2)}
CURRENT WAAR: ${waar != null ? waar.toFixed(2) : 'N/A'} ${waarBreached ? '— BREACH (+' + (waar-maxWaar).toFixed(2) + ' points above ' + clientIR + ' maximum)' : '— within ' + clientIR + ' corridor'}

ASSET ALLOCATION vs ${clientIR} benchmark:
Equities: ${window._lastEquityPct || 'N/A'} vs ${window._lastBmEquity || 'N/A'} | Bonds: ${window._lastBondPct || 'N/A'} vs ${window._lastBmBond || 'N/A'} | Cash: ${window._lastCashPct || 'N/A'}

TOP 5 POSITIONS: ${topPos}
PERFORMANCE METRICS: ${metrics || 'N/A'}
${fullModeText ? 'FULL ANALYTICS: ' + fullModeText : ''}
${bcaContext}

Write exactly ${isFullMode ? '5' : '4'} paragraphs (no headers, no bullets) covering:
1. Suitability & Allocation — WAAR status, allocation vs ${clientIR} benchmark with exact numbers
2. Portfolio Performance — return, volatility, max drawdown${isFullMode ? ', beta, alpha' : ''}
3. ${hasBcaViews ? `House View & Positioning — briefly state Orion Ridge Capital's current market outlook (key overweights, underweights, and any changes this month based on the BCA report context). Then assess how this client's portfolio aligns with or diverges from that view, naming specific positions.` : 'Key Observations — notable characteristics of the portfolio composition'}
${hasBcaViews ? `4. Tactical Recommendations — start a NEW paragraph (do not continue paragraph 3). Give 2-3 concrete, specific actions to better align the portfolio with the house view and restore ${clientIR} compliance. Each recommendation should name specific positions or asset classes with approximate target sizes.` : ''}
${isFullMode ? `${hasBcaViews ? '5' : '4'}. Risk Concentration — top risk contributors and diversification assessment` : ''}

Style: factual, professional investment advisory. Do NOT mention the client's name — refer to "the portfolio", "the client", or "the investor". Third person. Concrete numbers. Paragraph 3 references the BCA market thesis. Paragraph 4 (recommendations) opens with a clear transition like "To improve alignment..." or "From a tactical standpoint..."`;
}

async function generateCommentaryText(extraInstruction) {
  const apiKey = (document.getElementById('apiKey')?.value || localStorage.getItem('suitability-api-key') || '').trim();
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
      max_tokens: 1400,
      messages: [{ role: 'user', content: userContent }]
    })
  });
  const data = await resp.json();
  return data.content?.[0]?.text?.trim() || null;
}

// Auto-generate commentary after report is rendered
async function autoGenerateCommentary() {
  const apiKey = (document.getElementById('apiKey')?.value || localStorage.getItem('suitability-api-key') || '').trim();
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
  const apiKey = (document.getElementById('apiKey')?.value || localStorage.getItem('suitability-api-key') || '').trim();
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

// ─── Print Suitability Letter (new window, clean PDF) ─────────────────────────
window.printLetter = function() {
  const content = document.getElementById('letterOutput');
  if (!content || !content.innerHTML.trim()) {
    alert('Please generate the suitability letter first.'); return;
  }
  const letterHtml = content.innerHTML;
  const w = window.open('', '_blank', 'width=900,height=800');
  if (!w) { alert('Pop-up blocked — please allow pop-ups for this page and try again.'); return; }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Suitability Letter</title>
    <style>
      body { font-family: Georgia, serif; font-size: 12pt; line-height: 1.6; margin: 2cm 2.5cm; color: #000; }
      h1, h2, h3 { font-family: Arial, sans-serif; }
      p { margin: 0 0 1em; }
      strong { font-weight: 700; }
      @media print { body { margin: 1.5cm 2cm; } }
    </style>
  </head><body>${letterHtml}<script>
    window.addEventListener('load', function() { setTimeout(function() { window.print(); }, 800); });
  <\/script></body></html>`);
  w.document.close();
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

    /* CSS custom properties for report components */
    :root {
      --bg1: #FAF7F4; --bg2: #f5f0eb; --bg3: #ede8e3;
      --border: #d9d0c7; --text1: #2C2C2C; --text2: #5C5148; --text3: #8B7A68;
    }

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
    @media print {
      .report-table thead { display: table-header-group; }
      .report-table tr { page-break-inside: avoid; break-inside: avoid; }
      .report-table tbody tr:last-child { page-break-before: avoid; break-before: avoid; }
    }
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
      setTimeout(function() {
        document.body.classList.add('printing-letter');
        window.print();
        setTimeout(() => document.body.classList.remove('printing-letter'), 1000);
      }, 1500);
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
  {label:'Government',w:0.755},{label:'Investment Grade',w:0.195},{label:'High Yield',w:0.018},{label:'EM Debt',w:0.031}
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

  const section = document.getElementById('bp-views-section');
  if (section) section.style.display = 'block';

  function pill(v) {
    if (!v) return '';
    const styles = {
      overweight:  'background:#e8f5e9;color:#2e7d32;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:600;display:inline-block',
      underweight: 'background:#ffebee;color:#c62828;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:600;display:inline-block',
      neutral:     'background:#f0f0f0;color:#666;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:500;display:inline-block'
    };
    const label = v.charAt(0).toUpperCase() + v.slice(1);
    return `<span style="${styles[v] || styles.neutral}">${label}</span>`;
  }

  let html = `<table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr>
      <th style="text-align:left;padding:0 8px 8px;font-size:10px;color:var(--text3);font-weight:500;width:70%"></th>
      <th style="text-align:center;padding:0 8px 8px;font-size:10px;color:var(--text3);font-weight:500">Current view</th>
    </tr></thead><tbody>`;

  BP_BCA_ITEMS.forEach(item => {
    if (item.section) {
      html += `<tr><td colspan="2" style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--text3);padding:8px 8px 3px;border-top:1px solid var(--border);background:var(--bg2)">${item.section}</td></tr>`;
      return;
    }
    const view = _bpBcaViews[item.key] || {prev: item.prev, curr: item.curr};
    const mkSelect = (field, val) => `<select data-key="${item.key}" data-field="${field}"
      onchange="bpUpdateView(this)"
      style="font-size:11px;padding:2px 6px;border:1px solid var(--border);border-radius:10px;cursor:pointer;
             background:${val==='overweight'?'#e8f5e9':val==='underweight'?'#fdecea':'#f0f0f0'};
             color:${val==='overweight'?'#2e7d32':val==='underweight'?'#c62828':'#555'};
             font-weight:600;outline:none">
      <option value="overweight" ${val==='overweight'?'selected':''}>Overweight</option>
      <option value="neutral"    ${val==='neutral'   ?'selected':''}>Neutral</option>
      <option value="underweight"${val==='underweight'?'selected':''}>Underweight</option>
    </select>`;
    html += `<tr style="border-top:0.5px solid var(--border)">
      <td style="padding:5px 8px">${item.label}</td>
      <td style="text-align:center;padding:3px 8px">${mkSelect('curr', view.curr)}</td>
    </tr>`;
  });

  html += '</tbody></table>';
  wrap.innerHTML = html;
}

window.bpSaveReportText = function() {
  const text = document.getElementById('bp-report-text')?.value || '';
  lsSet('suitability-bp-alloc-text', text);
  const st = document.getElementById('bp-report-text-status');
  if (st) { st.textContent = '✓ Saved'; st.style.color = '#3b6d11'; setTimeout(()=>{ st.textContent=''; }, 2000); }
};

window.bpUpdateView = function(sel) {
  const key = sel.dataset.key, field = sel.dataset.field;
  if (!_bpBcaViews[key]) _bpBcaViews[key] = {};
  _bpBcaViews[key][field] = sel.value;
  lsSet('suitability-bp-bca-views', JSON.stringify(_bpBcaViews));
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
        lsSet('suitability-bp-etf', JSON.stringify(_bpEtfData));
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
    lsSet('suitability-bp-etf', JSON.stringify(_bpEtfData));

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
    lsSet('suitability-bp-etf', JSON.stringify(_bpEtfData));

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
  lsSet('suitability-bp-data', JSON.stringify(bpData));

  // Also build _benchmark object for report tab compatibility
  _benchmark = {};
  BP_IRS.forEach(ir => {
    _benchmark[ir] = {
      equities: W[ir].eq, bonds: W[ir].bd, cash: W[ir].ca,
      equity:   W[ir].eq, bond:  W[ir].bd,  // aliases used in report.js
      sectors:  {}, bondSegments: {}
    };
    BP_SECTORS.forEach(s => { _benchmark[ir].sectors[s.label] = W[ir].eq * s.w; });
    BP_BOND_SEGS.forEach(s => { _benchmark[ir].bondSegments[s.label] = W[ir].bd * s.w; });
  });
  lsSet('suitability-benchmark', JSON.stringify(_benchmark));

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
    <th style="text-align:left;padding:6px 10px;font-size:11px;font-weight:600;color:white;background:${BRAND}"></th>
    ${BP_IRS.map(ir => `<th style="${ir==='IR3'?TH_IR3:TH_IR}">${ir}</th>`).join('')}
  </tr></thead><tbody>`;

  // ── BENCHMARKS ──
  h += `<tr><td colspan="7" style="${SEC_HDR}">Benchmarks</td></tr>`;
  ETF_META.forEach(e => {
    h += `<tr style="background:white">
      <td style="padding:6px 10px;border-bottom:0.5px solid #e8e5e0">
        <span style="font-weight:600;font-size:13px;color:${BRAND_DARK}">${e.label}</span>
        <span style="font-size:11px;color:#888;font-weight:400;margin-left:6px">(${e.key} · ${e.isin} · ${e.name})</span>
      </td>`;
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
    h += `<tr style="background:#fafaf8"><td style="padding:3px 10px 3px 18px;font-size:11px;color:#777;border-bottom:0.5px solid #ece9e3">${m.label}</td>`;
    BP_IRS.forEach(ir => {
      const bg = ir==='IR3' ? 'background:#f5f8f5;' : 'background:#fafaf8;';
      h += `<td style="text-align:right;padding:3px 8px;border-bottom:0.5px solid #ece9e3;${bg}">${fmtV(weighted(m.key,ir),m.isRet)}</td>`;
    });
    h += '</tr>';
  });

  // ── PORTFOLIO WEIGHTS ──
  h += `<tr><td colspan="7" style="${SEC_HDR}">Portfolio weights <span style="font-size:10px;font-weight:400;opacity:0.8">based on BCA Research GAA</span></td></tr>`;
  [{key:'eq',label:'Equities'},{key:'bd',label:'Bonds'},{key:'ca',label:'Cash'}].forEach(a => {
    h += `<tr style="background:white"><td style="padding:6px 10px;font-weight:600;color:${BRAND_DARK};border-bottom:0.5px solid #e8e5e0" colspan="1">${a.label}</td>`;
    BP_IRS.forEach(ir => {
      h += `<td style="${ir==='IR3'?TD_R3:TD_R};font-weight:600">${fmtW(W[ir][a.key])}</td>`;
    });
    h += '</tr>';
    h += `<tr style="background:#fafaf8"><td style="padding:2px 10px 4px 18px;font-size:10px;color:#888;border-bottom:0.5px solid #ece9e3" colspan="1">Benchmark</td>`;
    BP_IRS.forEach(ir => {
      const bg = ir==='IR3' ? 'background:#f5f8f5;' : 'background:#fafaf8;';
      h += `<td style="text-align:right;padding:2px 8px 4px;font-size:10px;color:#888;border-bottom:0.5px solid #ece9e3;${bg}">${(BP_BM_WEIGHTS[a.key][ir]*100).toFixed(0)}%</td>`;
    });
    h += '</tr>';
  });

  // ── EQUITY SECTORS ──
  h += `<tr><td colspan="7" style="${SUB_HDR}">Equity sectors</td></tr>`;
  BP_SECTORS.forEach(s => {
    h += `<tr style="background:white"><td style="padding:4px 10px 4px 18px;font-size:11px;color:#444;border-bottom:0.5px solid #ece9e3" colspan="1">${s.label}</td>`;
    BP_IRS.forEach(ir => {
      h += `<td style="${ir==='IR3'?TD_R3:TD_R}">${fmtW(W[ir].eq*s.w)}</td>`;
    });
    h += '</tr>';
  });
  h += `<tr style="background:${BRAND_HDR}"><td style="padding:5px 10px;font-weight:600;font-size:11px;color:${BRAND_DARK};border-bottom:1px solid #c8dac8" colspan="1">Total equities</td>`;
  BP_IRS.forEach(ir => {
    h += `<td style="text-align:right;padding:5px 8px;font-weight:600;font-size:11px;color:${BRAND_DARK};border-bottom:1px solid #c8dac8;${ir==='IR3'?'background:#deeede;':''}">${fmtW(W[ir].eq)}</td>`;
  });
  h += '</tr>';

  // ── BOND SEGMENTS ──
  h += `<tr><td colspan="7" style="${SUB_HDR}">Bond segments</td></tr>`;
  BP_BOND_SEGS.forEach(s => {
    h += `<tr style="background:white"><td style="padding:4px 10px 4px 18px;font-size:11px;color:#444;border-bottom:0.5px solid #ece9e3" colspan="1">${s.label}</td>`;
    BP_IRS.forEach(ir => {
      h += `<td style="${ir==='IR3'?TD_R3:TD_R}">${fmtW(W[ir].bd*s.w)}</td>`;
    });
    h += '</tr>';
  });
  h += `<tr style="background:${BRAND_HDR}"><td style="padding:5px 10px;font-weight:600;font-size:11px;color:${BRAND_DARK};border-bottom:1px solid #c8dac8" colspan="1">Total bonds</td>`;
  BP_IRS.forEach(ir => {
    h += `<td style="text-align:right;padding:5px 8px;font-weight:600;font-size:11px;color:${BRAND_DARK};border-bottom:1px solid #c8dac8;${ir==='IR3'?'background:#deeede;':''}">${fmtW(W[ir].bd)}</td>`;
  });
  h += '</tr>';

  // ── CASH ──
  h += `<tr style="background:white"><td style="padding:5px 10px;font-weight:600;color:${BRAND_DARK};border-bottom:0.5px solid #e8e5e0" colspan="1">Cash</td>`;
  BP_IRS.forEach(ir => {
    h += `<td style="${ir==='IR3'?TD_R3:TD_R};font-weight:600">${fmtW(W[ir].ca)}</td>`;
  });
  h += '</tr>';

  // ── RETURNS ──
  [{key:'12M',label:'Indicative returns — 12 months'},{key:'5Y',label:'Indicative returns — 5 years'}].forEach(p => {
    h += `<tr><td colspan="7" style="${SEC_HDR}">${p.label}</td></tr>`;
    [{key:'eq',label:'Equities'},{key:'bd',label:'Bonds'},{key:'ca',label:'Cash'}].forEach(a => {
      h += `<tr style="background:#fafaf8"><td style="padding:4px 10px 4px 18px;font-size:11px;color:#666;border-bottom:0.5px solid #ece9e3" colspan="1">${a.label}</td>`;
      BP_IRS.forEach(ir => {
        const bg = ir==='IR3' ? 'background:#f5f8f5;' : 'background:#fafaf8;';
        h += `<td style="text-align:right;padding:4px 8px;border-bottom:0.5px solid #ece9e3;${bg}">${fmtR(rets[a.key][p.key], W[ir][a.key])}</td>`;
      });
      h += '</tr>';
    });
    h += `<tr style="background:${BRAND_HDR}"><td style="padding:6px 10px;font-weight:600;color:${BRAND_DARK};border-bottom:1px solid #c8dac8" colspan="1">Portfolio total</td>`;
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

window.bpDownloadXlsx = async function() {
  const stored = localStorage.getItem('suitability-bp-data');
  if (!stored) { alert('Generate table first.'); return; }
  if (typeof ExcelJS === 'undefined') { alert('ExcelJS library not loaded yet, please wait and try again.'); return; }
  const bp = JSON.parse(stored);
  const W = bp.W; const rets = bp.rets;
  const source = bp.source || 'BCA Research GAA';
  const etf = _bpEtfData || {};
  // Load views from localStorage (fresh, not stale module-level variable)
  let views = {};
  try {
    const vStored = localStorage.getItem('suitability-bp-bca-views');
    if (vStored) views = JSON.parse(vStored);
    else views = _bpBcaViews || {};
  } catch(e) { views = _bpBcaViews || {}; }
  const IRS = BP_IRS;
  const month = new Date().toLocaleDateString('en-GB',{month:'long',year:'numeric'});

  const BRAND='5A7259',BRAND_DARK='3D4F3C',BRAND_HDR='EAF0EA',BRAND_MED='C8DAC8';
  const LGRAY='F7F6F4',MGRAY='D8D4CC',TGRAY='999999';
  const GREEN='2E7D32',RED='C62828',BLUE_TXT='1565C0',BLUE_BG='E8F0FE';
  const OW_BG='E8F5E9',UW_BG='FFEBEE',NEU_BG='F2F2F2';

  const wb2 = new ExcelJS.Workbook();
  wb2.creator = 'Orion Ridge Capital'; wb2.created = new Date();

  const bf = hex => ({type:'pattern',pattern:'solid',fgColor:{argb:'FF'+hex}});
  const med = c => ({style:'medium',color:{argb:'FF'+c}});
  const thin = c => ({style:'thin',color:{argb:'FF'+(c||MGRAY)}});
  const border = (b={}) => ({
    left:b.l||thin(),right:b.r||thin(),
    top:b.t||thin(),bottom:b.b||thin()
  });

  function etfMetric(metric,ir){
    let s=0,ok=false;
    [{k:'ACWI',t:'eq'},{k:'AGGU',t:'bd'},{k:'BIL',t:'ca'}].forEach(e=>{
      const w=BP_BM_WEIGHTS[e.t][ir],v=(etf[e.k]||{})[metric];
      if(v!=null&&!isNaN(v)&&w>0){s+=w*v;ok=true;}
    });
    return ok?s:null;
  }

  // ── Sheet 1 ──────────────────────────────────────────────────────────────
  const ws = wb2.addWorksheet('Base Portfolios');
  ws.views=[{state:'frozen',xSplit:0,ySplit:4}];
  ws.getColumn(1).width=52;
  IRS.forEach((_,i)=>{ws.getColumn(i+2).width=11;});

  let r=1;

  function title(row,txt,bg){
    ws.mergeCells(row,1,row,7);
    const c=ws.getCell(row,1);
    c.value=txt;c.font={name:'Arial',bold:true,color:{argb:'FFFFFFFF'},size:13};
    c.fill=bf(bg);c.alignment={horizontal:'left',vertical:'middle'};
    c.border={bottom:med(BRAND_DARK)};ws.getRow(row).height=30;
  }
  function secHdr(row,label,sub=''){
    ws.mergeCells(row,1,row,7);
    const c=ws.getCell(row,1);
    c.value=label+(sub?'   —   '+sub:'');
    c.font={name:'Arial',bold:true,color:{argb:'FFFFFFFF'},size:11};
    c.fill=bf(BRAND);c.alignment={horizontal:'left',vertical:'middle'};
    c.border={top:med(BRAND_DARK),bottom:med(BRAND)};ws.getRow(row).height=22;return row+1;
  }
  function irHdr(row){
    ws.getCell(row,1).fill=bf(BRAND);ws.getCell(row,1).border={bottom:med(BRAND)};
    IRS.forEach((ir,i)=>{
      const c=ws.getCell(row,i+2);
      c.value=ir;c.font={name:'Arial',bold:true,color:{argb:'FFFFFFFF'},size:10};
      c.fill=bf(ir==='IR3'?BRAND_DARK:BRAND);c.alignment={horizontal:'center',vertical:'middle'};
      c.border={left:thin(),right:thin(),bottom:med(BRAND)};
    });
    ws.getRow(row).height=18;return row+1;
  }
  function lbl(cell,txt,opts={}){
    const{bold=false,color='222222',size=10,italic=false,bg='FFFFFF',indent=0}=opts;
    cell.value='  '.repeat(indent)+txt;
    cell.font={name:'Arial',bold,color:{argb:'FF'+color},size,italic};
    cell.fill=bf(bg);cell.alignment={horizontal:'left',vertical:'middle'};
    cell.border={right:thin(),bottom:thin()};
  }
  function val(cell,v,opts={}){
    const{pct=true,bold=false,color=null,ir='',fmt=null}=opts;
    const bg=ir==='IR3'?BRAND_HDR:opts.bg||'FFFFFF';
    cell.fill=bf(bg);cell.alignment={horizontal:'right',vertical:'middle'};
    cell.border={left:thin(),right:thin(),bottom:thin()};
    if(v===null||v===undefined||(pct&&typeof v==='number'&&Math.abs(v)<0.00001)){
      cell.value='—';cell.font={name:'Arial',color:{argb:'FF'+TGRAY},size:10};return;
    }
    if(pct){cell.value=v/100;cell.numFmt=fmt||'0.00%';}
    else{cell.value=v/100;cell.numFmt=fmt||'+0.0%;-0.0%;"-"';}
    const col=color||(v>0?GREEN:v<0?RED:'333333');
    cell.font={name:'Arial',bold,color:{argb:'FF'+col},size:10};
  }
  function totRow(row,label,vals,pct=true){
    const c=ws.getCell(row,1);
    c.value=label;c.font={name:'Arial',bold:true,color:{argb:'FF'+BRAND_DARK},size:10};
    c.fill=bf(BRAND_HDR);c.alignment={horizontal:'left',vertical:'middle'};
    c.border={top:med(BRAND),bottom:med(BRAND),right:thin()};
    IRS.forEach((ir,i)=>{
      const cell=ws.getCell(row,i+2);const v=vals[ir];
      cell.fill=bf(ir==='IR3'?BRAND_MED:BRAND_HDR);
      cell.alignment={horizontal:'right',vertical:'middle'};
      cell.border={left:thin(),right:thin(),top:med(BRAND),bottom:med(BRAND)};
      if(v===null||v===undefined){cell.value='—';cell.font={name:'Arial',color:{argb:'FF'+TGRAY},size:10,bold:true};return;}
      if(pct){cell.value=v/100;cell.numFmt='0.00%';}else{cell.value=v/100;cell.numFmt='+0.0%;-0.0%;"-"';}
      const col=v>0?GREEN:v<0?RED:BRAND_DARK;
      cell.font={name:'Arial',bold:true,color:{argb:'FF'+col},size:10};
    });
    ws.getRow(row).height=18;
  }
  function subHdr(row,label){
    const c=ws.getCell(row,1);
    c.value=label.toUpperCase();c.font={name:'Arial',bold:true,color:{argb:'FF'+BRAND},size:9};
    c.fill=bf(BRAND_HDR);c.alignment={horizontal:'left',vertical:'middle'};
    c.border={top:med(BRAND),bottom:thin(),right:thin()};
    IRS.forEach((_,i)=>{
      const cell=ws.getCell(row,i+2);cell.fill=bf(BRAND_HDR);
      cell.border={left:thin(),right:thin(),top:med(BRAND),bottom:thin()};
    });
    ws.getRow(row).height=16;
  }

  title(r,`Orion Ridge Capital  —  Base Portfolios  |  ${month}`,BRAND_DARK);r++;
  r=secHdr(r,'Benchmarks');r=irHdr(r);

  [{label:'Equities',tracker:'ACWI  ·  US4642882579  ·  iShares MSCI ACWI ETF',type:'eq'},
   {label:'Bonds',  tracker:'AGGU  ·  IE00BZ043R46  ·  iShares Core Global Aggregate Bond ETF (USD Hdg)',type:'bd'},
   {label:'Cash',   tracker:'GS1  ·  US 1-Year Treasury CMT — avg yield (FRED)',type:'ca'}
  ].forEach(e=>{
    const c=ws.getCell(r,1);
    c.value=e.label;c.font={name:'Arial',bold:true,color:{argb:'FF'+BRAND_DARK},size:11};
    c.fill=bf('FFFFFF');c.alignment={horizontal:'left',vertical:'middle'};
    c.border={right:thin(),bottom:thin()};
    IRS.forEach((ir,i)=>{
      const w=BP_BM_WEIGHTS[e.type][ir];const cell=ws.getCell(r,i+2);
      cell.fill=bf(ir==='IR3'?BRAND_HDR:'FFFFFF');cell.alignment={horizontal:'center',vertical:'middle'};
      cell.border={left:thin(),right:thin(),bottom:thin()};
      if(w>0){cell.value=w;cell.numFmt='0%';cell.font={name:'Arial',bold:true,color:{argb:'FF'+BRAND_DARK},size:11};}
      else{cell.value='—';cell.font={name:'Arial',color:{argb:'FF'+TGRAY},size:11};}
    });
    ws.getRow(r).height=20;r++;
    const tc=ws.getCell(r,1);
    tc.value='    '+e.tracker;tc.font={name:'Arial',italic:true,color:{argb:'FF'+TGRAY},size:8};
    tc.fill=bf(LGRAY);tc.alignment={horizontal:'left',vertical:'middle'};tc.border={right:thin(),bottom:med(BRAND)};
    IRS.forEach((ir,i)=>{const cell=ws.getCell(r,i+2);cell.fill=bf(ir==='IR3'?BRAND_HDR:LGRAY);cell.border={left:thin(),right:thin(),bottom:med(BRAND)};});
    ws.getRow(r).height=12;r++;
  });

  [['1y return (ann.)','ret1y',true],['3y return (ann.)','ret3y',true],
   ['1y volatility','vol1y',false],['3y volatility (ann.)','vol3y',false]].forEach(([label,key,isRet])=>{
    lbl(ws.getCell(r,1),'  '+label,{color:'666666',size:9,italic:true,bg:LGRAY});
    IRS.forEach((ir,i)=>{
      const v=etfMetric(key,ir);const cell=ws.getCell(r,i+2);
      cell.fill=bf(ir==='IR3'?BRAND_HDR:LGRAY);cell.alignment={horizontal:'right',vertical:'middle'};
      cell.border={left:thin(),right:thin(),bottom:thin()};
      if(v===null){cell.value='—';cell.font={name:'Arial',color:{argb:'FF'+TGRAY},size:9};}
      else{cell.value=v/100;cell.numFmt='0.00%';cell.font={name:'Arial',color:{argb:'FF'+(isRet?(v>=0?GREEN:RED):'555555')},size:9};}
    });
    ws.getRow(r).height=14;r++;
  });
  r++;

  r=secHdr(r,'Portfolio weights',`based on ${source}`);r=irHdr(r);
  [['eq','Equities'],['bd','Bonds'],['ca','Cash']].forEach(([typ,label])=>{
    lbl(ws.getCell(r,1),label,{bold:true,color:BRAND_DARK,size:11});
    IRS.forEach((ir,i)=>{
      val(ws.getCell(r,i+2),W[ir][typ]>0?W[ir][typ]*100:null,{pct:true,bold:true,color:BRAND_DARK,ir});
    });
    ws.getRow(r).height=20;r++;
    lbl(ws.getCell(r,1),'    Benchmark',{color:TGRAY,size:8,italic:true,bg:LGRAY});
    IRS.forEach((ir,i)=>{
      const cell=ws.getCell(r,i+2);
      cell.fill=bf(ir==='IR3'?BRAND_HDR:LGRAY);cell.alignment={horizontal:'center',vertical:'middle'};
      cell.border={left:thin(),right:thin(),bottom:med(BRAND)};
      cell.value=BP_BM_WEIGHTS[typ][ir];cell.numFmt='0%';cell.font={name:'Arial',italic:true,color:{argb:'FF'+TGRAY},size:8};
    });
    ws.getRow(r).height=12;r++;
  });
  r++;

  subHdr(r,'Equity sectors');r++;
  BP_SECTORS.forEach(s=>{
    lbl(ws.getCell(r,1),'  '+s.label,{color:'333333',size:10});
    IRS.forEach((ir,i)=>{val(ws.getCell(r,i+2),W[ir].eq*s.w>0?W[ir].eq*s.w*100:null,{pct:true,color:BRAND_DARK,ir});});
    ws.getRow(r).height=15;r++;
  });
  totRow(r,'Total equities',Object.fromEntries(IRS.map(ir=>[ir,W[ir].eq*100])));r++;r++;

  subHdr(r,'Bond segments');r++;
  BP_BOND_SEGS.forEach(s=>{
    lbl(ws.getCell(r,1),'  '+s.label,{color:'333333',size:10});
    IRS.forEach((ir,i)=>{val(ws.getCell(r,i+2),W[ir].bd*s.w>0?W[ir].bd*s.w*100:null,{pct:true,color:BRAND_DARK,ir});});
    ws.getRow(r).height=15;r++;
  });
  totRow(r,'Total bonds',Object.fromEntries(IRS.map(ir=>[ir,W[ir].bd>0?W[ir].bd*100:null])));r++;r++;

  lbl(ws.getCell(r,1),'Cash',{bold:true,color:BRAND_DARK,size:11});
  IRS.forEach((ir,i)=>{val(ws.getCell(r,i+2),W[ir].ca>0?W[ir].ca*100:null,{pct:true,bold:true,color:BRAND_DARK,ir});});
  ws.getRow(r).height=20;r++;r++;

  [['12M','12-month return'],['5Y','5-year return']].forEach(([key,label])=>{
    r=secHdr(r,`Indicative returns — ${label}`);r=irHdr(r);
    [['eq','Equities'],['bd','Bonds'],['ca','Cash']].forEach(([asset,lbl2])=>{
      lbl(ws.getCell(r,1),'  '+lbl2,{color:'444444',size:9,bg:LGRAY});
      IRS.forEach((ir,i)=>{
        const w=W[ir][asset];const v=w>0?w*rets[asset][key]:null;
        const cell=ws.getCell(r,i+2);
        cell.fill=bf(ir==='IR3'?BRAND_HDR:LGRAY);cell.alignment={horizontal:'right',vertical:'middle'};
        cell.border={left:thin(),right:thin(),bottom:thin()};
        if(v===null){cell.value='—';cell.font={name:'Arial',color:{argb:'FF'+TGRAY},size:9};}
        else{cell.value=v/100;cell.numFmt='+0.0%;-0.0%;"-"';cell.font={name:'Arial',color:{argb:'FF'+(v>=0?GREEN:RED)},size:9};}
      });
      ws.getRow(r).height=14;r++;
    });
    totRow(r,'Portfolio total',Object.fromEntries(IRS.map(ir=>[ir,['eq','bd','ca'].reduce((s,a)=>s+W[ir][a]*rets[a][key],0)])),false);r++;r++;
  });

  ['* Sector/segment weights based on BCA Research GAA benchmark proportions, scaled by IR equity/bond allocation.',
   `** Equity return: BCA Equity Allocation (Sectors) GAA. Bond return: BCA Bond Allocation GAA. Source: ${source}.`,
   '*** Cash: avg US 1-Year Treasury CMT (GS1). Source: Federal Reserve H.15 via FRED. Returns are indicative only.'
  ].forEach(note=>{
    ws.mergeCells(r,1,r,7);const c=ws.getCell(r,1);
    c.value=note;c.font={name:'Arial',italic:true,color:{argb:'FF'+TGRAY},size:8};
    c.alignment={horizontal:'left',wrapText:true};ws.getRow(r).height=13;r++;
  });

  // ── Sheet 2: BCA Views ───────────────────────────────────────────────────
  const wv=wb2.addWorksheet('BCA Research Views');
  wv.getColumn(1).width=34;wv.getColumn(2).width=16;wv.getColumn(3).width=16;
  let rv=1;
  wv.mergeCells(rv,1,rv,3);
  Object.assign(wv.getCell(rv,1),{value:`BCA Research — Recommended Allocation  |  ${month}`,
    font:{name:'Arial',bold:true,color:{argb:'FFFFFFFF'},size:12},fill:bf(BRAND_DARK),
    alignment:{horizontal:'left',vertical:'middle'},border:{bottom:med(BRAND_DARK)}});
  wv.getRow(rv).height=26;rv++;
  wv.mergeCells(rv,1,rv,3);
  Object.assign(wv.getCell(rv,1),{value:`Source: ${source}. For informational purposes only.`,
    font:{name:'Arial',italic:true,color:{argb:'FF'+TGRAY},size:8},alignment:{horizontal:'left'}});
  wv.getRow(rv).height=14;rv++;

  // Column header row (once)
  for(let c=1;c<=3;c++){wv.getCell(rv,c).fill=bf(BRAND);wv.getCell(rv,c).border={bottom:med(BRAND)};}
  wv.getCell(rv,1).value='';
  wv.getCell(rv,2).value='Previous';wv.getCell(rv,2).font={name:'Arial',bold:true,color:{argb:'FFFFFFFF'},size:10};wv.getCell(rv,2).alignment={horizontal:'center'};
  wv.getCell(rv,3).value='Current'; wv.getCell(rv,3).font={name:'Arial',bold:true,color:{argb:'FFFFFFFF'},size:10};wv.getCell(rv,3).alignment={horizontal:'center'};
  wv.getRow(rv).height=18;rv++;

  BP_BCA_ITEMS.forEach(item=>{
    if(item.section){
      wv.mergeCells(rv,1,rv,3);
      const sc=wv.getCell(rv,1);
      sc.value=item.section;sc.font={name:'Arial',bold:true,color:{argb:'FFFFFFFF'},size:10};
      sc.fill=bf(BRAND);sc.alignment={horizontal:'left',vertical:'middle'};
      sc.border={top:{style:'thin',color:{argb:'FF'+MGRAY}},bottom:{style:'thin',color:{argb:'FF'+MGRAY}}};
      wv.getRow(rv).height=16;rv++;return;
    }
    const v=views[item.key]||{prev:item.prev,curr:item.curr};
    const changed=v.prev!==v.curr;
    const lc=wv.getCell(rv,1);
    lc.value=(changed?'↑ ':'   ')+item.label;
    lc.font={name:'Arial',bold:changed,color:{argb:'FF'+(changed?BLUE_TXT:'222222')},size:10};
    lc.fill=bf(changed?BLUE_BG:'FFFFFF');lc.alignment={horizontal:'left',vertical:'middle'};
    lc.border={right:thin(),bottom:thin()};
    [[2,v.prev],[3,v.curr]].forEach(([col,view])=>{
      const cell=wv.getCell(rv,col);
      const s={overweight:{t:GREEN,bg:OW_BG,l:'Overweight',b:true},underweight:{t:RED,bg:UW_BG,l:'Underweight',b:true},neutral:{t:'777777',bg:NEU_BG,l:'Neutral',b:false}}[view]||{t:'777777',bg:NEU_BG,l:view,b:false};
      cell.value=s.l;cell.font={name:'Arial',bold:s.b,color:{argb:'FF'+s.t},size:9};
      cell.fill=bf(s.bg.replace('#',''));cell.alignment={horizontal:'center',vertical:'middle'};
      cell.border={left:thin(),right:thin(),bottom:thin()};
    });
    wv.getRow(rv).height=16;rv++;
  });

  // Sheet 3 removed — system uses localStorage directly

  const buffer=await wb2.xlsx.writeBuffer();
  const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');
  a.href=url;a.download=`${month.replace(' ','_')}_Base_Portfolios.xlsx`;a.click();
  URL.revokeObjectURL(url);
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
  // Restore _benchmark from bp-data (always prefer bp-data over old xlsx)
  try {
    const bpStored = localStorage.getItem('suitability-bp-data');
    if (bpStored) {
      const bp = JSON.parse(bpStored);
      const W = bp.W;
      _benchmark = {};
      BP_IRS.forEach(ir => {
        _benchmark[ir] = {
          equities: W[ir].eq, bonds: W[ir].bd, cash: W[ir].ca,
          equity: W[ir].eq, bond: W[ir].bd,  // aliases used in report.js
          sectors: {}, bondSegments: {}
        };
        BP_SECTORS.forEach(s => { _benchmark[ir].sectors[s.label] = W[ir].eq * s.w; });
        BP_BOND_SEGS.forEach(s => { _benchmark[ir].bondSegments[s.label] = W[ir].bd * s.w; });
      });
      // Also save to suitability-benchmark for compatibility
      localStorage.setItem('suitability-benchmark', JSON.stringify(_benchmark));
    }
  } catch(e) {}
  setTimeout(bpUpdateSidebarStatus, 100);
})();

window.bpOpen = function() {
  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('appContent').classList.add('hidden');
  document.getElementById('basePortfoliosPanel').classList.remove('hidden');
  bpRestoreState();

  // ETF status
  const st = document.getElementById('bp-etf-status');
  const etfKeys = Object.keys(_bpEtfData).filter(k => k !== 'BIL');
  if (!_bpEtfData['BIL'] || _bpEtfData['BIL'].ret1y == null) {
    if (st) st.textContent = `${etfKeys.length ? 'Loaded: '+etfKeys.join(', ')+' · ' : ''}Fetching cash rates from FRED...`;
    bpFetchFredGS1(st);
  } else {
    if (st) {
      st.textContent = `${etfKeys.length ? 'Loaded: '+etfKeys.join(', ')+' · ' : ''}Cash: US 1Y Treasury avg ${_bpEtfData['BIL'].ret1y.toFixed(2)}% (FRED GS1)`;
      st.style.color = '#3b6d11';
    }
  }

  // Show views table if we have any views
  if (Object.keys(_bpBcaViews).length > 0) {
    bpRenderBcaTable();
    try {
      const bpData = JSON.parse(localStorage.getItem('suitability-bp-data') || '{}');
      const srcEl = document.getElementById('bp-views-source');
      if (srcEl && bpData.source) srcEl.textContent = bpData.source;
    } catch(e) {}
  }

  // Restore PDF status
  try {
    const t = localStorage.getItem('suitability-bp-takeaway');
    if (t) {
      const pst = document.getElementById('bp-pdf-status');
      if (pst) { pst.textContent = '✓ Views extracted from previous session'; pst.style.color = '#3b6d11'; }
    }
  } catch(e) {}

  // Restore report text
  try {
    const txt = localStorage.getItem('suitability-bp-alloc-text');
    const el = document.getElementById('bp-report-text');
    if (el && txt) el.value = txt;
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
      const apiKey = localStorage.getItem('suitability-api-key');
      if (!apiKey) { status.textContent = 'Add API key in Settings first'; status.style.color = '#a32d2d'; return; }

      status.textContent = 'Extracting views via AI...';

      // Convert image to base64
      const base64 = e.target.result.split(',')[1];
      const mimeType = file.type || 'image/png';

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 4000,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mimeType, data: base64 }
              },
              {
                type: 'text',
                text: `This is the "Recommended Allocation" table from a BCA Research Global Asset Allocation monthly report. The table shows investment views using filled squares: CRITICAL INSTRUCTIONS for reading the 5-box scale:\n- Each row has EXACTLY 5 boxes from left(-) to right(+)\n- The DARKER/BLACK filled square = CURRENT position\n- The lighter/green filled square = PREVIOUS position (IGNORE this one)\n- Box positions: 1=Strong UW, 2=Underweight, 3=NEUTRAL, 4=Overweight, 5=Strong OW\n- If dark square is in the CENTER (3rd box out of 5) = "neutral"\n- Count ALL 5 boxes carefully. Many rows will have the dark square in box 3 = neutral.\n- DO NOT confuse the lighter previous square with the current dark square\n\nExtract all views and return ONLY valid JSON, no markdown:
{
  "reportTitle": "string",
  "reportDate": "string",
  "source": "BCA Research GAA, [Month Year]",
  "views": {
    "gaa_eq":  "overweight|neutral|underweight",
    "gaa_fi":  "...",
    "gaa_ca":  "...",
    "eq_us":   "...",
    "eq_eu":   "...",
    "eq_jp":   "...",
    "eq_ca":   "...",
    "eq_au":   "...",
    "eq_uk":   "...",
    "eq_cn":   "...",
    "eq_em":   "...",
    "fi_gov":  "...",
    "fi_ig":   "...",
    "fi_hy":   "...",
    "fi_em":   "...",
    "fi_dur":  "...",
    "fi_inf":  "...",
    "sec_fin": "...",
    "sec_it":  "...",
    "sec_hc":  "...",
    "sec_cs2": "...",
    "sec_ind": "...",
    "sec_cd":  "...",
    "sec_cst": "...",
    "sec_en":  "...",
    "sec_mat": "...",
    "sec_re":  "...",
    "sec_ut":  "...",
    "fx_usd":  "...",
    "fx_eur":  "...",
    "fx_jpy":  "...",
    "fx_gbp":  "...",
    "fx_aud":  "...",
    "fx_cad":  "...",
    "fx_chf":  "...",
    "fx_cny":  "...",
    "fx_em":   "..."
  }
}
For each key return ONLY one of: overweight, neutral, underweight (for the CURRENT dark square only). Ignore the lighter/previous squares completely. If not visible, use neutral.`
              }
            ]
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

      // Apply views — normalize: new format returns strings, old format {prev,curr} objects
      if (parsed.views) {
        Object.entries(parsed.views).forEach(([k, v]) => {
          // New format: v is a string like "overweight"
          // Old format: v is {prev: "...", curr: "..."}
          if (typeof v === 'string') {
            _bpBcaViews[k] = { curr: v, prev: v };  // no prev data — set same as curr
          } else {
            _bpBcaViews[k] = v;
          }
        });
        lsSet('suitability-bp-bca-views', JSON.stringify(_bpBcaViews));
      }
      if (parsed.source) {
        document.getElementById('bp-bca-source').value = parsed.source;
        const srcEl = document.getElementById('bp-views-source');
        if (srcEl) srcEl.textContent = parsed.source;
      }
      if (parsed.topTakeaway) {
        lsSet('suitability-bp-takeaway', parsed.topTakeaway);
      }

      status.textContent = `✓ ${parsed.reportDate || file.name} — views extracted`;
      status.style.color = '#3b6d11';

      // Show views table
      bpRenderBcaTable();

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
  reader.readAsDataURL(file);
};

window.bpParseAllocText = function() {
  const text = document.getElementById('bp-alloc-paste').value;
  const status = document.getElementById('bp-alloc-status');
  if (!text.trim()) { status.textContent = 'Paste text first'; return; }

  // Normalise: lowercase, collapse whitespace, strip dates like "01 Jun 2026"
  let norm = text
    .replace(/\d{2}\s+[A-Za-z]{3}\s+\d{4}/g, '') // remove dates
    .replace(/\s+/g, ' ')
    .trim();
  // Split stuck view words: "neutralUnderweight" → "neutral Underweight"
  norm = norm.replace(/(overweight|underweight|neutral)(overweight|underweight|neutral)/gi, '$1 $2');

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
    // Build loose pattern: match key words from section name, then find period value
    const words = section.replace(/[()]/g, '').split(/\s+/).filter(w => w.length > 2);
    const loosePat = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.{0,15}');
    const re = new RegExp(loosePat + '.{0,200}?' + period + '\\s+([\\-\\d\\.]+)', 'i');
    const m = norm.match(re);
    return m ? { gaa: parseFloat(m[1]), bm: null } : null;
  }

  const eq12m = extractPerf('Equity Allocation (Sectors)', '12 Months');
  const eq5y  = extractPerf('Equity Allocation (Sectors)', '5 Years');
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

  lsSet('suitability-bp-bca-views', JSON.stringify(_bpBcaViews));
  lsSet('suitability-bp-alloc-text', text);

  // Update BP_SECTORS weights from BCA Allocation % (benchmark for sector weights)
  // Format in text: "Info Tech Neutral 31.7% 31.7%"  — first % = GAA allocation, second = benchmark
  // We use the Allocation % (first number) as the sector weight
  const SECTOR_LABEL_MAP = [
    {label:'Financials',        bpLabel:'Financials'},
    {label:'Info Tech',         bpLabel:'Info Tech'},
    {label:'Health Care',       bpLabel:'Health Care'},
    {label:'Comsumer Discretionary', bpLabel:'Consumer Discretionary'},  // BCA typo
    {label:'Consumer Discretionary', bpLabel:'Consumer Discretionary'},
    {label:'Industrials',       bpLabel:'Industrials'},
    {label:'Communication Services', bpLabel:'Communication Services'},
    {label:'Consumer Staples',  bpLabel:'Consumer Staples'},
    {label:'Energy',            bpLabel:'Energy'},
    {label:'Materials',         bpLabel:'Materials'},
    {label:'Utilities',         bpLabel:'Utilities'},
    {label:'Real Estate',       bpLabel:'Real Estate'},
  ];
  let sectorWeightsUpdated = 0;
  SECTOR_LABEL_MAP.forEach(({label, bpLabel}) => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match: "Label [view] XX.X% YY.Y%" — first % after label = allocation
    const re = new RegExp(escaped + '[^\\d]{0,60}?([\\d\\.]+)%', 'i');
    const m = norm.match(re);
    if (m) {
      const pct = parseFloat(m[1]) / 100;
      const sec = BP_SECTORS.find(s => s.label === bpLabel);
      if (sec && pct > 0.001 && pct < 1) {
        sec.w = parseFloat(pct.toFixed(4));
        sectorWeightsUpdated++;
      }
    }
  });

  // Also update bond segment weights from BCA Bond Allocation %
  const BOND_LABEL_MAP = [
    {label:'Government',       bpLabel:'Government'},
    {label:'Investment Grade', bpLabel:'Investment Grade'},
    {label:'High-Yield',       bpLabel:'High Yield'},
    {label:'EM Debt',          bpLabel:'EM Debt'},
  ];
  BOND_LABEL_MAP.forEach(({label, bpLabel}) => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped + '[^\\d]{0,60}?([\\d\\.]+)%', 'i');
    const m = norm.match(re);
    if (m) {
      const pct = parseFloat(m[1]) / 100;
      const seg = BP_BOND_SEGS.find(s => s.label === bpLabel);
      if (seg && pct > 0.001 && pct < 1) {
        seg.w = parseFloat(pct.toFixed(4));
      }
    }
  });

  // Renormalize BP_SECTORS weights to sum to 1
  const secSum = BP_SECTORS.reduce((s,x) => s+x.w, 0);
  if (secSum > 0.5) BP_SECTORS.forEach(s => { s.w = parseFloat((s.w/secSum).toFixed(4)); });
  const bondSum = BP_BOND_SEGS.reduce((s,x) => s+x.w, 0);
  if (bondSum > 0.5) BP_BOND_SEGS.forEach(s => { s.w = parseFloat((s.w/bondSum).toFixed(4)); });

  const parts = [];
  if (eq !== null) parts.push(`Eq ${eq}%`);
  if (bd !== null) parts.push(`Bd ${bd}%`);
  if (ca !== null) parts.push(`Ca ${ca}%`);
  if (eq12m) parts.push(`Eq 12M ${eq12m.gaa}%`);
  if (bd12m) parts.push(`Bd 12M ${bd12m.gaa}%`);
  parts.push(`${viewsFound} views`);

  status.textContent = `✓ Parsed: ${parts.join(' · ')}`;
  status.style.color = '#3b6d11';

  // Defer generate to ensure DOM input values are updated first
  setTimeout(() => bpSaveAndGenerate(), 50);
};

// ─── Cash & Deposits ──────────────────────────────────────────────────────────

window.addDepositRow = function(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'deposit-row';
  row.style.cssText = 'display:flex;gap:6px;margin-bottom:6px';
  row.innerHTML = `
    <select class="deposit-ccy" style="font-size:12px;padding:4px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg2);color:var(--text1);width:70px">
      <option>USD</option><option>EUR</option><option>GBP</option><option>CHF</option><option>Other</option>
    </select>
    <input type="number" class="deposit-amount" placeholder="Amount" style="font-size:12px;padding:4px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg2);color:var(--text1);flex:1;min-width:0"
      oninput="saveDepositData()">
    <button onclick="this.parentElement.remove();saveDepositData()" style="font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg2);color:var(--text3);cursor:pointer">✕</button>`;
  container.appendChild(row);
  // Add auto-save to existing select
  row.querySelector('.deposit-ccy').addEventListener('change', saveDepositData);
};

window.saveDepositData = function() {
  if (!currentClientId) return;
  const data = getDepositData();
  lsSet(`suitability-deposits-${currentClientId}`, JSON.stringify(data));
};

function makeEmptyRow(isDeposit) {
  const ccyOpts = ['USD','EUR','GBP','CHF'].map(c=>`<option>${c}</option>`).join('');
  const extraFields = isDeposit ? `
    <input type="text" class="deposit-bank" placeholder="Bank name" oninput="saveDepositData()"
      style="font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg2);color:var(--text1);width:130px">
    <input type="date" class="deposit-date-start" title="Start date" oninput="saveDepositData()"
      style="font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg2);color:var(--text1);width:110px">
    <input type="date" class="deposit-date-end" title="Maturity date" oninput="saveDepositData()"
      style="font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg2);color:var(--text1);width:110px">
    <input type="number" class="deposit-rate" placeholder="Rate %" step="0.01" min="0" oninput="saveDepositData()"
      style="font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg2);color:var(--text1);width:72px">` :
    `<input type="text" class="deposit-bank" placeholder="Bank name" oninput="saveDepositData()"
      style="font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg2);color:var(--text1);width:160px">`;
  const row = document.createElement('div');
  row.className = 'deposit-row';
  row.style.cssText = 'display:flex;gap:5px;margin-bottom:6px;flex-wrap:wrap;align-items:center';
  row.innerHTML = `
    <select class="deposit-ccy" onchange="saveDepositData()"
      style="font-size:12px;padding:4px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg2);color:var(--text1);width:68px">${ccyOpts}</select>
    <input type="number" class="deposit-amount" placeholder="Amount" oninput="saveDepositData()"
      style="font-size:12px;padding:4px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg2);color:var(--text1);flex:1;min-width:100px">
    ${extraFields}
    <button onclick="this.parentElement.remove();saveDepositData()"
      style="font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg2);color:var(--text3);cursor:pointer">✕</button>`;
  return row;
}

window.addDepositRow = function(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const isDeposit = containerId === 'r-time-deposits';
  container.appendChild(makeEmptyRow(isDeposit));
};

window.loadDepositData = function() {
  if (!currentClientId) return;

  function clearToEmpty(containerId, isDeposit) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    container.appendChild(makeEmptyRow(isDeposit));
  }

  function renderRows(containerId, rows, isDeposit) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    if (!rows.length) { container.appendChild(makeEmptyRow(isDeposit)); return; }
    rows.forEach(r => {
      const row = makeEmptyRow(isDeposit);
      const ccySel = row.querySelector('.deposit-ccy');
      if (ccySel) ccySel.value = r.ccy || 'USD';
      const amtEl = row.querySelector('.deposit-amount');
      if (amtEl && r.amount) amtEl.value = r.amount;
      const bankEl = row.querySelector('.deposit-bank');
      if (bankEl && r.bank) bankEl.value = r.bank;
      if (isDeposit) {
        const ds = row.querySelector('.deposit-date-start');
        const de = row.querySelector('.deposit-date-end');
        const dr = row.querySelector('.deposit-rate');
        if (ds && r.dateStart) ds.value = r.dateStart;
        if (de && r.dateEnd)   de.value = r.dateEnd;
        if (dr && r.rate)      dr.value = r.rate;
      }
      container.appendChild(row);
    });
  }

  try {
    const stored = localStorage.getItem(`suitability-deposits-${currentClientId}`);
    if (!stored) {
      // No data for this client — clear fields
      clearToEmpty('r-current-accounts', false);
      clearToEmpty('r-time-deposits', true);
      const cb = document.getElementById('r-depositsOnly');
      if (cb) cb.checked = false;
      return;
    }
    const data = JSON.parse(stored);
    renderRows('r-current-accounts', data.currentAccounts || [], false);
    renderRows('r-time-deposits',    data.timeDeposits    || [], true);
    const cb = document.getElementById('r-depositsOnly');
    if (cb) cb.checked = data.depositsOnly || false;
  } catch(e) {
    clearToEmpty('r-current-accounts', false);
    clearToEmpty('r-time-deposits', true);
  }
};

window.toggleDepositsOnly = function(checked) {
  document.querySelectorAll('.form-card').forEach((c, i) => {
    if (i < 3) c.style.opacity = checked ? '0.4' : '';
  });
};

function readDepositRows(containerId) {
  const rows = document.querySelectorAll(`#${containerId} .deposit-row`);
  const isDeposit = containerId === 'r-time-deposits';
  const result = [];
  rows.forEach(row => {
    const ccy = row.querySelector('.deposit-ccy')?.value;
    const amt = parseFloat(row.querySelector('.deposit-amount')?.value);
    if (!ccy || isNaN(amt) || amt <= 0) return;
    const entry = { ccy, amount: amt };
    const bank = row.querySelector('.deposit-bank')?.value?.trim();
    if (bank) entry.bank = bank;
    if (isDeposit) {
      const ds = row.querySelector('.deposit-date-start')?.value;
      const de = row.querySelector('.deposit-date-end')?.value;
      const dr = row.querySelector('.deposit-rate')?.value;
      if (ds) entry.dateStart = ds;
      if (de) entry.dateEnd = de;
      if (dr) entry.rate = parseFloat(dr);
    }
    result.push(entry);
  });
  return result;
}

function getDepositData() {
  return {
    currentAccounts: readDepositRows('r-current-accounts'),
    timeDeposits:    readDepositRows('r-time-deposits'),
    depositsOnly:    document.getElementById('r-depositsOnly')?.checked || false,
  };
}

// ─── DAILY BRIEF ─────────────────────────────────────────────────────────────

window.dbOpen = function() {
  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('appContent').classList.add('hidden');
  document.getElementById('basePortfoliosPanel').classList.add('hidden');
  document.getElementById('dailyBriefPanel').classList.remove('hidden');
  dbRenderHistory();
  // Restore TG settings
  const tok = localStorage.getItem('suitability-tg-token');
  const cid = localStorage.getItem('suitability-tg-chat');
  if (tok) document.getElementById('tgBotToken').value = tok;
  if (cid) document.getElementById('tgChatId').value = cid;
};

window.dbClose = function() {
  document.getElementById('dailyBriefPanel').classList.add('hidden');
  if (window.currentClientId) {
    document.getElementById('appContent').classList.remove('hidden');
  } else {
    document.getElementById('emptyState').classList.remove('hidden');
  }
};

window.dbFormat = async function() {
  const text = document.getElementById('db-source-text').value.trim();
  if (!text) { alert('Paste source text first.'); return; }
  const apiKey = localStorage.getItem('suitability-api-key');
  if (!apiKey) { alert('Add Anthropic API key in Settings first.'); return; }

  const status = document.getElementById('db-format-status');
  status.textContent = 'Formatting...';
  status.style.color = '#854f0b';

  try {
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
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `Перефразируй следующий текст на профессиональном русском языке для публикации в Telegram канале об инвестициях.

Правила:
- Не меняй факты, цифры, названия компаний и индексов
- В начале каждого абзаца добавь подходящий эмодзи
- В конце добавь строку "Источники: Bloomberg, Reuters" (или другие источники из текста)
- Используй профессиональный финансовый язык — не дословный перевод
- Вместо "липкая инфляция" пиши "устойчивая инфляция"
- Вместо "ястребиный" пиши "жёсткий" применительно к ДКП
- Вместо "голубиный" пиши "мягкий" применительно к ДКП
- Вместо "бычий/медвежий" пиши "позитивный/негативный настрой"
- Пиши живо и по делу, избегай канцелярита
- Общий объём не более 3500 символов
- НЕ используй markdown-разметку (никаких **, __, ###, - в начале строки и т.п.) — публикация идёт как обычный текст, звёздочки и решётки останутся видны как есть. Для акцента используй только эмодзи и разбивку на абзацы

Текст:
${text}`
        }]
      })
    });

    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error?.message || resp.status);
    let result = data.content?.[0]?.text?.trim() || '';

    // Safety net: strip any markdown that slipped through despite the prompt
    // instruction — Telegram publishing uses parse_mode:HTML, so raw ** / ##
    // just show up as literal characters instead of being rendered.
    result = result
      .replace(/\*\*(.+?)\*\*/g, '$1')   // **bold** -> bold
      .replace(/__(.+?)__/g, '$1')       // __bold__ -> bold
      .replace(/^#{1,6}\s*/gm, '')       // # headings
      .replace(/^[-*]\s+/gm, '• ');      // - bullets / * bullets -> •

    document.getElementById('db-result-text').value = result;
    document.getElementById('db-result-card').classList.remove('hidden');
    dbUpdateCharCount();
    status.textContent = '✓ Done';
    status.style.color = '#3b6d11';
    setTimeout(() => { status.textContent = ''; }, 2000);
  } catch(e) {
    status.textContent = 'Error: ' + e.message;
    status.style.color = '#a32d2d';
  }
};

window.dbReformat = function() {
  document.getElementById('db-format-status').textContent = '';
  dbFormat();
};

window.dbUpdateCharCount = function() {
  const text = document.getElementById('db-result-text').value;
  const el = document.getElementById('db-char-count');
  const n = text.length;
  el.textContent = `${n} chars`;
  el.style.color = n > 4000 ? '#c62828' : n > 3500 ? '#854f0b' : '#3b6d11';
};

window.dbCopy = function() {
  const text = document.getElementById('db-result-text').value;
  navigator.clipboard.writeText(text).then(() => {
    const st = document.getElementById('db-publish-status');
    st.textContent = '✓ Copied'; st.style.color = '#3b6d11';
    setTimeout(() => { st.textContent = ''; }, 2000);
  });
};

window.dbPublish = async function() {
  const text = document.getElementById('db-result-text').value.trim();
  if (!text) { alert('No formatted text to publish.'); return; }

  const token = localStorage.getItem('suitability-tg-token');
  const chatId = localStorage.getItem('suitability-tg-chat');
  if (!token || !chatId) { alert('Add Telegram Bot Token and Chat ID in Settings.'); return; }

  const status = document.getElementById('db-publish-status');
  status.textContent = 'Publishing...';
  status.style.color = '#854f0b';

  // Split into parts if too long
  const MAX = 4000;
  const parts = [];
  if (text.length <= MAX) {
    parts.push(text);
  } else {
    const paras = text.split('\n\n');
    let current = '';
    paras.forEach(p => {
      if ((current + '\n\n' + p).length <= MAX) {
        current += (current ? '\n\n' : '') + p;
      } else {
        if (current) parts.push(current);
        current = p;
      }
    });
    if (current) parts.push(current);
  }

  try {
    for (let i = 0; i < parts.length; i++) {
      const msg = parts.length > 1 ? `(${i+1}/${parts.length})\n\n${parts[i]}` : parts[i];
      const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML' })
      });
      const data = await resp.json();
      if (!data.ok) throw new Error(data.description || 'Telegram error');
      if (i < parts.length - 1) await new Promise(r => setTimeout(r, 2000));
    }

    status.textContent = `✓ Published (${parts.length} part${parts.length>1?'s':''})`;
    status.style.color = '#3b6d11';

    // Save to history
    const history = JSON.parse(localStorage.getItem('suitability-db-history') || '[]');
    history.unshift({
      date: new Date().toLocaleDateString('ru-RU', {day:'numeric',month:'long',year:'numeric'}),
      preview: text.slice(0, 120) + '...',
      length: text.length,
    });
    localStorage.setItem('suitability-db-history', JSON.stringify(history.slice(0, 20)));
    dbRenderHistory();
    dbUpdateSidebarStatus();
  } catch(e) {
    status.textContent = 'Error: ' + e.message;
    status.style.color = '#a32d2d';
  }
};

function dbRenderHistory() {
  const el = document.getElementById('db-history-list');
  if (!el) return;
  const history = JSON.parse(localStorage.getItem('suitability-db-history') || '[]');
  if (!history.length) { el.innerHTML = '<span style="color:var(--text3)">No posts yet</span>'; return; }
  el.innerHTML = history.map(h => `
    <div style="padding:8px 0;border-bottom:0.5px solid var(--border)">
      <div style="font-size:11px;color:var(--text3);margin-bottom:3px">${h.date} · ${h.length} chars</div>
      <div style="font-size:12px;color:var(--text2);line-height:1.4">${h.preview}</div>
    </div>`).join('');
}

function dbUpdateSidebarStatus() {
  const el = document.getElementById('dailyBriefSidebarStatus');
  if (!el) return;
  const history = JSON.parse(localStorage.getItem('suitability-db-history') || '[]');
  if (history.length) {
    el.innerHTML = `<span style="color:var(--text-success)">✓ Last: ${history[0].date}</span>`;
  }
}

// Init on load
document.addEventListener('DOMContentLoaded', () => {
  dbUpdateSidebarStatus();
  const tok = localStorage.getItem('suitability-tg-token');
  const cid = localStorage.getItem('suitability-tg-chat');
  if (tok) { const el = document.getElementById('tgBotToken'); if(el) el.value = tok; }
  if (cid) { const el = document.getElementById('tgChatId');   if(el) el.value = cid; }
});

// ─── SETTINGS PANEL ──────────────────────────────────────────────────────────
window.settingsOpen = function() {
  ['emptyState','appContent','basePortfoliosPanel','dailyBriefPanel','crmPanel'].forEach(id => {
    document.getElementById(id)?.classList.add('hidden');
  });
  document.getElementById('settingsPanel').classList.remove('hidden');
  // Restore saved values
  const apiKey = localStorage.getItem('suitability-api-key');
  const tok    = localStorage.getItem('suitability-tg-token');
  const chat   = localStorage.getItem('suitability-tg-chat');
  const crmGh  = localStorage.getItem('suitability-crm-gh-token');
  if (apiKey) document.getElementById('apiKey').value = apiKey;
  if (tok)    document.getElementById('tgBotToken').value = tok;
  if (chat)   document.getElementById('tgChatId').value = chat;
  if (crmGh)  document.getElementById('crmGhToken').value = crmGh;
};

window.settingsClose = function() {
  document.getElementById('settingsPanel').classList.add('hidden');
  if (window.currentClientId) {
    document.getElementById('appContent').classList.remove('hidden');
  } else {
    document.getElementById('emptyState').classList.remove('hidden');
  }
};
window.macroOpen = function() {
  ['emptyState','appContent','basePortfoliosPanel','dailyBriefPanel','settingsPanel','crmPanel'].forEach(id => {
    document.getElementById(id)?.classList.add('hidden');
  });
  document.getElementById('macroPanel').classList.remove('hidden');
  const saved = localStorage.getItem('macro_gh_token');
  if (saved) {
    const el = document.getElementById('macro-gh-token');
    if (el) el.value = saved;
    const st = document.getElementById('macro-token-status');
    if (st) st.textContent = '✓ Token loaded';
  }
};

window.macroClose = function() {
  document.getElementById('macroPanel').classList.add('hidden');
  if (window.currentClientId) {
    document.getElementById('appContent').classList.remove('hidden');
  } else {
    document.getElementById('emptyState').classList.remove('hidden');
  }
};

// ─── CRM ─────────────────────────────────────────────────────────────────────
// Two kinds of CRM subjects:
//  - "client"   → activity log/tasks are stored ON the existing client record
//                 (clients[id].crm), so they travel with the client and are
//                 already persisted via saveToStorage()/IndexedDB.
//  - "prospect" → separate lightweight records (not yet full clients), stored
//                 under their own IndexedDB key and a simple stage pipeline.

let prospects = {};
let crmCurrentTab = 'today';
let crmDetailPersonRef = null; // {type:'client'|'prospect', id}
const CRM_STAGES = ['Prospecting', 'Meeting', 'Proposal', 'Client'];

async function loadProspects() {
  try {
    const fromIdb = await idbGet('crm-prospects');
    if (fromIdb) { prospects = fromIdb; return; }
  } catch (e) {
    console.error('Failed to load CRM prospects', e);
  }
  prospects = {};
}

function saveProspectsToStorage() {
  idbSet('crm-prospects', prospects).catch(err => {
    console.error('Failed to save CRM prospects', err);
    alert('⚠️ Failed to save prospect data — browser storage is full.\n\n' + err.message);
  });
}

let businessTasks = [];

async function loadBusinessTasks() {
  try {
    const fromIdb = await idbGet('crm-business-tasks');
    if (fromIdb) { businessTasks = fromIdb; return; }
  } catch (e) {
    console.error('Failed to load business tasks', e);
  }
  businessTasks = [];
}

function saveBusinessTasksToStorage() {
  idbSet('crm-business-tasks', businessTasks).catch(err => {
    console.error('Failed to save business tasks', err);
    alert('⚠️ Failed to save business tasks — browser storage is full.\n\n' + err.message);
  });
}

let meetings = [];

async function loadMeetings() {
  try {
    const fromIdb = await idbGet('crm-meetings');
    if (fromIdb) { meetings = fromIdb; return; }
  } catch (e) {
    console.error('Failed to load meetings', e);
  }
  meetings = [];
}

function saveMeetingsToStorage() {
  idbSet('crm-meetings', meetings).catch(err => {
    console.error('Failed to save meetings', err);
    alert('⚠️ Failed to save meetings — browser storage is full.\n\n' + err.message);
  });
}

const CRM_URGENCY_ICONS = { eagle: '🦅', dove: '🕊️', chicken: '🐔' };
const CRM_URGENCY_FILTERS = { eagle: '', dove: 'grayscale(1)', chicken: 'sepia(1) saturate(3) hue-rotate(-10deg) brightness(0.8)' };
const CRM_URGENCY_ORDER = ['eagle', 'dove', 'chicken'];
function crmUrgencyIcon(u) {
  const key = CRM_URGENCY_ICONS[u] ? u : 'dove';
  return `<span style="filter:${CRM_URGENCY_FILTERS[key]}">${CRM_URGENCY_ICONS[key]}</span>`;
}
function crmUrgencyNext(u) {
  const i = CRM_URGENCY_ORDER.indexOf(u || 'dove');
  return CRM_URGENCY_ORDER[(i + 1) % CRM_URGENCY_ORDER.length];
}

function crmEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function crmFmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return String(d);
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function crmGetBucket(ref) {
  if (!ref) return null;
  if (ref.type === 'client') {
    if (!clients[ref.id]) return null;
    if (!clients[ref.id].crm) clients[ref.id].crm = { activities: [], tasks: [] };
    return clients[ref.id].crm;
  }
  return prospects[ref.id] || null;
}
function crmSaveBucket(ref) {
  if (ref.type === 'client') saveToStorage(); else saveProspectsToStorage();
}
function crmGetName(ref) {
  return ref.type === 'client' ? (clients[ref.id]?.name || 'Unnamed') : (prospects[ref.id]?.name || 'Unnamed');
}
function crmRefreshActiveView() {
  if (crmCurrentTab === 'today') crmRenderToday();
  else if (crmCurrentTab === 'clients') crmRenderClients();
  else if (crmCurrentTab === 'prospects') crmRenderProspects();
  else if (crmCurrentTab === 'tasks') crmRenderTasks();
  else if (crmCurrentTab === 'biztasks') crmRenderBizTasks();
  else if (crmCurrentTab === 'meetings') crmRenderMeetings();
  else if (crmCurrentTab === 'biz') crmRenderBizExpansion();
  else if (crmCurrentTab === 'pipeline') crmRenderPipeline();
  else crmRenderKateTab();
}

window.crmOpen = function() {
  ['emptyState', 'appContent', 'basePortfoliosPanel', 'dailyBriefPanel', 'settingsPanel', 'macroPanel'].forEach(id => {
    document.getElementById(id)?.classList.add('hidden');
  });
  document.getElementById('crmPanel').classList.remove('hidden');
  crmSwitchTab(crmCurrentTab || 'today');
};

window.crmClose = function() {
  document.getElementById('crmPanel').classList.add('hidden');
  document.getElementById('crmDetailModal').classList.add('hidden');
  if (window.currentClientId) {
    document.getElementById('appContent').classList.remove('hidden');
  } else {
    document.getElementById('emptyState').classList.remove('hidden');
  }
};

window.crmSwitchTab = function(tab) {
  crmCurrentTab = tab;
  document.getElementById('crmTabToday').classList.toggle('active', tab === 'today');
  document.getElementById('crmTabClients').classList.toggle('active', tab === 'clients');
  document.getElementById('crmTabProspects').classList.toggle('active', tab === 'prospects');
  document.getElementById('crmTabTasks').classList.toggle('active', tab === 'tasks');
  document.getElementById('crmTabBizTasks').classList.toggle('active', tab === 'biztasks');
  document.getElementById('crmTabMeetings').classList.toggle('active', tab === 'meetings');
  document.getElementById('crmTabBiz').classList.toggle('active', tab === 'biz');
  document.getElementById('crmTabPipeline').classList.toggle('active', tab === 'pipeline');
  document.getElementById('crmTabKate').classList.toggle('active', tab === 'kate');
  document.getElementById('crmTodayView').classList.toggle('hidden', tab !== 'today');
  document.getElementById('crmClientsView').classList.toggle('hidden', tab !== 'clients');
  document.getElementById('crmProspectsView').classList.toggle('hidden', tab !== 'prospects');
  document.getElementById('crmTasksView').classList.toggle('hidden', tab !== 'tasks');
  document.getElementById('crmBizTasksView').classList.toggle('hidden', tab !== 'biztasks');
  document.getElementById('crmMeetingsView').classList.toggle('hidden', tab !== 'meetings');
  document.getElementById('crmBizView').classList.toggle('hidden', tab !== 'biz');
  document.getElementById('crmPipelineView').classList.toggle('hidden', tab !== 'pipeline');
  document.getElementById('crmKateView').classList.toggle('hidden', tab !== 'kate');
  crmRefreshActiveView();
};

// ── Clients tab: activity/task summary per existing client ─────────────────
function crmRenderToday() {
  const el = document.getElementById('crmTodayView');
  if (!el) return;
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const birthdaysToday = crmUpcomingBirthdays(0).filter(p => p.daysUntil === 0);
  const meetingsToday = meetings.filter(m => !m.cancelled && m.date === todayStr)
    .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
  const allItems = crmAllTasks().filter(i => !i.done && !i.cancelled && i.due && i.due <= todayStr);
  const overdue = allItems.filter(i => i.due < todayStr).sort((a, b) => new Date(a.due) - new Date(b.due));
  const dueToday = allItems.filter(i => i.due === todayStr);

  const renderRow = it => `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg)">
    ${it.kind === 'task' || it.kind === 'biztask' ? `<span style="font-size:14px">${crmUrgencyIcon(it.urgency)}</span>` : `<span style="font-size:14px">💰</span>`}
    <div style="flex:1;min-width:0;cursor:pointer" onclick="${it.kind==='biztask' ? `crmOpen();crmSwitchTab('biztasks')` : `crmOpenDetail('${it.personType}','${it.personId}'${it.kind==='task'?`,'${it.taskId}'`:''})`}">
      ${it.kind==='biztask' ? '' : `<span style="font-weight:600;color:var(--text1);font-size:13px">${crmEsc(it.personName)}</span><span style="color:var(--text3);font-size:12px"> — </span>`}
      <span style="font-size:13px;color:var(--text1)">${crmEsc(it.text)}</span>
    </div>
    ${it.due < todayStr ? `<span style="font-size:10px;font-weight:600;color:#c62828;white-space:nowrap">since ${crmFmtDate(it.due)}</span>` : ''}
    ${it.kind === 'task' ? `<button onclick="crmToggleTaskFromList('${it.personType}','${it.personId}','${it.taskId}');crmRenderToday()" style="font-size:10px;padding:3px 8px;border:1px solid var(--border2);border-radius:4px;background:var(--bg2);color:var(--text2);cursor:pointer;flex-shrink:0">Done</button><button onclick="crmCancelTaskFromList('${it.personType}','${it.personId}','${it.taskId}')" style="font-size:10px;padding:3px 8px;border:1px solid var(--border2);border-radius:4px;background:var(--bg2);color:var(--text2);cursor:pointer;flex-shrink:0">Cancel</button>` : ''}
    ${it.kind === 'biztask' ? `<button onclick="crmToggleBizTaskDone('${it.taskId}');crmRenderToday()" style="font-size:10px;padding:3px 8px;border:1px solid var(--border2);border-radius:4px;background:var(--bg2);color:var(--text2);cursor:pointer;flex-shrink:0">Done</button><button onclick="crmToggleBizTaskCancel('${it.taskId}');crmRenderToday()" style="font-size:10px;padding:3px 8px;border:1px solid var(--border2);border-radius:4px;background:var(--bg2);color:var(--text2);cursor:pointer;flex-shrink:0">Cancel</button>` : ''}
  </div>`;

  el.innerHTML = `
    <div style="margin-bottom:1.25rem">
      <div style="font-size:13px;color:var(--text3)">${todayLabel}</div>
    </div>
    ${birthdaysToday.length ? `<div style="background:#fff3d6;border-radius:8px;padding:10px 14px;margin-bottom:1.25rem;font-size:13px">
      <span style="font-weight:600">🎂 Birthday today:</span>
      ${birthdaysToday.map(p => `<span onclick="crmOpenDetail('${p.type}','${p.id}')" style="cursor:pointer;margin-left:10px;color:#8a6100;font-weight:600">${crmEsc(p.name)}</span>`).join('')}
    </div>` : ''}
    ${meetingsToday.length ? `<div style="background:#eaf4fb;border-radius:8px;padding:10px 14px;margin-bottom:1.25rem;font-size:13px">
      <div style="font-weight:600;margin-bottom:4px">📅 Meetings today:</div>
      ${meetingsToday.map(m => `<div style="cursor:pointer;color:#1a5276" onclick="crmOpen();crmSwitchTab('meetings')"><strong>${m.time || '(no time)'}</strong> — ${crmEsc(m.title)}${m.personName ? ' with ' + crmEsc(m.personName) : ''}</div>`).join('')}
    </div>` : ''}
    ${overdue.length ? `<div style="margin-bottom:1.5rem">
      <div style="font-weight:600;font-size:13px;color:#c62828;margin-bottom:8px">⚠ Overdue (${overdue.length})</div>
      <div style="display:flex;flex-direction:column;gap:6px">${overdue.map(renderRow).join('')}</div>
    </div>` : ''}
    <div>
      <div style="font-weight:600;font-size:13px;color:var(--text2);margin-bottom:8px">Due today (${dueToday.length})</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${dueToday.length ? dueToday.map(renderRow).join('') : '<div style="color:var(--text3);font-size:13px;padding:1rem 0">Nothing due today.</div>'}
      </div>
    </div>`;
}

function crmAllTasks() {
  const items = [];
  Object.entries(clients).forEach(([id, c]) => {
    (c.crm?.tasks || []).forEach(t => {
      items.push({ personType: 'client', personId: id, personName: c.name || 'Unnamed', text: t.text, due: t.due, done: !!t.done, cancelled: !!t.cancelled, urgency: t.urgency, kind: 'task', taskId: t.id });
    });
    (c.crm?.opportunities || []).forEach(o => {
      if (o.nextDate && o.status !== 'Won' && o.status !== 'Lost') {
        items.push({ personType: 'client', personId: id, personName: c.name || 'Unnamed', text: `[${o.type}] ${o.nextText || 'follow up'}`, due: o.nextDate, done: false, kind: 'opportunity', oppId: o.id });
      }
    });
  });
  Object.entries(prospects).forEach(([id, p]) => {
    (p.tasks || []).forEach(t => {
      items.push({ personType: 'prospect', personId: id, personName: p.name, text: t.text, due: t.due, done: !!t.done, cancelled: !!t.cancelled, urgency: t.urgency, kind: 'task', taskId: t.id });
    });
  });
  businessTasks.forEach(t => {
    items.push({ personType: 'biztask', personId: null, personName: 'Business', text: t.text, due: t.due, done: !!t.done, cancelled: !!t.cancelled, urgency: t.urgency, kind: 'biztask', taskId: t.id });
    (t.subtasks || []).forEach(s => {
      items.push({ personType: 'biztask', personId: null, personName: 'Business', text: `${t.text} → ${s.text}`, due: s.due, done: !!s.done, cancelled: !!s.cancelled, urgency: s.urgency, kind: 'biztask', taskId: `${t.id}::${s.id}` });
    });
  });
  return items;
}

let crmShowCompletedTasks = false;

function crmDateBadge(label) {
  const isOverdue = label.includes('overdue');
  const isToday = label === 'Today';
  const bg = isOverdue ? '#fdecea' : isToday ? '#fff3d6' : 'var(--bg2)';
  const color = isOverdue ? '#c62828' : isToday ? '#8a6100' : 'var(--text2)';
  return `<span style="display:inline-block;font-size:10px;font-weight:700;color:${color};background:${bg};padding:3px 10px;border-radius:10px">${isOverdue?'⚠ ':''}${crmEsc(label)}</span>`;
}

function crmGroupByDate(items, dateField) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const groups = {};
  const order = [];
  items.forEach(it => {
    const key = it[dateField] || '__nodate__';
    if (!(key in groups)) { groups[key] = []; order.push(key); }
    groups[key].push(it);
  });
  order.sort((a, b) => {
    if (a === '__nodate__') return 1;
    if (b === '__nodate__') return -1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return order.map(key => {
    let label;
    if (key === '__nodate__') label = 'No date';
    else if (key === todayStr) label = 'Today';
    else {
      const tmrw = new Date(); tmrw.setDate(tmrw.getDate() + 1);
      label = key === tmrw.toISOString().slice(0, 10) ? 'Tomorrow' : crmFmtDate(key);
      if (key < todayStr) label += ' — overdue';
    }
    return { key, label, items: groups[key] };
  });
}

function crmRenderMeetings() {
  const el = document.getElementById('crmMeetingsView');
  if (!el) return;
  const now = new Date();

  const personOptions = () => {
    let opts = '<option value="">— internal / no client —</option>';
    Object.entries(clients).forEach(([id, c]) => { opts += `<option value="client:${id}">${crmEsc(c.name || 'Unnamed')} (client)</option>`; });
    Object.entries(prospects).forEach(([id, p]) => { opts += `<option value="prospect:${id}">${crmEsc(p.name)} (prospect)</option>`; });
    return opts;
  };

  const header = `
    <div style="background:var(--bg2);border-radius:8px;padding:12px 14px;margin-bottom:1.25rem">
      <div style="font-weight:600;font-size:13px;color:var(--text2);margin-bottom:4px">📅 Schedule a meeting</div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:10px">Telegram reminder ~30 min before (best-effort — GitHub Actions cron timing can drift by several minutes).</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <input id="crmNewMeetingTitle" placeholder="e.g. FAB call, portfolio review..." onkeydown="if(event.key==='Enter')crmAddMeeting()" style="flex:1;min-width:200px;font-size:12px;padding:6px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text1)">
        <select id="crmNewMeetingPerson" style="font-size:12px;padding:6px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text1);max-width:200px">
          ${personOptions()}
        </select>
        <input id="crmNewMeetingDate" type="date" style="font-size:12px;padding:6px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text1)">
        <input id="crmNewMeetingTime" type="time" style="font-size:12px;padding:6px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text1)">
        <button onclick="crmAddMeeting()" class="btn-primary" style="font-size:12px;padding:6px 14px">Add</button>
      </div>
    </div>
    <div style="display:flex;justify-content:flex-end;margin-bottom:1rem">
      <button onclick="crmSyncMeetings()" class="btn-secondary" style="font-size:12px;padding:5px 12px">Sync meetings with Telegram reminder</button>
      <span id="crmMeetingSyncStatus" style="font-size:12px;color:var(--text3);margin-left:8px;align-self:center"></span>
    </div>`;

  const upcoming = meetings.filter(m => !m.cancelled && new Date(`${m.date}T${m.time || '00:00'}`) >= new Date(now.toDateString()))
    .sort((a, b) => new Date(`${a.date}T${a.time||'00:00'}`) - new Date(`${b.date}T${b.time||'00:00'}`));
  const past = meetings.filter(m => m.cancelled || new Date(`${m.date}T${m.time || '00:00'}`) < new Date(now.toDateString()));

  if (!meetings.length) {
    el.innerHTML = header + '<div style="color:var(--text3);padding:2rem;text-align:center;font-size:13px">No meetings scheduled yet.</div>';
    return;
  }

  const row = m => {
    const dt = new Date(`${m.date}T${m.time || '00:00'}`);
    const isPast = dt < now;
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg);${(m.cancelled||isPast)?'opacity:0.5':''}">
      <span style="font-size:14px">📅</span>
      <div style="flex:1;min-width:0">
        <span style="font-size:13px;font-weight:600;color:var(--text1)">${crmEsc(m.title)}</span>
        ${m.personName ? `<span style="font-size:11px;color:var(--text3);margin-left:6px">with ${crmEsc(m.personName)}</span>` : ''}
        ${m.cancelled ? '<span style="font-size:10px;font-weight:600;color:#c62828;margin-left:6px">✕ Cancelled</span>' : ''}
      </div>
      <span style="font-size:12px;color:var(--text2);white-space:nowrap">${crmFmtDate(m.date)} ${m.time || ''}</span>
      ${m.cancelled ? '' : `<button onclick="crmCancelMeeting('${m.id}')" style="font-size:10px;padding:3px 8px;border:1px solid var(--border2);border-radius:4px;background:var(--bg2);color:var(--text2);cursor:pointer;flex-shrink:0">Cancel</button>`}
      <button onclick="crmDeleteMeeting('${m.id}')" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px;flex-shrink:0">×</button>
    </div>`;
  };

  el.innerHTML = header + `
    <div style="font-weight:600;font-size:13px;color:var(--text2);margin-bottom:8px">Upcoming (${upcoming.length})</div>
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:1.5rem">
      ${upcoming.length ? upcoming.map(row).join('') : '<div style="font-size:12px;color:var(--text3)">Nothing upcoming.</div>'}
    </div>
    ${past.length ? `<div style="font-weight:600;font-size:13px;color:var(--text2);margin-bottom:8px">Past / cancelled</div>
    <div style="display:flex;flex-direction:column;gap:6px">${past.map(row).join('')}</div>` : ''}`;
}

window.crmAddMeeting = function() {
  const titleEl = document.getElementById('crmNewMeetingTitle');
  const personEl = document.getElementById('crmNewMeetingPerson');
  const dateEl = document.getElementById('crmNewMeetingDate');
  const timeEl = document.getElementById('crmNewMeetingTime');
  const title = titleEl.value.trim();
  if (!title) { titleEl.style.borderColor = '#c62828'; titleEl.focus(); return; }
  if (!dateEl.value) { dateEl.style.borderColor = '#c62828'; dateEl.focus(); return; }
  titleEl.style.borderColor = ''; dateEl.style.borderColor = '';

  let personName = null;
  if (personEl.value) {
    const [ptype, pid] = personEl.value.split(':');
    personName = ptype === 'client' ? (clients[pid]?.name || null) : (prospects[pid]?.name || null);
  }

  meetings.push({
    id: 'mt_' + Date.now(), title, personName, date: dateEl.value, time: timeEl.value || null,
    cancelled: false, reminded: false, updatedAt: new Date().toISOString(),
  });
  saveMeetingsToStorage();
  titleEl.value = ''; dateEl.value = ''; timeEl.value = ''; personEl.value = '';
  crmRenderMeetings();
  crmSyncMeetings(); // auto-sync so the reminder workflow sees it as soon as possible
};
window.crmCancelMeeting = function(id) {
  const m = meetings.find(x => x.id === id); if (!m) return;
  m.cancelled = true;
  saveMeetingsToStorage();
  crmRenderMeetings();
  crmSyncMeetings();
};
window.crmDeleteMeeting = function(id) {
  meetings = meetings.filter(x => x.id !== id);
  saveMeetingsToStorage();
  crmRenderMeetings();
  crmSyncMeetings();
};

window.crmSyncMeetings = async function() {
  const token = (document.getElementById('crmGhToken')?.value || localStorage.getItem('suitability-crm-gh-token') || '').trim();
  const statusEl = document.getElementById('crmMeetingSyncStatus');
  if (!token) { if (statusEl) statusEl.textContent = 'Add a GitHub token in Settings first.'; return; }
  if (statusEl) statusEl.textContent = 'Syncing...';
  const REPO = 'nickolaiklimoff/suitability-letter';
  const PATH = 'meetings.json';
  try {
    let sha = null, remote = [];
    const getResp = await fetch(`https://api.github.com/repos/${REPO}/contents/${PATH}`, {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' }
    });
    if (getResp.ok) {
      const d = await getResp.json();
      sha = d.sha;
      remote = JSON.parse(decodeURIComponent(escape(atob(d.content))));
    }
    // Merge by id: local is the source of truth for content, but preserve the
    // remote "reminded" flag so an already-sent reminder isn't accidentally
    // reset (which would cause a duplicate Telegram message).
    const remoteById = {}; remote.forEach(m => { remoteById[m.id] = m; });
    const merged = meetings.map(m => ({ ...m, reminded: m.reminded || (remoteById[m.id]?.reminded || false) }));

    const content = btoa(unescape(encodeURIComponent(JSON.stringify(merged, null, 2))));
    const putResp = await fetch(`https://api.github.com/repos/${REPO}/contents/${PATH}`, {
      method: 'PUT',
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `chore: sync meetings (${merged.length} entries)`, content, sha: sha || undefined, branch: 'main' })
    });
    if (!putResp.ok) { const err = await putResp.json(); throw new Error(err.message || 'GitHub API error'); }
    if (statusEl) { statusEl.textContent = `✓ Synced ${merged.length} meetings`; statusEl.style.color = '#3b6d11'; }
  } catch (e) {
    console.error('crmSyncMeetings failed', e);
    if (statusEl) { statusEl.textContent = 'Sync failed: ' + e.message; statusEl.style.color = '#c62828'; }
  }
};

function crmRenderBizTasks() {
  const el = document.getElementById('crmBizTasksView');
  if (!el) return;
  const todayStr = new Date().toISOString().slice(0, 10);
  let items = businessTasks.slice();
  if (!crmShowCompletedTasks) items = items.filter(t => !t.done && !t.cancelled);
  items.sort((a, b) => {
    const ar = !!(a.done || a.cancelled), br = !!(b.done || b.cancelled);
    if (ar !== br) return ar ? 1 : -1;
    return new Date(a.due || '2100-01-01') - new Date(b.due || '2100-01-01');
  });

  const header = `
    <div style="background:var(--bg2);border-radius:8px;padding:12px 14px;margin-bottom:1.25rem">
      <div style="font-weight:600;font-size:13px;color:var(--text2);margin-bottom:10px">📋 New business task <span style="font-weight:400;color:var(--text3)">(not tied to a client — e.g. bank negotiations, collect Kate's pipeline; add sub-tasks once created)</span></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <input id="crmNewBizTaskText" placeholder="e.g. arrange meeting with FAB, review Kate's pipeline..." onkeydown="if(event.key==='Enter')crmAddBizTask()" style="flex:1;min-width:220px;font-size:12px;padding:6px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text1)">
        <select id="crmNewBizTaskUrgency" title="Urgency" style="font-size:12px;padding:6px 4px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text1)">
          <option value="eagle">🦅 urgent</option>
          <option value="dove" selected>🕊️ normal</option>
          <option value="chicken">🐔 no rush</option>
        </select>
        <input id="crmNewBizTaskDue" type="date" style="font-size:12px;padding:6px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text1)">
        <button onclick="crmAddBizTask()" class="btn-primary" style="font-size:12px;padding:6px 14px">Add</button>
      </div>
    </div>
    <label style="font-size:12px;color:var(--text2);display:flex;align-items:center;gap:5px;cursor:pointer;margin-bottom:1rem">
      <input type="checkbox" ${crmShowCompletedTasks?'checked':''} onchange="crmShowCompletedTasks=this.checked;crmRenderBizTasks()"> Show completed
    </label>`;

  if (!items.length) {
    el.innerHTML = header + '<div style="color:var(--text3);padding:2rem;text-align:center;font-size:13px">No business tasks — nice and clear.</div>';
    return;
  }

  const subtaskRow = (parent, s) => {
    const overdue = !s.done && !s.cancelled && s.due && s.due < todayStr;
    return `<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);${(s.done||s.cancelled)?'opacity:0.5':''}">
      <span style="font-size:12px">${crmUrgencyIcon(s.urgency)}</span>
      <div style="flex:1;min-width:0">
        <span style="font-size:12px;color:var(--text1);${s.done?'text-decoration:line-through':''}">${crmEsc(s.text)}</span>
        ${s.due ? `<span style="font-size:10px;color:${overdue?'#c62828':'var(--text3)'};margin-left:6px">${overdue?'⚠ since ':''}${crmFmtDate(s.due)}</span>` : ''}
        ${s.cancelled ? '<span style="font-size:10px;font-weight:600;color:#c62828;margin-left:6px">✕ Cancelled</span>' : ''}
      </div>
      <button onclick="crmToggleBizTaskDone('${parent.id}::${s.id}')" style="font-size:9px;padding:2px 6px;border:1px solid var(--border2);border-radius:4px;background:${s.done?'#eaf5ea':'var(--bg)'};color:${s.done?'#3b6d11':'var(--text2)'};cursor:pointer;flex-shrink:0">${s.done?'Undone':'Done'}</button>
      <button onclick="crmToggleBizTaskCancel('${parent.id}::${s.id}')" style="font-size:9px;padding:2px 6px;border:1px solid var(--border2);border-radius:4px;background:${s.cancelled?'#fdecea':'var(--bg)'};color:${s.cancelled?'#c62828':'var(--text2)'};cursor:pointer;flex-shrink:0">${s.cancelled?'Uncancel':'Cancel'}</button>
      <button onclick="crmDeleteBizSubtask('${parent.id}','${s.id}')" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:13px;flex-shrink:0">×</button>
    </div>`;
  };

  const renderRow = t => {
    const overdue = !t.done && !t.cancelled && t.due && t.due < todayStr;
    const subs = t.subtasks || [];
    const openSubs = subs.filter(s => !s.done && !s.cancelled).length;
    return `<div style="padding:9px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg);${(t.done||t.cancelled)?'opacity:0.5':''}">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:14px">${crmUrgencyIcon(t.urgency)}</span>
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <input value="${crmEsc(t.text)}" onchange="crmEditBizTaskText('${t.id}',this.value)" style="flex:1;min-width:140px;font-size:13px;font-weight:600;color:var(--text1);border:none;background:transparent;padding:1px 2px;${t.done?'text-decoration:line-through':''}">
            ${subs.length ? `<span style="font-size:10px;font-weight:600;background:var(--bg2);color:var(--text2);padding:1px 7px;border-radius:8px;flex-shrink:0">${openSubs}/${subs.length} sub-tasks</span>` : ''}
            ${t.cancelled ? '<span style="font-size:10px;font-weight:600;color:#c62828;flex-shrink:0">✕ Cancelled</span>' : ''}
          </div>
          <input type="date" value="${t.due||''}" onchange="crmEditBizTaskDue('${t.id}',this.value)" style="width:fit-content;font-size:10px;color:${overdue ? '#c62828' : 'var(--text3)'};border:none;background:transparent;padding:0 2px">
        </div>
        <button onclick="crmToggleBizTaskDone('${t.id}')" style="font-size:10px;padding:3px 8px;border:1px solid var(--border2);border-radius:4px;background:${t.done?'#eaf5ea':'var(--bg2)'};color:${t.done?'#3b6d11':'var(--text2)'};cursor:pointer;flex-shrink:0">${t.done?'Undone':'Done'}</button>
        <button onclick="crmToggleBizTaskCancel('${t.id}')" style="font-size:10px;padding:3px 8px;border:1px solid var(--border2);border-radius:4px;background:${t.cancelled?'#fdecea':'var(--bg2)'};color:${t.cancelled?'#c62828':'var(--text2)'};cursor:pointer;flex-shrink:0">${t.cancelled?'Uncancel':'Cancel'}</button>
        <button onclick="crmDeleteBizTask('${t.id}')" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px;flex-shrink:0">×</button>
      </div>
      <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:5px">
        ${subs.map(s => subtaskRow(t, s)).join('')}
        <div style="display:flex;gap:4px;margin-top:2px">
          <input id="crmNewSubtask_${t.id}" placeholder="+ Add sub-task..." onkeydown="if(event.key==='Enter')crmAddBizSubtask('${t.id}')" style="flex:1;font-size:11px;padding:4px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg2);color:var(--text1)">
          <input id="crmNewSubtaskDue_${t.id}" type="date" style="font-size:11px;padding:4px 4px;border:1px solid var(--border);border-radius:4px;background:var(--bg2);color:var(--text1)">
          <button onclick="crmAddBizSubtask('${t.id}')" style="font-size:10px;padding:4px 10px;border:1px solid var(--border2);border-radius:4px;background:var(--bg2);color:var(--text2);cursor:pointer">Add</button>
        </div>
      </div>
    </div>`;
  };

  const groups = crmGroupByDate(items, 'due');
  el.innerHTML = header + groups.map(g => `
    <div style="margin-bottom:1.25rem">
      <div style="margin-bottom:8px">${crmDateBadge(g.label)}</div>
      <div style="display:flex;flex-direction:column;gap:8px">${g.items.map(renderRow).join('')}</div>
    </div>`).join('');
}

window.crmEditBizTaskText = function(id, val) {
  const t = businessTasks.find(x => x.id === id); if (!t) return;
  const text = val.trim(); if (!text) return;
  t.text = text; t.updatedAt = new Date().toISOString();
  saveBusinessTasksToStorage();
  crmRenderBizTasks();
};
window.crmEditBizTaskDue = function(id, val) {
  const t = businessTasks.find(x => x.id === id); if (!t) return;
  t.due = val || null; t.updatedAt = new Date().toISOString();
  saveBusinessTasksToStorage();
  crmRenderBizTasks();
};
window.crmAddBizTask = function() {
  const textEl = document.getElementById('crmNewBizTaskText');
  const dueEl = document.getElementById('crmNewBizTaskDue');
  const urgencyEl = document.getElementById('crmNewBizTaskUrgency');
  const text = textEl.value.trim();
  if (!text) { textEl.style.borderColor = '#c62828'; textEl.focus(); return; }
  textEl.style.borderColor = '';
  businessTasks.push({
    id: 'bt_' + Date.now(), text, due: dueEl.value || null,
    urgency: urgencyEl.value || 'dove', done: false, cancelled: false, subtasks: [],
    updatedAt: new Date().toISOString(), updatedBy: 'Nikolai',
  });
  saveBusinessTasksToStorage();
  textEl.value = ''; dueEl.value = '';
  crmRenderBizTasks();
};

window.crmAddBizSubtask = function(parentId) {
  const t = businessTasks.find(x => x.id === parentId); if (!t) return;
  const textEl = document.getElementById('crmNewSubtask_' + parentId);
  const dueEl = document.getElementById('crmNewSubtaskDue_' + parentId);
  const text = textEl.value.trim();
  if (!text) { textEl.style.borderColor = '#c62828'; textEl.focus(); return; }
  if (!t.subtasks) t.subtasks = [];
  t.subtasks.push({
    id: 'st_' + Date.now(), text, due: dueEl.value || null,
    urgency: 'dove', done: false, cancelled: false,
  });
  t.updatedAt = new Date().toISOString();
  saveBusinessTasksToStorage();
  crmRenderBizTasks();
};

window.crmDeleteBizSubtask = function(parentId, subId) {
  const t = businessTasks.find(x => x.id === parentId); if (!t) return;
  t.subtasks = (t.subtasks || []).filter(s => s.id !== subId);
  saveBusinessTasksToStorage();
  crmRenderBizTasks();
};

// Both parent tasks and sub-tasks flow through here — a compound id
// "parentId::subId" (used when this is called from the unified Today view)
// routes to the sub-task; a plain id routes to the parent.
window.crmToggleBizTaskDone = function(id) {
  if (id.includes('::')) {
    const [parentId, subId] = id.split('::');
    const t = businessTasks.find(x => x.id === parentId); if (!t) return;
    const s = (t.subtasks || []).find(x => x.id === subId); if (!s) return;
    s.done = !s.done; if (s.done) s.cancelled = false;
  } else {
    const t = businessTasks.find(x => x.id === id); if (!t) return;
    t.done = !t.done; if (t.done) t.cancelled = false;
  }
  saveBusinessTasksToStorage();
  crmRenderBizTasks();
};
window.crmToggleBizTaskCancel = function(id) {
  if (id.includes('::')) {
    const [parentId, subId] = id.split('::');
    const t = businessTasks.find(x => x.id === parentId); if (!t) return;
    const s = (t.subtasks || []).find(x => x.id === subId); if (!s) return;
    s.cancelled = !s.cancelled; if (s.cancelled) s.done = false;
  } else {
    const t = businessTasks.find(x => x.id === id); if (!t) return;
    t.cancelled = !t.cancelled; if (t.cancelled) t.done = false;
  }
  saveBusinessTasksToStorage();
  crmRenderBizTasks();
};
window.crmDeleteBizTask = function(id) {
  businessTasks = businessTasks.filter(x => x.id !== id);
  saveBusinessTasksToStorage();
  crmRenderBizTasks();
};

function crmRenderTasks() {
  const el = document.getElementById('crmTasksView');
  if (!el) return;
  const todayStr = new Date().toISOString().slice(0, 10);
  let items = crmAllTasks().filter(i => (i.kind === 'task' && i.personType === 'client') || i.kind === 'biztask');
  if (!crmShowCompletedTasks) items = items.filter(i => !i.done && !i.cancelled);
  items.sort((a, b) => {
    if (!!a.done !== !!b.done) return a.done ? 1 : -1;
    return new Date(a.due || '2100-01-01') - new Date(b.due || '2100-01-01');
  });

  const renderRow = it => {
    const isBiz = it.kind === 'biztask';
    const toggleDone = isBiz ? `crmToggleBizTaskDone('${it.taskId}')` : `crmToggleTaskFromList('${it.personType}','${it.personId}','${it.taskId}')`;
    const toggleCancel = isBiz ? `crmToggleBizTaskCancel('${it.taskId}')` : `crmCancelTaskFromList('${it.personType}','${it.personId}','${it.taskId}')`;
    const openClick = isBiz ? `crmOpen();crmSwitchTab('biztasks')` : `crmOpenDetail('${it.personType}','${it.personId}','${it.taskId}')`;
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg);${(it.done||it.cancelled)?'opacity:0.5':''}">
      <input type="checkbox" ${it.done?'checked':''} onchange="${toggleDone}">
      <span style="font-size:14px">${crmUrgencyIcon(it.urgency)}</span>
      <div style="flex:1;min-width:0;cursor:pointer" onclick="${openClick}">
        ${isBiz ? '' : `<span style="font-weight:600;color:var(--text1);font-size:13px">${crmEsc(it.personName)}</span><span style="color:var(--text3);font-size:12px"> — </span>`}
        <span style="font-size:13px;color:var(--text1);${it.done?'text-decoration:line-through':''}">${crmEsc(it.text)}</span>
        ${it.cancelled ? '<span style="font-size:10px;font-weight:600;color:#c62828;margin-left:6px">✕ Cancelled</span>' : ''}
      </div>
      <button onclick="${toggleDone}" style="font-size:10px;padding:3px 8px;border:1px solid var(--border2);border-radius:4px;background:${it.done?'#eaf5ea':'var(--bg2)'};color:${it.done?'#3b6d11':'var(--text2)'};cursor:pointer;flex-shrink:0">${it.done?'Undone':'Done'}</button>
      <button onclick="${toggleCancel}" style="font-size:10px;padding:3px 8px;border:1px solid var(--border2);border-radius:4px;background:${it.cancelled?'#fdecea':'var(--bg2)'};color:${it.cancelled?'#c62828':'var(--text2)'};cursor:pointer;flex-shrink:0">${it.cancelled?'Uncancel':'Cancel'}</button>
    </div>`;
  };

  const header = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
    <div style="font-size:12px;color:var(--text3)">${items.length} task${items.length===1?'':'s'}</div>
    <label style="font-size:12px;color:var(--text2);display:flex;align-items:center;gap:5px;cursor:pointer">
      <input type="checkbox" ${crmShowCompletedTasks?'checked':''} onchange="crmShowCompletedTasks=this.checked;crmRenderTasks()"> Show completed
    </label>
  </div>`;

  if (!items.length) {
    el.innerHTML = header + '<div style="color:var(--text3);padding:2rem;text-align:center;font-size:13px">No tasks — nice and clear.</div>';
    return;
  }

  const groups = crmGroupByDate(items, 'due');
  el.innerHTML = header + groups.map(g => `
    <div style="margin-bottom:1.25rem">
      <div style="margin-bottom:8px">${crmDateBadge(g.label)}</div>
      <div style="display:flex;flex-direction:column;gap:6px">${g.items.map(renderRow).join('')}</div>
    </div>`).join('');
}

window.crmBizAddComment = function(prospectId, taskId) {
  const p = prospects[prospectId]; if (!p) return;
  const t = (p.tasks || []).find(x => x.id === taskId); if (!t) return;
  const el = document.getElementById('crmBizComment_' + taskId);
  const text = el.value.trim(); if (!text) return;
  if (!t.comments) t.comments = [];
  t.comments.push({ id: 'c_' + Date.now(), author: 'Nikolai', text, date: new Date().toISOString() });
  t.updatedAt = new Date().toISOString(); t.updatedBy = 'Nikolai';
  saveProspectsToStorage();
  crmRenderBizExpansion();
};

window.crmPipelineAddOppComment = function(clientId, oppId) {
  const c = clients[clientId]; if (!c?.crm) return;
  const o = (c.crm.opportunities || []).find(x => x.id === oppId); if (!o) return;
  const el = document.getElementById('crmPipeComment_opp_' + oppId);
  const text = el.value.trim(); if (!text) return;
  if (!o.comments) o.comments = [];
  o.comments.push({ id: 'c_' + Date.now(), author: 'Nikolai', text, date: new Date().toISOString() });
  saveToStorage();
  crmRenderPipeline();
};
window.crmPipelineAddProspectComment = function(prospectId) {
  const p = prospects[prospectId]; if (!p) return;
  const el = document.getElementById('crmPipeComment_prospect_' + prospectId);
  const text = el.value.trim(); if (!text) return;
  if (!p.comments) p.comments = [];
  p.comments.push({ id: 'c_' + Date.now(), author: 'Nikolai', text, date: new Date().toISOString() });
  saveProspectsToStorage();
  crmRenderPipeline();
};

let crmPipeExpanded = new Set();
function crmPipeToggleComments(key) {
  if (crmPipeExpanded.has(key)) crmPipeExpanded.delete(key); else crmPipeExpanded.add(key);
  crmRenderPipeline();
}
function crmCommentBlock(comments, key, inputId, addCallJs) {
  const expanded = crmPipeExpanded.has(key);
  const shown = expanded ? comments : comments.slice(-1);
  return `<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">
    ${comments.length > 1 ? `<div onclick="crmPipeToggleComments('${key}')" style="font-size:10px;color:var(--text3);cursor:pointer;margin-bottom:3px">${expanded ? '▾ hide' : `▸ ${comments.length} comments`}</div>` : ''}
    ${shown.map(c => `<div style="font-size:11px;color:var(--text2);margin-bottom:3px"><span style="font-weight:600">${crmEsc(c.author)}:</span> ${crmEsc(c.text)}</div>`).join('') || '<div style="font-size:11px;color:var(--text3)">No comments yet.</div>'}
    <div style="display:flex;gap:4px;margin-top:4px">
      <input id="${inputId}" placeholder="Comment..." onkeydown="if(event.key==='Enter')${addCallJs}" style="flex:1;font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg2);color:var(--text1)">
      <button onclick="${addCallJs}" style="font-size:10px;padding:3px 8px;border:1px solid var(--border2);border-radius:4px;background:var(--bg2);color:var(--text2);cursor:pointer">Add</button>
    </div>
  </div>`;
}

function crmRenderPipeline() {
  const el = document.getElementById('crmPipelineView');
  if (!el) return;
  const fmtMoney = v => '$' + Number(v || 0).toLocaleString();
  const isOpen = status => status === 'Open' || status === 'In progress';

  const topUps = [], newAccounts = [], otherOpps = [];
  Object.entries(clients).forEach(([id, c]) => {
    (c.crm?.opportunities || []).forEach(o => {
      if (!isOpen(o.status)) return;
      const row = { id, name: c.name || 'Unnamed', opp: o };
      const t = (o.type || '').toLowerCase();
      if (t.includes('balance')) topUps.push(row);
      else if (t.includes('account')) newAccounts.push(row);
      else otherOpps.push(row);
    });
  });
  const newClients = Object.entries(prospects).map(([id, p]) => ({ id, p }));

  const sum = (rows, key) => rows.reduce((s, r) => s + (Number(key(r)) || 0), 0);
  const totalTopUps = sum(topUps, r => r.opp.estValue);
  const totalNewAcc = sum(newAccounts, r => r.opp.estValue);
  const totalNewCli = sum(newClients, r => r.p.estValue);
  const grandTotal = totalTopUps + totalNewAcc + totalNewCli;

  const oppRow = r => {
    const missing = !r.opp.estValue;
    const comments = r.opp.comments || [];
    return `<div style="padding:8px 10px;border:1px solid ${missing?'#f0c96b':'var(--border)'};border-radius:8px;background:${missing?'#fffaf0':'var(--bg)'};margin-bottom:6px">
    <div style="min-width:0;cursor:pointer;margin-bottom:6px" onclick="crmOpenDetail('client','${r.id}')">
      <div style="font-weight:600;font-size:13px;color:var(--text1)">${crmEsc(r.name)}</div>
      ${r.opp.note ? `<div style="font-size:11px;color:var(--text3)">${crmEsc(r.opp.note)}</div>` : ''}
    </div>
    <div style="display:flex;align-items:center;gap:4px">
      <span style="font-size:12px;color:var(--text3)">$</span>
      <input type="number" value="${r.opp.estValue||''}" placeholder="0" onclick="event.stopPropagation()" onchange="crmSetOpportunityValueDirect('${r.id}','${r.opp.id}',this.value)" style="flex:1;min-width:0;font-size:13px;font-weight:600;padding:4px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg2);color:var(--text1);text-align:right">
    </div>
    ${crmCommentBlock(comments, 'opp_'+r.opp.id, 'crmPipeComment_opp_'+r.opp.id, `crmPipelineAddOppComment('${r.id}','${r.opp.id}')`)}
  </div>`;
  };

  const prospectRow = r => {
    const missing = !r.p.estValue;
    const comments = r.p.comments || [];
    return `<div style="padding:8px 10px;border:1px solid ${missing?'#f0c96b':'var(--border)'};border-radius:8px;background:${missing?'#fffaf0':'var(--bg)'};margin-bottom:6px">
    <div style="min-width:0;cursor:pointer;margin-bottom:6px" onclick="crmOpenDetail('prospect','${r.id}')">
      <div style="font-weight:600;font-size:13px;color:var(--text1)">${crmEsc(r.p.name)}</div>
      <span style="font-size:10px;font-weight:600;background:var(--bg2);color:var(--text2);padding:2px 8px;border-radius:8px">${crmEsc(r.p.stage)}</span>
    </div>
    <div style="display:flex;align-items:center;gap:4px">
      <span style="font-size:12px;color:var(--text3)">$</span>
      <input type="number" value="${r.p.estValue||''}" placeholder="0" onclick="event.stopPropagation()" onchange="crmSetProspectValueDirect('${r.id}',this.value)" style="flex:1;min-width:0;font-size:13px;font-weight:600;padding:4px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg2);color:var(--text1);text-align:right">
    </div>
    ${crmCommentBlock(comments, 'prospect_'+r.id, 'crmPipeComment_prospect_'+r.id, `crmPipelineAddProspectComment('${r.id}')`)}
  </div>`;
  };

  const section = (icon, title, rows, total, rowFn, emptyMsg) => `
    <div style="background:var(--bg2);border-radius:8px;padding:12px 14px">
      <div style="margin-bottom:10px">
        <div style="font-weight:600;font-size:13px;color:var(--text2)">${icon} ${title} <span style="font-weight:400;color:var(--text3)">(${rows.length})</span></div>
        <div style="font-size:18px;font-weight:700;color:var(--text1);margin-top:2px">${fmtMoney(total)}</div>
      </div>
      ${rows.length ? rows.sort((a,b) => (b.opp?.estValue||b.p?.estValue||0) - (a.opp?.estValue||a.p?.estValue||0)).map(rowFn).join('') : `<div style="font-size:12px;color:var(--text3)">${emptyMsg}</div>`}
    </div>`;

  const cols = otherOpps.length ? 4 : 3;
  el.innerHTML = `
    <div style="background:var(--bg2);border-radius:8px;padding:14px;margin-bottom:1.25rem;text-align:center">
      <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em">Total pipeline (est.)</div>
      <div style="font-size:28px;font-weight:700;color:var(--text1)">${fmtMoney(grandTotal)}</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:12px;align-items:start">
      ${section('💰', 'Top-ups — existing open accounts', topUps, totalTopUps, oppRow, 'No open top-up opportunities.')}
      ${section('🏦', 'New accounts — existing clients', newAccounts, totalNewAcc, oppRow, 'No open new-account opportunities.')}
      ${section('🆕', 'New clients (pipeline → new accounts)', newClients, totalNewCli, prospectRow, 'No prospects in the pipeline.')}
      ${otherOpps.length ? section('📌', 'Other opportunities', otherOpps, sum(otherOpps, r=>r.opp.estValue), oppRow, '') : ''}
    </div>`;
}

function crmRenderBizExpansion() {
  const el = document.getElementById('crmBizView');
  if (!el) return;
  const todayStr = new Date().toISOString().slice(0, 10);

  const rows = [];
  Object.entries(clients).forEach(([id, c]) => {
    (c.crm?.opportunities || []).forEach(o => rows.push({ id, name: c.name || 'Unnamed', kind: 'opp', opp: o, _date: o.nextDate }));
  });
  Object.entries(prospects).forEach(([id, p]) => {
    (p.tasks || []).forEach(t => {
      if (!t.done && !t.cancelled) rows.push({ id, name: p.name, kind: 'task', task: t, _date: t.due });
    });
  });

  if (!rows.length) {
    el.innerHTML = '<div style="color:var(--text3);padding:2rem;text-align:center;font-size:13px">No opportunities or prospect tasks yet.</div>';
    return;
  }

  const statusColor = s => s === 'Won' ? '#3b6d11' : s === 'Lost' ? '#c62828' : s === 'In progress' ? '#8a6100' : 'var(--text2)';
  const openCount = rows.filter(r => r.kind === 'task' || r.opp.status === 'Open' || r.opp.status === 'In progress').length;

  const cardHtml = r => {
    if (r.kind === 'task') {
      const overdue = r.task.due && r.task.due < todayStr;
      const comments = r.task.comments || [];
      return `<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:9px 12px;margin-bottom:8px">
        <div onclick="crmOpenDetail('prospect','${r.id}','${r.task.id}')" style="cursor:pointer">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
            <div style="min-width:0">
              <span style="font-weight:600;font-size:13px;color:var(--text1)">${crmEsc(r.name)}</span>
              <span style="font-size:10px;font-weight:600;background:var(--bg2);color:var(--text2);padding:2px 8px;border-radius:8px;margin-left:6px">Prospect</span>
              ${r.task.assignedTo ? `<span style="font-size:10px;font-weight:600;background:#e6e0f5;color:#5b3fa3;padding:2px 8px;border-radius:8px;margin-left:4px">→ ${crmEsc(r.task.assignedTo)}</span>` : ''}
            </div>
          </div>
          <div style="font-size:11px;margin-top:3px;color:${overdue?'#c62828':'var(--text2)'}">${overdue?'⚠ ':''}${crmEsc(r.task.text)}</div>
        </div>
        ${comments.length || r.task.assignedTo ? `
        <div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">
          ${comments.map(c => `<div style="font-size:11px;color:var(--text2);margin-bottom:3px"><span style="font-weight:600">${crmEsc(c.author)}:</span> ${crmEsc(c.text)}</div>`).join('') || '<div style="font-size:11px;color:var(--text3)">No comments yet.</div>'}
          <div style="display:flex;gap:4px;margin-top:4px" onclick="event.stopPropagation()">
            <input id="crmBizComment_${r.task.id}" placeholder="Reply..." onkeydown="if(event.key==='Enter')crmBizAddComment('${r.id}','${r.task.id}')" style="flex:1;font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg2);color:var(--text1)">
            <button onclick="crmBizAddComment('${r.id}','${r.task.id}')" style="font-size:10px;padding:3px 8px;border:1px solid var(--border2);border-radius:4px;background:var(--bg2);color:var(--text2);cursor:pointer">Reply</button>
          </div>
        </div>` : ''}
      </div>`;
    }
    const overdue = r.opp.nextDate && r.opp.nextDate < todayStr && r.opp.status !== 'Won' && r.opp.status !== 'Lost';
    return `<div onclick="crmOpenDetail('client','${r.id}')" style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:9px 12px;margin-bottom:8px;cursor:pointer">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <div style="min-width:0">
          <span style="font-weight:600;font-size:13px;color:var(--text1)">${crmEsc(r.name)}</span>
          <span style="font-size:10px;font-weight:600;background:var(--bg2);color:var(--text2);padding:2px 8px;border-radius:8px;margin-left:6px">${crmEsc(r.opp.type)}</span>
        </div>
        <span style="font-size:10px;font-weight:600;color:${statusColor(r.opp.status)};white-space:nowrap">${crmEsc(r.opp.status)}</span>
      </div>
      ${r.opp.note ? `<div style="font-size:11px;color:var(--text3);margin-top:3px">${crmEsc(r.opp.note)}</div>` : ''}
      ${r.opp.nextDate ? `<div style="font-size:11px;margin-top:3px;color:${overdue?'#c62828':'var(--text2)'}">${overdue?'⚠ ':''}${r.opp.nextText?crmEsc(r.opp.nextText):'follow up'}</div>` : ''}
    </div>`;
  };

  const dateGroups = crmGroupByDate(rows, '_date');
  const header = `<div style="font-size:12px;color:var(--text3);margin-bottom:1rem">${openCount} open item${openCount===1?'':'s'} (client opportunities + prospect tasks)</div>`;

  el.innerHTML = header + dateGroups.map(g => `
    <div style="margin-bottom:1.25rem">
      <div style="margin-bottom:8px">${crmDateBadge(g.label)}</div>
      <div>${g.items.map(cardHtml).join('')}</div>
    </div>`).join('');
}

window.crmToggleTaskFromList = function(personType, personId, taskId) {
  const bucket = personType === 'client'
    ? (clients[personId]?.crm)
    : prospects[personId];
  if (!bucket) return;
  const t = (bucket.tasks || []).find(x => x.id === taskId); if (!t) return;
  t.done = !t.done;
  if (t.done) t.cancelled = false;
  t.updatedAt = new Date().toISOString(); t.updatedBy = 'Nikolai';
  if (personType === 'client') saveToStorage(); else saveProspectsToStorage();
  crmRenderTasks();
  crmAutoSyncKate(t);
};
window.crmCancelTaskFromList = function(personType, personId, taskId) {
  const bucket = personType === 'client'
    ? (clients[personId]?.crm)
    : prospects[personId];
  if (!bucket) return;
  const t = (bucket.tasks || []).find(x => x.id === taskId); if (!t) return;
  t.cancelled = !t.cancelled;
  if (t.cancelled) t.done = false;
  t.updatedAt = new Date().toISOString(); t.updatedBy = 'Nikolai';
  if (personType === 'client') saveToStorage(); else saveProspectsToStorage();
  crmRenderTasks();
  crmRenderToday();
  crmAutoSyncKate(t);
};

function crmTodaysTasks() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const items = [];
  Object.entries(clients).forEach(([id, c]) => {
    (c.crm?.tasks || []).forEach(t => {
      if (!t.done && !t.cancelled && t.due === todayStr) items.push({ personType: 'client', personId: id, personName: c.name || 'Unnamed', task: t });
    });
    (c.crm?.opportunities || []).forEach(o => {
      if (o.nextDate === todayStr && o.status !== 'Won' && o.status !== 'Lost') {
        items.push({ personType: 'client', personId: id, personName: c.name || 'Unnamed', task: { text: `[${o.type}] ${o.nextText || 'follow up'}` } });
      }
    });
  });
  Object.entries(prospects).forEach(([id, p]) => {
    (p.tasks || []).forEach(t => {
      if (!t.done && !t.cancelled && t.due === todayStr) items.push({ personType: 'prospect', personId: id, personName: p.name, task: t });
    });
  });
  return items;
}

window.crmShowTodayTasks = function() {
  const items = crmTodaysTasks();
  if (!items.length) return;
  const modal = document.getElementById('crmTodayModal');
  document.getElementById('crmTodayContent').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
      <h3 style="font-size:16px;font-weight:600;color:var(--text1);margin:0">📋 Today's tasks (${items.length})</h3>
      <button onclick="document.getElementById('crmTodayModal').classList.add('hidden')" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text3)">×</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${items.map(it => `
        <div onclick="document.getElementById('crmTodayModal').classList.add('hidden');crmOpen();crmSwitchTab('${it.personType}s');crmOpenDetail('${it.personType}','${it.personId}')" style="padding:8px 10px;border:1px solid var(--border);border-radius:6px;cursor:pointer;background:var(--bg2)">
          <div style="font-weight:600;font-size:13px;color:var(--text1)">${crmEsc(it.personName)}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:2px">${crmEsc(it.task.text)}</div>
        </div>`).join('')}
    </div>
    <div style="margin-top:1rem;text-align:right">
      <button onclick="document.getElementById('crmTodayModal').classList.add('hidden')" class="btn-secondary" style="font-size:12px">Dismiss</button>
    </div>`;
  modal.classList.remove('hidden');
};

window.crmSyncBirthdays = async function() {
  const token = (document.getElementById('crmGhToken')?.value || localStorage.getItem('suitability-crm-gh-token') || '').trim();
  const statusEl = document.getElementById('crmSyncStatus');
  if (!token) { if (statusEl) statusEl.textContent = 'Add a GitHub token above first.'; return; }

  const people = [];
  Object.values(clients).forEach(c => {
    if (c.crm?.birthday) people.push({ name: c.name || 'Unnamed', day: c.crm.birthday.day, month: c.crm.birthday.month });
    (c.crm?.family || []).forEach(f => {
      if (f.day && f.month) people.push({ name: `${c.name || 'Unnamed'}'s ${f.relation.toLowerCase()}${f.name ? ' ' + f.name : ''}`, day: f.day, month: f.month });
    });
  });
  Object.values(prospects).forEach(p => { if (p.birthday) people.push({ name: p.name, day: p.birthday.day, month: p.birthday.month }); });

  if (statusEl) statusEl.textContent = 'Syncing...';
  const REPO = 'nickolaiklimoff/suitability-letter';
  const PATH = 'birthdays.json';
  try {
    let sha = null;
    const getResp = await fetch(`https://api.github.com/repos/${REPO}/contents/${PATH}`, {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' }
    });
    if (getResp.ok) { const d = await getResp.json(); sha = d.sha; }

    const content = btoa(unescape(encodeURIComponent(JSON.stringify(people, null, 2))));
    const putResp = await fetch(`https://api.github.com/repos/${REPO}/contents/${PATH}`, {
      method: 'PUT',
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `chore: sync birthdays (${people.length} entries)`, content, sha: sha || undefined, branch: 'main' })
    });
    if (!putResp.ok) { const err = await putResp.json(); throw new Error(err.message || 'GitHub API error'); }
    if (statusEl) { statusEl.textContent = `✓ Synced ${people.length} birthdays`; statusEl.style.color = '#3b6d11'; }
  } catch (e) {
    console.error('crmSyncBirthdays failed', e);
    if (statusEl) { statusEl.textContent = 'Sync failed: ' + e.message; statusEl.style.color = '#c62828'; }
  }
};

// ── Kate task sync ───────────────────────────────────────────────────────────
// Shares only tasks explicitly assigned to Kate via assigned-tasks.json in the
// same repo. Merge strategy: per task id, whichever side has the newer
// updatedAt wins for scalar fields (text/due/done); comments are unioned by id
// so neither side's replies get lost even if both edited around the same time.
const KATE_TASKS_PATH = 'assigned-tasks.json';

function crmCollectKateTasks() {
  const out = [];
  Object.entries(clients).forEach(([id, c]) => {
    (c.crm?.tasks || []).forEach(t => {
      if (t.assignedTo === 'Kate') out.push({ ...t, clientId: id, clientName: c.name || 'Unnamed' });
    });
  });
  return out;
}

function crmRenderKateTab() {
  const el = document.getElementById('crmKateView');
  if (!el) return;
  let items = crmCollectKateTasks();
  const showDone = crmShowCompletedTasks;
  if (!showDone) items = items.filter(t => !t.done && !t.cancelled);
  items.sort((a, b) => {
    if (!!a.done !== !!b.done) return a.done ? 1 : -1;
    return new Date(a.due || '2100-01-01') - new Date(b.due || '2100-01-01');
  });

  const header = `
    <div style="background:var(--bg2);border-radius:8px;padding:12px 14px;margin-bottom:1.25rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
      <div style="font-size:12px;color:var(--text3)">${items.length} task${items.length===1?'':'s'} assigned to Kate</div>
      <div>
        <button class="btn-primary" onclick="crmPushTasksToKate()" style="font-size:12px;padding:6px 14px">Sync with Kate</button>
        <span id="crmKateSyncStatus" style="font-size:12px;color:var(--text3);margin-left:8px"></span>
      </div>
    </div>
    <label style="font-size:12px;color:var(--text2);display:flex;align-items:center;gap:5px;cursor:pointer;margin-bottom:1rem">
      <input type="checkbox" ${showDone?'checked':''} onchange="crmShowCompletedTasks=this.checked;crmRenderKateTab()"> Show completed
    </label>`;

  if (!items.length) {
    el.innerHTML = header + '<div style="color:var(--text3);padding:2rem;text-align:center;font-size:13px">No tasks assigned to Kate yet — check "Assign to Kate" when adding a task on a client\'s card.</div>';
    return;
  }

  const groups = crmGroupByDate(items, 'due');
  el.innerHTML = header + groups.map(g => `
    <div style="margin-bottom:1.25rem">
      <div style="margin-bottom:8px">${crmDateBadge(g.label)}</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${g.items.map(t => `
          <div style="padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg);${(t.done||t.cancelled)?'opacity:0.5':''}">
            <div style="display:flex;align-items:center;gap:8px">
              <input type="checkbox" ${t.done?'checked':''} onchange="crmKateToggleTask('${t.clientId}','${t.id}')">
              <span style="font-size:14px">${crmUrgencyIcon(t.urgency)}</span>
              <div style="flex:1;min-width:0;cursor:pointer" onclick="crmOpenDetail('client','${t.clientId}','${t.id}')">
                <span style="font-weight:600;color:var(--text1);font-size:13px">${crmEsc(t.clientName)}</span>
                <span style="color:var(--text3);font-size:12px"> — </span>
                <span style="font-size:13px;color:var(--text1);${t.done?'text-decoration:line-through':''}">${crmEsc(t.text)}</span>
                ${t.cancelled ? '<span style="font-size:10px;font-weight:600;color:#c62828;margin-left:6px">✕ Cancelled</span>' : ''}
              </div>
              <input type="date" value="${t.due||''}" onchange="crmKateEditTaskDue('${t.clientId}','${t.id}',this.value)" style="font-size:11px;padding:3px 5px;border:1px solid var(--border);border-radius:4px;background:var(--bg2);color:var(--text2)">
            </div>
            <div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">
              ${(t.comments||[]).map(c => `<div style="font-size:11px;color:var(--text2);margin-bottom:3px"><span style="font-weight:600">${crmEsc(c.author)}:</span> ${crmEsc(c.text)}</div>`).join('') || '<div style="font-size:11px;color:var(--text3)">No comments yet.</div>'}
              <div style="display:flex;gap:4px;margin-top:4px">
                <input id="crmKateComment_${t.id}" placeholder="Reply..." onkeydown="if(event.key==='Enter')crmKateAddComment('${t.clientId}','${t.id}')" style="flex:1;font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg2);color:var(--text1)">
                <button onclick="crmKateAddComment('${t.clientId}','${t.id}')" style="font-size:10px;padding:3px 8px;border:1px solid var(--border2);border-radius:4px;background:var(--bg2);color:var(--text2);cursor:pointer">Reply</button>
              </div>
            </div>
          </div>`).join('')}
      </div>
    </div>`).join('');
}

// Direct-mutation variants for the Kate tab, which spans multiple clients at
// once — unlike the in-card task functions, there's no single "open detail"
// to read from, so these take clientId explicitly.
window.crmKateToggleTask = function(clientId, taskId) {
  const c = clients[clientId]; if (!c?.crm) return;
  const t = (c.crm.tasks || []).find(x => x.id === taskId); if (!t) return;
  t.done = !t.done; t.updatedAt = new Date().toISOString(); t.updatedBy = 'Nikolai';
  saveToStorage();
  crmRenderKateTab();
  crmAutoSyncKate(t);
};
window.crmKateEditTaskDue = function(clientId, taskId, val) {
  const c = clients[clientId]; if (!c?.crm) return;
  const t = (c.crm.tasks || []).find(x => x.id === taskId); if (!t) return;
  t.due = val || null; t.updatedAt = new Date().toISOString(); t.updatedBy = 'Nikolai';
  saveToStorage();
  crmAutoSyncKate(t);
};
window.crmKateAddComment = function(clientId, taskId) {
  const c = clients[clientId]; if (!c?.crm) return;
  const t = (c.crm.tasks || []).find(x => x.id === taskId); if (!t) return;
  const el = document.getElementById('crmKateComment_' + taskId);
  const text = el.value.trim(); if (!text) return;
  if (!t.comments) t.comments = [];
  t.comments.push({ id: 'c_' + Date.now(), author: 'Nikolai', text, date: new Date().toISOString() });
  t.updatedAt = new Date().toISOString(); t.updatedBy = 'Nikolai';
  saveToStorage();
  crmRenderKateTab();
  crmAutoSyncKate(t);
};

function crmDeletedKateTaskIds() {
  try { return JSON.parse(localStorage.getItem('suitability-crm-deleted-kate-tasks') || '[]'); }
  catch (e) { return []; }
}
function crmMarkKateTaskDeleted(taskId) {
  const ids = crmDeletedKateTaskIds();
  if (!ids.includes(taskId)) ids.push(taskId);
  try { localStorage.setItem('suitability-crm-deleted-kate-tasks', JSON.stringify(ids)); } catch (e) {}
}

function crmMergeKateTasks(local, remote) {
  const byId = {};
  remote.forEach(t => { byId[t.id] = t; });
  local.forEach(t => {
    const r = byId[t.id];
    if (!r) { byId[t.id] = t; return; }
    const localNewer = new Date(t.updatedAt || 0) >= new Date(r.updatedAt || 0);
    const merged = localNewer ? { ...r, ...t } : { ...t, ...r };
    const allComments = [...(t.comments || []), ...(r.comments || [])];
    const seen = new Set();
    merged.comments = allComments.filter(c => c.id && !seen.has(c.id) && seen.add(c.id));
    byId[t.id] = merged;
  });
  // Tombstones: a task once explicitly deleted must never resurrect, even if
  // a stale browser tab (whose local state predates the delete) pushes again.
  const deleted = new Set(crmDeletedKateTaskIds());
  return Object.values(byId).filter(t => !deleted.has(t.id));
}

window.crmPushTasksToKate = async function() {
  const token = (document.getElementById('crmGhToken')?.value || localStorage.getItem('suitability-crm-gh-token') || '').trim();
  const statusEl = document.getElementById('crmKateSyncStatus');
  if (!token) { if (statusEl) statusEl.textContent = 'Add a GitHub token above first.'; return; }
  if (statusEl) statusEl.textContent = 'Syncing...';
  const REPO = 'nickolaiklimoff/suitability-letter';
  try {
    let remote = [], sha = null;
    const getResp = await fetch(`https://api.github.com/repos/${REPO}/contents/${KATE_TASKS_PATH}`, {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' }
    });
    if (getResp.ok) {
      const d = await getResp.json();
      sha = d.sha;
      remote = JSON.parse(decodeURIComponent(escape(atob(d.content))));
    }
    const local = crmCollectKateTasks();
    const merged = crmMergeKateTasks(local, remote);

    // Pull back into local client records first (so Kate's comments/deadline/done
    // changes aren't lost), then push the merged set.
    merged.forEach(mt => {
      const c = clients[mt.clientId];
      if (!c || !c.crm) return;
      const idx = (c.crm.tasks || []).findIndex(t => t.id === mt.id);
      const { clientId, clientName, ...clean } = mt;
      if (idx >= 0) c.crm.tasks[idx] = clean;
    });
    saveToStorage();

    const content = btoa(unescape(encodeURIComponent(JSON.stringify(merged, null, 2))));
    const putResp = await fetch(`https://api.github.com/repos/${REPO}/contents/${KATE_TASKS_PATH}`, {
      method: 'PUT',
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `chore: sync Kate's tasks (${merged.length} entries)`, content, sha: sha || undefined, branch: 'main' })
    });
    if (!putResp.ok) { const err = await putResp.json(); throw new Error(err.message || 'GitHub API error'); }
    if (statusEl) { statusEl.textContent = `✓ Synced ${merged.length} tasks (pulled Kate's updates too)`; statusEl.style.color = '#3b6d11'; }
    crmRefreshActiveView();
  } catch (e) {
    console.error('crmPushTasksToKate failed', e);
    if (statusEl) { statusEl.textContent = 'Sync failed: ' + e.message; statusEl.style.color = '#c62828'; }
  }
};

function crmUpcomingBirthdays(withinDays) {
  const today = new Date(); today.setHours(0,0,0,0);
  const people = [];
  Object.entries(clients).forEach(([id, c]) => {
    if (c.crm?.birthday) people.push({ type: 'client', id, name: c.name || 'Unnamed', birthday: c.crm.birthday });
    (c.crm?.family || []).forEach(f => {
      if (f.day && f.month) people.push({ type: 'client', id, name: `${c.name || 'Unnamed'}'s ${f.relation.toLowerCase()}${f.name ? ' ' + f.name : ''}`, birthday: { day: f.day, month: f.month } });
    });
  });
  Object.entries(prospects).forEach(([id, p]) => {
    if (p.birthday) people.push({ type: 'prospect', id, name: p.name, birthday: p.birthday });
  });
  return people.map(p => {
    let next = new Date(today.getFullYear(), p.birthday.month - 1, p.birthday.day);
    if (next < today) next = new Date(today.getFullYear() + 1, p.birthday.month - 1, p.birthday.day);
    const daysUntil = Math.round((next - today) / 86400000);
    return { ...p, daysUntil };
  }).filter(p => p.daysUntil <= withinDays).sort((a, b) => a.daysUntil - b.daysUntil);
}

function crmRenderClients() {
  const el = document.getElementById('crmClientsView');
  if (!el) return;
  const ids = Object.keys(clients);
  const upcoming = crmUpcomingBirthdays(30);
  const bdayHtml = upcoming.length ? `<div style="background:var(--bg2);border-radius:8px;padding:10px 14px;margin-bottom:1rem;font-size:12px">
    <span style="font-weight:600;color:var(--text2)">🎂 Upcoming birthdays:</span>
    ${upcoming.map(p => `<span onclick="crmOpenDetail('${p.type}','${p.id}')" style="cursor:pointer;margin-left:10px;color:var(--text1)">${crmEsc(p.name)} <span style="color:var(--text3)">(${p.daysUntil===0?'today':p.daysUntil===1?'tomorrow':'in '+p.daysUntil+'d'})</span></span>`).join('')}
  </div>` : '';

  // Opportunity summary — counts of Open/In progress items by type across all clients
  const oppCounts = {};
  ids.forEach(id => {
    (clients[id].crm?.opportunities || []).forEach(o => {
      if (o.status === 'Open' || o.status === 'In progress') oppCounts[o.type] = (oppCounts[o.type] || 0) + 1;
    });
  });
  const oppTypes = Object.keys(oppCounts);
  const oppSummaryHtml = oppTypes.length ? `<div style="background:var(--bg2);border-radius:8px;padding:10px 14px;margin-bottom:1rem;font-size:12px">
    <span style="font-weight:600;color:var(--text2)">💰 Open opportunities:</span>
    ${oppTypes.map(t => `<span style="margin-left:10px;color:var(--text1)">${crmEsc(t)} <span style="color:var(--text3)">(${oppCounts[t]})</span></span>`).join('')}
  </div>` : '';

  if (!ids.length) {
    el.innerHTML = bdayHtml + oppSummaryHtml + '<div style="color:var(--text3);padding:2rem;text-align:center;font-size:13px">No clients yet — add one from the sidebar first.</div>';
    return;
  }
  el.innerHTML = bdayHtml + oppSummaryHtml + `<div style="display:flex;flex-direction:column;gap:6px">` + ids.map(id => {
    const c = clients[id];
    const crm = c.crm || { activities: [], tasks: [] };
    const openTasks = (crm.tasks || []).filter(t => !t.done && !t.cancelled);
    const overdue = openTasks.some(t => t.due && new Date(t.due) < new Date(new Date().toDateString()));
    const lastAct = (crm.activities || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    const openOpps = (crm.opportunities || []).filter(o => o.status === 'Open' || o.status === 'In progress');
    return `<div onclick="crmOpenDetail('client','${id}')" style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 14px;border:1px solid var(--border);border-radius:8px;cursor:pointer;background:var(--bg)">
      <div style="min-width:0">
        <div style="font-weight:600;color:var(--text1);font-size:13px">${crmEsc(c.name || 'Unnamed client')}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${lastAct ? crmFmtDate(lastAct.date) + ' — ' + crmEsc(lastAct.text) : 'No activity logged'}</div>
        ${openOpps.length ? `<div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap">${openOpps.map(o => `<span style="background:#fff3d6;color:#8a6100;font-size:9px;padding:1px 6px;border-radius:8px;font-weight:600">${crmEsc(o.type)}</span>`).join('')}</div>` : ''}
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        ${overdue ? '<span style="background:#fdecea;color:#c62828;font-size:10px;padding:2px 8px;border-radius:10px;font-weight:600;white-space:nowrap">overdue</span>' : ''}
        ${openTasks.length ? `<span style="background:#eaf4fb;color:#1a5276;font-size:10px;padding:2px 8px;border-radius:10px;font-weight:600;white-space:nowrap">${openTasks.length} task${openTasks.length > 1 ? 's' : ''}</span>` : ''}
      </div>
    </div>`;
  }).join('') + `</div>`;
}

// ── Prospects tab: pipeline kanban ──────────────────────────────────────────
window.crmAddProspect = function() {
  const name = prompt('Prospect name:');
  if (!name || !name.trim()) return;
  const id = 'p_' + Date.now();
  prospects[id] = { id, name: name.trim(), company: '', stage: 'Prospecting', activities: [], tasks: [], createdAt: Date.now() };
  saveProspectsToStorage();
  crmRenderProspects();
  crmOpenDetail('prospect', id);
};

window.crmMoveStage = function(id, delta) {
  const p = prospects[id]; if (!p) return;
  const idx = CRM_STAGES.indexOf(p.stage);
  p.stage = CRM_STAGES[Math.max(0, Math.min(CRM_STAGES.length - 1, idx + delta))];
  saveProspectsToStorage();
  crmRenderProspects();
};

window.crmConvertToClient = function(id) {
  const p = prospects[id]; if (!p) return;
  if (!confirm(`Convert "${p.name}" to a full client? This creates a new client record in the sidebar (with the activity log and tasks carried over) and removes them from the prospect pipeline.`)) return;
  const cid = 'c_' + Date.now();
  clients[cid] = { name: p.name, profile: {}, letters: [], crm: { activities: p.activities || [], tasks: p.tasks || [] } };
  saveToStorage();
  renderClientList();
  delete prospects[id];
  saveProspectsToStorage();
  crmRenderProspects();
  alert(`${p.name} is now a client — find them in the sidebar list.`);
};

window.crmDeleteProspect = function(id) {
  const p = prospects[id]; if (!p) return;
  if (!confirm(`Delete prospect "${p.name}"? This cannot be undone.`)) return;
  delete prospects[id];
  saveProspectsToStorage();
  crmRenderProspects();
  document.getElementById('crmDetailModal').classList.add('hidden');
};

function crmRenderProspects() {
  const el = document.getElementById('crmProspectsView');
  if (!el) return;
  let html = `<div style="margin-bottom:1rem"><button class="btn-primary" onclick="crmAddProspect()" style="font-size:13px;padding:7px 16px">+ New prospect</button></div>`;
  html += `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">`;
  CRM_STAGES.forEach((stage, stageIdx) => {
    const items = Object.values(prospects).filter(p => p.stage === stage).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    html += `<div style="background:var(--bg2);border-radius:8px;padding:10px;min-height:140px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text3);margin-bottom:8px">${stage} (${items.length})</div>
      ${items.map(p => {
        const openTasks = (p.tasks || []).filter(t => !t.done && !t.cancelled);
        const overdue = openTasks.some(t => t.due && new Date(t.due) < new Date(new Date().toDateString()));
        return `<div onclick="crmOpenDetail('prospect','${p.id}')" style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px 10px;margin-bottom:8px;cursor:pointer">
          <div style="font-weight:600;font-size:13px;color:var(--text1)">${crmEsc(p.name)}</div>
          ${p.company ? `<div style="font-size:11px;color:var(--text3)">${crmEsc(p.company)}</div>` : ''}
          <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
            ${overdue ? '<span style="background:#fdecea;color:#c62828;font-size:9px;padding:1px 6px;border-radius:8px;font-weight:600">overdue</span>' : ''}
            ${openTasks.length ? `<span style="background:#eaf4fb;color:#1a5276;font-size:9px;padding:1px 6px;border-radius:8px;font-weight:600">${openTasks.length} task${openTasks.length > 1 ? 's' : ''}</span>` : ''}
          </div>
          <div style="display:flex;gap:4px;margin-top:6px" onclick="event.stopPropagation()">
            ${stageIdx > 0 ? `<button onclick="crmMoveStage('${p.id}',-1)" title="Move back" style="font-size:10px;padding:2px 6px;border:1px solid var(--border2);border-radius:4px;background:none;cursor:pointer;color:var(--text2)">←</button>` : ''}
            ${stageIdx < CRM_STAGES.length - 1
              ? `<button onclick="crmMoveStage('${p.id}',1)" title="Move forward" style="font-size:10px;padding:2px 6px;border:1px solid var(--border2);border-radius:4px;background:none;cursor:pointer;color:var(--text2)">→</button>`
              : `<button onclick="crmConvertToClient('${p.id}')" title="Convert to client" style="font-size:10px;padding:2px 6px;border:none;border-radius:4px;background:var(--green-text);color:#fff;cursor:pointer;font-weight:600">✓ Onboard</button>`}
          </div>
        </div>`;
      }).join('') || `<div style="font-size:11px;color:var(--text3);padding:8px 0">Empty</div>`}
    </div>`;
  });
  html += `</div>`;
  el.innerHTML = html;
}

// ── Shared detail modal: activity log + tasks (clients and prospects) ──────
window.crmOpenDetail = function(type, id, focusTaskId) {
  crmDetailPersonRef = { type, id };
  document.getElementById('crmDetailModal').classList.remove('hidden');
  crmRenderDetail();
  if (focusTaskId) {
    setTimeout(() => {
      const row = document.getElementById('crmTaskRow_' + focusTaskId);
      if (!row) return;
      row.scrollIntoView({ block: 'center', behavior: 'smooth' });
      row.style.transition = 'box-shadow 0.3s';
      row.style.boxShadow = '0 0 0 2px var(--blue)';
      setTimeout(() => { row.style.boxShadow = ''; }, 1600);
      const textInput = row.querySelector('.crm-task-text-input');
      if (textInput) textInput.focus();
    }, 50);
  }
};

window.crmCloseDetail = function() {
  document.getElementById('crmDetailModal').classList.add('hidden');
  crmDetailPersonRef = null;
};

function crmRenderDetail() {
  const ref = crmDetailPersonRef; if (!ref) return;
  const bucket = crmGetBucket(ref); if (!bucket) return;
  const name = crmGetName(ref);
  const tasks = (bucket.tasks || []).slice().sort((a, b) => {
    if (!!a.done !== !!b.done) return a.done ? 1 : -1;
    return new Date(a.due || '2100-01-01') - new Date(b.due || '2100-01-01');
  });
  const activities = (bucket.activities || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const isProspect = ref.type === 'prospect';

  document.getElementById('crmDetailContent').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem">
      <div style="flex:1">
        <h3 style="font-size:17px;font-weight:600;color:var(--text1);margin:0">${crmEsc(name)}</h3>
        ${isProspect ? `<div style="display:flex;gap:6px;margin-top:6px;max-width:340px">
          <input value="${crmEsc(prospects[ref.id].company || '')}" placeholder="Company / context" onchange="crmSetCompany(this.value)" style="flex:1;font-size:12px;padding:5px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg2);color:var(--text1)">
          <input type="number" value="${prospects[ref.id].estValue||''}" placeholder="Est. AUM $" onchange="crmSetProspectValue(this.value)" style="width:110px;font-size:12px;padding:5px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg2);color:var(--text1)">
        </div>` : ''}
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        ${isProspect ? `
        <select onchange="crmSetStage(this.value)" style="font-size:12px;padding:5px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg2);color:var(--text1)">
          ${CRM_STAGES.map(s => `<option value="${s}" ${prospects[ref.id].stage === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <button onclick="crmDeleteProspect('${ref.id}')" title="Delete prospect" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px">🗑</button>` : ''}
        <button onclick="crmCloseDetail()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--text3);line-height:1">×</button>
      </div>
    </div>
    <div style="background:var(--bg2);border-radius:8px;padding:10px 14px;margin-bottom:1.25rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-weight:600;font-size:12px;color:var(--text2)">Personal <span style="font-weight:400;color:var(--text3)">(minimal — no year of birth, no other PII, all data stays local — nothing sent to any third party)</span></div>
        <div style="display:flex;gap:6px">
          <button onclick="crmExportPerson()" title="Export all CRM data held on this person (GDPR Art. 15)" style="font-size:10px;padding:3px 8px;border:1px solid var(--border2);border-radius:4px;background:var(--bg);color:var(--text2);cursor:pointer">⬇ Export</button>
          <button onclick="crmEraseCrmData()" title="Erase all CRM data held on this person (GDPR Art. 17) — keeps the client record itself, only clears activity/tasks/personal fields" style="font-size:10px;padding:3px 8px;border:1px solid var(--border2);border-radius:4px;background:var(--bg);color:#c62828;cursor:pointer">🗑 Erase CRM data</button>
        </div>
      </div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end">
        <div>
          <label style="display:block;font-size:10px;color:var(--text3);margin-bottom:3px">Birthday (day/month only)</label>
          <div style="display:flex;gap:4px">
            <select id="crmBdayDay" onchange="crmSetBirthday()" style="font-size:12px;padding:5px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text1)">
              <option value="">Day</option>
              ${Array.from({length:31},(_,i)=>i+1).map(d=>`<option value="${d}" ${bucket.birthday?.day===d?'selected':''}>${d}</option>`).join('')}
            </select>
            <select id="crmBdayMonth" onchange="crmSetBirthday()" style="font-size:12px;padding:5px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text1)">
              <option value="">Month</option>
              ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m,i)=>`<option value="${i+1}" ${bucket.birthday?.month===i+1?'selected':''}>${m}</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="flex:1;min-width:220px">
          <label style="display:block;font-size:10px;color:var(--text3);margin-bottom:3px">Interests / plans (free text)</label>
          <input id="crmInterests" value="${crmEsc(bucket.interests || '')}" placeholder="e.g. Arsenal FC, golf, sailing, expanding to Kazakhstan..." onchange="crmSetInterests(this.value)" style="width:100%;font-size:12px;padding:5px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text1)">
        </div>
      </div>
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
        <button onclick="crmCheckNews()" class="btn-secondary" style="font-size:11px;padding:4px 10px" ${bucket.interests ? '' : 'disabled title="Add interests first"'}>🔎 Check relevant news</button>
        <span id="crmNewsStatus" style="font-size:11px;color:var(--text3);margin-left:8px"></span>
        <span style="font-size:10px;color:var(--text3);margin-left:8px">— sends only the Interests text above to Anthropic's API. Name and birthday are never included.</span>
        ${bucket.newsCheck ? `<div style="margin-top:8px;font-size:12px;color:var(--text1);background:var(--bg);border-radius:6px;padding:8px 10px;white-space:pre-wrap">${crmEsc(bucket.newsCheck.text)}<div style="font-size:10px;color:var(--text3);margin-top:6px">Checked ${crmFmtDate(bucket.newsCheck.date)}</div></div>` : ''}
      </div>
    </div>

    ${!isProspect ? `
    <div style="background:var(--bg2);border-radius:8px;padding:12px 14px;margin-bottom:1.25rem">
      <div style="font-weight:600;font-size:13px;color:var(--text2);margin-bottom:10px">Opportunities <span style="font-weight:400;color:var(--text3);font-size:11px">(internal expansion — not the prospect pipeline)</span></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end;margin-bottom:10px">
        <div style="flex:1;min-width:180px">
          <label style="display:block;font-size:10px;color:var(--text3);margin-bottom:3px">Type</label>
          <input id="crmOppType" list="crmOppTypeList" placeholder="New balances..." style="width:100%;font-size:12px;padding:5px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text1)">
          <datalist id="crmOppTypeList">
            <option value="New balances">
            <option value="New account">
            <option value="Discretionary mandate">
          </datalist>
        </div>
        <div>
          <label style="display:block;font-size:10px;color:var(--text3);margin-bottom:3px">Status</label>
          <select id="crmOppStatus" style="font-size:12px;padding:5px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text1)">
            <option>Open</option><option>In progress</option><option>Won</option><option>Lost</option>
          </select>
        </div>
        <div>
          <label style="display:block;font-size:10px;color:var(--text3);margin-bottom:3px">Est. value</label>
          <input id="crmOppEstValue" type="number" placeholder="$" style="width:90px;font-size:12px;padding:5px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text1)">
        </div>
        <div style="flex:1;min-width:180px">
          <label style="display:block;font-size:10px;color:var(--text3);margin-bottom:3px">Note</label>
          <input id="crmOppNote" placeholder="optional context" style="width:100%;font-size:12px;padding:5px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text1)">
        </div>
        <div>
          <label style="display:block;font-size:10px;color:var(--text3);margin-bottom:3px">When (next action)</label>
          <input id="crmOppNextDateNew" type="date" style="font-size:12px;padding:5px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text1)">
        </div>
        <button onclick="crmAddOpportunity()" class="btn-secondary" style="font-size:12px;padding:5px 10px">Add</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${(bucket.opportunities || []).length ? bucket.opportunities.map(o => {
          const overdue = o.nextDate && new Date(o.nextDate) < new Date(new Date().toDateString());
          return `
          <div style="padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg)">
            <div style="display:flex;align-items:center;gap:8px">
              <div style="flex:1;min-width:0">
                <div style="font-size:12px;font-weight:600;color:var(--text1)">${crmEsc(o.type)}${o.estValue ? ` <span style="font-weight:400;color:var(--text3)">· $${Number(o.estValue).toLocaleString()}</span>` : ''}</div>
                ${o.note ? `<div style="font-size:11px;color:var(--text3)">${crmEsc(o.note)}</div>` : ''}
              </div>
              <input type="number" value="${o.estValue||''}" onchange="crmSetOpportunityValue('${o.id}',this.value)" placeholder="$ value" style="width:80px;font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg2);color:var(--text1)">
              <select onchange="crmSetOpportunityStatus('${o.id}',this.value)" style="font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg2);color:${o.status==='Won'?'#3b6d11':o.status==='Lost'?'#c62828':'var(--text2)'};font-weight:600">
                ${['Open','In progress','Won','Lost'].map(s=>`<option ${o.status===s?'selected':''}>${s}</option>`).join('')}
              </select>
              <button onclick="crmDeleteOpportunity('${o.id}')" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px;flex-shrink:0">×</button>
            </div>
            <div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border);display:flex;gap:6px;align-items:center;flex-wrap:wrap">
              ${o.nextDate ? `<span style="font-size:11px;color:${overdue?'#c62828':'var(--text2)'};font-weight:600">${overdue?'⚠ ':''}Next: ${crmFmtDate(o.nextDate)}${o.nextText?' — '+crmEsc(o.nextText):''}</span>` : ''}
              <input type="date" id="crmOppNextDate_${o.id}" value="${o.nextDate||''}" style="font-size:11px;padding:3px 5px;border:1px solid var(--border);border-radius:4px;background:var(--bg2);color:var(--text1)">
              <input type="text" id="crmOppNextText_${o.id}" value="${crmEsc(o.nextText||'')}" placeholder="what to do" style="flex:1;min-width:100px;font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg2);color:var(--text1)">
              <button onclick="crmSetOpportunityNext('${o.id}')" style="font-size:10px;padding:3px 8px;border:1px solid var(--border2);border-radius:4px;background:var(--bg2);color:var(--text2);cursor:pointer">Set</button>
            </div>
          </div>`;
        }).join('') : '<div style="font-size:12px;color:var(--text3)">No open opportunities yet.</div>'}
      </div>
    </div>` : ''}

    ${!isProspect ? `
    <div style="background:var(--bg2);border-radius:8px;padding:12px 14px;margin-bottom:1.25rem">
      <div style="font-weight:600;font-size:13px;color:var(--text2);margin-bottom:10px">Family <span style="font-weight:400;color:var(--text3);font-size:11px">(same minimal approach — name + day/month only, no year)</span></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end;margin-bottom:10px">
        <div>
          <label style="display:block;font-size:10px;color:var(--text3);margin-bottom:3px">Relation</label>
          <select id="crmFamRelation" style="font-size:12px;padding:5px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text1)">
            <option>Wife</option><option>Husband</option><option>Son</option><option>Daughter</option><option>Mother</option><option>Father</option><option>Other</option>
          </select>
        </div>
        <div style="flex:1;min-width:140px">
          <label style="display:block;font-size:10px;color:var(--text3);margin-bottom:3px">Name</label>
          <input id="crmFamName" placeholder="First name" style="width:100%;font-size:12px;padding:5px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text1)">
        </div>
        <div>
          <label style="display:block;font-size:10px;color:var(--text3);margin-bottom:3px">Birthday</label>
          <div style="display:flex;gap:4px">
            <select id="crmFamDay" style="font-size:12px;padding:5px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text1)">
              <option value="">Day</option>
              ${Array.from({length:31},(_,i)=>i+1).map(d=>`<option value="${d}">${d}</option>`).join('')}
            </select>
            <select id="crmFamMonth" style="font-size:12px;padding:5px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text1)">
              <option value="">Month</option>
              ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m,i)=>`<option value="${i+1}">${m}</option>`).join('')}
            </select>
          </div>
        </div>
        <button onclick="crmAddFamily()" class="btn-secondary" style="font-size:12px;padding:5px 10px">Add</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${(bucket.family || []).length ? bucket.family.map(f => `
          <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg)">
            <div style="flex:1;min-width:0;font-size:12px;color:var(--text1)"><span style="font-weight:600">${crmEsc(f.relation)}</span>${f.name ? ' — ' + crmEsc(f.name) : ''}</div>
            <span style="font-size:11px;color:var(--text3)">${f.day && f.month ? String(f.day).padStart(2,'0')+'/'+String(f.month).padStart(2,'0') : 'no birthday'}</span>
            <button onclick="crmDeleteFamily('${f.id}')" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px;flex-shrink:0">×</button>
          </div>`).join('') : '<div style="font-size:12px;color:var(--text3)">No family members added yet.</div>'}
      </div>
    </div>` : ''}

    <div style="background:var(--bg2);border-radius:8px;padding:12px 14px;margin-bottom:1.25rem">
      <div style="font-weight:600;font-size:13px;color:var(--text2);margin-bottom:10px">Log a contact</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-bottom:8px">
        <div>
          <label style="display:block;font-size:10px;color:var(--text3);margin-bottom:3px">Date</label>
          <input id="crmContactDate" type="date" value="${new Date().toISOString().slice(0,10)}" style="font-size:12px;padding:5px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text1)">
        </div>
        <div>
          <label style="display:block;font-size:10px;color:var(--text3);margin-bottom:3px">Type</label>
          <select id="crmNewActType" style="font-size:12px;padding:5px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text1)">
            <option value="note">Note</option>
            <option value="call">Call</option>
            <option value="meeting">Meeting</option>
            <option value="email">Email</option>
          </select>
        </div>
        <div style="flex:1;min-width:200px">
          <label style="display:block;font-size:10px;color:var(--text3);margin-bottom:3px">What happened</label>
          <input id="crmNewActText" placeholder="e.g. discussed Q3 rebalancing, happy with performance" style="width:100%;font-size:12px;padding:5px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text1)">
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
        <div>
          <label style="display:block;font-size:10px;color:var(--text3);margin-bottom:3px">Next contact date</label>
          <input id="crmNextDate" type="date" style="font-size:12px;padding:5px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text1)">
        </div>
        <div style="flex:1;min-width:200px">
          <label style="display:block;font-size:10px;color:var(--text3);margin-bottom:3px">Next contact — what for</label>
          <input id="crmNextText" placeholder="e.g. follow up on Q4 statement" style="width:100%;font-size:12px;padding:5px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text1)">
        </div>
        <button onclick="crmLogContact()" class="btn-primary" style="font-size:12px;padding:6px 16px">Save</button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem">
      <div style="background:var(--bg2);border-radius:8px;padding:12px 14px">
        <div style="font-weight:600;font-size:13px;color:var(--text2);margin-bottom:10px">📋 Tasks</div>
        <div style="display:flex;gap:6px;margin-bottom:6px">
          <input id="crmNewTaskText" placeholder="e.g. renew deposit, prepare meeting..." onkeydown="if(event.key==='Enter')crmAddTask()" style="flex:1;min-width:0;font-size:12px;padding:6px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text1)">
          <select id="crmNewTaskUrgency" title="Urgency" style="font-size:12px;padding:6px 4px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text1)">
            <option value="eagle">🦅 urgent</option>
            <option value="dove" selected>🕊️ normal</option>
            <option value="chicken">🐔 no rush</option>
          </select>
          <input id="crmNewTaskDue" type="date" style="font-size:12px;padding:6px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text1)">
          <button onclick="crmAddTask()" class="btn-primary" style="font-size:12px;padding:6px 12px">Add</button>
        </div>
        <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text3);margin-bottom:10px;cursor:pointer">
          <input type="checkbox" id="crmNewTaskAssignKate"> Assign to Kate
        </label>
        <div style="display:flex;flex-direction:column;gap:6px;max-height:320px;overflow-y:auto">
          ${tasks.length ? tasks.map(t => {
            const overdue = !t.done && !t.cancelled && t.due && new Date(t.due) < new Date(new Date().toDateString());
            return `<div id="crmTaskRow_${t.id}" style="padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);${(t.done||t.cancelled) ? 'opacity:0.5' : ''}">
              <div style="display:flex;align-items:center;gap:8px">
                <input type="checkbox" ${t.done ? 'checked' : ''} onchange="crmToggleTask('${t.id}')">
                <span onclick="crmCycleUrgency('${t.id}')" title="Urgency — click to change" style="cursor:pointer;font-size:14px">${crmUrgencyIcon(t.urgency)}</span>
                <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px">
                  <input class="crm-task-text-input" value="${crmEsc(t.text)}" onchange="crmEditTaskText('${t.id}',this.value)" style="font-size:12px;color:var(--text1);border:none;background:transparent;padding:1px 2px;width:100%;${t.done ? 'text-decoration:line-through' : ''}">
                  ${t.cancelled ? `<div style="font-size:10px;font-weight:600;color:#c62828">✕ Cancelled${t.updatedBy?' by '+crmEsc(t.updatedBy):''}</div>` : ''}
                  <div style="display:flex;align-items:center;gap:6px">
                    <input type="date" value="${t.due||''}" onchange="crmEditTaskDue('${t.id}',this.value)" style="font-size:10px;color:${overdue ? '#c62828' : 'var(--text3)'};border:none;background:transparent;padding:0 2px;width:fit-content">
                    <label style="display:flex;align-items:center;gap:3px;font-size:9px;font-weight:600;cursor:pointer;${t.assignedTo?'background:#e6e0f5;color:#5b3fa3':'color:var(--text3)'};padding:1px 6px;border-radius:8px">
                      <input type="checkbox" ${t.assignedTo?'checked':''} onchange="crmToggleAssignKate('${t.id}',this.checked)" style="width:10px;height:10px;margin:0">→ Kate
                    </label>
                  </div>
                </div>
                <button onclick="crmToggleCancelTask('${t.id}')" style="font-size:10px;padding:3px 8px;border:1px solid var(--border2);border-radius:4px;background:${t.cancelled?'#fdecea':'var(--bg2)'};color:${t.cancelled?'#c62828':'var(--text2)'};cursor:pointer;flex-shrink:0">${t.cancelled?'Uncancel':'Cancel'}</button>
                <button onclick="crmDeleteTask('${t.id}')" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px;flex-shrink:0">×</button>
              </div>
              ${t.assignedTo ? `
              <div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">
                ${(t.comments||[]).map(c => `<div style="font-size:11px;color:var(--text2);margin-bottom:3px"><span style="font-weight:600">${crmEsc(c.author)}:</span> ${crmEsc(c.text)}</div>`).join('')}
                <div style="display:flex;gap:4px;margin-top:4px">
                  <input id="crmTaskComment_${t.id}" placeholder="Reply..." onkeydown="if(event.key==='Enter')crmAddTaskComment('${t.id}')" style="flex:1;font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg2);color:var(--text1)">
                  <button onclick="crmAddTaskComment('${t.id}')" style="font-size:10px;padding:3px 8px;border:1px solid var(--border2);border-radius:4px;background:var(--bg2);color:var(--text2);cursor:pointer">Reply</button>
                </div>
              </div>` : ''}
            </div>`;
          }).join('') : '<div style="font-size:12px;color:var(--text3)">No tasks yet — add one above.</div>'}
        </div>
      </div>
      <div style="background:var(--bg2);border-radius:8px;padding:12px 14px">
        <div style="font-weight:600;font-size:13px;color:var(--text2);margin-bottom:10px">Contact history</div>
        <div style="display:flex;flex-direction:column;gap:6px;max-height:380px;overflow-y:auto">
          ${activities.length ? activities.map(a => `
            <div style="padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg)">
              <div style="display:flex;justify-content:space-between;gap:8px">
                <span style="font-size:10px;font-weight:600;text-transform:uppercase;color:var(--text3)">${crmEsc(a.type)}</span>
                <span style="font-size:10px;color:var(--text3)">${crmFmtDate(a.date)}</span>
              </div>
              <div style="font-size:12px;color:var(--text1);margin-top:2px">${crmEsc(a.text)}</div>
            </div>`).join('') : '<div style="font-size:12px;color:var(--text3)">No activity logged yet.</div>'}
        </div>
      </div>
    </div>`;
}

function crmAutoSyncKate(task) {
  if (!task || task.assignedTo !== 'Kate') return;
  const token = (document.getElementById('crmGhToken')?.value || localStorage.getItem('suitability-crm-gh-token') || '').trim();
  if (!token) return; // silently skip — no token configured, nothing we can do in the background
  crmPushTasksToKate();
}

window.crmAddTask = function() {
  const ref = crmDetailPersonRef; const bucket = crmGetBucket(ref); if (!bucket) return;
  const textEl = document.getElementById('crmNewTaskText');
  const dueEl = document.getElementById('crmNewTaskDue');
  const assignEl = document.getElementById('crmNewTaskAssignKate');
  const urgencyEl = document.getElementById('crmNewTaskUrgency');
  const text = textEl.value.trim(); if (!text) return;
  if (!bucket.tasks) bucket.tasks = [];
  const newTask = {
    id: 't_' + Date.now(), text, due: dueEl.value || null, done: false,
    urgency: urgencyEl?.value || 'dove',
    assignedTo: assignEl?.checked ? 'Kate' : null,
    comments: [], updatedAt: new Date().toISOString(), updatedBy: 'Nikolai',
  };
  bucket.tasks.push(newTask);
  crmSaveBucket(ref);
  crmRenderDetail();
  crmRefreshActiveView();
  crmAutoSyncKate(newTask);
};
window.crmAddTaskComment = function(taskId) {
  const ref = crmDetailPersonRef; const bucket = crmGetBucket(ref); if (!bucket) return;
  const t = (bucket.tasks || []).find(x => x.id === taskId); if (!t) return;
  const el = document.getElementById('crmTaskComment_' + taskId);
  const text = el.value.trim(); if (!text) return;
  if (!t.comments) t.comments = [];
  t.comments.push({ id: 'c_' + Date.now(), author: 'Nikolai', text, date: new Date().toISOString() });
  t.updatedAt = new Date().toISOString(); t.updatedBy = 'Nikolai';
  crmSaveBucket(ref);
  crmRenderDetail();
  crmAutoSyncKate(t);
};
window.crmEditTaskText = function(taskId, val) {
  const ref = crmDetailPersonRef; const bucket = crmGetBucket(ref); if (!bucket) return;
  const t = (bucket.tasks || []).find(x => x.id === taskId); if (!t) return;
  const text = val.trim(); if (!text) return;
  t.text = text; t.updatedAt = new Date().toISOString(); t.updatedBy = 'Nikolai';
  crmSaveBucket(ref);
  crmRefreshActiveView();
  crmAutoSyncKate(t);
};
window.crmEditTaskDue = function(taskId, val) {
  const ref = crmDetailPersonRef; const bucket = crmGetBucket(ref); if (!bucket) return;
  const t = (bucket.tasks || []).find(x => x.id === taskId); if (!t) return;
  t.due = val || null; t.updatedAt = new Date().toISOString(); t.updatedBy = 'Nikolai';
  crmSaveBucket(ref);
  crmRenderDetail();
  crmRefreshActiveView();
  crmAutoSyncKate(t);
};
window.crmCycleUrgency = function(taskId) {
  const ref = crmDetailPersonRef; const bucket = crmGetBucket(ref); if (!bucket) return;
  const t = (bucket.tasks || []).find(x => x.id === taskId); if (!t) return;
  t.urgency = crmUrgencyNext(t.urgency);
  t.updatedAt = new Date().toISOString(); t.updatedBy = 'Nikolai';
  crmSaveBucket(ref);
  crmRenderDetail();
  crmRefreshActiveView();
  crmAutoSyncKate(t);
};
window.crmToggleAssignKate = function(taskId, checked) {
  const ref = crmDetailPersonRef; const bucket = crmGetBucket(ref); if (!bucket) return;
  const t = (bucket.tasks || []).find(x => x.id === taskId); if (!t) return;
  t.assignedTo = checked ? 'Kate' : null;
  if (checked && !t.comments) t.comments = [];
  t.updatedAt = new Date().toISOString(); t.updatedBy = 'Nikolai';
  crmSaveBucket(ref);
  crmRenderDetail();
  crmAutoSyncKate(t);
};
window.crmToggleTask = function(taskId) {
  const ref = crmDetailPersonRef; const bucket = crmGetBucket(ref); if (!bucket) return;
  const t = (bucket.tasks || []).find(x => x.id === taskId); if (!t) return;
  t.done = !t.done; if (t.done) t.cancelled = false;
  t.updatedAt = new Date().toISOString(); t.updatedBy = 'Nikolai';
  crmSaveBucket(ref);
  crmRenderDetail();
  crmRefreshActiveView();
  crmAutoSyncKate(t);
};
window.crmToggleCancelTask = function(taskId) {
  const ref = crmDetailPersonRef; const bucket = crmGetBucket(ref); if (!bucket) return;
  const t = (bucket.tasks || []).find(x => x.id === taskId); if (!t) return;
  t.cancelled = !t.cancelled; if (t.cancelled) t.done = false;
  t.updatedAt = new Date().toISOString(); t.updatedBy = 'Nikolai';
  crmSaveBucket(ref);
  crmRenderDetail();
  crmRefreshActiveView();
  crmAutoSyncKate(t);
};
window.crmDeleteTask = function(taskId) {
  const ref = crmDetailPersonRef; const bucket = crmGetBucket(ref); if (!bucket) return;
  const wasAssignedToKate = (bucket.tasks || []).find(x => x.id === taskId)?.assignedTo === 'Kate';
  bucket.tasks = (bucket.tasks || []).filter(x => x.id !== taskId);
  crmSaveBucket(ref);
  crmRenderDetail();
  crmRefreshActiveView();
  if (wasAssignedToKate) { crmMarkKateTaskDeleted(taskId); crmSyncDeleteFromKate(taskId); }
};

// Removals need their own path — the normal push/pull merge only ever unions
// tasks by id, so a task deleted locally would otherwise linger forever in
// assigned-tasks.json (and keep reappearing for Kate) since nothing ever
// removes it from the remote file.
async function crmSyncDeleteFromKate(taskId) {
  const token = (document.getElementById('crmGhToken')?.value || localStorage.getItem('suitability-crm-gh-token') || '').trim();
  if (!token) return;
  const REPO = 'nickolaiklimoff/suitability-letter';
  try {
    const getResp = await fetch(`https://api.github.com/repos/${REPO}/contents/${KATE_TASKS_PATH}`, {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' }
    });
    if (!getResp.ok) return;
    const d = await getResp.json();
    const remote = JSON.parse(decodeURIComponent(escape(atob(d.content))));
    const filtered = remote.filter(t => t.id !== taskId);
    if (filtered.length === remote.length) return; // nothing to remove
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(filtered, null, 2))));
    await fetch(`https://api.github.com/repos/${REPO}/contents/${KATE_TASKS_PATH}`, {
      method: 'PUT',
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `chore: remove deleted task from Kate's list`, content, sha: d.sha, branch: 'main' })
    });
  } catch (e) {
    console.error('crmSyncDeleteFromKate failed', e);
  }
}
window.crmLogContact = function() {
  const ref = crmDetailPersonRef; const bucket = crmGetBucket(ref); if (!bucket) return;
  const dateEl = document.getElementById('crmContactDate');
  const typeEl = document.getElementById('crmNewActType');
  const textEl = document.getElementById('crmNewActText');
  const nextDateEl = document.getElementById('crmNextDate');
  const nextTextEl = document.getElementById('crmNextText');

  const text = textEl.value.trim();
  const nextDate = nextDateEl.value;
  const nextText = nextTextEl.value.trim();

  if (!text && !nextDate && !nextText) return; // nothing to save

  if (text) {
    if (!bucket.activities) bucket.activities = [];
    bucket.activities.push({
      id: 'a_' + Date.now(),
      type: typeEl.value,
      text,
      date: dateEl.value ? new Date(dateEl.value).toISOString() : new Date().toISOString(),
    });
  }
  if (nextDate || nextText) {
    if (!bucket.tasks) bucket.tasks = [];
    bucket.tasks.push({ id: 't_' + Date.now(), text: nextText || 'Follow up', due: nextDate || null, done: false });
  }
  crmSaveBucket(ref);
  crmRenderDetail();
  crmRefreshActiveView();
};
window.crmSetStage = function(stage) {
  const ref = crmDetailPersonRef; if (!ref || ref.type !== 'prospect') return;
  prospects[ref.id].stage = stage;
  saveProspectsToStorage();
  crmRenderDetail();
  crmRefreshActiveView();
};
window.crmSetCompany = function(val) {
  const ref = crmDetailPersonRef; if (!ref || ref.type !== 'prospect') return;
  prospects[ref.id].company = val.trim();
  saveProspectsToStorage();
  crmRefreshActiveView();
};
window.crmSetProspectValue = function(val) {
  const ref = crmDetailPersonRef; if (!ref || ref.type !== 'prospect') return;
  prospects[ref.id].estValue = parseFloat(val) || null;
  saveProspectsToStorage();
  crmRefreshActiveView();
};

window.crmSetBirthday = function() {
  const ref = crmDetailPersonRef; const bucket = crmGetBucket(ref); if (!bucket) return;
  const d = parseInt(document.getElementById('crmBdayDay').value, 10);
  const m = parseInt(document.getElementById('crmBdayMonth').value, 10);
  bucket.birthday = (d && m) ? { day: d, month: m } : null; // no year stored — data minimisation
  crmSaveBucket(ref);
  crmRefreshActiveView();
};

window.crmSetInterests = function(val) {
  const ref = crmDetailPersonRef; const bucket = crmGetBucket(ref); if (!bucket) return;
  bucket.interests = val.trim();
  crmSaveBucket(ref);
};

window.crmAddOpportunity = function() {
  const ref = crmDetailPersonRef; const bucket = crmGetBucket(ref); if (!bucket) return;
  const typeEl = document.getElementById('crmOppType');
  const statusEl = document.getElementById('crmOppStatus');
  const noteEl = document.getElementById('crmOppNote');
  const nextDateEl = document.getElementById('crmOppNextDateNew');
  const estValueEl = document.getElementById('crmOppEstValue');
  const type = typeEl.value.trim();
  if (!type) { typeEl.style.borderColor = '#c62828'; typeEl.focus(); typeEl.placeholder = 'Type is required — e.g. New balances'; return; }
  typeEl.style.borderColor = '';
  if (!bucket.opportunities) bucket.opportunities = [];
  bucket.opportunities.push({ id: 'o_' + Date.now(), type, status: statusEl.value, note: noteEl.value.trim(), nextDate: nextDateEl.value || null, nextText: '', estValue: parseFloat(estValueEl.value) || null });
  crmSaveBucket(ref);
  crmRenderDetail();
  crmRefreshActiveView();
};
window.crmSetOpportunityValueDirect = function(clientId, oppId, val) {
  const c = clients[clientId]; if (!c?.crm) return;
  const o = (c.crm.opportunities || []).find(x => x.id === oppId); if (!o) return;
  o.estValue = parseFloat(val) || null;
  saveToStorage();
  crmRenderPipeline();
};
window.crmSetProspectValueDirect = function(prospectId, val) {
  const p = prospects[prospectId]; if (!p) return;
  p.estValue = parseFloat(val) || null;
  saveProspectsToStorage();
  crmRenderPipeline();
};
window.crmSetOpportunityValue = function(id, val) {
  const ref = crmDetailPersonRef; const bucket = crmGetBucket(ref); if (!bucket) return;
  const o = (bucket.opportunities || []).find(x => x.id === id); if (!o) return;
  o.estValue = parseFloat(val) || null;
  crmSaveBucket(ref);
  crmRefreshActiveView();
};
window.crmSetOpportunityStatus = function(id, status) {
  const ref = crmDetailPersonRef; const bucket = crmGetBucket(ref); if (!bucket) return;
  const o = (bucket.opportunities || []).find(x => x.id === id); if (!o) return;
  o.status = status;
  crmSaveBucket(ref);
  crmRefreshActiveView();
};
window.crmSetOpportunityNext = function(id) {
  const ref = crmDetailPersonRef; const bucket = crmGetBucket(ref); if (!bucket) return;
  const o = (bucket.opportunities || []).find(x => x.id === id); if (!o) return;
  const dateEl = document.getElementById('crmOppNextDate_' + id);
  const textEl = document.getElementById('crmOppNextText_' + id);
  o.nextDate = dateEl.value || null;
  o.nextText = textEl.value.trim();
  crmSaveBucket(ref);
  crmRenderDetail();
  crmRefreshActiveView();
};
window.crmAddFamily = function() {
  const ref = crmDetailPersonRef; const bucket = crmGetBucket(ref); if (!bucket) return;
  const relEl = document.getElementById('crmFamRelation');
  const nameEl = document.getElementById('crmFamName');
  const dayEl = document.getElementById('crmFamDay');
  const monthEl = document.getElementById('crmFamMonth');
  if (!bucket.family) bucket.family = [];
  bucket.family.push({
    id: 'f_' + Date.now(),
    relation: relEl.value,
    name: nameEl.value.trim(),
    day: parseInt(dayEl.value, 10) || null,
    month: parseInt(monthEl.value, 10) || null,
  });
  crmSaveBucket(ref);
  crmRenderDetail();
};
window.crmDeleteFamily = function(id) {
  const ref = crmDetailPersonRef; const bucket = crmGetBucket(ref); if (!bucket) return;
  bucket.family = (bucket.family || []).filter(x => x.id !== id);
  crmSaveBucket(ref);
  crmRenderDetail();
};
window.crmDeleteOpportunity = function(id) {
  const ref = crmDetailPersonRef; const bucket = crmGetBucket(ref); if (!bucket) return;
  bucket.opportunities = (bucket.opportunities || []).filter(x => x.id !== id);
  crmSaveBucket(ref);
  crmRenderDetail();
  crmRefreshActiveView();
};

// GDPR Art. 15 — right of access: export everything CRM-related held on this person.
// Manual, on-demand only. Sends ONLY the interests text to the API — never the
// person's name, birthday, or any other identifying field.
window.crmCheckNews = async function() {
  const ref = crmDetailPersonRef; const bucket = crmGetBucket(ref); if (!bucket) return;
  const interests = (bucket.interests || '').trim();
  if (!interests) return;
  const apiKey = (document.getElementById('apiKey')?.value || localStorage.getItem('suitability-api-key') || '').trim();
  const statusEl = document.getElementById('crmNewsStatus');
  if (!apiKey) { if (statusEl) statusEl.textContent = 'Set an API key in Settings first.'; return; }
  if (statusEl) statusEl.textContent = 'Searching...';

  const prompt = `You help prepare small talk / relationship-building talking points for a meeting with someone whose stated interests/plans are: "${interests}"
Search for genuinely recent, relevant news tied to these specific interests (e.g. a sports team's recent result, a notable development in a stated hobby or business area). Ignore anything generic or not clearly tied to what's listed.
Reply with 2-4 short bullet points, each one fact + a one-line "why it's useful to mention" note. If nothing relevant and recent is found, reply exactly: "No relevant recent news found."
Keep it under 100 words total.`;

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
        model: 'claude-sonnet-4-5',
        max_tokens: 700,
        messages: [{ role: 'user', content: prompt }],
        tools: [{ type: 'web_search_20250305', name: 'web_search' }]
      })
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message || 'API error');
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    bucket.newsCheck = { date: new Date().toISOString(), text: text || 'No relevant recent news found.' };
    crmSaveBucket(ref);
    if (statusEl) statusEl.textContent = '';
    crmRenderDetail();
  } catch (e) {
    console.error('crmCheckNews failed', e);
    if (statusEl) statusEl.textContent = 'Search failed: ' + e.message;
  }
};

window.crmExportPerson = function() {
  const ref = crmDetailPersonRef; const bucket = crmGetBucket(ref); if (!bucket) return;
  const name = crmGetName(ref);
  const record = {
    name,
    type: ref.type,
    company: ref.type === 'prospect' ? (prospects[ref.id].company || null) : null,
    stage: ref.type === 'prospect' ? (prospects[ref.id].stage || null) : null,
    birthday: bucket.birthday ? `${String(bucket.birthday.day).padStart(2,'0')}/${String(bucket.birthday.month).padStart(2,'0')} (no year stored)` : null,
    interests: bucket.interests || null,
    activities: bucket.activities || [],
    tasks: bucket.tasks || [],
    opportunities: bucket.opportunities || [],
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `crm-data-${name.replace(/[^a-z0-9]+/gi,'_')}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// GDPR Art. 17 — right to erasure: clears all CRM fields for this person. For an
// existing client this only clears the CRM bucket (activities/tasks/birthday/
// interests) — it does NOT touch their suitability letter / portfolio records,
// which are a separate processing activity with its own retention basis.
window.crmEraseCrmData = function() {
  const ref = crmDetailPersonRef; if (!ref) return;
  const name = crmGetName(ref);
  if (!confirm(`Erase all CRM data (activity log, tasks, birthday, interests) held on "${name}"? This cannot be undone.${ref.type === 'client' ? ' The client record itself and their portfolio/letter data are not affected.' : ' This will delete the prospect entirely.'}`)) return;
  if (ref.type === 'client') {
    if (clients[ref.id]) clients[ref.id].crm = { activities: [], tasks: [] };
    saveToStorage();
  } else {
    delete prospects[ref.id];
    saveProspectsToStorage();
  }
  crmCloseDetail();
  crmRefreshActiveView();
};


// ─── Rebalancing Tab ──────────────────────────────────────────────────────────
let _rbClassified = [];

function importFromPortfolioReport() {
  const pd = window._lastPortfolioData;
  if (!pd) {
    alert('No portfolio loaded. Go to Portfolio Report tab and load a portfolio file first.');
    return;
  }
  const allH = [...(pd.bonds||[]), ...(pd.funds||[]), ...(pd.stocks||[])];
  const filtered = allH.filter(h => Math.round(h.convertedHoldingValue || h.holdingValue || 0) > 0);

  // Cash + deposits: classified as Cash, risk rating 1
  const cashVal = Math.round(pd.cash || 0);
  let depositVal = 0;
  if (window._lastDepositData) {
    const dd = window._lastDepositData;
    const FX = window._liveEurUsd ? {USD:1,EUR:window._liveEurUsd,GBP:1.34,CHF:1.12} : {USD:1,EUR:1.16,GBP:1.34,CHF:1.12};
    const portFx = FX[pd.reportCcy || 'USD'] || 1;
    [...(dd.currentAccounts||[]),...(dd.timeDeposits||[])].forEach(r => {
      depositVal += r.amount * (FX[r.ccy]||1) / portFx;
    });
    depositVal = Math.round(depositVal);
  }
  const totalCash = cashVal + depositVal;

  if (!filtered.length && totalCash <= 0) { alert('Portfolio is empty.'); return; }

  const tbody = document.getElementById('l-existingRows');
  if (!tbody) return;
  tbody.innerHTML = '';

  filtered.forEach(h => {
    const val = Math.round(h.convertedHoldingValue || h.holdingValue || 0);
    // addExistingRow creates an empty row — then we fill the inputs
    addExistingRow();
    const rows = tbody.querySelectorAll('tr');
    const lastRow = rows[rows.length - 1];
    const inputs = lastRow.querySelectorAll('input');
    if (inputs[0]) inputs[0].value = h.isin || '';
    if (inputs[1]) inputs[1].value = h.name || '';
    if (inputs[2]) { inputs[2].value = val; inputs[2].dispatchEvent(new Event('input')); }
  });

  // Add Cash & Deposits row with risk rating 1
  if (totalCash > 0) {
    addExistingRow();
    const rows = tbody.querySelectorAll('tr');
    const lastRow = rows[rows.length - 1];
    const inputs = lastRow.querySelectorAll('input');
    if (inputs[0]) inputs[0].value = '';
    if (inputs[1]) inputs[1].value = 'Cash & Deposits';
    if (inputs[2]) { inputs[2].value = totalCash; inputs[2].dispatchEvent(new Event('input')); }
    if (inputs[3]) { inputs[3].value = 1; inputs[3].dispatchEvent(new Event('input')); }
  }

  const totalCount = filtered.length + (totalCash > 0 ? 1 : 0);
  const statusEl = document.getElementById('existingStatus');
  if (statusEl) statusEl.textContent = `✓ ${totalCount} holdings imported from Portfolio Report` + (totalCash > 0 ? ` (incl. Cash & Deposits: ${fmtUSD(totalCash)})` : '');
}

function importModelFromBasePortfolios() {
  const ir = clients[currentClientId]?.ir || 'IR3';
  // Try window._benchmark first, then localStorage
  let bpDef = (window._benchmark || {})[ir] || {};
  if (!bpDef.eq && !bpDef.equity) {
    try {
      const stored = localStorage.getItem('suitability-bp-data');
      if (stored) {
        const bp = JSON.parse(stored);
        const irKey = ir.toLowerCase().replace('-','');
        bpDef = {
          eq:   parseFloat(bp[irKey + 'eq'] || bp['ir3eq'] || 0),
          bd:   parseFloat(bp[irKey + 'bd'] || bp['ir3bd'] || 0),
          cash: parseFloat(bp[irKey + 'ca'] || bp['ir3ca'] || 0),
        };
        // Also load sector/segment data from _benchmark if available
        if (window._benchmark && window._benchmark[ir]) {
          bpDef = { ...bpDef, ...window._benchmark[ir] };
        }
      }
    } catch(e) {}
  }
  const W = { eq: bpDef.eq || bpDef.equity || 0, bd: bpDef.bd || bpDef.bond || 0, cash: bpDef.cash || 0 };

  if (!W.eq && !W.bd) {
    alert('Base Portfolios not loaded. Open Base Portfolios panel and click Save first.');
    return;
  }

  const nameEl = document.getElementById('l-modelName');
  if (nameEl && !nameEl.value) nameEl.value = `${ir} Model Portfolio`;

  const tbody = document.getElementById('l-modelRows');
  if (!tbody) return;
  tbody.innerHTML = '';

  const rows = [];
  const fmt = v => Math.round(v * 1000) / 10;

  // Top-level
  if (W.eq > 0)   rows.push({ label: 'Equities (total)', pct: fmt(W.eq) });

  // Equity sectors
  if (BP_SECTORS && W.eq > 0) {
    const wSum = BP_SECTORS.reduce((s,x) => s+x.w, 0);
    BP_SECTORS.forEach(s => {
      rows.push({ label: `  ${s.label}`, pct: fmt(W.eq * s.w / wSum) });
    });
  }

  if (W.bd > 0) rows.push({ label: 'Bonds (total)', pct: fmt(W.bd) });

  // Bond segments
  if (BP_BOND_SEGS && W.bd > 0) {
    const wSum = BP_BOND_SEGS.reduce((s,x) => s+x.w, 0);
    BP_BOND_SEGS.forEach(s => {
      rows.push({ label: `  ${s.label}`, pct: fmt(W.bd * s.w / wSum) });
    });
  }

  if (W.cash > 0) rows.push({ label: 'Cash', pct: fmt(W.cash) });

  rows.forEach(r => {
    addModelRow();
    const allRows = tbody.querySelectorAll('tr');
    const last = allRows[allRows.length - 1];
    const inputs = last.querySelectorAll('input');
    if (inputs[0]) inputs[0].value = r.label;
    if (inputs[1]) inputs[1].value = r.pct;
  });

  const statusEl = document.getElementById('importModelStatus');
  if (statusEl) statusEl.textContent = `✓ ${ir} — ${rows.length} lines loaded`;
}

function rbClassify(h) {
  const name = (h.name||'').toLowerCase();
  let sector = null, bondSeg = null;

  if (BP_SECTORS) {
    const SECTOR_KW = {
      'Info Tech':              ['information tech','info tech','technology'],
      'Financials':             ['financial'],
      'Health Care':            ['health care','healthcare'],
      'Consumer Discretionary': ['consumer discret','discretionary'],
      'Industrials':            ['industrial'],
      'Communication Services': ['communication serv','communication'],
      'Consumer Staples':       ['consumer staples','staples'],
      'Energy':                 ['energy'],
      'Materials':              ['materials'],
      'Utilities':              ['utilities','utility'],
      'Real Estate':            ['real estate','reit'],
    };
    for (const s of BP_SECTORS) {
      const kws = SECTOR_KW[s.label] || [s.label.toLowerCase().split(' ')[0]];
      if (kws.some(kw => name.includes(kw))) { sector = s.label; break; }
    }
  }

  // EM Debt must be checked FIRST — "EM Corporate Bond" would otherwise match Investment Grade
  if (name.includes('em debt') || name.includes('emerging market bond') || name.includes('em bond') || name.includes('em corporate bond') || name.includes('j.p. morgan em') || name.includes('jpmorgan em') || (name.includes('emerging') && name.includes('bond'))) bondSeg = 'EM Debt';
  else if (name.includes('gilt') || name.includes('gov') || name.includes('treasur') || name.includes('bund') || name.includes('sovereign')) bondSeg = 'Government';
  else if (name.includes('high yield') || name.includes(' hy ') || name.includes('hy bond') || name.includes('junk')) bondSeg = 'High Yield';
  else if (name.includes('corporate') || name.includes('ig corp') || name.includes('investment grade') || (name.includes('aggregate') && !name.includes('high yield'))) bondSeg = 'Investment Grade';

  const isBond = !!(bondSeg || h.maturityDate || (name.includes('bond') && !sector));
  const isEquity = !isBond && !!(sector || name.includes('equity') || name.includes('msci') || name.includes('acwi') || name.includes('world') || name.includes('s&p') || name.includes('stoxx') || name.includes('ftse'));
  const type = isBond ? 'bond' : isEquity ? 'equity' : 'other';
  return { ...h, type, sector, bondSeg };
}

function rbInit() {
  const pd = window._lastPortfolioData;
  const statusEl = document.getElementById('rb-portfolioStatus');
  const step2 = document.getElementById('rb-step2');
  const emptyEl = document.getElementById('rb-empty');
  const outputEl = document.getElementById('rb-output');

  if (!pd) {
    statusEl.textContent = 'No portfolio loaded — go to Portfolio Report tab and load a file first.';
    step2.style.display = 'none';
    emptyEl.style.display = 'block';
    return;
  }

  // Set IR selector to client's IR only on first load
  const clientIR = clients[currentClientId]?.ir || 'IR3';
  const sel = document.getElementById('rb-irSelect');
  if (sel && !sel._initialized) {
    sel.value = clientIR;
    sel._initialized = true;
    sel.addEventListener('change', () => { sel._initialized = true; });
  }

  const allH = [...(pd.funds||[]),...(pd.stocks||[]),...(pd.bonds||[])];
  _rbClassified = allH.map(rbClassify);

  const mode = document.querySelector('input[name="rbMode"]:checked')?.value || 'equity';
  const eqCount = _rbClassified.filter(h => h.type === 'equity').length;
  const bdCount = _rbClassified.filter(h => h.type === 'bond').length;
  statusEl.textContent = `✓ ${allH.length} holdings loaded (${eqCount} equity, ${bdCount} bonds)`;

  renderHoldingsList(mode);
  step2.style.display = 'block';
  emptyEl.style.display = 'none';
  outputEl.style.display = 'none';
}

// Auto-init when switching to rebalance tab
const _origSwitchTab = window.switchTab;

function renderHoldingsList(mode) {
  const typeLabel = { equity: '📈 Equity', bond: '📊 Bond', other: '💰 Other' };
  const typeOrder = { equity: 0, bond: 1, other: 2 };
  const sorted = [..._rbClassified].sort((a,b) => typeOrder[a.type] - typeOrder[b.type] || (a.name||'').localeCompare(b.name||''));

  let html = '<table style="width:100%;border-collapse:collapse;font-size:13px">';
  html += '<thead><tr style="background:var(--bg3);position:sticky;top:0;z-index:1">';
  html += '<th style="padding:7px 12px;text-align:left;font-weight:600">Holding</th>';
  html += '<th style="padding:7px 12px;text-align:left;font-weight:500;color:var(--text3)">Type · Segment</th>';
  html += '<th style="padding:7px 12px;text-align:right;font-weight:500;color:var(--text3)">Qty</th>';
  html += '<th style="padding:7px 12px;text-align:right;font-weight:500;color:var(--text3)">Price</th>';
  html += '<th style="padding:7px 12px;text-align:right;font-weight:500;color:var(--text3)">Value</th>';
  html += '<th style="padding:7px 12px;text-align:center;font-weight:500;color:var(--text3)">✓</th>';
  html += '</tr></thead><tbody>';

  sorted.forEach((h, idx) => {
    const segLabel = h.type === 'equity' ? (h.sector || '—') : h.type === 'bond' ? (h.bondSeg || '—') : 'Other';
    const typeColor = h.type === 'equity' ? '#2e7d52' : h.type === 'bond' ? '#1a5276' : 'var(--text3)';
    const bg = idx % 2 === 0 ? 'var(--bg2)' : 'transparent';
    const val = h.convertedHoldingValue || 0;
    // default checked: equity mode → only equity; full mode → equity+bond
    const defaultChecked = mode === 'equity' ? h.type === 'equity' : h.type !== 'other';
    const qty   = h.quantity || h.qty || 0;
    const price = val > 0 && qty > 0 ? val / qty : (h.price || h.lastPrice || 0);
    html += `<tr style="background:${bg}">
      <td style="padding:7px 12px">${h.name}</td>
      <td style="padding:7px 12px;font-size:12px;color:${typeColor}">${typeLabel[h.type]||''} · ${segLabel}</td>
      <td style="padding:7px 12px;text-align:right;font-size:12px">${qty ? qty.toLocaleString('en-US') : '—'}</td>
      <td style="padding:7px 12px;text-align:right;font-size:12px">${price ? price.toFixed(2) : '—'}</td>
      <td style="padding:7px 12px;text-align:right;font-size:12px">$${Math.round(val).toLocaleString('en-US')}</td>
      <td style="padding:7px 12px;text-align:center">
        <input type="checkbox" class="rb-check" data-name="${h.name.replace(/"/g,'&quot;')}" ${defaultChecked?'checked':''} style="width:15px;height:15px;cursor:pointer">
      </td>
    </tr>`;
  });
  html += '</tbody></table>';
  document.getElementById('rb-holdingsList').innerHTML = html;
}

function rbSelectAll(checked) {
  document.querySelectorAll('.rb-check').forEach(cb => cb.checked = checked);
}

function rbSelectByType(type) {
  document.querySelectorAll('.rb-check').forEach(cb => {
    const h = _rbClassified.find(h => h.name === cb.dataset.name);
    cb.checked = h?.type === type;
  });
}

function rbExportXlsx() {
  const trades = window._rbLastTrades || [];
  if (!trades.length) { alert('No trades to export. Calculate rebalancing first.'); return; }
  const XL = window.XLSX;
  if (!XL) { alert('Excel library not loaded'); return; }
  const wb = XL.utils.book_new();

  // Sheet 1: Allocation Before vs After
  const alloc = window._rbLastAllLines || [];
  const allocRows = [['Segment / Sector', 'Target %', 'Current %', 'Deviation before', 'Buy (USD)', 'Units to buy', 'After %', 'Deviation after']];
  alloc.forEach(r => {
    const fmt = v => parseFloat((v*100).toFixed(1));
    const fmtDev = v => parseFloat(((v||0)*100).toFixed(1));
    // Sum units from holdingTrades for this segment
    const trades = window._rbLastTrades || [];
    const segUnits = trades.filter(t => {
      const h = t.holding || t.h;
      const sec = h?.sector || '';
      const seg = h?.bondSeg || '';
      const key = h?.type === 'equity' ? sec : seg;
      return key === r.label && (t.qty || 0) > 0;
    }).reduce((s, t) => s + (t.qty || 0), 0);
    allocRows.push([r.label, fmt(r.tgtPct), fmt(r.curPct), fmtDev(r.curPct-r.tgtPct),
      Math.round(r.buyAmt||0), segUnits || '', fmt(r.afterPct||r.curPct), fmtDev(r.afterDev!==undefined?r.afterDev:(r.curPct-r.tgtPct))]);
  });
  const ws1 = XL.utils.aoa_to_sheet(allocRows);
  ws1['!cols'] = [{wch:30},{wch:10},{wch:10},{wch:16},{wch:12},{wch:14},{wch:10},{wch:14}];
  XL.utils.book_append_sheet(wb, ws1, 'Allocation');

  // Sheet 2: Buy Orders
  const buyRows = [['Holding', 'ISIN', 'Price per unit', 'Units to buy', 'Amount USD']];
  trades.forEach(t => {
    // Support both new format {holding, qty, spent, price} and legacy {h, buyAmt}
    const holding = t.holding || t.h;
    const qty     = t.qty !== undefined ? t.qty : (t.price > 0.01 ? Math.floor((t.buyAmt||0) / t.price) : 0);
    const price   = t.price || (holding?.quantity > 0 ? (holding.convertedHoldingValue||0)/holding.quantity : 0);
    const amount  = Math.round(qty * price);
    if (qty > 0 && amount > 0) buyRows.push([holding?.name||'', holding?.isin||'', parseFloat(price.toFixed(2)), qty, amount]);
  });
  const ws2 = XL.utils.aoa_to_sheet(buyRows);
  ws2['!cols'] = [{wch:50},{wch:16},{wch:14},{wch:14},{wch:14}];
  XL.utils.book_append_sheet(wb, ws2, 'Buy Orders');

  // Sheet 3: Portfolio After
  const afterData = window._rbLastAfterRows || [];
  const afterRows = [['Holding', 'Qty now', 'Qty after', 'Price', 'Value after', '% before', '% after', 'Target %', 'Deviation after']];
  afterData.forEach(r => {
    afterRows.push([r.name, r.qtyNow, r.qtyAfter, r.price,
      r.newVal, parseFloat((r.beforePct*100).toFixed(1)),
      parseFloat((r.newPct*100).toFixed(1)),
      r.tgtPct!==null?parseFloat((r.tgtPct*100).toFixed(1)):'',
      r.dev!==null?parseFloat((r.dev*100).toFixed(1)):''
    ]);
  });
  const ws3 = XL.utils.aoa_to_sheet(afterRows);
  ws3['!cols'] = [{wch:50},{wch:10},{wch:10},{wch:10},{wch:14},{wch:10},{wch:10},{wch:10},{wch:16}];
  XL.utils.book_append_sheet(wb, ws3, 'Portfolio After');

  const clientName = (clients[currentClientId]?.name||'client').replace(/\s+/g,'_');
  const date = new Date().toISOString().slice(0,10);
  try {
    const wbout = XL.write(wb, {bookType:'xlsx', type:'array'});
    const blob = new Blob([wbout], {type:'application/octet-stream'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href=url; a.download=`rebalance_${clientName}_${date}.xlsx`;
    document.body.appendChild(a); a.click();
    setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url);},1000);
  } catch(e) { alert('Export failed: '+e.message); }
}

function rbSendToLetter() {
  const trades = window._rbLastTrades || [];
  if (!trades.length) { alert('No trades to send. Calculate rebalancing first.'); return; }
  const rows = [];
  trades.forEach(t => {
    // Support both new format {holding, qty, spent, price} and legacy {h, buyAmt}
    const holding = t.holding || t.h;
    const qty     = t.qty !== undefined ? t.qty : (t.price > 0.01 ? Math.floor((t.buyAmt||0) / t.price) : 0);
    const price   = t.price || (holding?.quantity > 0 ? (holding.convertedHoldingValue||0)/holding.quantity : 0);
    const amount  = Math.round(qty * price);
    if (qty > 0 && amount > 0) rows.push({ name: holding?.name||'', isin: holding?.isin||'', amount });
  });
  if (!rows.length) { alert('No valid trades to send.'); return; }
  const letterBtn = document.querySelector('.tab[onclick*="letter"]');
  switchTab('letter', letterBtn);
  setTimeout(() => {
    const tbody = document.getElementById('l-investRows');
    if (!tbody) { alert('Could not find investment rows.'); return; }
    tbody.innerHTML = '';
    rows.forEach(r => addInvestRow(r.name, r.isin, r.amount));
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:2rem;right:2rem;background:#2e7d52;color:#fff;padding:1rem 1.5rem;border-radius:8px;font-size:13px;z-index:9999';
    toast.textContent = `✓ ${rows.length} trades added to Suitability Letter`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }, 400);
}


function runRebalance() {
  if (!_rbClassified.length) return;

  const selected = new Set([...document.querySelectorAll('.rb-check:checked')].map(cb => cb.dataset.name));
  const subset   = _rbClassified.filter(h => selected.has(h.name));
  if (!subset.length) return;

  const ir    = document.getElementById('rb-irSelect')?.value || 'IR3';
  const bpDef = (window._benchmark || {})[ir] || {};
  const W = {
    eq:   bpDef.eq   || bpDef.equity || 0.515,
    bd:   bpDef.bd   || bpDef.bond   || 0.475,
  };

  const addCash    = parseFloat(document.getElementById('rb-addCash')?.value) || 0;
  const mode       = document.querySelector('input[name="rbMode"]:checked')?.value || 'equity';
  const subsetVal  = subset.reduce((s,h) => s + (h.convertedHoldingValue||0), 0);
  const totalAfter = subsetVal + addCash;
  let holdingTrades = [];

  const eqHoldings = subset.filter(h => h.type === 'equity');
  const bdHoldings = subset.filter(h => h.type === 'bond');
  const eqValue    = eqHoldings.reduce((s,h) => s + (h.convertedHoldingValue||0), 0);
  const bdValue    = bdHoldings.reduce((s,h) => s + (h.convertedHoldingValue||0), 0);

  const fmtPctAbs = v => (v*100).toFixed(1) + '%';
  const fmtDev    = v => (v >= 0 ? '+' : '') + (v*100).toFixed(1) + 'pp';
  const fmtUSDabs = v => '$' + Math.round(Math.abs(v)).toLocaleString('en-US');
  const devCol    = d => Math.abs(d) < 0.005 ? 'var(--text2)' : d > 0 ? '#c0392b' : '#2e7d52';

  const h3  = t => `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text3);margin:1.5rem 0 0.5rem">${t}</div>`;
  const thRow = cols => `<thead><tr style="background:#2d5a3d;color:#ffffff">${cols.map((c,i)=>`<th style="padding:8px 12px;text-align:${i===0?'left':'right'};font-weight:700;font-size:12px;letter-spacing:0.03em;color:#ffffff !important;white-space:nowrap">${c}</th>`).join('')}</tr></thead>`;
  const tdRow = (cells, idx) => {
    const bg = idx%2===0 ? 'background:var(--bg2)' : '';
    return `<tr style="${bg}">${cells.map((c,i)=>`<td style="padding:7px 12px;text-align:${i===0?'left':'right'}">${c}</td>`).join('')}</tr>`;
  };
  const tbl = (cols, rows) => `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:0.25rem"><${thRow(cols)}<tbody>${rows}</tbody></table>`;

  let html = '';

  // ── Summary header ────────────────────────────────────────────────────────
  // Will be updated after effectiveBudget is known
  // Note: summary blocks (overweight warning, min budget, after-investing) are
  // appended directly via html += inside each mode branch below.

  if (mode === 'full') {
    // ── Full allocation: buy-only rebalance vs IR benchmark ───────────────────
    const bm = (window._benchmark||{})[ir] || {};
    const wSum   = BP_SECTORS   ? BP_SECTORS.reduce((s,x)=>s+x.w,0)   : 1;
    const wBdSum = BP_BOND_SEGS ? BP_BOND_SEGS.reduce((s,x)=>s+x.w,0) : 1;

    // Build allLines: one row per equity sector + one per bond segment
    const allLines = [];
    const sectorMap = {}, segMap = {};
    subset.forEach(h => {
      const sec = h.sector || '';
      const seg = h.bondSeg || '';
      if (h.type === 'equity') { (sectorMap[sec]||(sectorMap[sec]=[])).push(h); }
      else                     { (segMap[seg]  ||(segMap[seg]  =[])).push(h); }
    });

    const portfolioTotal = subsetVal;  // base for current weights

    if (BP_SECTORS) BP_SECTORS.forEach(s => {
      const tgtPct = bm.sectors?.[s.label] !== undefined ? bm.sectors[s.label] : W.eq*(s.w/wSum);
      const hh     = sectorMap[s.label] || [];
      const curVal = hh.reduce((a,h)=>a+(h.convertedHoldingValue||0),0);
      const curPct = portfolioTotal > 0 ? curVal / portfolioTotal : 0;
      allLines.push({ label:s.label, group:'equity', tgtPct, curPct, curVal, holdings:hh });
    });
    if (BP_BOND_SEGS) BP_BOND_SEGS.forEach(s => {
      const tgtPct = bm.bondSegments?.[s.label] !== undefined ? bm.bondSegments[s.label] : W.bd*(s.w/wBdSum);
      const hh     = segMap[s.label] || [];
      const curVal = hh.reduce((a,h)=>a+(h.convertedHoldingValue||0),0);
      const curPct = portfolioTotal > 0 ? curVal / portfolioTotal : 0;
      allLines.push({ label:s.label, group:'bond',   tgtPct, curPct, curVal, holdings:hh });
    });

    // ── Determine underweight / overweight ────────────────────────────────────
    // Underweight: curPct < tgtPct  (buy-only; no threshold — match xlsx logic)
    const underLines = allLines.filter(r => r.curPct < r.tgtPct);
    const overLines  = allLines.filter(r => r.curPct >= r.tgtPct);

    // Overweight warning (informational only)
    const overweightItems = allLines.filter(r => r.curPct > r.tgtPct + 0.005);  // >0.5pp visual threshold
    if (overweightItems.length) {
      html += `<div style="font-size:12px;color:#856404;background:#fff3cd;border-radius:6px;padding:8px 12px;margin-bottom:0.75rem">
        ⚠️ Overweight (buy-only mode, no action): ${overweightItems.map(r=>`${r.label} (+${((r.curPct-r.tgtPct)*100).toFixed(1)}pp)`).join(', ')}
      </div>`;
    }

    // ── Compute buy amounts ─────────────────────────────────────────────────────────────────────────────────
    let effectiveBudget = addCash;

    if (addCash === 0) {
      // Mode 1: Minimum budget - analytical formula
      // new_total = sum(overweight curVal) / (sum of ALL tgtPct - sum(underweight tgtPct))
      // NOTE: tgtPct here are absolute % of the whole portfolio (equity+bonds+cash),
      // so they do NOT sum to 100% across allLines — cash's share (e.g. ~1% for IR3)
      // is never in allLines at all. Using a hardcoded "1" as the full-portfolio
      // base here was UNDER-funding the minimum budget, leaving real residual
      // deviations even after spending 100% of the (too-small) suggested amount.
      const totalTgtSum = allLines.reduce((s,r)=>s+r.tgtPct, 0);
      const overVal  = allLines.filter(r => r.curPct >= r.tgtPct).reduce((s,r)=>s+r.curVal, 0);
      const underTgt = allLines.filter(r => r.curPct <  r.tgtPct).reduce((s,r)=>s+r.tgtPct, 0);
      const denom    = totalTgtSum - underTgt;
      const newTotalM1 = denom > 0.001 ? overVal / denom : portfolioTotal;
      effectiveBudget  = Math.max(0, newTotalM1 - portfolioTotal);
      html += `<div style="font-size:12px;color:#1a5276;background:#eaf4fb;border-radius:6px;padding:8px 12px;margin-bottom:0.75rem">
        💡 Minimum budget to bring all underweight positions to target: <strong>${fmtUSDabs(Math.round(effectiveBudget))}</strong>
      </div>`;
    }

    // KEY: deficit = tgtPct * newTotal - curVal  (newTotal = current + budget)
    const newTotal = portfolioTotal + effectiveBudget;
    allLines.forEach(r => {
      r.targetVal = r.tgtPct * newTotal;
      r.deficit   = Math.max(0, r.targetVal - r.curVal);
    });
    const underLines2  = allLines.filter(r => r.deficit > 0.01);
    const totalDeficit = underLines2.reduce((s,r)=>s+r.deficit, 0);

    holdingTrades.length = 0;
    let totalSpent = 0;
    allLines.forEach(r => { r.buyAmt = 0; });

    if (totalDeficit > 0.01 && effectiveBudget > 0) {
      const budgetSufficient = effectiveBudget >= totalDeficit;
      underLines2.forEach(r => {
        const lineAlloc = budgetSufficient ? r.deficit : (r.deficit / totalDeficit) * effectiveBudget;
        r.buyAmt = lineAlloc;
        r.holdings.forEach(h => {
          const qty_now = h.quantity || 0;
          const price = qty_now > 0 ? (h.convertedHoldingValue||0) / qty_now : (h.price || h.lastPrice || 0);
          if (price <= 0) return;
          const hShare = r.curVal > 0 ? (h.convertedHoldingValue||0) / r.curVal : 1 / Math.max(r.holdings.length, 1);
          const hAlloc = lineAlloc * hShare;
          const qty    = Math.floor(hAlloc / price);
          const spent  = qty * price;
          holdingTrades.push({ holding:h, qty, spent, price, alloc:hAlloc });
          totalSpent += spent;
        });
      });
      // Greedy remainder: sort by fractional leftover (alloc mod price) descending
      holdingTrades
        .filter(t => t.price > 0)
        .sort((a,b) => (b.alloc % b.price) - (a.alloc % a.price))
        .forEach(t => {
          if (effectiveBudget - totalSpent >= t.price) {
            t.qty += 1; t.spent += t.price; totalSpent += t.price;
          }
        });
    }

    // Recalc actual new total after flooring
    const actualNewTotal = portfolioTotal + totalSpent;

    // Map buyAmt back to allLines from holdingTrades
    allLines.forEach(r => { r.buyAmt = 0; r.sharesToBuy = 0; });
    holdingTrades.forEach(t => {
      const sec = t.holding.sector || '';
      const seg = t.holding.bondSeg || '';
      const key = t.holding.type === 'equity' ? sec : seg;
      const line = allLines.find(r => r.label === key);
      if (line) { line.buyAmt += t.spent; line.sharesToBuy = (line.sharesToBuy||0) + t.qty; }
    });

    // afterPct based on actual new total
    allLines.forEach(r => {
      r.afterVal = r.curVal + r.buyAmt;
      r.afterPct = actualNewTotal > 0 ? r.afterVal / actualNewTotal : 0;
      r.afterDev = r.afterPct - r.tgtPct;
      r.curPctDisplay = portfolioTotal > 0 ? r.curVal / portfolioTotal : 0;
    });

    // Summary
    const improved = allLines.filter(r => r.buyAmt >= 1).length;
    const unchanged = allLines.filter(r => r.buyAmt < 1).length;
    html += `<div style="font-size:13px;color:var(--text2);background:var(--bg2);border-radius:6px;padding:10px 14px;margin-bottom:1rem">
      After investing <strong>${fmtUSDabs(Math.round(totalSpent))}</strong> (unspent: ${fmtUSDabs(Math.round(effectiveBudget - totalSpent))}):
      <span style="color:#2e7d52;font-weight:600">${improved} positions buying</span> ·
      <span style="color:var(--text3)">${unchanged} positions unchanged (overweight or at target)</span>
    </div>`;

    // ── Table 1: Allocation ───────────────────────────────────────────────────
    html += `<h4 style="margin:0 0 0.5rem;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text3)">FULL ALLOCATION VS IR${ir} BENCHMARK</h4>`;
    let rows = '', lastGroup = '';
    const fmtPctAbs = v => (v*100).toFixed(1)+'%';
    const fmtDev    = v => (v >= 0 ? '+' : '') + (v*100).toFixed(1) + 'pp';
    const devCol    = v => Math.abs(v) < 0.005 ? '#2e7d52' : v > 0 ? '#c0392b' : '#c0392b';
    allLines.forEach((r,i) => {
      if (r.group !== lastGroup) {
        rows += `<tr style="background:var(--bg3)"><td colspan="7" style="padding:6px 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text3)">${r.group==='equity'?'Equity Sectors':'Bond Segments'}</td></tr>`;
        lastGroup = r.group;
      }
      const dev = r.curPct - r.tgtPct;
      const hasBuy = r.buyAmt >= 1;
      const afterColor = Math.abs(r.afterDev) < 0.005 ? '#2e7d52' : devCol(r.afterDev);
      rows += tdRow([
        r.label,
        fmtPctAbs(r.tgtPct),
        fmtPctAbs(r.curPct),
        `<span style="color:${devCol(dev)}">${fmtDev(dev)}</span>`,
        hasBuy ? `<span style="color:#2e7d52;font-weight:600">+${fmtUSDabs(Math.round(r.buyAmt))}</span>` : '—',
        hasBuy ? `<span style="color:${afterColor};font-weight:600">${fmtPctAbs(r.afterPct)} ↑</span>` : `<span style="color:var(--text3)">${fmtPctAbs(r.curPct)}</span>`,
        hasBuy ? `<span style="color:${afterColor}">${fmtDev(r.afterDev)}</span>` : `<span style="color:${devCol(dev)}">${fmtDev(dev)}</span>`
      ], i);
    });
    const totalBuy = allLines.reduce((s,r)=>s+r.buyAmt,0);
    const sumDevBefore = allLines.reduce((s,r) => s + Math.abs(r.curPct - r.tgtPct), 0);
    const sumDevAfter  = allLines.reduce((s,r) => s + Math.abs(r.afterDev !== undefined ? r.afterDev : (r.curPct - r.tgtPct)), 0);
    const devImprove   = sumDevBefore > 0 ? Math.round((1 - sumDevAfter/sumDevBefore)*100) : 0;
    rows += `<tr style="border-top:2px solid var(--border);font-weight:700">
      <td style="padding:8px 12px">Total</td>
      <td></td><td></td>
      <td style="padding:8px 12px;text-align:right;color:#c0392b">±${(sumDevBefore*100).toFixed(1)}pp</td>
      <td style="padding:8px 12px;text-align:right;color:#2e7d52">+${fmtUSDabs(Math.round(totalSpent))}</td>
      <td></td>
      <td style="padding:8px 12px;text-align:right;color:#2e7d52">±${(sumDevAfter*100).toFixed(1)}pp <span style="font-size:11px;color:#2e7d52">(−${devImprove}%)</span></td>
    </tr>`;
    html += tbl(['Segment / Sector','Target','Current','Dev. before','Buy','After %','Dev. after'], rows);

    // ── Table 2: Buy Orders ───────────────────────────────────────────────────
    const activeTrades = holdingTrades.filter(t => t.qty > 0);
    if (activeTrades.length) {
      html += `<h4 style="margin:1.5rem 0 0.5rem;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text3)">BUY ORDERS</h4>`;
      let brows = '';
      activeTrades.forEach((t,i) => {
        brows += tdRow([
          `<span style="font-weight:600">${t.holding.fundName||t.holding.name||''}</span>`,
          fmtUSDabs(t.price),
          `${t.qty} units`,
          `<span style="color:#2e7d52;font-weight:600">+${fmtUSDabs(Math.round(t.spent))}</span>`
        ], i);
      });
      brows += `<tr style="border-top:2px solid var(--border);font-weight:700"><td style="padding:8px 12px">Total buys</td><td></td><td></td><td style="padding:8px 12px;text-align:right;color:#2e7d52">+${fmtUSDabs(Math.round(totalSpent))}</td></tr>`;
      html += tbl(['Holding','Price per unit','Units to buy','Amount'], brows);
    }

    // ── Table 3: Portfolio after rebalancing ──────────────────────────────────
    html += `<h4 style="margin:1.5rem 0 0.5rem;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text3)">PORTFOLIO AFTER REBALANCING</h4>`;
    let prows = '';
    const afterRowsData = [];
    const tradeMap = {};
    holdingTrades.forEach(t => {
      const id = t.holding.isin || t.holding.fundName || t.holding.name;
      if (!tradeMap[id]) tradeMap[id] = { qty:0, spent:0 };
      tradeMap[id].qty   += t.qty;
      tradeMap[id].spent += t.spent;
    });
    subset.forEach((h,i) => {
      const id  = h.isin || h.fundName || h.name;
      const tr  = tradeMap[id] || { qty:0, spent:0 };
      const qtyNow   = h.quantity || h.qty || 0;
      const qtyAfter = qtyNow + tr.qty;
      const price    = qtyNow > 0 ? (h.convertedHoldingValue||0) / qtyNow : (h.price || h.lastPrice || 0);
      const valAfter = qtyAfter * price;
      const newPct   = actualNewTotal > 0 ? valAfter / actualNewTotal : 0;
      const beforePct = subsetVal > 0 ? (h.convertedHoldingValue||0) / subsetVal : 0;
      // Find target for this holding
      const sec = h.sector || '';
      const seg = h.bondSeg || '';
      const key = h.type === 'equity' ? sec : seg;
      const line = allLines.find(r => r.label === key);
      const nH   = line ? Math.max(line.holdings.length,1) : 1;
      const tgtPct = line ? line.tgtPct / nH : null;
      const dev  = tgtPct !== null ? newPct - tgtPct : null;
      afterRowsData.push({ name: h.fundName||h.name||'', qtyNow, qtyAfter, price: parseFloat(price.toFixed(2)), newVal: Math.round(valAfter), beforePct, newPct, tgtPct, dev });
      prows += tdRow([
        `<span style="font-weight:600">${h.fundName||h.name||''}</span>`,
        qtyNow, qtyAfter,
        fmtUSDabs(price),
        fmtUSDabs(Math.round(valAfter)),
        fmtPctAbs(newPct),
        tgtPct !== null ? fmtPctAbs(tgtPct) : '—',
        dev !== null ? `<span style="color:${devCol(dev)}">${fmtDev(dev)}</span>` : '—'
      ], i);
    });
    window._rbLastAfterRows = afterRowsData;
    prows += `<tr style="border-top:2px solid var(--border);font-weight:700"><td style="padding:8px 12px">Total</td><td></td><td></td><td></td><td style="padding:8px 12px;text-align:right">${fmtUSDabs(Math.round(actualNewTotal))}</td><td style="padding:8px 12px;text-align:right">100%</td><td></td><td></td></tr>`;
    html += tbl(['Holding','Qty now','Qty after','Price','Value after','% after','Target %','Deviation'], prows);

    window._rbLastAllLines = allLines;  // save for Excel export
  } else {
    // ── Equity sleeve only: buy-only rebalance of equity sectors vs IR benchmark ──
    const bm = (window._benchmark||{})[ir] || {};
    const wSum = BP_SECTORS ? BP_SECTORS.reduce((s,x)=>s+x.w,0) : 1;

    const allLines = [];
    const sectorMap = {};
    eqHoldings.forEach(h => {
      const sec = h.sector || '';
      (sectorMap[sec]||(sectorMap[sec]=[])).push(h);
    });

    const sleeveTotal = eqValue;  // base for current weights = equity sleeve only
    if (BP_SECTORS) BP_SECTORS.forEach(s => {
      // Within equity sleeve, target % = sector weight normalized to 100% of equity
      const tgtPct = (bm.sectors?.[s.label] !== undefined ? bm.sectors[s.label] : W.eq*(s.w/wSum)) / (W.eq || 0.515);
      const hh     = sectorMap[s.label] || [];
      const curVal = hh.reduce((a,h)=>a+(h.convertedHoldingValue||0),0);
      const curPct = sleeveTotal > 0 ? curVal / sleeveTotal : 0;
      allLines.push({ label:s.label, tgtPct, curPct, curVal, holdings:hh });
    });

    const overweightItems = allLines.filter(r => r.curPct > r.tgtPct + 0.005);
    if (overweightItems.length) {
      html += `<div style="font-size:12px;color:#856404;background:#fff3cd;border-radius:6px;padding:8px 12px;margin-bottom:0.75rem">
        ⚠️ Overweight (buy-only mode, no action): ${overweightItems.map(r=>`${r.label} (+${((r.curPct-r.tgtPct)*100).toFixed(1)}pp)`).join(', ')}
      </div>`;
    }

    let effectiveBudget = addCash;
    if (addCash === 0) {
      const underLines0 = allLines.filter(r => r.curPct < r.tgtPct);
      const overLines0  = allLines.filter(r => r.curPct >= r.tgtPct);
      const overVal  = overLines0.reduce((s,r)=>s+r.curVal, 0);
      const underTgt = underLines0.reduce((s,r)=>s+r.tgtPct, 0);
      const denom    = 1 - underTgt;
      const newTotalM1 = denom > 0.001 ? overVal / denom : sleeveTotal;
      effectiveBudget  = Math.max(0, newTotalM1 - sleeveTotal);
      html += `<div style="font-size:12px;color:#1a5276;background:#eaf4fb;border-radius:6px;padding:8px 12px;margin-bottom:0.75rem">
        💡 Minimum budget to bring all underweight equity sectors to target: <strong>${fmtUSDabs(Math.round(effectiveBudget))}</strong>
      </div>`;
    }

    const newTotal = sleeveTotal + effectiveBudget;
    allLines.forEach(r => {
      r.targetVal = r.tgtPct * newTotal;
      r.deficit   = Math.max(0, r.targetVal - r.curVal);
    });
    const underLines2  = allLines.filter(r => r.deficit > 0.01);
    const totalDeficit = underLines2.reduce((s,r)=>s+r.deficit, 0);

    holdingTrades = [];
    let totalSpent = 0;
    allLines.forEach(r => { r.buyAmt = 0; });

    if (totalDeficit > 0.01 && effectiveBudget > 0) {
      const budgetSufficient = effectiveBudget >= totalDeficit;
      underLines2.forEach(r => {
        const lineAlloc = budgetSufficient ? r.deficit : (r.deficit / totalDeficit) * effectiveBudget;
        r.holdings.forEach(h => {
          const qty_now = h.quantity || 0;
          const price = qty_now > 0 ? (h.convertedHoldingValue||0) / qty_now : (h.price || h.lastPrice || 0);
          if (price <= 0) return;
          const hShare = r.curVal > 0 ? (h.convertedHoldingValue||0) / r.curVal : 1 / Math.max(r.holdings.length, 1);
          const hAlloc = lineAlloc * hShare;
          const qty    = Math.floor(hAlloc / price);
          const spent  = qty * price;
          holdingTrades.push({ holding:h, qty, spent, price, alloc:hAlloc, row:r });
          totalSpent += spent;
        });
      });
      holdingTrades
        .filter(t => t.price > 0)
        .sort((a,b) => (b.alloc % b.price) - (a.alloc % a.price))
        .forEach(t => {
          if (effectiveBudget - totalSpent >= t.price) {
            t.qty += 1; t.spent += t.price; totalSpent += t.price;
          }
        });
      // Use actual (post-rounding) spend per row — not the pre-rounding planned
      // allocation — so the displayed Buy $ and the After% figures reconcile
      // with actualNewTotal instead of drifting apart (After column previously
      // didn't sum to 100%, since numerators used planned $ but the total used
      // actual spend).
      holdingTrades.forEach(t => { t.row.buyAmt += t.spent; });
    }

    const actualNewTotal = sleeveTotal + totalSpent;
    allLines.forEach(r => {
      r.afterVal = r.curVal + r.buyAmt;
      r.afterPct = actualNewTotal > 0 ? r.afterVal / actualNewTotal : 0;
      r.afterDev = r.afterPct - r.tgtPct;
    });

    const improved = allLines.filter(r => r.buyAmt >= 1).length;
    const unchanged = allLines.filter(r => r.buyAmt < 1).length;
    html += `<div style="font-size:13px;color:var(--text2);background:var(--bg2);border-radius:6px;padding:10px 14px;margin-bottom:1rem">
      After investing <strong>${fmtUSDabs(Math.round(totalSpent))}</strong> (unspent: ${fmtUSDabs(Math.round(effectiveBudget - totalSpent))}):
      <span style="color:#2e7d52;font-weight:600">${improved} sectors buying</span> ·
      <span style="color:var(--text3)">${unchanged} sectors unchanged (overweight or at target)</span>
    </div>`;

    html += `<h4 style="margin:0 0 0.5rem;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text3)">EQUITY SLEEVE VS IR${ir} BENCHMARK</h4>`;
    let rows = '';
    const fmtPctAbs2 = v => (v*100).toFixed(1)+'%';
    allLines.forEach((r,i) => {
      const dev = r.curPct - r.tgtPct;
      const hasBuy = r.buyAmt >= 1;
      const afterColor = Math.abs(r.afterDev) < 0.005 ? '#2e7d52' : devCol(r.afterDev);
      rows += tdRow([
        r.label,
        fmtPctAbs2(r.tgtPct),
        fmtPctAbs2(r.curPct),
        `<span style="color:${devCol(dev)}">${fmtDev(dev)}</span>`,
        hasBuy ? `<span style="color:#2e7d52;font-weight:600">+${fmtUSDabs(Math.round(r.buyAmt))}</span>` : '—',
        hasBuy ? `<span style="color:${afterColor};font-weight:600">${fmtPctAbs2(r.afterPct)} ↑</span>` : `<span style="color:var(--text3)">${fmtPctAbs2(r.curPct)}</span>`,
        hasBuy ? `<span style="color:${afterColor}">${fmtDev(r.afterDev)}</span>` : `<span style="color:${devCol(dev)}">${fmtDev(dev)}</span>`
      ], i);
    });
    const sumDevBefore = allLines.reduce((s,r) => s + Math.abs(r.curPct - r.tgtPct), 0);
    const sumDevAfter  = allLines.reduce((s,r) => s + Math.abs(r.afterDev !== undefined ? r.afterDev : (r.curPct - r.tgtPct)), 0);
    const devImprove   = sumDevBefore > 0 ? Math.round((1 - sumDevAfter/sumDevBefore)*100) : 0;
    rows += `<tr style="border-top:2px solid var(--border);font-weight:700">
      <td style="padding:8px 12px">Total</td>
      <td></td><td></td>
      <td style="padding:8px 12px;text-align:right;color:#c0392b">±${(sumDevBefore*100).toFixed(1)}pp</td>
      <td style="padding:8px 12px;text-align:right;color:#2e7d52">+${fmtUSDabs(Math.round(totalSpent))}</td>
      <td></td>
      <td style="padding:8px 12px;text-align:right;color:#2e7d52">±${(sumDevAfter*100).toFixed(1)}pp <span style="font-size:11px;color:#2e7d52">(−${devImprove}%)</span></td>
    </tr>`;
    html += tbl(['Equity Sector','Target','Current','Dev. before','Buy','After %','Dev. after'], rows);

    const activeTrades = holdingTrades.filter(t => t.qty > 0);
    if (activeTrades.length) {
      html += `<h4 style="margin:1.5rem 0 0.5rem;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text3)">BUY ORDERS</h4>`;
      let brows = '';
      activeTrades.forEach((t,i) => {
        brows += tdRow([
          `<span style="font-weight:600">${t.holding.fundName||t.holding.name||''}</span>`,
          fmtUSDabs(t.price), `${t.qty} units`,
          `<span style="color:#2e7d52;font-weight:600">+${fmtUSDabs(Math.round(t.spent))}</span>`
        ], i);
      });
      brows += `<tr style="border-top:2px solid var(--border);font-weight:700"><td style="padding:8px 12px">Total buys</td><td></td><td></td><td style="padding:8px 12px;text-align:right;color:#2e7d52">+${fmtUSDabs(Math.round(totalSpent))}</td></tr>`;
      html += tbl(['Holding','Price per unit','Units to buy','Amount'], brows);
    }

    // ── Table 3: Equity portfolio after rebalancing ───────────────────────────
    html += `<h4 style="margin:1.5rem 0 0.5rem;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text3)">EQUITY PORTFOLIO AFTER REBALANCING</h4>`;
    let prows = '';
    const afterRowsData = [];
    const tradeMap = {};
    holdingTrades.forEach(t => {
      const id = t.holding.isin || t.holding.fundName || t.holding.name;
      if (!tradeMap[id]) tradeMap[id] = { qty:0, spent:0 };
      tradeMap[id].qty   += t.qty;
      tradeMap[id].spent += t.spent;
    });
    eqHoldings.forEach((h,i) => {
      const id  = h.isin || h.fundName || h.name;
      const tr  = tradeMap[id] || { qty:0, spent:0 };
      const qtyNow   = h.quantity || h.qty || 0;
      const qtyAfter = qtyNow + tr.qty;
      const price    = qtyNow > 0 ? (h.convertedHoldingValue||0) / qtyNow : (h.price || h.lastPrice || 0);
      const valAfter = qtyAfter * price;
      const newPct   = actualNewTotal > 0 ? valAfter / actualNewTotal : 0;
      const beforePct = sleeveTotal > 0 ? (h.convertedHoldingValue||0) / sleeveTotal : 0;
      const sec = h.sector || '';
      const line = allLines.find(r => r.label === sec);
      const nH   = line ? Math.max(line.holdings.length,1) : 1;
      const tgtPct = line ? line.tgtPct / nH : null;
      const dev  = tgtPct !== null ? newPct - tgtPct : null;
      afterRowsData.push({ name: h.fundName||h.name||'', qtyNow, qtyAfter, price: parseFloat(price.toFixed(2)), newVal: Math.round(valAfter), beforePct, newPct, tgtPct, dev });
      prows += tdRow([
        `<span style="font-weight:600">${h.fundName||h.name||''}</span>`,
        qtyNow, qtyAfter,
        fmtUSDabs(price),
        fmtUSDabs(Math.round(valAfter)),
        fmtPctAbs2(newPct),
        tgtPct !== null ? fmtPctAbs2(tgtPct) : '—',
        dev !== null ? `<span style="color:${devCol(dev)}">${fmtDev(dev)}</span>` : '—'
      ], i);
    });
    window._rbLastAfterRows = afterRowsData;
    prows += `<tr style="border-top:2px solid var(--border);font-weight:700"><td style="padding:8px 12px">Total</td><td></td><td></td><td></td><td style="padding:8px 12px;text-align:right">${fmtUSDabs(Math.round(actualNewTotal))}</td><td style="padding:8px 12px;text-align:right">100%</td><td></td><td></td></tr>`;
    html += tbl(['Holding','Qty now','Qty after','Price','Value after','% after','Target %','Deviation'], prows);

    window._rbLastAllLines = allLines;
  }

  // Store trades for export
  window._rbLastTrades = holdingTrades;
  // _rbLastAllLines saved inside full mode block
  window._rbLastTradesMode = mode;

  // Add export buttons
  html += `<div style="display:flex;gap:10px;margin-top:1.5rem;flex-wrap:wrap">
    <button id="rb-exportBtn" class="btn-primary" style="display:flex;align-items:center;gap:6px">
      ⬇ Export to Excel
    </button>
    <button id="rb-letterBtn" class="btn-secondary" style="display:flex;align-items:center;gap:6px">
      ✉ Send to Suitability Letter
    </button>
  </div>`;

  document.getElementById('rb-allocationTable').innerHTML = html;
  document.getElementById('rb-output').style.display = 'block';

  // Attach button handlers after innerHTML render (onclick doesn't work in dynamic HTML)
  const exportBtn = document.getElementById('rb-exportBtn');
  const letterBtn2 = document.getElementById('rb-letterBtn');
  if (exportBtn) exportBtn.onclick = () => rbExportXlsx();
  if (letterBtn2) letterBtn2.onclick = () => rbSendToLetter();
}


function onRebalanceFileChange() {}  // kept for compatibility
function buildRebalTable() {}