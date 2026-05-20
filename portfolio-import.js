// ─── Portfolio & Transactions Import via Claude API ───────────────────────────

const METHODOLOGY_PROMPT = `You are a risk analyst at Orion Ridge Capital.
Assign risk ratings strictly per this methodology:

RISK RATING SCALE (1-6):
- Rating 1: Very low risk (cash, short-term govt bonds 1-5yr developed markets)
- Rating 2: Low-moderate (investment-grade corp bonds ≤10yr senior, conservative funds)
- Rating 3: Moderate (broad/sector equity ETFs developed markets, IG corp bonds >10yr, balanced funds)
- Rating 4: High (large-cap developed equities, high-yield bonds developed markets, sector ETFs, EM equity ETFs, leveraged ETFs)
- Rating 5: Very high (mid/small-cap equities, EM equities, high-yield EM bonds)
- Rating 6: Extremely high (private equity, aggressive hedge funds)

GOVERNMENT BONDS (developed markets): 1-5yr=1, 5-10yr=2, >10yr=3. EM govt bonds=3.
CORPORATE BONDS IG (developed): senior/secured ≤10yr=2, subordinated/convertible ≤10yr=3, any >10yr=3. IG EM=3. HY developed=4. HY EM=5.
ETFs: Govt bond ETF developed=2, IG corp bond ETF developed=3, HY/EM fixed income ETF=4, broad equity ETF developed (MSCI World/ACWI/S&P500)=3, sector equity ETF developed=3, EM equity ETF=4, leveraged/inverse=4.
EQUITIES: large-cap developed=4, mid/small-cap developed=5, EM=5.
MUTUAL FUNDS: money market=1, conservative=2, balanced=3, equity/thematic=4, EM bond=3.
STRUCTURED: capital-protected=2, income index-linked ≤5yr=3, income single-stock=4. Add +1 if maturity>5yr.
PRIVATE EQUITY=6. HEDGE FUNDS conservative=4, aggressive=5.

DEVELOPED MARKETS: USA, Canada, UK, Germany, France, Switzerland, Netherlands, Sweden, Denmark, Norway, Finland, Belgium, Austria, Ireland, Japan, Australia, New Zealand, South Korea, Singapore, Hong Kong, Israel.

WAAR = Sum(Rating_i × Amount_USD_i) / Sum(Amount_USD_i), rounded to 2 decimal places.

IR BANDS: IR1=1.00-1.99, IR2=2.00-2.99, IR3=3.00-3.99, IR4=4.00-4.99, IR5=5.00-5.99, IR6=6.00+`;

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function irBand(waar) {
  if (!waar) return null;
  if (waar < 2) return 'IR1';
  if (waar < 3) return 'IR2';
  if (waar < 4) return 'IR3';
  if (waar < 5) return 'IR4';
  if (waar < 6) return 'IR5';
  return 'IR6';
}

// ─── Analyze existing portfolio ───────────────────────────────────────────────
async function analyzeExistingPortfolio(file) {
  const apiKey = document.getElementById('apiKey').value.trim();
  if (!apiKey) throw new Error('Please enter your Anthropic API key in the sidebar.');

  const b64 = await fileToBase64(file);

  const prompt = `${METHODOLOGY_PROMPT}

Analyze this existing portfolio Excel file. Extract every holding, assign a risk rating, and calculate WAAR.
The file may have multiple sections (bonds, ETFs, equities). Parse all of them.
Key columns to look for: product name, ISIN, holding value / converted holding value (prefer USD-converted amounts).

Return ONLY valid JSON, no markdown:
{
  "holdings": [
    {
      "name": "full product name",
      "isin": "ISIN or empty string",
      "type": "bond|etf|equity|mutual_fund|structured|cash",
      "amountUSD": 123456.78,
      "currency": "USD",
      "riskRating": 3,
      "ratingReason": "one short sentence"
    }
  ],
  "waarBefore": 2.41,
  "irBefore": "IR2"
}

FILE:
<document>
  <source>portfolio.xlsx</source>
  <type>application/vnd.openxmlformats-officedocument.spreadsheetml.sheet</type>
  <data>${b64}</data>
</document>`;

  return await callClaudeAPI(apiKey, prompt, 4000);
}

// ─── Analyze new transactions ─────────────────────────────────────────────────
async function analyzeNewTransactions(file) {
  const apiKey = document.getElementById('apiKey').value.trim();
  if (!apiKey) throw new Error('Please enter your Anthropic API key in the sidebar.');

  const b64 = await fileToBase64(file);

  const prompt = `${METHODOLOGY_PROMPT}

Analyze this new transactions Excel file. Extract every transaction/investment.
The file may have any structure — look for product name, ISIN, amount/quantity, currency, price.
Calculate the total investment amount in USD for each position (quantity × price if needed).

Return ONLY valid JSON, no markdown:
{
  "transactions": [
    {
      "name": "full product name",
      "isin": "ISIN or empty string",
      "type": "bond|etf|equity|mutual_fund|structured|cash",
      "amountUSD": 123456.78,
      "currency": "USD",
      "riskRating": 3,
      "ratingReason": "one short sentence",
      "advisoryFee": ""
    }
  ]
}

FILE:
<document>
  <source>transactions.xlsx</source>
  <type>application/vnd.openxmlformats-officedocument.spreadsheetml.sheet</type>
  <data>${b64}</data>
</document>`;

  return await callClaudeAPI(apiKey, prompt, 2000);
}

// ─── Analyze model portfolio ──────────────────────────────────────────────────
async function analyzeModelPortfolioWithClaude(file) {
  const apiKey = document.getElementById('apiKey').value.trim();
  if (!apiKey) throw new Error('Please enter your Anthropic API key in the sidebar.');

  const b64 = await fileToBase64(file);

  const prompt = `Analyze this model portfolio allocation Excel file.
Extract all rows with an asset class name and a percentage value.
Percentages may be in decimal format (0.515 = 51.5%) or already as percentages (51.5).
Convert all to percentage format. Skip section header rows that have no numeric value.
Suggest a portfolio name based on the allocation mix.

Return ONLY valid JSON, no markdown:
{
  "portfolioName": "Growth & Income Model Portfolio",
  "rows": [
    { "asset": "Equities", "pct": "51.50" },
    { "asset": "Bonds", "pct": "47.50" },
    { "asset": "Cash", "pct": "1.00" }
  ]
}

FILE:
<document>
  <source>model_portfolio.xlsx</source>
  <type>application/vnd.openxmlformats-officedocument.spreadsheetml.sheet</type>
  <data>${b64}</data>
</document>`;

  return await callClaudeAPI(apiKey, prompt, 1000);
}

// ─── Shared API call ──────────────────────────────────────────────────────────
async function callClaudeAPI(apiKey, prompt, maxTokens) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'API error ' + response.status);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(clean);
}

// ─── Render helpers ───────────────────────────────────────────────────────────
function ratingColor(r) {
  if (r <= 2) return '#185fa5';
  if (r <= 3) return '#3b6d11';
  if (r <= 4) return '#854f0b';
  return '#a32d2d';
}

function renderPortfolioRows(holdings, prefix) {
  const tbody = document.getElementById(`l-${prefix}Rows`);
  tbody.innerHTML = '';
  holdings.forEach(h => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <input type="text" value="${escAttr(h.name)}" />
        ${h.ratingReason ? `<div style="font-size:11px;color:#999;margin-top:2px;padding-left:2px;font-style:italic">${escAttr(h.ratingReason)}</div>` : ''}
      </td>
      <td><input type="text" value="${escAttr(h.currency||'USD')}" style="width:52px"/></td>
      <td><input type="number" value="${(h.amountUSD||0).toFixed(2)}" oninput="recalcWAAR()"/></td>
      <td><input type="number" value="${h.riskRating}" min="1" max="6" step="0.5"
        oninput="recalcWAAR()"
        style="width:52px;color:${ratingColor(h.riskRating)};font-weight:600"/></td>
      <td><button class="btn-remove" onclick="this.closest('tr').remove();recalcWAAR()">×</button></td>`;
    tbody.appendChild(tr);
  });
}

function renderTransactionRows(transactions) {
  // Fill Step 2 invest table
  const tbody = document.getElementById('l-investRows');
  tbody.innerHTML = '';
  transactions.forEach(t => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" value="${escAttr(t.name)}" /></td>
      <td><input type="text" value="${escAttr(t.isin||'')}" style="width:130px" /></td>
      <td><input type="text" value="${escAttr(formatAmount(t.amountUSD, t.currency))}" /></td>
      <td><input type="text" value="${escAttr(t.advisoryFee||'0')}" style="width:80px" /></td>
      <td><button class="btn-remove" onclick="this.closest('tr').remove()">×</button></td>`;
    tbody.appendChild(tr);
  });

  // Also render in new portfolio table
  const newTbody = document.getElementById('l-newRows');
  // Keep existing rows, add new transactions on top
  const existingRows = Array.from(newTbody.querySelectorAll('tr'));

  transactions.forEach(t => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <input type="text" value="${escAttr(t.name)}" />
        ${t.ratingReason ? `<div style="font-size:11px;color:#999;margin-top:2px;padding-left:2px;font-style:italic">${escAttr(t.ratingReason)}</div>` : ''}
      </td>
      <td><input type="text" value="${escAttr(t.currency||'USD')}" style="width:52px"/></td>
      <td><input type="number" value="${(t.amountUSD||0).toFixed(2)}" oninput="recalcWAAR()"/></td>
      <td><input type="number" value="${t.riskRating}" min="1" max="6" step="0.5"
        oninput="recalcWAAR()"
        style="width:52px;color:${ratingColor(t.riskRating)};font-weight:600"/></td>
      <td><button class="btn-remove" onclick="this.closest('tr').remove();recalcWAAR()">×</button></td>`;
    newTbody.insertBefore(tr, newTbody.firstChild);
  });

  // Store ratings for WAAR after calculation
  window._transactionRatings = (result.transactions || []).map(t => ({
    amount: t.amountUSD || 0,
    rating: t.riskRating || 3
  }));
  recalcWAAR();
}

function renderModelPortfolioRows(rows) {
  const tbody = document.getElementById('l-modelRows');
  tbody.innerHTML = '';
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" value="${escAttr(r.asset)}" /></td>
      <td><input type="number" value="${r.pct}" min="0" max="100" step="0.01"/></td>
      <td><button class="btn-remove" onclick="this.closest('tr').remove()">×</button></td>`;
    tbody.appendChild(tr);
  });
}

// ─── Recalculate WAAR from current table values ───────────────────────────────
window.recalcWAAR = function() {
  ['existing', 'new'].forEach(prefix => {
    const rows = Array.from(document.querySelectorAll(`#l-${prefix}Rows tr`));
    const holdings = rows.map(tr => {
      const inputs = tr.querySelectorAll('input[type=number]');
      return { amount: parseFloat(inputs[0]?.value)||0, rating: parseFloat(inputs[1]?.value)||0 };
    }).filter(h => h.amount > 0 && h.rating > 0);

    const total = holdings.reduce((s, h) => s + h.amount, 0);
    const waar = total > 0 ? holdings.reduce((s, h) => s + h.rating * h.amount, 0) / total : null;
    const el = document.getElementById(`waar-${prefix === 'existing' ? 'before' : 'after'}`);
    if (el) el.textContent = waar ? `${waar.toFixed(2)} (${irBand(waar)})` : '—';
  });
};

// Keep backward compat
window.updateWAAR = window.recalcWAAR;

// ─── Main handlers ────────────────────────────────────────────────────────────

window.analyzeExistingFile = async function() {
  const input = document.getElementById('importExisting');
  if (!input.files[0]) { alert('Please upload the existing portfolio Excel file.'); return; }

  const statusEl = document.getElementById('existingStatus');
  const btn = document.getElementById('btnAnalyzeExisting');
  statusEl.textContent = 'Analyzing with Claude…';
  statusEl.style.color = '#854f0b';
  btn.disabled = true;

  try {
    const result = await analyzeExistingPortfolio(input.files[0]);
    renderPortfolioRows(result.holdings || [], 'existing');

    // Set WAAR before
    const el = document.getElementById('waar-before');
    if (el && result.waarBefore) el.textContent = `${result.waarBefore} (${result.irBefore||irBand(result.waarBefore)})`;

    statusEl.textContent = `✓ ${result.holdings?.length||0} holdings — WAAR: ${result.waarBefore} (${result.irBefore})`;
    statusEl.style.color = '#3b6d11';
  } catch(e) {
    statusEl.textContent = 'Error: ' + e.message;
    statusEl.style.color = '#a32d2d';
  }
  btn.disabled = false;
};

window.analyzeTransactionsFile = async function() {
  const input = document.getElementById('importTransactions');
  if (!input.files[0]) { alert('Please upload the new transactions Excel file.'); return; }

  const statusEl = document.getElementById('transactionsStatus');
  const btn = document.getElementById('btnAnalyzeTransactions');
  statusEl.textContent = 'Analyzing with Claude…';
  statusEl.style.color = '#854f0b';
  btn.disabled = true;

  try {
    const result = await analyzeNewTransactions(input.files[0]);
    renderTransactionRows(result.transactions || []);

    statusEl.textContent = `✓ ${result.transactions?.length||0} transactions imported — also added to Step 2 table and new portfolio`;
    statusEl.style.color = '#3b6d11';
  } catch(e) {
    statusEl.textContent = 'Error: ' + e.message;
    statusEl.style.color = '#a32d2d';
  }
  btn.disabled = false;
};

window.analyzeModelFile = async function() {
  const input = document.getElementById('importModel');
  if (!input.files[0]) { alert('Please upload the model portfolio Excel file.'); return; }

  const statusEl = document.getElementById('importModelStatus');
  const btn = document.getElementById('btnAnalyzeModel');
  statusEl.textContent = 'Analyzing with Claude…';
  statusEl.style.color = '#854f0b';
  btn.disabled = true;

  try {
    const result = await analyzeModelPortfolioWithClaude(input.files[0]);
    const nameInput = document.getElementById('l-modelName');
    if (!nameInput.value && result.portfolioName) nameInput.value = result.portfolioName;
    renderModelPortfolioRows(result.rows || []);
    statusEl.textContent = `✓ ${result.rows?.length||0} rows imported`;
    statusEl.style.color = '#3b6d11';
  } catch(e) {
    statusEl.textContent = 'Error: ' + e.message;
    statusEl.style.color = '#a32d2d';
  }
  btn.disabled = false;
};

function formatAmount(amount, currency) {
  if (!amount) return '';
  return `${currency||'USD'} ${amount.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
}

function escAttr(s) { return (s||'').replace(/"/g,'&quot;'); }
