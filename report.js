// ─── Portfolio Report Module ──────────────────────────────────────────────────

// ─── Parse cbonds Excel export ────────────────────────────────────────────────
window.parseCbondsExport = function(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });

        const getSheet = (name) => {
          const ws = wb.Sheets[name];
          if (!ws) return [];
          return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
        };

        // Parse currencies (cash)
        const currRows = getSheet('currencies').slice(1);
        const cash = currRows.reduce((s, r) => s + (parseFloat(r[2]) || 0), 0);

        // Parse bonds
        const bondRows = getSheet('bonds').slice(1).filter(r => r[0]);
        const bonds = bondRows.map(r => ({
          name: String(r[0]).trim(),
          type: 'bond',
          quantity: parseFloat(r[2]) || 0,
          price: parseFloat(r[4]) || 0,
          holdingValue: parseFloat(r[7]) || parseFloat(r[5]) || 0,
          purchasePrice: parseFloat(r[6]) || 0,
          unrealizedPnL: parseFloat(r[8]) || 0,
        }));

        // Parse funds/ETFs
        const fundRows = getSheet('funds').slice(1).filter(r => r[0]);
        const funds = fundRows.map(r => ({
          name: String(r[0]).trim(),
          type: 'etf',
          exchange: String(r[1] || '').trim(),
          quantity: parseFloat(r[2]) || 0,
          price: parseFloat(r[3]) || 0,
          holdingValue: parseFloat(r[6]) || parseFloat(r[4]) || 0,
          purchasePrice: parseFloat(r[5]) || 0,
          unrealizedPnL: parseFloat(r[7]) || 0,
          tradeDate: r[9] ? new Date(r[9]).toLocaleDateString('en-GB') : '',
        }));

        // Parse stocks
        const stockRows = getSheet('stocks').slice(1).filter(r => r[0]);
        const stocks = stockRows.map(r => ({
          name: String(r[0]).trim(),
          type: 'equity',
          exchange: String(r[1] || '').trim(),
          quantity: parseFloat(r[2]) || 0,
          price: parseFloat(r[3]) || 0,
          holdingValue: parseFloat(r[6]) || parseFloat(r[4]) || 0,
          purchasePrice: parseFloat(r[5]) || 0,
          unrealizedPnL: parseFloat(r[7]) || 0,
        }));

        // Parse income
        const divRows = getSheet('dividends').slice(1).filter(r => r[0]);
        const couponRows = getSheet('coupons').slice(1).filter(r => r[0]);

        const dividends = divRows
          .reduce((s, r) => s + (parseFloat(r[7]) || parseFloat(r[5]) || 0), 0);

        const coupons = couponRows
          .reduce((s, r) => s + (parseFloat(r[5]) || parseFloat(r[3]) || 0), 0);

        const holdings = [...bonds, ...funds, ...stocks];
        const totalValue = holdings.reduce((s, h) => s + h.holdingValue, 0) + cash;
        const totalUnrealizedPnL = holdings.reduce((s, h) => s + h.unrealizedPnL, 0);

        resolve({
          holdings, bonds, funds, stocks,
          cash, totalValue, totalUnrealizedPnL,
          dividends, coupons,
          totalIncome: dividends + coupons
        });
      } catch(err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

// ─── Parse IR Benchmark Excel (monthly) ──────────────────────────────────────
window.parseBenchmarkExcel = function(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });

        // Use 'weights' sheet
        const ws = wb.Sheets['weights'] || wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

        // Build benchmark for each IR: { IR1: {equities, bonds, cash, sectors:{}, bondSegments:{}}, ... }
        const benchmark = {};

        // Find IR columns - look for IR1-IR6 headers
        let headerRow = null;
        let irCols = {};
        for (let i = 0; i < Math.min(10, rows.length); i++) {
          const row = rows[i];
          if (!row) continue;
          for (let j = 0; j < row.length; j++) {
            const v = String(row[j] || '').trim();
            if (/^IR[1-6]$/i.test(v)) {
              headerRow = i;
              irCols[v.toUpperCase()] = j;
            }
          }
          if (headerRow !== null) break;
        }

        if (headerRow === null) {
          // Try 'for reporting IR3' sheet as fallback
          resolve({ fallback: true, raw: rows });
          return;
        }

        // Initialize IR structures
        ['IR1','IR2','IR3','IR4','IR5','IR6'].forEach(ir => {
          if (irCols[ir] !== undefined) {
            benchmark[ir] = { equities: 0, bonds: 0, cash: 0, sectors: {}, bondSegments: {} };
          }
        });

        // Read rows after header
        for (let i = headerRow + 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row) continue;
          const label = String(row[0] || row[1] || '').trim().toLowerCase();
          if (!label) continue;

          Object.entries(irCols).forEach(([ir, col]) => {
            const val = parseFloat(row[col]) || 0;
            if (!benchmark[ir]) return;

            if (label.includes('equit')) benchmark[ir].equities = val;
            else if (label.includes('bond') && !label.includes('government') && !label.includes('invest') && !label.includes('high') && !label.includes('em')) benchmark[ir].bonds = val;
            else if (label.includes('cash')) benchmark[ir].cash = val;
            else if (label.includes('financ')) benchmark[ir].sectors['Financials'] = val;
            else if (label.includes('info') || label.includes('tech')) benchmark[ir].sectors['Info Tech'] = val;
            else if (label.includes('health')) benchmark[ir].sectors['Health Care'] = val;
            else if (label.includes('consumer disc')) benchmark[ir].sectors['Consumer Discretionary'] = val;
            else if (label.includes('industrial')) benchmark[ir].sectors['Industrials'] = val;
            else if (label.includes('communic')) benchmark[ir].sectors['Communication Services'] = val;
            else if (label.includes('consumer stap')) benchmark[ir].sectors['Consumer Staples'] = val;
            else if (label.includes('energy')) benchmark[ir].sectors['Energy'] = val;
            else if (label.includes('material')) benchmark[ir].sectors['Materials'] = val;
            else if (label.includes('util')) benchmark[ir].sectors['Utilities'] = val;
            else if (label.includes('real estate')) benchmark[ir].sectors['Real Estate'] = val;
            else if (label.includes('government')) benchmark[ir].bondSegments['Government'] = val;
            else if (label.includes('invest')) benchmark[ir].bondSegments['Investment Grade'] = val;
            else if (label.includes('high')) benchmark[ir].bondSegments['High Yield'] = val;
            else if (label.includes('em debt') || label.includes('em bond')) benchmark[ir].bondSegments['EM Debt'] = val;
          });
        }

        resolve(benchmark);
      } catch(err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

// ─── Classify holdings ────────────────────────────────────────────────────────
const SECTOR_MAP = {
  'XLK': 'Info Tech', 'Technology Select': 'Info Tech',
  'XLF': 'Financials', 'Financial Select': 'Financials',
  'XLV': 'Health Care', 'Health Care Select': 'Health Care',
  'XLY': 'Consumer Discretionary', 'Consumer Discretionary Select': 'Consumer Discretionary',
  'XLI': 'Industrials', 'Industrial Select': 'Industrials',
  'XLC': 'Communication Services', 'Communication Services Select': 'Communication Services',
  'XLP': 'Consumer Staples', 'Consumer Staples Select': 'Consumer Staples',
  'XLE': 'Energy', 'Energy Select': 'Energy',
  'XLB': 'Materials', 'Materials Select': 'Materials',
  'XLU': 'Utilities', 'Utilities Select': 'Utilities',
  'XLRE': 'Real Estate', 'Real Estate Select': 'Real Estate',
};

const BOND_SEGMENT_MAP = {
  'Treasury': 'Government', 'IEF': 'Government', '7-10 Year Treasury': 'Government',
  'International Corporate': 'Investment Grade', 'IBND': 'Investment Grade', 'Bloomberg Barclays International': 'Investment Grade',
  'High Yield': 'High Yield', 'HYXF': 'High Yield', 'iShares International High Yield': 'High Yield',
  'EM Corporate': 'EM Debt', 'CEMB': 'EM Debt', 'J.P. Morgan EM': 'EM Debt',
};

function classifyHolding(h) {
  const name = h.name.toLowerCase();
  // Check sector ETFs
  for (const [key, sector] of Object.entries(SECTOR_MAP)) {
    if (h.name.includes(key)) return { assetClass: 'equity', sector };
  }
  // Check bond ETFs/segments
  for (const [key, seg] of Object.entries(BOND_SEGMENT_MAP)) {
    if (h.name.includes(key)) return { assetClass: 'bond', bondSegment: seg };
  }
  // By type
  if (h.type === 'bond') return { assetClass: 'bond', bondSegment: 'Investment Grade' };
  if (h.type === 'equity') return { assetClass: 'equity', sector: 'Other' };
  return { assetClass: 'other' };
}

// ─── Calculate portfolio analytics ───────────────────────────────────────────
window.calculatePortfolioAnalytics = function(portfolioData, irRatings, clientIR) {
  const { holdings, cash, totalValue } = portfolioData;

  // Classify each holding
  const classified = holdings.map(h => ({
    ...h,
    ...classifyHolding(h),
    weight: totalValue > 0 ? h.holdingValue / totalValue : 0,
    irRating: irRatings[h.name] || (h.type === 'bond' ? 2 : h.type === 'equity' ? 4 : 3)
  }));

  // Asset class totals
  const equityValue = classified.filter(h => h.assetClass === 'equity').reduce((s,h) => s + h.holdingValue, 0);
  const bondValue = classified.filter(h => h.assetClass === 'bond').reduce((s,h) => s + h.holdingValue, 0);
  const cashValue = cash;

  const equityPct = totalValue > 0 ? equityValue / totalValue : 0;
  const bondPct = totalValue > 0 ? bondValue / totalValue : 0;
  const cashPct = totalValue > 0 ? cashValue / totalValue : 0;

  // Sector breakdown (% of total portfolio)
  const sectors = {};
  classified.filter(h => h.assetClass === 'equity' && h.sector).forEach(h => {
    sectors[h.sector] = (sectors[h.sector] || 0) + h.holdingValue / totalValue;
  });

  // Bond segment breakdown
  const bondSegments = {};
  classified.filter(h => h.assetClass === 'bond' && h.bondSegment).forEach(h => {
    bondSegments[h.bondSegment] = (bondSegments[h.bondSegment] || 0) + h.holdingValue / totalValue;
  });

  // WAAR
  const waarNum = classified.reduce((s,h) => s + h.irRating * h.holdingValue, 0);
  const waar = totalValue > 0 ? waarNum / totalValue : 0;

  return {
    classified, equityValue, bondValue, cashValue,
    equityPct, bondPct, cashPct,
    sectors, bondSegments, waar,
    totalValue
  };
};

// ─── Format helpers ───────────────────────────────────────────────────────────
function fmtPct(v) { return (v * 100).toFixed(1) + '%'; }
function fmtDev(v) { const p = (v * 100).toFixed(1); return (v >= 0 ? '+' : '') + p + 'pp'; }
function fmtUSD(v) { return '$' + Math.abs(v).toLocaleString('en-US', {maximumFractionDigits:0}); }
function fmtUSDSigned(v) { return (v >= 0 ? '+' : '−') + '$' + Math.abs(v).toLocaleString('en-US', {maximumFractionDigits:0}); }
function devColor(v) { return Math.abs(v) < 0.02 ? '#3b6d11' : Math.abs(v) < 0.05 ? '#854f0b' : '#a32d2d'; }

// ─── Generate HTML report ─────────────────────────────────────────────────────
window.generatePortfolioReport = function(portfolioData, analytics, benchmark, clientIR, client, reportDate, dataDate) {
  const bm = benchmark[clientIR] || {};
  const { equityPct, bondPct, cashPct, sectors, bondSegments, waar, totalValue, classified } = analytics;
  const { dividends, coupons, totalIncome, totalUnrealizedPnL } = portfolioData;

  const irBandLocal = (w) => {
    if (w < 2) return 'IR1'; if (w < 3) return 'IR2'; if (w < 4) return 'IR3';
    if (w < 5) return 'IR4'; if (w < 6) return 'IR5'; return 'IR6';
  };

  // Section 2: Asset Allocation
  const allocationRows = [
    ['Equities', bm.equities || 0, equityPct],
    ['Bonds', bm.bonds || 0, bondPct],
    ['Cash', bm.cash || 0, cashPct],
  ].map(([label, rec, client]) => {
    const dev = client - rec;
    const gap = dev * totalValue;
    return `<tr>
      <td>${label}</td>
      <td>${fmtPct(rec)}</td>
      <td>${fmtPct(client)}</td>
      <td style="color:${devColor(dev)}">${fmtDev(dev)}</td>
      <td style="color:${devColor(dev)}">${fmtUSDSigned(gap)}</td>
    </tr>`;
  }).join('');

  // Section 3: Equity sectors
  const allSectors = ['Info Tech','Financials','Health Care','Consumer Discretionary','Industrials',
    'Communication Services','Consumer Staples','Energy','Materials','Utilities','Real Estate'];
  const sectorRows = allSectors.map(s => {
    const rec = bm.sectors?.[s] || 0;
    const client = sectors[s] || 0;
    const dev = client - rec;
    return `<tr>
      <td>${s}</td>
      <td>${fmtPct(rec)}</td>
      <td>${fmtPct(client)}</td>
      <td style="color:${devColor(dev)}">${fmtDev(dev)}</td>
    </tr>`;
  }).join('');

  // Section 4: Bond segments
  const allSegments = ['Government','Investment Grade','High Yield','EM Debt'];
  const segmentRows = allSegments.map(s => {
    const rec = bm.bondSegments?.[s] || 0;
    const client = bondSegments[s] || 0;
    const dev = client - rec;
    const gap = dev * totalValue;
    return `<tr>
      <td>${s}</td>
      <td>${fmtPct(rec)}</td>
      <td>${fmtPct(client)}</td>
      <td style="color:${devColor(dev)}">${fmtDev(dev)}</td>
      <td style="color:${devColor(dev)}">${fmtUSDSigned(gap)}</td>
    </tr>`;
  }).join('');

  // Section 5: Holdings detail
  const holdingRows = [...classified].sort((a,b) => b.holdingValue - a.holdingValue).map(h => {
    const pnlColor = h.unrealizedPnL >= 0 ? '#3b6d11' : '#a32d2d';
    return `<tr>
      <td>${h.name}</td>
      <td>${h.type === 'bond' ? 'Bond' : h.type === 'equity' ? 'Equity' : 'ETF'}</td>
      <td>${fmtPct(h.weight)}</td>
      <td>${fmtUSD(h.holdingValue)}</td>
      <td style="color:${pnlColor}">${h.unrealizedPnL >= 0 ? '+' : ''}${fmtUSD(h.unrealizedPnL)}</td>
      <td><span style="font-weight:600;color:${h.irRating<=2?'#185fa5':h.irRating<=3?'#3b6d11':h.irRating<=4?'#854f0b':'#a32d2d'}">IR${h.irRating}</span></td>
    </tr>`;
  }).join('');

  return `
    <div class="report-doc">
      <div class="report-header">
        <div class="report-logo">ORION RIDGE CAPITAL</div>
        <div class="report-title">Portfolio Report</div>
        <div class="report-subtitle">Investment Analysis &amp; Advisory</div>
        <div class="report-meta">
          <div>Presented by <strong>Nikolai Klimov — Partner</strong></div>
          <div>Portfolio Value: <strong>${fmtUSD(totalValue)}</strong></div>
          <div>Report Date: <strong>${reportDate}</strong></div>
          <div>Data as at: <strong>${dataDate}</strong></div>
          <div>Currency: <strong>USD</strong></div>
        </div>
        <div class="report-confidential">CONFIDENTIAL</div>
      </div>

      <div class="report-section">
        <div class="report-section-title">1. Client Risk Profile</div>
        <table class="report-table profile-table">
          <tr><td class="profile-label">Client</td><td>${client.name}</td></tr>
          <tr><td class="profile-label">Profile</td><td><strong>${clientIR}</strong></td></tr>
          <tr><td class="profile-label">Investment Horizon</td><td>${client.profile?.timeHorizon || '—'}</td></tr>
          <tr><td class="profile-label">Primary Objective</td><td>${client.profile?.investmentObjective || '—'}</td></tr>
          <tr><td class="profile-label">WAAR</td><td><strong>${waar.toFixed(2)} (${irBandLocal(waar)})</strong></td></tr>
        </table>
      </div>

      <div class="report-section">
        <div class="report-section-title">2. Asset Allocation vs ${clientIR} Benchmark</div>
        <table class="report-table">
          <thead><tr><th>Asset Class</th><th>${clientIR} Rec.</th><th>Client Portfolio</th><th>Deviation</th><th>$$ Gap</th></tr></thead>
          <tbody>${allocationRows}</tbody>
        </table>
      </div>

      <div class="report-section">
        <div class="report-section-title">3. Equity Sleeve — Sector Allocation vs ${clientIR}</div>
        <table class="report-table">
          <thead><tr><th>Equity Sector</th><th>${clientIR} Rec.</th><th>Client (% of port.)</th><th>Deviation</th></tr></thead>
          <tbody>${sectorRows}</tbody>
        </table>
      </div>

      <div class="report-section">
        <div class="report-section-title">4. Bond Sleeve — Segment Allocation vs ${clientIR}</div>
        <table class="report-table">
          <thead><tr><th>Bond Segment</th><th>${clientIR} Rec.</th><th>Client (% of port.)</th><th>Deviation</th><th>$$ Gap</th></tr></thead>
          <tbody>${segmentRows}</tbody>
        </table>
      </div>

      <div class="report-section">
        <div class="report-section-title">5. Holdings Detail</div>
        <table class="report-table">
          <thead><tr><th>Position</th><th>Type</th><th>Weight</th><th>Value</th><th>Unrealized PnL</th><th>IR Rating</th></tr></thead>
          <tbody>${holdingRows}</tbody>
        </table>
      </div>

      <div class="report-section">
        <div class="report-section-title">6. Income Summary (total period)</div>
        <table class="report-table">
          <thead><tr><th>Type</th><th>Amount</th></tr></thead>
          <tbody>
            <tr><td>Dividends</td><td>${fmtUSD(dividends)}</td></tr>
            <tr><td>Coupons</td><td>${fmtUSD(coupons)}</td></tr>
            <tr style="font-weight:600"><td>Total income</td><td>${fmtUSD(totalIncome)}</td></tr>
            <tr><td>Unrealized PnL</td><td style="color:${totalUnrealizedPnL>=0?'#3b6d11':'#a32d2d'}">${totalUnrealizedPnL>=0?'+':''}${fmtUSD(totalUnrealizedPnL)}</td></tr>
          </tbody>
        </table>
      </div>

      <div class="report-disclaimer">
        <strong>Important Disclaimer</strong><br>
        This report is indicative and has been compiled solely on the basis of information provided by or on behalf of the client.
        The holdings, valuations, performance figures, and allocations shown are approximate and aggregated for informational purposes only.
        Accurate and authoritative data can only be found in official statements issued by the relevant broker.
        This report does not constitute investment advice, a solicitation, or an offer to buy or sell any security or financial instrument.
        Past performance is not a reliable indicator of future results.<br><br>
        Orion Ridge Capital Ltd | FCA Authorised &amp; Regulated (FRN 830294)<br>
        Report generated: ${reportDate} | For internal advisor use only.
      </div>
    </div>`;
};
