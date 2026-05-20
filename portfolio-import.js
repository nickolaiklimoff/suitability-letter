// ─── Portfolio Excel Import ───────────────────────────────────────────────────
// Parses the bank portfolio Excel export (two sections: Bonds + ETFs/Equities)
// Auto-assigns risk ratings per Orion Ridge Capital methodology

// Risk rating rules by instrument type + credit rating
const RISK_RULES = {
  // Government bonds by maturity
  govBond: (maturityYears, rating) => {
    if (rating && /Aa|AA|Aaa|AAA/.test(rating)) {
      if (maturityYears < 5)  return 1;
      if (maturityYears < 10) return 2;
      return 3;
    }
    if (maturityYears < 5)  return 2;
    if (maturityYears < 10) return 3;
    return 4;
  },
  // Corporate bonds by credit rating
  corpBond: (rating) => {
    if (!rating) return 3;
    if (/Aaa|AAA|Aa|AA/.test(rating)) return 2;
    if (/A1|A2|A3|A\+|A-|^A\//.test(rating)) return 2;
    if (/Baa|BBB/.test(rating)) return 3;
    if (/Ba|BB/.test(rating))  return 4;
    if (/B[^B]|B$/.test(rating)) return 5;
    if (/Caa|CCC|Ca|CC|C$/.test(rating)) return 6;
    return 3;
  },
  // ETF by type
  etf: (name) => {
    const n = (name || '').toLowerCase();
    if (/gilt|government|treasury|sovereign/.test(n)) return 2;
    if (/corporate bond|corp bond/.test(n)) return 3;
    if (/high yield|hy bond/.test(n)) return 4;
    if (/emerging market|em bond/.test(n)) return 4;
    if (/real estate|reit/.test(n)) return 3;
    if (/msci world|acwi|s&p 500|global equit/.test(n)) return 3;
    if (/sector|communication|consumer|energy|financial|health|industrial|information|materials|utilities/.test(n)) return 3;
    if (/small cap|micro cap/.test(n)) return 4;
    if (/leverage|2x|3x/.test(n)) return 5;
    return 3;
  }
};

function autoRiskRating(row, type) {
  if (type === 'bond') {
    const name = (row.name || '').toLowerCase();
    const rating = row.issuerRating || '';
    const isGov = /usa|u\.s\.|treasury|gilt|sovereign|government/.test(name) ||
                  /Aa1|AA\+|Aaa|AAA/.test(rating);
    let matYears = 5;
    if (row.maturityDate) {
      const now = new Date();
      matYears = (new Date(row.maturityDate) - now) / (1000 * 60 * 60 * 24 * 365);
    }
    return isGov ? RISK_RULES.govBond(matYears, rating) : RISK_RULES.corpBond(rating);
  }
  if (type === 'etf') return RISK_RULES.etf(row.name);
  return 3;
}

// Parse Excel file using SheetJS (loaded via CDN in HTML)
async function parsePortfolioExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

        const holdings = [];
        let currentType = null;
        let headers = null;

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.every(v => v === null)) { headers = null; continue; }

          const first = String(row[0] || '').trim();

          // Detect section headers
          if (first === 'Bond') { currentType = 'bond'; headers = row; continue; }
          if (first === 'Name') { currentType = 'etf'; headers = row; continue; }
          if (!headers || !first) continue;

          // Map columns by header name
          const idx = (name) => headers.findIndex(h => h && String(h).toLowerCase().includes(name.toLowerCase()));

          if (currentType === 'bond') {
            const name = row[0];
            const amountUSD = parseFloat(row[idx('Converted holding')]) || parseFloat(row[idx('Holding value')]) || 0;
            const issuerRating = row[idx("Issuer rating M/S&P")] || '';
            const maturityDate = row[idx('Maturity date')];
            const isin = row[idx('ISIN')] || '';
            const pctPortfolio = parseFloat(row[idx('% of Total')]) || null;

            if (name && typeof name === 'string' && amountUSD > 0) {
              const h = { name, amountUSD, issuerRating, maturityDate, isin, pctPortfolio, type: 'bond' };
              h.riskRating = autoRiskRating(h, 'bond');
              holdings.push(h);
            }
          }

          if (currentType === 'etf') {
            const name = row[0];
            const amountUSD = parseFloat(row[idx('Converted Holding')]) || parseFloat(row[idx('Holding Value')]) || 0;
            const isin = row[idx('ISIN')] || '';
            const pctPortfolio = parseFloat(row[idx('% of Total')]) || null;

            if (name && typeof name === 'string' && amountUSD > 0) {
              const h = { name, amountUSD, isin, pctPortfolio, type: 'etf' };
              h.riskRating = autoRiskRating(h, 'etf');
              holdings.push(h);
            }
          }
        }

        resolve(holdings);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// Render imported holdings into the portfolio table
function renderImportedHoldings(holdings, prefix) {
  const tbody = document.getElementById(`l-${prefix}Rows`);
  tbody.innerHTML = '';
  holdings.forEach(h => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" value="${escAttr(h.name)}" /></td>
      <td><input type="text" value="${h.type === 'bond' ? 'USD' : 'USD'}" style="width:60px" /></td>
      <td><input type="number" value="${h.amountUSD.toFixed(2)}" oninput="updateWAAR()" /></td>
      <td>
        <input type="number" value="${h.riskRating}" min="1" max="6" step="0.5"
          oninput="updateWAAR()"
          style="width:55px;${h.riskRating >= 4 ? 'color:#a32d2d' : h.riskRating <= 2 ? 'color:#185fa5' : ''}"
          title="Auto-assigned: ${riskRatingLabel(h.riskRating)}" />
      </td>
      <td><button class="btn-remove" onclick="this.closest('tr').remove();updateWAAR()">×</button></td>`;
    tbody.appendChild(tr);
  });
  updateWAAR();
}

function riskRatingLabel(r) {
  const map = {1:'IR1 – Very Low',2:'IR2 – Low',3:'IR3 – Moderate',4:'IR4 – High',5:'IR5 – Very High',6:'IR6 – Extreme'};
  return map[Math.round(r)] || r;
}

function escAttr(s) { return (s||'').replace(/"/g,'&quot;'); }

// ─── Model portfolio Excel import ─────────────────────────────────────────────

async function handleModelImport(input) {
  const file = input.files[0];
  if (!file) return;
  const statusEl = document.getElementById('importModelStatus');
  statusEl.textContent = 'Parsing...';
  statusEl.style.color = '#999';
  try {
    const rows = await parseModelExcel(file);
    renderModelRows(rows);
    statusEl.textContent = `✓ ${rows.length} rows imported`;
    statusEl.style.color = '#3b6d11';
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
    statusEl.style.color = '#a32d2d';
  }
}

async function parseModelExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

        const rows = [];
        // Section headers (no percentage) vs data rows (have percentage)
        const SECTION_HEADERS = ['asset classes', 'equities - sectors allocation', 'bond segments allocation', 'cash'];

        raw.forEach(row => {
          const name = row[1]; // column B = asset class name
          const pct  = row[2]; // column C = percentage
          if (!name || typeof name !== 'string') return;
          const nameClean = name.trim();
          if (!nameClean) return;
          // Skip section headers (no numeric percentage)
          if (SECTION_HEADERS.includes(nameClean.toLowerCase())) return;
          if (pct === null || pct === undefined || isNaN(parseFloat(pct))) return;
          const pctVal = (parseFloat(pct) * 100).toFixed(2).replace(/\.00$/, '');
          rows.push({ asset: nameClean, pct: pctVal });
        });

        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function renderModelRows(rows) {
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
