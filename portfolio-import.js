// ─── Portfolio & Model Import via Claude API ──────────────────────────────────
// Sends Excel files as base64 to Claude API, which applies the full
// Orion Ridge Capital methodology and returns structured JSON.

const METHODOLOGY_PROMPT = `You are a risk analyst at Orion Ridge Capital. 
You must analyze investment portfolios and assign risk ratings strictly following this methodology:

RISK RATING SCALE (1-6):
- Rating 1: Very low risk (cash equivalents, short-term govt bonds 1-5yr from developed markets)
- Rating 2: Low-moderate risk (investment-grade corp bonds, conservative mutual funds)
- Rating 3: Moderate risk (broad market equity ETFs developed markets, balanced mutual funds, long-term IG corp bonds)
- Rating 4: High risk (large-cap developed market equities, high-yield bonds developed markets, sector ETFs, emerging market equity ETFs)
- Rating 5: Very high risk (mid/small-cap equities, emerging market equities, high-yield EM bonds, leveraged ETFs)
- Rating 6: Extremely high risk (private equity, aggressive hedge funds)

DETAILED RULES:

GOVERNMENT BONDS (developed markets):
- Short-term 1-5 years: Rating 1
- Medium-term 5-10 years: Rating 2
- Long-term >10 years: Rating 3
- Emerging market govt bonds: Rating 3 regardless of maturity

CORPORATE BONDS (investment grade, developed markets):
- Up to 10 years, Senior Secured/Unsecured: Rating 2
- Up to 10 years, Subordinated/Convertible: Rating 3
- Over 10 years, any type: Rating 3
- Investment grade emerging markets: Rating 3
- High-yield developed markets: Rating 4
- High-yield emerging markets: Rating 5
- Complex bonds (callable, puttable, convertible, perpetual) developed markets: Rating 3
- Complex bonds emerging markets: Rating 4

ETFs:
- Developed market government bond ETFs: Rating 2
- Investment-grade corporate bond ETFs (developed markets): Rating 3
- High-yield or emerging market fixed income ETFs: Rating 4
- Broad market equity ETFs (developed markets, e.g. MSCI World, ACWI, S&P500): Rating 3
- Sector-specific equity ETFs (developed markets): Rating 3
- Emerging market equity ETFs: Rating 4
- Leveraged or inverse ETFs: Rating 4

EQUITIES:
- Large-cap developed markets: Rating 4
- Mid/small-cap developed markets: Rating 5
- Emerging markets: Rating 5

MUTUAL FUNDS:
- Money market: Rating 1
- Conservative (70%+ fixed income/govt bonds): Rating 2
- Balanced (~50/50 equity/bond, developed markets): Rating 3
- Equity/thematic/sector funds: Rating 4
- EM bond funds: Rating 3

STRUCTURED PRODUCTS:
- Capital-protected: Rating 2
- Income-generating linked to index, no capital protection, ≤5yr: Rating 3
- Income-generating linked to single stock, no capital protection: Rating 4
- Add +1 to rating if maturity >5 years

PRIVATE EQUITY: Rating 6
HEDGE FUNDS (conservative strategies): Rating 4
HEDGE FUNDS (aggressive strategies): Rating 5

DEVELOPED MARKETS include: USA, Canada, UK, Germany, France, Switzerland, Netherlands, Sweden, Denmark, Norway, Finland, Belgium, Austria, Ireland, Japan, Australia, New Zealand, South Korea, Singapore, Hong Kong, Israel.

WAAR FORMULA:
WAAR = Sum(Risk_Rating_i × Amount_USD_i) / Sum(Amount_USD_i)
Round to 2 decimal places.`;

// ─── File to base64 ───────────────────────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Call Claude API with Excel file ─────────────────────────────────────────
async function analyzePortfolioWithClaude(existingFile, newFile, investmentsFromStep2) {
  const apiKey = document.getElementById('apiKey').value.trim();
  if (!apiKey) throw new Error('Please enter your Anthropic API key in the sidebar.');

  const existingB64 = await fileToBase64(existingFile);

  let newPortfolioInstruction = '';
  if (newFile) {
    const newB64 = await fileToBase64(newFile);
    newPortfolioInstruction = `
NEW PORTFOLIO FILE (after transaction):
<document>
  <source>new_portfolio.xlsx</source>
  <type>application/vnd.openxmlformats-officedocument.spreadsheetml.sheet</type>
  <data>${newB64}</data>
</document>`;
  } else if (investmentsFromStep2 && investmentsFromStep2.length > 0) {
    newPortfolioInstruction = `
NEW INVESTMENTS (from Step 2, to be added to existing portfolio):
${investmentsFromStep2.map(r => `- ${r.product}: ${r.amount} USD`).join('\n')}
For the new portfolio, combine existing holdings with these new investments.`;
  }

  const userMessage = `${METHODOLOGY_PROMPT}

TASK: Analyze the portfolio Excel file(s) below. 

EXISTING PORTFOLIO FILE:
<document>
  <source>existing_portfolio.xlsx</source>
  <type>application/vnd.openxmlformats-officedocument.spreadsheetml.sheet</type>
  <data>${existingB64}</data>
</document>
${newPortfolioInstruction}

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "existing": [
    {
      "name": "full product name",
      "isin": "ISIN if available",
      "type": "bond|etf|equity|mutual_fund|structured|private_equity|hedge_fund|cash",
      "amountUSD": 123456.78,
      "currency": "USD",
      "riskRating": 3,
      "ratingReason": "one sentence why this rating"
    }
  ],
  "newPortfolio": [
    { same structure as above }
  ],
  "waarBefore": 2.41,
  "waarAfter": 2.64,
  "irBefore": "IR2",
  "irAfter": "IR3",
  "concentrationFlags": {
    "issuerBreach": false,
    "productBreach": false,
    "details": ""
  }
}`;

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
      max_tokens: 4000,
      messages: [{ role: 'user', content: userMessage }]
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'API error');
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';

  // Strip markdown fences if present
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(clean);
}

// ─── Analyze model portfolio Excel ───────────────────────────────────────────
async function analyzeModelPortfolioWithClaude(file) {
  const apiKey = document.getElementById('apiKey').value.trim();
  if (!apiKey) throw new Error('Please enter your Anthropic API key in the sidebar.');

  const b64 = await fileToBase64(file);

  const userMessage = `You are analyzing a model portfolio allocation Excel file for Orion Ridge Capital.

The file contains asset class names and their percentage allocations (in decimal format, e.g. 0.515 = 51.5%).
It may have multiple sections (e.g. top-level asset classes, then equity sector breakdown, then bond segment breakdown).

TASK: Extract ALL rows that have a name and a numeric percentage. Convert decimals to percentages (multiply by 100).
Skip section header rows (rows with no percentage value).

Return ONLY valid JSON (no markdown):
{
  "portfolioName": "suggested name based on allocation (e.g. Growth & Income Model Portfolio)",
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
      max_tokens: 1000,
      messages: [{ role: 'user', content: userMessage }]
    })
  });

  const data = await response.json();
  const text = data.content?.[0]?.text || '';
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(clean);
}

// ─── Render portfolio results ─────────────────────────────────────────────────
function renderAnalyzedPortfolio(holdings, prefix) {
  const tbody = document.getElementById(`l-${prefix}Rows`);
  tbody.innerHTML = '';

  holdings.forEach(h => {
    const ratingColor = h.riskRating <= 2 ? '#185fa5'
      : h.riskRating === 3 ? '#3b6d11'
      : h.riskRating === 4 ? '#854f0b'
      : '#a32d2d';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <input type="text" value="${escAttr(h.name)}" />
        ${h.ratingReason ? `<div style="font-size:11px;color:var(--text3);margin-top:2px;padding-left:2px">${escAttr(h.ratingReason)}</div>` : ''}
      </td>
      <td><input type="text" value="${escAttr(h.currency || 'USD')}" style="width:55px" /></td>
      <td><input type="number" value="${(h.amountUSD||0).toFixed(2)}" oninput="updateWAAR()" /></td>
      <td>
        <input type="number" value="${h.riskRating}" min="1" max="6" step="0.5"
          oninput="updateWAAR()"
          style="width:55px;color:${ratingColor};font-weight:600"
          title="${h.ratingReason || ''}" />
      </td>
      <td><button class="btn-remove" onclick="this.closest('tr').remove();updateWAAR()">×</button></td>`;
    tbody.appendChild(tr);
  });

  updateWAAR();
}

function renderModelPortfolioRows(rows) {
  const tbody = document.getElementById('l-modelRows');
  tbody.innerHTML = '';
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" value="${escAttr(r.asset)}" /></td>
      <td><input type="number" value="${r.pct}" min="0" max="100" step="0.01" /></td>
      <td><button class="btn-remove" onclick="this.closest('tr').remove()">×</button></td>`;
    tbody.appendChild(tr);
  });
}

// ─── Main handlers (called from index.html) ───────────────────────────────────

// Called when user clicks "Analyze with Claude" on step 4
window.analyzePortfolioFiles = async function() {
  const existingInput = document.getElementById('importExisting');
  const newInput = document.getElementById('importNew');

  if (!existingInput.files[0]) {
    alert('Please upload the existing portfolio Excel file first.');
    return;
  }

  const statusEl = document.getElementById('portfolioAnalysisStatus');
  statusEl.textContent = 'Analyzing with Claude... this may take 15–30 seconds';
  statusEl.style.color = '#854f0b';
  document.getElementById('btnAnalyzePortfolio').disabled = true;

  try {
    // Collect Step 2 investments
    const step2 = Array.from(document.querySelectorAll('#l-investRows tr')).map(tr => {
      const inputs = tr.querySelectorAll('input');
      return { product: inputs[0]?.value, amount: inputs[1]?.value };
    }).filter(r => r.product && r.amount);

    const result = await analyzePortfolioWithClaude(
      existingInput.files[0],
      newInput.files[0] || null,
      step2
    );

    // Render existing portfolio
    renderAnalyzedPortfolio(result.existing || [], 'existing');

    // Render new portfolio
    renderAnalyzedPortfolio(result.newPortfolio || [], 'new');

    // Update WAAR display with Claude's calculated values
    const elBefore = document.getElementById('waar-before');
    const elAfter = document.getElementById('waar-after');
    if (elBefore) elBefore.textContent = result.waarBefore
      ? `${result.waarBefore} (${result.irBefore})` : '—';
    if (elAfter) elAfter.textContent = result.waarAfter
      ? `${result.waarAfter} (${result.irAfter})` : '—';

    // Auto-set concentration radio if breach detected
    if (result.concentrationFlags?.issuerBreach || result.concentrationFlags?.productBreach) {
      const breachRadio = document.querySelector('input[name="concentration"][value="breach"]');
      if (breachRadio) breachRadio.checked = true;
    }

    statusEl.textContent = `✓ Done — ${result.existing?.length || 0} existing + ${result.newPortfolio?.length || 0} new holdings analyzed`;
    statusEl.style.color = '#3b6d11';

  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
    statusEl.style.color = '#a32d2d';
  }

  document.getElementById('btnAnalyzePortfolio').disabled = false;
};

window.analyzeModelFile = async function() {
  const input = document.getElementById('importModel');
  if (!input.files[0]) { alert('Please upload the model portfolio Excel file first.'); return; }

  const statusEl = document.getElementById('importModelStatus');
  statusEl.textContent = 'Analyzing with Claude...';
  statusEl.style.color = '#854f0b';
  document.getElementById('btnAnalyzeModel').disabled = true;

  try {
    const result = await analyzeModelPortfolioWithClaude(input.files[0]);

    // Auto-fill model name if empty
    const nameInput = document.getElementById('l-modelName');
    if (!nameInput.value && result.portfolioName) nameInput.value = result.portfolioName;

    renderModelPortfolioRows(result.rows || []);
    statusEl.textContent = `✓ ${result.rows?.length || 0} rows imported`;
    statusEl.style.color = '#3b6d11';
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
    statusEl.style.color = '#a32d2d';
  }

  document.getElementById('btnAnalyzeModel').disabled = false;
};

function escAttr(s) { return (s || '').replace(/"/g, '&quot;'); }
