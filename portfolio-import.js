// ─── Portfolio Import & WAAR via Claude API ───────────────────────────────────

const METHODOLOGY_PROMPT = `You are a risk analyst at Orion Ridge Capital.
Assign risk ratings strictly per this methodology:

RISK RATING SCALE (1-6):
- Rating 1: Very low risk (cash, short-term govt bonds 1-5yr developed markets)
- Rating 2: Low-moderate (IG corp bonds ≤10yr senior/secured developed, govt bonds 5-10yr developed)
- Rating 3: Moderate (broad/sector equity ETFs developed, IG corp bonds >10yr, govt bonds >10yr developed, IG corp bond ETFs developed)
- Rating 4: High (large-cap developed equities, HY bonds developed, EM equity ETFs, leveraged ETFs)
- Rating 5: Very high (mid/small-cap developed equities, EM equities, HY EM bonds)
- Rating 6: Extremely high (private equity, aggressive hedge funds)

GOVERNMENT BONDS (developed markets): 1-5yr=1, 5-10yr=2, >10yr=3. EM govt bonds=3.
CORPORATE BONDS IG (developed): senior/secured ≤10yr=2, subordinated/convertible ≤10yr=3, any >10yr=3. IG EM=3. HY developed=4. HY EM=5.
ETFs: Govt bond ETF developed=2, IG corp bond ETF developed=3, HY/EM fixed income ETF=4, broad equity ETF developed markets=3, broad global equity ETF (e.g. MSCI World, MSCI ACWI, S&P500, FTSE All-World) where developed markets represent >70% of holdings=3, sector equity ETF developed=3, pure EM equity ETF=4, leveraged/inverse=4.
EQUITIES: large-cap developed=4, mid/small-cap developed=5, EM=5.
DEVELOPED MARKETS: USA, Canada, UK, Germany, France, Switzerland, Netherlands, Sweden, Denmark, Norway, Finland, Belgium, Austria, Ireland, Japan, Australia, New Zealand, South Korea, Singapore, Hong Kong, Israel.
WAAR = Sum(Rating_i × Amount_i) / Sum(Amount_i), rounded to 2 decimal places.
IR BANDS: IR1=1.00-1.99, IR2=2.00-2.99, IR3=3.00-3.99, IR4=4.00-4.99, IR5=5.00-5.99, IR6=6.00+`;

// ─── Download portfolio template ──────────────────────────────────────────────
window.downloadPortfolioTemplate = function() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['ISIN', 'Name', 'Amount USD'],
    ['IE00B6R52259', 'iShares MSCI ACWI UCITS ETF', 147571.80],
    ['XS1234567890', 'Goldman Sachs 6.125% 2030', 107743.00],
    ['', 'Cash USD', 50000.00]
  ]);
  ws['!cols'] = [{wch:18},{wch:45},{wch:18}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Portfolio');
  XLSX.writeFile(wb, 'portfolio_template.xlsx');
};

// ─── Import portfolio Excel (3-column format) ─────────────────────────────────
window.importPortfolioExcel = function(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      // Find header row (contains ISIN or Name)
      let startRow = 0;
      for (let i = 0; i < Math.min(5, rows.length); i++) {
        const r = rows[i].map(v => String(v).toLowerCase());
        if (r.some(v => v.includes('isin') || v.includes('name'))) { startRow = i + 1; break; }
      }

      const tbody = document.getElementById('l-existingRows');
      tbody.innerHTML = '';
      let count = 0;

      for (let i = startRow; i < rows.length; i++) {
        const row = rows[i];
        const isin = String(row[0] || '').trim();
        const name = String(row[1] || '').trim();
        const amount = parseFloat(String(row[2] || '').replace(/,/g, '')) || 0;
        if (!name && !isin) continue;

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><input type="text" value="${escAttr(isin)}" placeholder="ISIN" style="width:130px"/></td>
          <td><input type="text" value="${escAttr(name)}" placeholder="Product name"/></td>
          <td><input type="number" value="${amount}" oninput="recalcWAAR()"/></td>
          <td><input type="number" value="" min="1" max="6" step="0.5" placeholder="—" oninput="recalcWAAR()" style="width:52px;color:#185fa5;font-weight:600"/></td>
          <td><button class="btn-remove" onclick="this.closest('tr').remove();recalcWAAR()">×</button></td>`;
        tbody.appendChild(tr);
        count++;
      }

      document.getElementById('existingStatus').textContent = `✓ ${count} rows imported — click "Assign ratings" to get risk ratings`;
      document.getElementById('existingStatus').style.color = '#3b6d11';
      recalcWAAR();
    } catch(err) {
      document.getElementById('existingStatus').textContent = 'Error reading file: ' + err.message;
      document.getElementById('existingStatus').style.color = '#a32d2d';
    }
  };
  reader.readAsArrayBuffer(file);
};

// ─── Assign risk ratings via Claude API ───────────────────────────────────────
window.analyzeExistingPortfolio = async function() {
  const apiKey = document.getElementById('apiKey').value.trim();
  if (!apiKey) { alert('Please enter your Anthropic API key in the sidebar.'); return; }

  const rows = getExistingRows();
  if (!rows.length) { alert('Please add holdings first.'); return; }

  const statusEl = document.getElementById('existingStatus');
  const btn = document.getElementById('btnAnalyzeExisting');
  statusEl.textContent = 'Assigning risk ratings with Claude...';
  statusEl.style.color = '#854f0b';
  btn.disabled = true;

  const holdingsList = rows.map((r,i) =>
    `${i+1}. ISIN: ${r.isin||'N/A'} | Name: ${r.name} | Amount USD: ${r.amount}`
  ).join('\n');

  const prompt = `${METHODOLOGY_PROMPT}

Assign a risk rating (1-6) to each holding below based on the methodology above.
Use the ISIN and name to identify the instrument type and apply the correct rating.

Holdings:
${holdingsList}

Return ONLY valid JSON, no markdown:
{
  "holdings": [
    { "index": 1, "name": "exact name", "isin": "ISIN", "riskRating": 3, "ratingReason": "one sentence" }
  ],
  "waarBefore": 2.85,
  "irBefore": "IR3"
}`;

  try {
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
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    const text = data.content?.[0]?.text || '';
    const clean = text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
    const result = JSON.parse(clean);

    // Apply ratings back to table rows
    const tbody = document.getElementById('l-existingRows');
    const trs = tbody.querySelectorAll('tr');
    (result.holdings || []).forEach(h => {
      const tr = trs[h.index - 1];
      if (!tr) return;
      const ratingInput = tr.querySelectorAll('input')[3];
      if (ratingInput) {
        ratingInput.value = h.riskRating;
        ratingInput.style.color = ratingColor(h.riskRating);
        ratingInput.title = h.ratingReason || '';
      }
      // Add reason as subtitle
      const nameCell = tr.querySelectorAll('td')[1];
      let hint = nameCell.querySelector('.rating-hint');
      if (!hint) { hint = document.createElement('div'); hint.className = 'rating-hint'; nameCell.appendChild(hint); }
      hint.textContent = h.ratingReason || '';
      hint.style.cssText = 'font-size:11px;color:#999;margin-top:2px;font-style:italic';
    });

    statusEl.textContent = `✓ ${result.holdings?.length || 0} ratings assigned`;
    statusEl.style.color = '#3b6d11';
    recalcWAAR();

  } catch(e) {
    statusEl.textContent = 'Error: ' + e.message;
    statusEl.style.color = '#a32d2d';
  }
  btn.disabled = false;
};

// ─── Add row manually ─────────────────────────────────────────────────────────
window.addExistingRow = function() {
  const tbody = document.getElementById('l-existingRows');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" placeholder="e.g. IE00B6R52259" style="width:130px"/></td>
    <td><input type="text" placeholder="Product name"/></td>
    <td><input type="number" placeholder="Amount" oninput="recalcWAAR()"/></td>
    <td><input type="number" placeholder="—" min="1" max="6" step="0.5" oninput="recalcWAAR()" style="width:52px;color:#185fa5;font-weight:600"/></td>
    <td><button class="btn-remove" onclick="this.closest('tr').remove();recalcWAAR()">×</button></td>`;
  tbody.appendChild(tr);
};

// ─── Read existing rows ───────────────────────────────────────────────────────
function getExistingRows() {
  return Array.from(document.querySelectorAll('#l-existingRows tr')).map(tr => {
    const inputs = tr.querySelectorAll('input');
    return {
      isin:   inputs[0]?.value || '',
      name:   inputs[1]?.value || '',
      amount: parseFloat(inputs[2]?.value) || 0,
      rating: parseFloat(inputs[3]?.value) || 0
    };
  }).filter(r => r.name || r.isin);
}

// ─── Model portfolio ──────────────────────────────────────────────────────────
window.analyzeModelFile = async function() {
  const input = document.getElementById('importModel');
  if (!input.files[0]) { alert('Please upload the model portfolio Excel file.'); return; }

  const statusEl = document.getElementById('importModelStatus');
  const btn = document.getElementById('btnAnalyzeModel');
  statusEl.textContent = 'Reading...';
  statusEl.style.color = '#854f0b';
  btn.disabled = true;

  try {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

      const SKIP = ['asset classes','equities - sectors allocation','bond segments allocation'];
      const result = [];
      rows.forEach(row => {
        let name = null, pct = null;
        for (const v of row) {
          if (v !== null && typeof v === 'string' && !name) name = v.trim();
          if (v !== null && typeof v === 'number' && pct === null) pct = v;
        }
        if (!name || pct === null) return;
        if (SKIP.includes(name.toLowerCase())) return;
        const pctVal = pct < 1 ? (pct * 100).toFixed(2).replace(/\.00$/,'') : pct.toFixed(2).replace(/\.00$/,'');
        result.push({ asset: name, pct: pctVal });
      });

      renderModelPortfolioRows(result);
      statusEl.textContent = `✓ ${result.length} rows imported`;
      statusEl.style.color = '#3b6d11';
      btn.disabled = false;
    };
    reader.readAsArrayBuffer(input.files[0]);
  } catch(e) {
    statusEl.textContent = 'Error: ' + e.message;
    statusEl.style.color = '#a32d2d';
    btn.disabled = false;
  }
};

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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function irBand(waar) {
  if (!waar) return '';
  if (waar < 2) return 'IR1'; if (waar < 3) return 'IR2'; if (waar < 4) return 'IR3';
  if (waar < 5) return 'IR4'; if (waar < 6) return 'IR5'; return 'IR6';
}
function ratingColor(r) {
  if (r <= 2) return '#185fa5'; if (r <= 3) return '#3b6d11'; if (r <= 4) return '#854f0b'; return '#a32d2d';
}
function escAttr(s) { return (s||'').replace(/"/g,'&quot;'); }

// ─── Assign risk ratings to new investments (Step 2) ─────────────────────────
window.assignInvestmentRatings = async function() {
  const apiKey = document.getElementById('apiKey').value.trim();
  if (!apiKey) { alert('Please enter your Anthropic API key in the sidebar.'); return; }

  const rows = Array.from(document.querySelectorAll('#l-investRows tr')).map(tr => {
    const inputs = tr.querySelectorAll('input');
    return {
      product: inputs[0]?.value || '',
      isin:    inputs[1]?.value || '',
      amount:  parseFloat(inputs[2]?.value) || 0
    };
  }).filter(r => r.product);

  if (!rows.length) { alert('Please add investments first.'); return; }

  const statusEl = document.getElementById('investRatingStatus');
  const btn = document.getElementById('btnRateInvestments');
  statusEl.textContent = 'Assigning ratings with Claude...';
  statusEl.style.color = '#854f0b';
  btn.disabled = true;

  const list = rows.map((r,i) =>
    `${i+1}. Product: ${r.product} | ISIN: ${r.isin||'N/A'} | Amount: ${r.amount}`
  ).join('\n');

  const prompt = `${METHODOLOGY_PROMPT}

Assign a risk rating (1-6) to each investment below. Use the ISIN and name to identify the instrument.

Investments:
${list}

Return ONLY valid JSON, no markdown:
{
  "investments": [
    { "index": 1, "riskRating": 3, "ratingReason": "one sentence" }
  ]
}`;

  try {
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
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    const text = data.content?.[0]?.text || '';
    const clean = text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
    const result = JSON.parse(clean);

    // Store ratings for WAAR calculation
    window._transactionRatings = (result.investments || []).map((inv, i) => ({
      amount: parseFloat(rows[i]?.amount) || 0,
      rating: inv.riskRating || 3
    }));

    // Show reason under each product name
    const trs = document.querySelectorAll('#l-investRows tr');
    (result.investments || []).forEach(inv => {
      const tr = trs[inv.index - 1];
      if (!tr) return;
      const cell = tr.querySelectorAll('td')[0];
      let hint = cell.querySelector('.rating-hint');
      if (!hint) { hint = document.createElement('div'); hint.className = 'rating-hint'; cell.appendChild(hint); }
      hint.textContent = `IR${inv.riskRating} — ${inv.ratingReason}`;
      hint.style.cssText = 'font-size:11px;color:#185fa5;margin-top:2px;font-style:italic';
    });

    statusEl.textContent = `✓ Ratings assigned — WAAR after will update automatically`;
    statusEl.style.color = '#3b6d11';
    recalcWAAR();

  } catch(e) {
    statusEl.textContent = 'Error: ' + e.message;
    statusEl.style.color = '#a32d2d';
  }
  btn.disabled = false;
};
