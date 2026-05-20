// ─── Portfolio Import via SheetJS + Claude API ────────────────────────────────
// Step 1: Parse Excel to text in browser (SheetJS)
// Step 2: Send text to Claude API for risk rating assignment

const METHODOLOGY_PROMPT = `You are a risk analyst at Orion Ridge Capital.
Assign risk ratings strictly per this methodology:

RISK RATING SCALE (1-6):
- Rating 1: Very low risk (cash, short-term govt bonds 1-5yr developed markets)
- Rating 2: Low-moderate (investment-grade corp bonds ≤10yr senior/secured, govt bonds 5-10yr developed)
- Rating 3: Moderate (broad/sector equity ETFs developed markets, IG corp bonds >10yr, govt bonds >10yr developed, balanced funds, IG corp bond ETFs)
- Rating 4: High (large-cap developed equities, high-yield bonds developed markets, EM equity ETFs, leveraged ETFs)
- Rating 5: Very high (mid/small-cap equities, EM equities, high-yield EM bonds)
- Rating 6: Extremely high (private equity, aggressive hedge funds)

GOVERNMENT BONDS (developed markets): 1-5yr=1, 5-10yr=2, >10yr=3. EM govt bonds=3.
CORPORATE BONDS IG (developed): senior/secured ≤10yr=2, subordinated/convertible ≤10yr=3, any >10yr=3. IG EM=3. HY developed=4. HY EM=5.
ETFs: Govt bond ETF developed=2, IG corp bond ETF developed=3, HY/EM fixed income ETF=4, broad equity ETF developed=3, sector equity ETF developed=3, EM equity ETF=4, leveraged/inverse=4.
EQUITIES: large-cap developed=4, mid/small-cap developed=5, EM=5.

DEVELOPED MARKETS: USA, Canada, UK, Germany, France, Switzerland, Netherlands, Sweden, Denmark, Norway, Finland, Belgium, Austria, Ireland, Japan, Australia, New Zealand, South Korea, Singapore, Hong Kong, Israel.

WAAR = Sum(Rating_i × Amount_USD_i) / Sum(Amount_USD_i), rounded to 2 decimal places.
IR BANDS: IR1=1.00-1.99, IR2=2.00-2.99, IR3=3.00-3.99, IR4=4.00-4.99, IR5=5.00-5.99, IR6=6.00+`;

// ─── Parse Excel to CSV text using SheetJS ────────────────────────────────────
async function excelToText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        let text = '';
        wb.SheetNames.forEach(name => {
          const ws = wb.Sheets[name];
          const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false });
          if (csv.trim()) text += `\n=== Sheet: ${name} ===\n${csv}\n`;
        });
        resolve(text.trim());
      } catch(err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ─── Call Claude API with text ────────────────────────────────────────────────
async function callClaude(prompt, maxTokens) {
  const apiKey = document.getElementById('apiKey').value.trim();
  if (!apiKey) throw new Error('Please enter your Anthropic API key in the sidebar.');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
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

// ─── Analyze existing portfolio ───────────────────────────────────────────────
window.analyzeExistingFile = async function() {
  const input = document.getElementById('importExisting');
  if (!input.files[0]) { alert('Please upload the existing portfolio Excel file.'); return; }

  const statusEl = document.getElementById('existingStatus');
  const btn = document.getElementById('btnAnalyzeExisting');
  statusEl.textContent = 'Reading Excel...';
  statusEl.style.color = '#854f0b';
  btn.disabled = true;

  try {
    const csvText = await excelToText(input.files[0]);

    statusEl.textContent = 'Analyzing with Claude...';

    const prompt = `${METHODOLOGY_PROMPT}

Below is the raw CSV content of a portfolio Excel file. It may contain multiple sections (bonds, ETFs, equities).

For each holding:
- Extract the full product name
- Extract ISIN if present
- Determine the asset type (bond, etf, equity, mutual_fund, structured, cash)
- Extract the USD amount (look for columns like "Converted holding value", "Converted Holding Value", or calculate from quantity × price if in USD)
- Assign the correct risk rating per the methodology above
- Provide a one-sentence reason for the rating

Then calculate WAAR = weighted average of (riskRating × amountUSD) / totalUSD.

Return ONLY valid JSON, no markdown, no explanation:
{
  "holdings": [
    {
      "name": "full product name",
      "isin": "ISIN or empty string",
      "type": "bond|etf|equity|mutual_fund|structured|cash",
      "amountUSD": 107743.00,
      "currency": "USD",
      "riskRating": 2,
      "ratingReason": "Investment-grade corporate bond, senior, maturity <10yr, developed market"
    }
  ],
  "waarBefore": 2.85,
  "irBefore": "IR3"
}

PORTFOLIO DATA:
${csvText}`;

    const result = await callClaude(prompt, 4000);
    renderPortfolioRows(result.holdings || [], 'existing');

    const el = document.getElementById('waar-before');
    if (el && result.waarBefore) {
      el.textContent = `${result.waarBefore} (${result.irBefore || irBand(result.waarBefore)})`;
    }

    statusEl.textContent = `✓ ${result.holdings?.length || 0} holdings — WAAR: ${result.waarBefore} (${result.irBefore})`;
    statusEl.style.color = '#3b6d11';
    recalcWAAR();

  } catch(e) {
    statusEl.textContent = 'Error: ' + e.message;
    statusEl.style.color = '#a32d2d';
  }
  btn.disabled = false;
};

// ─── Analyze new transactions ─────────────────────────────────────────────────
window.analyzeTransactionsFile = async function() {
  const input = document.getElementById('importTransactions');
  if (!input.files[0]) { alert('Please upload the new transactions Excel file.'); return; }

  const statusEl = document.getElementById('transactionsStatus');
  const btn = document.getElementById('btnAnalyzeTransactions');
  statusEl.textContent = 'Reading Excel...';
  statusEl.style.color = '#854f0b';
  btn.disabled = true;

  try {
    const csvText = await excelToText(input.files[0]);
    statusEl.textContent = 'Analyzing with Claude...';

    const prompt = `${METHODOLOGY_PROMPT}

Below is the raw CSV content of a new transactions Excel file.
Extract each transaction/investment. Look for product name, ISIN, quantity, price, amount, currency.
Calculate total USD amount for each position.

Return ONLY valid JSON, no markdown:
{
  "transactions": [
    {
      "name": "full product name",
      "isin": "ISIN or empty string",
      "type": "bond|etf|equity|mutual_fund|structured|cash",
      "amountUSD": 9688.88,
      "currency": "USD",
      "riskRating": 3,
      "ratingReason": "Sector equity ETF tracking developed market index",
      "advisoryFee": "0"
    }
  ]
}

TRANSACTION DATA:
${csvText}`;

    const result = await callClaude(prompt, 2000);
    renderTransactionRows(result.transactions || []);

    window._transactionRatings = (result.transactions || []).map(t => ({
      amount: t.amountUSD || 0,
      rating: t.riskRating || 3
    }));

    statusEl.textContent = `✓ ${result.transactions?.length || 0} transactions — added to Step 2 table`;
    statusEl.style.color = '#3b6d11';
    recalcWAAR();

  } catch(e) {
    statusEl.textContent = 'Error: ' + e.message;
    statusEl.style.color = '#a32d2d';
  }
  btn.disabled = false;
};

// ─── Analyze model portfolio ──────────────────────────────────────────────────
window.analyzeModelFile = async function() {
  const input = document.getElementById('importModel');
  if (!input.files[0]) { alert('Please upload the model portfolio Excel file.'); return; }

  const statusEl = document.getElementById('importModelStatus');
  const btn = document.getElementById('btnAnalyzeModel');
  statusEl.textContent = 'Reading Excel...';
  statusEl.style.color = '#854f0b';
  btn.disabled = true;

  try {
    const csvText = await excelToText(input.files[0]);
    statusEl.textContent = 'Analyzing with Claude...';

    const prompt = `Analyze this model portfolio allocation CSV data.
Extract all rows with an asset class name and a percentage value.
Percentages may be decimal (0.515 = 51.5%) or already percentages (51.5).
Convert all to percentage format (e.g. "51.50"). Skip section header rows with no numeric value.
Suggest a portfolio name based on the allocation.

Return ONLY valid JSON, no markdown:
{
  "portfolioName": "Growth & Income Model Portfolio",
  "rows": [
    { "asset": "Equities", "pct": "51.50" },
    { "asset": "Bonds", "pct": "47.50" },
    { "asset": "Cash", "pct": "1.00" }
  ]
}

DATA:
${csvText}`;

    const result = await callClaude(prompt, 1000);
    const nameInput = document.getElementById('l-modelName');
    if (!nameInput.value && result.portfolioName) nameInput.value = result.portfolioName;
    renderModelPortfolioRows(result.rows || []);
    statusEl.textContent = `✓ ${result.rows?.length || 0} rows imported`;
    statusEl.style.color = '#3b6d11';

  } catch(e) {
    statusEl.textContent = 'Error: ' + e.message;
    statusEl.style.color = '#a32d2d';
  }
  btn.disabled = false;
};

// ─── Render helpers ───────────────────────────────────────────────────────────
function irBand(waar) {
  if (!waar) return '';
  if (waar < 2) return 'IR1';
  if (waar < 3) return 'IR2';
  if (waar < 4) return 'IR3';
  if (waar < 5) return 'IR4';
  if (waar < 6) return 'IR5';
  return 'IR6';
}

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

function formatAmount(amount, currency) {
  if (!amount) return '';
  return `${currency||'USD'} ${amount.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
}

function escAttr(s) { return (s||'').replace(/"/g,'&quot;'); }
