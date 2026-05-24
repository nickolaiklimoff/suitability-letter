// ─── Portfolio Report Module ──────────────────────────────────────────────────

// ─── Parse cbonds Excel export ────────────────────────────────────────────────
// Excel serial date helpers (for raw mode parsing)
function excelDateToObj(serial) {
  if (!serial) return null;
  if (serial instanceof Date) return serial;
  // Excel serial: days since 1900-01-01 (with leap year bug)
  const d = new Date((serial - 25569) * 86400 * 1000);
  return isNaN(d.getTime()) ? null : d;
}
function excelDateToStr(serial) {
  const d = excelDateToObj(serial);
  return d ? d.toLocaleDateString('en-GB') : '—';
}

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
          return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false, cellDates: true });
        };
        // Use raw=true for bonds to preserve numeric duration (not parsed as date)
        const getBondSheet = () => {
          const ws = wb.Sheets['bonds'];
          if (!ws) return [];
          return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true, cellDates: false });
        };

        // Parse currencies (cash)
        const currRows = getSheet('currencies').slice(1);
        const cash = currRows.reduce((s, r) => s + (parseFloat(r[2]) || 0), 0);

        // Parse bonds
        const bondRows = getBondSheet().slice(1).filter(r => r[0]);
        const bonds = bondRows.map(r => ({
          name: String(r[0]).trim(),
          type: 'bond',
          pricingSource: String(r[1]||'').trim(),
          quantity: parseFloat(String(r[2]||'').replace(/,/g,'')) || 0,
          faceValueStr: String(r[3]||'').trim(),
          faceValueNum: parseFloat(String(r[3]||'').replace(/,/g,'')) || 0,
          price: parseFloat(r[4]) || 0,
          holdingValue: parseFloat(r[5]) || 0,
          purchasePrice: parseFloat(r[6]) || 0,
          convertedHoldingValue: parseFloat(r[7]) || parseFloat(r[5]) || 0,
          unrealizedPnL: parseFloat(r[8]) || 0,
          interestIncome: parseFloat(r[10]) || 0,
          totalPnLFile: parseFloat(r[11]) || 0,
          isin: String(r[24]||'').trim(),
          issuerRating: String(r[22]||'').trim(),
          durationDays: parseFloat(r[18]) || 0,
          durationYears: parseFloat(r[18]) > 0 ? parseFloat(r[18]) / 365.25 : 0,
          maturityDate: r[27] ? excelDateToStr(r[27]) : '',
          maturityDateObj: r[27] ? excelDateToObj(r[27]) : null,
          putCallDate: r[28] ? excelDateToStr(r[28]) : '',
          pctOfPortfolio: parseFloat(r[29]) || 0,
        }));

        // Parse funds/ETFs
        const fundRows = getSheet('funds').slice(1).filter(r => r[0]);
        const funds = fundRows.map(r => ({
          name: String(r[0]).trim(),
          type: 'etf',
          exchange: String(r[1]||'').trim(),
          quantity: parseFloat(r[2]) || 0,
          price: parseFloat(r[3]) || 0,
          holdingValue: parseFloat(r[4]) || 0,
          purchasePrice: parseFloat(r[5]) || 0,
          convertedHoldingValue: parseFloat(r[6]) || parseFloat(r[4]) || 0,
          unrealizedPnL: parseFloat(r[7]) || 0,
          ticker: String(r[12]||'').trim(),
          tradingCurrency: String(r[13]||'').trim(),
          isin: String(r[14]||'').trim(),
          totalCostRatio: parseFloat(r[15]) || 0,
          pctOfPortfolio: parseFloat(r[18]) || 0,
          tradeDate: r[9] ? new Date(r[9]).toLocaleDateString('en-GB') : '',
        }));

        // Parse stocks
        const stockRows = getSheet('stocks').slice(1).filter(r => r[0]);
        const stocks = stockRows.map(r => ({
          name: String(r[0]).trim(),
          type: 'equity',
          quantity: parseFloat(r[1]) || 0,
          price: parseFloat(r[2]) || 0,
          holdingValue: parseFloat(r[3]) || 0,
          purchasePrice: parseFloat(r[4]) || 0,
          convertedHoldingValue: parseFloat(r[5]) || parseFloat(r[3]) || 0,
          unrealizedPnL: parseFloat(r[6]) || 0,
          tradingCurrency: String(r[7]||'').trim(),
          ticker: String(r[8]||'').trim(),
          pctOfPortfolio: parseFloat(r[10]) || 0,
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

        const tradeRows = getSheet('trades').slice(1).filter(r => r[0]);
        const firstPurchaseMap = {};
        tradeRows.forEach(r => {
          const date = r[0] ? new Date(r[0]) : null;
          const name = String(r[4] || '').trim();
          if (!date || !name) return;
          if (!firstPurchaseMap[name] || date < firstPurchaseMap[name]) {
            firstPurchaseMap[name] = date;
          }
        });

        resolve({
          holdings, bonds, funds, stocks,
          cash, totalValue, totalUnrealizedPnL,
          dividends, coupons,
          totalIncome: dividends + coupons,
          divRows, couponRows,
          tradeRows, firstPurchaseMap
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


// ─── Performance Analytics ────────────────────────────────────────────────────

// MWRR (IRR) via Newton-Raphson
function calcMWRR(cashFlows) {
  // cashFlows: [{date, amount}] where deposits are negative, final value is positive
  if (!cashFlows || cashFlows.length < 2) return null;
  const t0 = cashFlows[0].date;
  const flows = cashFlows.map(cf => ({
    t: (cf.date - t0) / (365.25 * 24 * 3600 * 1000), // years from start
    a: cf.amount
  }));

  let r = 0.1; // initial guess 10%
  for (let iter = 0; iter < 100; iter++) {
    let npv = 0, dnpv = 0;
    flows.forEach(f => {
      const disc = Math.pow(1 + r, f.t);
      npv  += f.a / disc;
      dnpv -= f.t * f.a / (disc * (1 + r));
    });
    if (Math.abs(npv) < 0.01) break;
    if (Math.abs(dnpv) < 1e-10) break;
    r -= npv / dnpv;
    if (r < -0.999) r = -0.999;
  }
  return isFinite(r) ? r : null;
}

// Simple annualized return from holding period
function annualizedReturn(totalReturnPct, years) {
  if (years <= 0) return null;
  return Math.pow(1 + totalReturnPct / 100, 1 / years) - 1;
}

// Normalize name for matching — strip (USD), ®, The, extra spaces
function normName(s) {
  return String(s||'')
    .replace(/\s*\(USD\)\s*/gi, '')
    .replace(/®/g, '')
    .replace(/^The\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Build per-position income map from dividends + coupons
function buildIncomeMap(portfolioData) {
  const map = {};
  const allHoldings = [
    ...(portfolioData.bonds||[]),
    ...(portfolioData.funds||[]),
    ...(portfolioData.stocks||[])
  ];

  // Pre-build normalized name lookup
  const holdingByNorm = {};
  allHoldings.forEach(h => { holdingByNorm[normName(h.name)] = h.name; });

  const findHolding = (rawName) => {
    const norm = normName(rawName);
    // Exact match
    if (holdingByNorm[norm]) return holdingByNorm[norm];
    // Partial match — check if norm contains or is contained by any holding norm
    for (const [hn, hname] of Object.entries(holdingByNorm)) {
      if (norm.includes(hn.substring(0, 18)) || hn.includes(norm.substring(0, 18))) return hname;
    }
    return null;
  };

  // Dividends — name is in column index 3 (Asset)
  (portfolioData.divRows || []).forEach(r => {
    const rawName = String(r[3] || '').trim();
    const amount = parseFloat(r[7]) || parseFloat(r[5]) || 0;
    if (!rawName || !amount) return;
    const hname = findHolding(rawName);
    if (hname) map[hname] = (map[hname] || 0) + amount;
  });

  // Coupons — name is in column index 1 (Bond)
  (portfolioData.couponRows || []).forEach(r => {
    const rawName = String(r[1] || '').trim();
    const amount = parseFloat(r[5]) || parseFloat(r[3]) || 0;
    if (!rawName || !amount) return;
    const hname = findHolding(rawName);
    if (hname) map[hname] = (map[hname] || 0) + amount;
  });

  return map;
}

// Build first purchase date map from trades
function buildFirstPurchaseMap(tradeRows) {
  const map = {};
  (tradeRows || []).forEach(r => {
    const date = r[0] ? new Date(r[0]) : null;
    const name = String(r[4] || '').trim();
    if (!date || !name) return;
    if (!map[name] || date < map[name]) {
      // Match by partial name
      map[name] = date;
    }
  });
  return map;
}

function findFirstPurchaseDate(holdingName, firstPurchaseMap, tradeRows) {
  // Direct match
  if (firstPurchaseMap[holdingName]) return firstPurchaseMap[holdingName];
  // Partial match
  for (const [name, date] of Object.entries(firstPurchaseMap)) {
    if (holdingName.includes(name.substring(0, 15)) || name.includes(holdingName.substring(0, 15))) {
      return date;
    }
  }
  return null;
}

// Calculate per-position performance
function calcPositionPerformance(h, incomeMap, firstPurchaseMap, tradeRows, reportDate) {
  const costBasis = (h.purchasePrice / 100) * (h.quantity || 0) * (h.type === 'bond' ? 1000 : 1);
  // For ETFs/stocks: purchasePrice * quantity directly
  const costBasisFinal = h.type === 'bond'
    ? (h.purchasePrice / 100) * parseFloat(String(h.quantity || '').replace(/,/g,'')) * 1000
    : h.purchasePrice * (h.quantity || 0);

  const income = incomeMap[h.name] || 0;
  const unrealizedPnL = h.unrealizedPnL || 0;
  const totalReturnUSD = unrealizedPnL + income;
  const totalReturnPct = costBasisFinal > 0 ? (totalReturnUSD / costBasisFinal) * 100 : 0;

  const firstDate = findFirstPurchaseDate(h.name, firstPurchaseMap, tradeRows);
  const refDate = reportDate ? new Date(reportDate) : new Date();
  const years = firstDate ? (refDate - firstDate) / (365.25 * 24 * 3600 * 1000) : null;
  const annReturn = years && years > 0 ? annualizedReturn(totalReturnPct, years) : null;

  return { costBasis: costBasisFinal, income, unrealizedPnL, totalReturnUSD, totalReturnPct, annReturn, years };
}

function decodeHorizon(v) {
  const map = {
    'lt1': 'Less than 1 year', 'lt3': 'Up to 3 years', 'lt5': 'Up to 5 years',
    'lt10': 'Up to 10 years', 'gt10': 'Over 10 years'
  };
  return map[v] || v || '—';
}

function decodeObjective(v) {
  const map = {
    'IR1-cap-pres': 'Capital Preservation',
    'IR2-defensive': 'Defensive',
    'IR2-income': 'Income Oriented',
    'IR3-income-growth': 'Income & Growth',
    'IR4-growth': 'Growth Oriented',
    'IR5-high-growth': 'High Growth',
    'IR6-speculation': 'Market Speculation'
  };
  return map[v] || v || '—';
}

window.generatePortfolioReport = function(portfolioData, analytics, benchmark, clientIR, client, reportDate, dataDate, chartSrc) {
  const bm = benchmark[clientIR] || {};
  const { equityPct, bondPct, cashPct, sectors, bondSegments, waar, totalValue, classified } = analytics;
  const { dividends, coupons, totalUnrealizedPnL } = portfolioData;

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
    return `<tr><td>${label}</td><td>${fmtPct(rec)}</td><td>${fmtPct(client)}</td><td style="color:${devColor(dev)}">${fmtDev(dev)}</td></tr>`;
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
    return `<tr>
      <td>${s}</td>
      <td>${fmtPct(rec)}</td>
      <td>${fmtPct(client)}</td>
      <td style="color:${devColor(dev)}">${fmtDev(dev)}</td>
    </tr>`;
  }).join('');

  // Section 5: Performance tables
  const incomeMap = buildIncomeMap(portfolioData);
  const reportDateObj = reportDate ? new Date(reportDate) : new Date();

  // Cost basis helper
  // Bonds: purchasePrice is % of face value (e.g. 97.77), faceValueNum is total face value in USD
  // Funds/Stocks: purchasePrice is price per unit
  const getCostBasis = (h) => {
    if (h.type === 'bond') {
      return h.faceValueNum > 0
        ? (h.purchasePrice / 100) * h.faceValueNum
        : (h.purchasePrice / 100) * h.quantity * 1000; // fallback
    }
    return h.purchasePrice * (h.quantity || 0);
  };

  // ── Bonds table ──
  const bondPerfRows = (portfolioData.bonds||[]).map(h => {
    const costBasis = getCostBasis(h);
    const interestIncome = h.interestIncome || 0;
    const totalPnL = h.unrealizedPnL + interestIncome;
    const totalPnLPct = costBasis > 0 ? (totalPnL / costBasis) * 100 : 0;
    const c = totalPnL >= 0 ? '#3b6d11' : '#a32d2d';
    const pctPort = h.pctOfPortfolio ? (h.pctOfPortfolio * 100).toFixed(1) + '%' : (portfolioData.totalValue > 0 ? (h.convertedHoldingValue / portfolioData.totalValue * 100).toFixed(1) + '%' : '—');
    return `<tr>
      <td style="min-width:160px">${h.name}</td>
      <td>${h.isin||'—'}</td>
      <td>${h.quantity||'—'}</td>
      <td>${h.faceValueStr||'—'}</td>
      <td>${h.price ? h.price.toFixed(2)+'%' : '—'}</td>
      <td>${fmtUSD(h.holdingValue)}</td>
      <td>${h.purchasePrice ? h.purchasePrice.toFixed(2)+'%' : '—'}</td>
      <td>${fmtUSD(h.convertedHoldingValue)}</td>
      <td style="color:${h.unrealizedPnL>=0?'#3b6d11':'#a32d2d'}">${h.unrealizedPnL>=0?'+':''}${fmtUSD(h.unrealizedPnL)}</td>
      <td>${fmtUSD(interestIncome)}</td>
      <td style="color:${c}">${totalPnL>=0?'+':''}${fmtUSD(totalPnL)}</td>
      <td style="color:${c}">${totalPnL>=0?'+':''}${totalPnLPct.toFixed(1)}%</td>
    </tr>`;
  }).join('');

  const bondTotCost = (portfolioData.bonds||[]).reduce((s,h) => s+getCostBasis(h), 0);
  const bondTotIncome = (portfolioData.bonds||[]).reduce((s,h) => s+(incomeMap[h.name]||0), 0);
  const bondTotUnreal = (portfolioData.bonds||[]).reduce((s,h) => s+h.unrealizedPnL, 0);
  const bondTotPnL = bondTotUnreal + bondTotIncome;
  const bondTotPnLPct = bondTotCost > 0 ? (bondTotPnL/bondTotCost*100).toFixed(1)+'%' : '—';
  const bc = bondTotPnL >= 0 ? '#3b6d11' : '#a32d2d';

  const bondPerfFooter = `<tfoot style="font-weight:600"><tr>
    <td colspan="9">BONDS TOTAL</td>
    <td style="color:${bondTotUnreal>=0?'#3b6d11':'#a32d2d'}">${bondTotUnreal>=0?'+':''}${fmtUSD(bondTotUnreal)}</td>
    <td>${fmtUSD(bondTotIncome)}</td>
    <td style="color:${bc}">${bondTotPnL>=0?'+':''}${fmtUSD(bondTotPnL)}</td>
    <td style="color:${bc}">${bondTotPnL>=0?'+':''}${bondTotPnLPct}</td>
    
  </tr></tfoot>`;

  // ── Funds table ──
  const fundPerfRows = (portfolioData.funds||[]).map(h => {
    const costBasis = getCostBasis(h);
    const dividends = incomeMap[h.name] || 0;
    const totalPnL = h.unrealizedPnL + dividends;
    const totalPnLPct = costBasis > 0 ? (totalPnL / costBasis) * 100 : 0;
    const c = totalPnL >= 0 ? '#3b6d11' : '#a32d2d';
    const pctPort = portfolioData.totalValue > 0 ? (h.convertedHoldingValue / portfolioData.totalValue * 100).toFixed(1) + '%' : '—';
    return `<tr>
      <td style="min-width:160px">${h.name}</td>
      <td>${h.isin||'—'}</td>
      <td>${h.quantity||'—'}</td>
      <td>${h.price ? h.price.toFixed(2) : '—'}</td>
      <td>${fmtUSD(h.holdingValue)}</td>
      <td>${h.purchasePrice ? h.purchasePrice.toFixed(4) : '—'}</td>
      <td>${fmtUSD(h.convertedHoldingValue)}</td>
      <td style="color:${h.unrealizedPnL>=0?'#3b6d11':'#a32d2d'}">${h.unrealizedPnL>=0?'+':''}${fmtUSD(h.unrealizedPnL)}</td>
      <td>${fmtUSD(dividends)}</td>
      <td style="color:${c}">${totalPnL>=0?'+':''}${fmtUSD(totalPnL)}</td>
      <td style="color:${c}">${totalPnL>=0?'+':''}${totalPnLPct.toFixed(1)}%</td>
      </tr>`;
  }).join('');

  const fundTotCost = (portfolioData.funds||[]).reduce((s,h) => s+getCostBasis(h), 0);
  const fundTotIncome = (portfolioData.funds||[]).reduce((s,h) => s+(incomeMap[h.name]||0), 0);
  const fundTotUnreal = (portfolioData.funds||[]).reduce((s,h) => s+h.unrealizedPnL, 0);
  const fundTotPnL = fundTotUnreal + fundTotIncome;
  const fundTotPnLPct = fundTotCost > 0 ? (fundTotPnL/fundTotCost*100).toFixed(1)+'%' : '—';
  const fc = fundTotPnL >= 0 ? '#3b6d11' : '#a32d2d';

  const fundPerfFooter = `<tbody><tr style="font-weight:600;background:var(--bg2)">
    <td colspan="7">Funds total</td>
    <td style="color:${fundTotUnreal>=0?'#3b6d11':'#a32d2d'}">${fundTotUnreal>=0?'+':''}${fmtUSD(fundTotUnreal)}</td>
    <td>${fmtUSD(fundTotIncome)}</td>
    <td style="color:${fc}">${fundTotPnL>=0?'+':''}${fmtUSD(fundTotPnL)}</td>
    <td style="color:${fc}">${fundTotPnL>=0?'+':''}${fundTotPnLPct}</td>
  </tr></tbody>`;

  // ── Stocks table ──
  const stockPerfRows = (portfolioData.stocks||[]).map(h => {
    const costBasis = getCostBasis(h);
    const dividends = incomeMap[h.name] || 0;
    const totalPnL = h.unrealizedPnL + dividends;
    const totalPnLPct = costBasis > 0 ? (totalPnL / costBasis) * 100 : 0;
    const c = totalPnL >= 0 ? '#3b6d11' : '#a32d2d';
    const pctPort = portfolioData.totalValue > 0 ? (h.convertedHoldingValue / portfolioData.totalValue * 100).toFixed(1) + '%' : '—';
    return `<tr>
      <td>${h.name}</td>
      <td>${h.ticker||'—'}</td>
      <td>${h.quantity||'—'}</td>
      <td>${h.price ? h.price.toFixed(2) : '—'}</td>
      <td>${fmtUSD(h.holdingValue)}</td>
      <td>${h.purchasePrice ? h.purchasePrice.toFixed(4) : '—'}</td>
      <td>${fmtUSD(h.convertedHoldingValue)}</td>
      <td style="color:${h.unrealizedPnL>=0?'#3b6d11':'#a32d2d'}">${h.unrealizedPnL>=0?'+':''}${fmtUSD(h.unrealizedPnL)}</td>
      <td>${fmtUSD(dividends)}</td>
      <td style="color:${c}">${totalPnL>=0?'+':''}${fmtUSD(totalPnL)}</td>
      <td style="color:${c}">${totalPnL>=0?'+':''}${totalPnLPct.toFixed(1)}%</td>
      <td>${pctPort}</td>
    </tr>`;
  }).join('');

  // ── Portfolio total ──
  const totalCostBasis = bondTotCost + fundTotCost +
    (portfolioData.stocks||[]).reduce((s,h) => s+getCostBasis(h), 0);
  const totalIncome = bondTotIncome + fundTotIncome +
    (portfolioData.stocks||[]).reduce((s,h) => s+(incomeMap[h.name]||0), 0);
  const totalUnreal = portfolioData.totalUnrealizedPnL;
  const totalPnL = totalUnreal + totalIncome;
  const totalPnLPct = totalCostBasis > 0 ? (totalPnL/totalCostBasis*100).toFixed(1)+'%' : '—';

  // MWRR
  const pc = totalPnL >= 0 ? '#3b6d11' : '#a32d2d';

  // Section 6: Holdings detail
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
          <tr><td class="profile-label">Risk Profile</td><td><strong>${clientIR}</strong></td></tr>
          <tr><td class="profile-label">Investment Horizon</td><td>${decodeHorizon(client.profile?.timeHorizon)}</td></tr>
          <tr><td class="profile-label">Primary Objective</td><td>${decodeObjective(client.profile?.investmentObjective)}</td></tr>
          <tr><td class="profile-label">WAAR</td><td><strong>${waar.toFixed(2)}</strong></td></tr>
        </table>
      </div>

      ${chartSrc ? `
      <div class="report-section" style="page-break-inside:avoid">
        <div class="report-section-title">Portfolio Value Over Time</div>
        <img src="${chartSrc}" style="width:100%;max-height:260px;object-fit:contain;object-position:left center;border-radius:6px;display:block" />
      </div>` : ''}

      <div class="report-section">
        <div class="report-section-title">2. Asset Allocation vs ${clientIR} Benchmark</div>
        <table class="report-table">
          <thead><tr><th>Asset Class</th><th>${clientIR} Rec.</th><th>Client Portfolio</th><th>Deviation</th></tr></thead>
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
          <thead><tr><th>Bond Segment</th><th>${clientIR} Rec.</th><th>Client (% of port.)</th><th>Deviation</th></tr></thead>
          <tbody>${segmentRows}</tbody>
        </table>
      </div>

      <div class="report-section">
        <div class="report-section-title">5. Bond Analysis</div>

        <table class="report-table" style="margin-bottom:1rem">
          <thead><tr>
            <th>Bond</th><th>ISIN</th><th>Rating</th><th>Maturity</th><th>Duration (years)</th><th>Weight</th>
          </tr></thead>
          <tbody>
            ${(portfolioData.bonds||[]).map(h => {
              const w = portfolioData.totalValue > 0 ? (h.convertedHoldingValue / portfolioData.totalValue * 100).toFixed(1) + '%' : '—';
              return `<tr>
                <td>${h.name}</td>
                <td>${h.isin||'—'}</td>
                <td>${h.issuerRating||'—'}</td>
                <td>${h.maturityDate||'—'}</td>
                <td>${h.durationYears > 0 ? h.durationYears.toFixed(2) : '—'}</td>
                <td>${w}</td>
              </tr>`;
            }).join('')}
            <tr style="font-weight:600;background:var(--bg2)">
              <td colspan="4">Weighted Average Duration</td>
              <td>${(() => {
                const bonds = portfolioData.bonds||[];
                const totalBondVal = bonds.reduce((s,h) => s + h.convertedHoldingValue, 0);
                const wadur = totalBondVal > 0 ? bonds.reduce((s,h) => s + h.durationYears * h.convertedHoldingValue, 0) / totalBondVal : 0;
                return wadur.toFixed(2) + ' years';
              })()}</td>
              <td></td>
            </tr>
          </tbody>
        </table>

        ${buildBondCharts(portfolioData.bonds||[], portfolioData.totalValue)}
      </div>

      <div class="report-section">
        <div class="report-section-title">6. Performance</div>

        <div style="font-size:13px;font-weight:600;margin:1rem 0 0.5rem;font-family:-apple-system,sans-serif">Bonds</div>
        <div style="overflow-x:auto">
        <table class="report-table" style="">
          <thead><tr>
            <th>Bond</th><th>ISIN</th><th>Qty</th><th>Face Value</th><th>Price</th><th>Holding Value</th><th>Purch. Price</th><th>Conv. Value USD</th><th>Unrealized PnL</th><th>Interest Income</th><th>Total PnL</th><th>Total PnL %</th></tr></thead>
          <tbody>${bondPerfRows}</tbody>
          ${bondPerfFooter}
        </table>
        </div>

        <div style="font-size:13px;font-weight:600;margin:1.5rem 0 0.5rem;font-family:-apple-system,sans-serif">Funds / ETFs</div>
        <div style="overflow-x:auto">
        <table class="report-table" style="">
          <thead><tr>
            <th>Name</th><th>ISIN</th><th>Qty</th><th>Price</th>
            <th>Holding Value</th><th>Purchase Price</th><th>Conv. Value USD</th>
            <th>Unrealized PnL</th><th>Dividends Paid</th>
            <th>Total P&amp;L</th><th>Total P&amp;L %</th>
          </tr></thead>
          <tbody>${fundPerfRows}</tbody>
          ${fundPerfFooter}
        </table>
        </div>

        ${stockPerfRows ? `
        <div style="font-size:13px;font-weight:600;margin:1.5rem 0 0.5rem;font-family:-apple-system,sans-serif">Stocks</div>
        <div style="overflow-x:auto">
        <table class="report-table" style="">
          <thead><tr>
            <th>Name</th><th>Ticker</th><th>Qty</th><th>Price</th>
            <th>Holding Value</th><th>Purchase Price</th><th>Conv. Value USD</th>
            <th>Unrealized PnL</th><th>Dividends Paid</th>
            <th>Total P&L</th><th>Total P&L %</th>
          </tr></thead>
          <tbody>${stockPerfRows}</tbody>
        </table>
        </div>` : ''}

        <table class="report-table" style="margin-top:0.5rem">
          <thead><tr>
            <th>Summary</th><th>Portfolio Value</th><th>Cost Basis</th><th>Income</th>
            <th>Unrealized PnL</th><th>Total PnL $</th><th>Total PnL %</th>
          </tr></thead>
          <tbody>
            <tr>
              <td>Bonds</td>
              <td>—</td>
              <td>${fmtUSD(bondTotCost)}</td>
              <td>${fmtUSD(bondTotIncome)}</td>
              <td style="color:${bondTotUnreal>=0?'#3b6d11':'#a32d2d'}">${bondTotUnreal>=0?'+':''}${fmtUSD(bondTotUnreal)}</td>
              <td style="color:${bc}">${bondTotPnL>=0?'+':''}${fmtUSD(bondTotPnL)}</td>
              <td style="color:${bc}">${bondTotPnL>=0?'+':''}${bondTotPnLPct}</td>
            </tr>
            <tr>
              <td>Funds / ETFs</td>
              <td>—</td>
              <td>${fmtUSD(fundTotCost)}</td>
              <td>${fmtUSD(fundTotIncome)}</td>
              <td style="color:${fundTotUnreal>=0?'#3b6d11':'#a32d2d'}">${fundTotUnreal>=0?'+':''}${fmtUSD(fundTotUnreal)}</td>
              <td style="color:${fc}">${fundTotPnL>=0?'+':''}${fmtUSD(fundTotPnL)}</td>
              <td style="color:${fc}">${fundTotPnL>=0?'+':''}${fundTotPnLPct}</td>
            </tr>
          </tbody>
          <tfoot style="font-weight:600;background:var(--bg2)"><tr>
            <td>PORTFOLIO TOTAL</td>
            <td>${portfolioData.totalValue ? fmtUSD(portfolioData.totalValue) : '—'}</td>
            <td>${fmtUSD(totalCostBasis)}</td>
            <td>${fmtUSD(totalIncome)}</td>
            <td style="color:${totalUnreal>=0?'#3b6d11':'#a32d2d'}">${totalUnreal>=0?'+':''}${fmtUSD(totalUnreal)}</td>
            <td style="color:${pc}">${totalPnL>=0?'+':''}${fmtUSD(totalPnL)}</td>
            <td style="color:${pc}">${totalPnL>=0?'+':''}${totalPnLPct}</td>
          </tr></tfoot>
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

// ─── Export report to Word (.docx) ───────────────────────────────────────────
window.exportReportToWord = async function() {
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
          HeadingLevel, AlignmentType, WidthType, BorderStyle, ShadingType,
          PageOrientation } = docx;

  const btn = document.querySelector('.no-print button:nth-child(2)');
  if (btn) { btn.textContent = 'Generating...'; btn.disabled = true; }

  try {
    // Read current report data from DOM
    const reportContent = document.getElementById('r-reportContent');
    if (!reportContent) throw new Error('No report generated yet');

    const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
    const borders = { top: border, bottom: border, left: border, right: border };
    const cellMargins = { top: 60, bottom: 60, left: 100, right: 100 };

    // Helper to make header cell
    const hCell = (text, w) => new TableCell({
      borders, width: { size: w, type: WidthType.DXA },
      shading: { fill: 'F0F0EC', type: ShadingType.CLEAR },
      margins: cellMargins,
      children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 18, font: 'Arial' })] })]
    });

    // Helper to make data cell
    const dCell = (text, w, color) => new TableCell({
      borders, width: { size: w, type: WidthType.DXA },
      margins: cellMargins,
      children: [new Paragraph({ children: [new TextRun({ text: String(text||''), size: 18, font: 'Arial', color: color || '000000' })] })]
    });

    // Helper to parse table from DOM
    const parseTable = (tableEl) => {
      if (!tableEl) return [];
      const rows = [];
      tableEl.querySelectorAll('tr').forEach(tr => {
        const cells = [];
        tr.querySelectorAll('th, td').forEach(td => cells.push(td.textContent.trim()));
        if (cells.length) rows.push(cells);
      });
      return rows;
    };

    // Build Word table from DOM table
    const buildWordTable = (tableEl, totalWidth) => {
      const rows = parseTable(tableEl);
      if (!rows.length) return null;
      const colCount = rows[0].length;
      const colW = Math.floor(totalWidth / colCount);
      const colWidths = Array(colCount).fill(colW);

      return new Table({
        width: { size: totalWidth, type: WidthType.DXA },
        columnWidths: colWidths,
        rows: rows.map((row, ri) => new TableRow({
          children: row.map((cell, ci) => {
            const isHeader = ri === 0 || tableEl.querySelectorAll('tr')[ri]?.querySelector('th');
            const isBold = ri === 0 || cell.includes('TOTAL') || cell.includes('Total');
            return new TableCell({
              borders, width: { size: colWidths[ci], type: WidthType.DXA },
              shading: { fill: (ri === 0 || cell.includes('TOTAL')) ? 'F0F0EC' : (ri % 2 === 0 ? 'FAFAF8' : 'FFFFFF'), type: ShadingType.CLEAR },
              margins: cellMargins,
              children: [new Paragraph({ children: [new TextRun({
                text: cell, size: 17, font: 'Arial', bold: isBold,
                color: cell.startsWith('+') ? '3b6d11' : cell.startsWith('−') || cell.startsWith('-') ? 'a32d2d' : '000000'
              })] })]
            });
          })
        }))
      });
    };

    // Content width for landscape A4: (16838 - 2*1134) = 14570 DXA
    const W = 14570;

    const children = [];

    // Title
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: 'ORION RIDGE CAPITAL', size: 20, font: 'Arial', color: '666666' })]
    }));
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: 'Portfolio Report', size: 48, bold: true, font: 'Arial' })]
    }));
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: 'Investment Analysis & Advisory', size: 22, font: 'Arial', color: '666666' })]
    }));

    // Extract meta info
    const metaText = reportContent.querySelector('.report-meta')?.textContent || '';
    metaText.split('\n').filter(l => l.trim()).forEach(line => {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [new TextRun({ text: line.trim(), size: 20, font: 'Arial' })]
      }));
    });

    children.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun('')] }));

    // Process each section
    reportContent.querySelectorAll('.report-section').forEach(section => {
      const title = section.querySelector('.report-section-title')?.textContent || '';
      if (title) {
        children.push(new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 240, after: 120 },
          children: [new TextRun({ text: title, bold: true, size: 26, font: 'Arial' })]
        }));
      }

      // Handle chart image
      const img = section.querySelector('img');
      if (img && img.src) {
        children.push(new Paragraph({
          spacing: { after: 120 },
          children: [new TextRun({ text: '[Portfolio Value Chart — see PDF version for chart image]', size: 18, font: 'Arial', italics: true, color: '888888' })]
        }));
      }

      // Handle tables
      section.querySelectorAll('table').forEach(tbl => {
        const wordTable = buildWordTable(tbl, W);
        if (wordTable) {
          children.push(wordTable);
          children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun('')] }));
        }
      });

      // Sub-headings (Bonds, Funds/ETFs labels)
      section.querySelectorAll('div[style*="font-weight:600"]').forEach(div => {
        const text = div.textContent.trim();
        if (text && !div.closest('table')) {
          children.push(new Paragraph({
            spacing: { before: 160, after: 80 },
            children: [new TextRun({ text, bold: true, size: 22, font: 'Arial' })]
          }));
        }
      });
    });

    // Disclaimer
    const disclaimer = reportContent.querySelector('.report-disclaimer')?.textContent || '';
    if (disclaimer) {
      children.push(new Paragraph({ spacing: { before: 240 }, children: [new TextRun('─'.repeat(60))] }));
      children.push(new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({ text: disclaimer.trim(), size: 16, font: 'Arial', color: '666666' })]
      }));
    }

    const doc = new Document({
      styles: {
        default: { document: { run: { font: 'Arial', size: 20 } } },
        paragraphStyles: [
          { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal',
            run: { size: 26, bold: true, font: 'Arial' },
            paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } }
        ]
      },
      sections: [{
        properties: {
          page: {
            size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE },
            margin: { top: 720, right: 720, bottom: 720, left: 720 }
          }
        },
        children
      }]
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'portfolio_report.docx';
    a.click();
    URL.revokeObjectURL(url);

  } catch(e) {
    alert('Error generating Word: ' + e.message);
  }

  if (btn) { btn.textContent = 'Export Word'; btn.disabled = false; }
};

// ─── Bond Analysis Charts ─────────────────────────────────────────────────────
function buildBondCharts(bonds, totalValue) {
  if (!bonds.length) return '';
  const totalBondVal = bonds.reduce((s,h) => s + h.convertedHoldingValue, 0);
  if (!totalBondVal) return '';
  const now = new Date();

  // Tenor buckets
  const tenorBuckets = {'<3 years': 0, '3-5 years': 0, '>5 years': 0};
  bonds.forEach(h => {
    const yrs = h.maturityDateObj ? (h.maturityDateObj - now) / (365.25*24*3600*1000) : 0;
    const w = h.convertedHoldingValue / totalBondVal;
    if (yrs < 3) tenorBuckets['<3 years'] += w;
    else if (yrs <= 5) tenorBuckets['3-5 years'] += w;
    else tenorBuckets['>5 years'] += w;
  });

  // Sector buckets
  const sectorBuckets = {};
  bonds.forEach(h => {
    const name = h.name.toLowerCase();
    const sector = (name.includes('treasury') || name.includes('government') || name.includes('gilt')) ? 'Government' : 'Corporate';
    sectorBuckets[sector] = (sectorBuckets[sector] || 0) + h.convertedHoldingValue / totalBondVal;
  });

  return '<div style="display:flex;gap:2rem;align-items:flex-start;margin-top:1rem">' +
    donutChart(tenorBuckets, ['#5BA4CF','#E85D5D','#5BBFA8'], 'Tenor') +
    donutChart(sectorBuckets, ['#5BA4CF','#E8A85D'], 'Sector') +
    '</div>';
}

function donutChart(data, colors, title) {
  const entries = Object.entries(data).filter(([,v]) => v > 0);
  const total = entries.reduce((s,[,v]) => s+v, 0);
  const r = 70, ri = 44, cx = 150, cy = 115;
  let angle = -Math.PI / 2;
  let paths = '';
  let legends = '';

  entries.forEach(([label, val], i) => {
    const pct = val / total;
    const sweep = pct * 2 * Math.PI;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    angle += sweep;
    const x2 = cx + r * Math.cos(angle);
    const y2 = cy + r * Math.sin(angle);
    const xi1 = cx + ri * Math.cos(angle - sweep);
    const yi1 = cy + ri * Math.sin(angle - sweep);
    const xi2 = cx + ri * Math.cos(angle);
    const yi2 = cy + ri * Math.sin(angle);
    const large = sweep > Math.PI ? 1 : 0;
    const midA = angle - sweep / 2;
    const lx = cx + (r + 20) * Math.cos(midA);
    const ly = cy + (r + 20) * Math.sin(midA);
    const col = colors[i] || '#aaa';

    paths += '<path d="M' + x1 + ',' + y1 +
      ' A' + r + ',' + r + ' 0 ' + large + ',1 ' + x2 + ',' + y2 +
      ' L' + xi2 + ',' + yi2 +
      ' A' + ri + ',' + ri + ' 0 ' + large + ',0 ' + xi1 + ',' + yi1 +
      ' Z" fill="' + col + '"/>';
    paths += '<text x="' + lx + '" y="' + ly + '" text-anchor="middle" font-size="9" fill="#333">' +
      (pct * 100).toFixed(1) + '%</text>';
    legends += '<rect x="10" y="' + (195 + i * 20) + '" width="12" height="12" fill="' + col + '" rx="2"/>';
    legends += '<text x="26" y="' + (205 + i * 20) + '" font-size="10" fill="#444">' +
      label + ': ' + (pct * 100).toFixed(1) + '%</text>';
  });

  return '<svg width="310" height="' + (200 + entries.length * 20) + '" xmlns="http://www.w3.org/2000/svg">' +
    '<text x="150" y="18" text-anchor="middle" font-size="13" font-weight="600" fill="#222">' + title + '</text>' +
    paths + legends + '</svg>';
}
