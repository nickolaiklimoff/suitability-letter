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

        // Parse bonds — col indices verified against actual file
        const bondRows = getSheet('bonds').slice(1).filter(r => r[0]);
        const bonds = bondRows.map(r => ({
          name:                  String(r[0]).trim(),
          type:                  'bond',
          quantity:              parseFloat(String(r[2]||'').replace(/,/g,'')) || 0,
          faceValueStr:          String(r[3]||'').trim(),
          faceValueNum:          parseFloat(String(r[3]||'').replace(/,/g,'')) || 0,
          price:                 parseFloat(r[4]) || 0,
          holdingValue:          parseFloat(r[5]) || 0,
          purchasePrice:         parseFloat(r[6]) || 0,
          convertedHoldingValue: parseFloat(r[7]) || parseFloat(r[5]) || 0,
          unrealizedPnL:         parseFloat(r[8]) || 0,
          interestIncome:        parseFloat(r[10]) || 0,
          durationDays:          parseFloat(String(r[18]||'').replace(/,/g,'')) || 0,
          issuerRating:          String(r[22]||'').trim(),
          isin:                  String(r[24]||'').trim(),
          maturityDate:          r[27] ? (r[27] instanceof Date ? r[27].toLocaleDateString('en-GB') : new Date(r[27]).toLocaleDateString('en-GB')) : '',
          maturityDateRaw:       r[27] ? (r[27] instanceof Date ? r[27] : new Date(r[27])) : null,
          pctOfPortfolio:        parseFloat(r[29]) || 0,
        }));

        // Parse funds/ETFs — verified col indices
        const fundRows = getSheet('funds').slice(1).filter(r => r[0]);
        const funds = fundRows.map(r => ({
          name:                  String(r[0]).trim(),
          type:                  'etf',
          exchange:              String(r[1]||'').trim(),
          quantity:              parseFloat(r[2]) || 0,
          price:                 parseFloat(r[3]) || 0,
          holdingValue:          parseFloat(r[4]) || 0,
          purchasePrice:         parseFloat(r[5]) || 0,
          convertedHoldingValue: parseFloat(r[6]) || parseFloat(r[4]) || 0,
          unrealizedPnL:         parseFloat(r[7]) || 0,
          ticker:                String(r[10]||'').trim(),
          isin:                  String(r[14]||'').trim(),
          pctOfPortfolio:        parseFloat(r[18]) || 0,
        }));

        // Parse stocks
        const stockRows = getSheet('stocks').slice(1).filter(r => r[0]);
        const stocks = stockRows.map(r => ({
          name:                  String(r[0]).trim(),
          type:                  'equity',
          quantity:              parseFloat(r[1]) || 0,
          price:                 parseFloat(r[2]) || 0,
          holdingValue:          parseFloat(r[3]) || 0,
          purchasePrice:         parseFloat(r[4]) || 0,
          convertedHoldingValue: parseFloat(r[5]) || parseFloat(r[3]) || 0,
          unrealizedPnL:         parseFloat(r[6]) || 0,
          ticker:                String(r[8]||'').trim(),
          isin:                  String(r[14]||'').trim(),
        }));

        // Parse income
        const divRows  = getSheet('dividends').slice(1).filter(r => r[0]);
        const couponRows = getSheet('coupons').slice(1).filter(r => r[0]);

        const dividends = divRows.reduce((s, r) => s + (parseFloat(r[7]) || parseFloat(r[5]) || 0), 0);
        const coupons   = couponRows.reduce((s, r) => s + (parseFloat(r[5]) || parseFloat(r[3]) || 0), 0);

        const holdings = [...bonds, ...funds, ...stocks];
        const totalValue = holdings.reduce((s, h) => s + h.convertedHoldingValue, 0) + cash;
        const totalUnrealizedPnL = holdings.reduce((s, h) => s + h.unrealizedPnL, 0);

        const tradeRows = getSheet('trades').slice(1).filter(r => r[0]);
        const firstPurchaseMap = {};
        tradeRows.forEach(r => {
          const date = r[0] ? new Date(r[0]) : null;
          const name = String(r[4] || '').trim();
          if (!date || !name) return;
          if (!firstPurchaseMap[name] || date < firstPurchaseMap[name]) firstPurchaseMap[name] = date;
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

// ─── Parse IR Benchmark Excel ─────────────────────────────────────────────────
window.parseBenchmarkExcel = function(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets['weights'] || wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

        const benchmark = {};
        let headerRow = null;
        let irCols = {};

        for (let i = 0; i < Math.min(10, rows.length); i++) {
          const row = rows[i];
          if (!row) continue;
          for (let j = 0; j < row.length; j++) {
            const v = String(row[j] || '').trim();
            if (/^IR[1-6]$/i.test(v)) { headerRow = i; irCols[v.toUpperCase()] = j; }
          }
          if (headerRow !== null) break;
        }

        if (headerRow === null) { resolve({ fallback: true }); return; }

        ['IR1','IR2','IR3','IR4','IR5','IR6'].forEach(ir => {
          if (irCols[ir] !== undefined) benchmark[ir] = { equities:0, bonds:0, cash:0, sectors:{}, bondSegments:{} };
        });

        for (let i = headerRow + 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row) continue;
          const label = String(row[0] || row[1] || '').trim().toLowerCase();
          if (!label) continue;
          Object.entries(irCols).forEach(([ir, col]) => {
            const val = parseFloat(row[col]) || 0;
            if (!benchmark[ir]) return;
            if (label.includes('equit') && !label.includes('sector') && !label.includes('financ') && !label.includes('tech') && !label.includes('health') && !label.includes('consumer') && !label.includes('industrial') && !label.includes('communic') && !label.includes('energy') && !label.includes('material') && !label.includes('util') && !label.includes('real')) benchmark[ir].equities = val;
            else if (label === 'bonds' || (label.includes('bond') && !label.includes('government') && !label.includes('invest') && !label.includes('high') && !label.includes('em'))) benchmark[ir].bonds = val;
            else if (label === 'cash') benchmark[ir].cash = val;
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
            else if (label.includes('em')) benchmark[ir].bondSegments['EM Debt'] = val;
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
  'Technology Select': 'Info Tech', 'XLK': 'Info Tech',
  'Financial Select': 'Financials', 'XLF': 'Financials',
  'Health Care Select': 'Health Care', 'XLV': 'Health Care',
  'Consumer Discretionary Select': 'Consumer Discretionary', 'XLY': 'Consumer Discretionary',
  'Industrial Select': 'Industrials', 'XLI': 'Industrials',
  'Communication Services Select': 'Communication Services', 'XLC': 'Communication Services',
  'Consumer Staples Select': 'Consumer Staples', 'XLP': 'Consumer Staples',
  'Energy Select': 'Energy', 'XLE': 'Energy',
  'Materials Select': 'Materials', 'XLB': 'Materials',
  'Utilities Select': 'Utilities', 'XLU': 'Utilities',
  'Real Estate Select': 'Real Estate', 'XLRE': 'Real Estate',
};

const BOND_SEGMENT_MAP = {
  '7-10 Year Treasury': 'Government', 'IEF': 'Government', 'Treasury Bond ETF': 'Government',
  'International Corporate': 'Investment Grade', 'Bloomberg Barclays International': 'Investment Grade',
  'High Yield': 'High Yield',
  'J.P. Morgan EM': 'EM Debt', 'EM Corporate': 'EM Debt',
};

function classifyHolding(h) {
  for (const [key, sector] of Object.entries(SECTOR_MAP)) {
    if (h.name.includes(key)) return { assetClass: 'equity', sector };
  }
  for (const [key, seg] of Object.entries(BOND_SEGMENT_MAP)) {
    if (h.name.includes(key)) return { assetClass: 'bond', bondSegment: seg };
  }
  if (h.type === 'bond') return { assetClass: 'bond', bondSegment: 'Investment Grade' };
  if (h.type === 'equity') return { assetClass: 'equity', sector: 'Other' };
  return { assetClass: 'other' };
}

// ─── Income map ───────────────────────────────────────────────────────────────
function normName(s) {
  return String(s||'').replace(/\s*\(USD\)\s*/gi,'').replace(/®/g,'').replace(/^The\s+/i,'').replace(/\s+/g,' ').trim().toLowerCase();
}

function buildIncomeMap(portfolioData) {
  const map = {};
  const allHoldings = [...(portfolioData.bonds||[]), ...(portfolioData.funds||[]), ...(portfolioData.stocks||[])];
  const holdingByNorm = {};
  allHoldings.forEach(h => { holdingByNorm[normName(h.name)] = h.name; });

  const findHolding = (rawName) => {
    const norm = normName(rawName);
    if (holdingByNorm[norm]) return holdingByNorm[norm];
    for (const [hn, hname] of Object.entries(holdingByNorm)) {
      if (norm.length > 10 && hn.length > 10 && (norm.includes(hn.substring(0,15)) || hn.includes(norm.substring(0,15)))) return hname;
    }
    return null;
  };

  (portfolioData.divRows||[]).forEach(r => {
    const rawName = String(r[3]||'').trim();
    const amount = parseFloat(r[7]) || parseFloat(r[5]) || 0;
    if (!rawName || !amount) return;
    const hname = findHolding(rawName);
    if (hname) map[hname] = (map[hname]||0) + amount;
  });

  (portfolioData.couponRows||[]).forEach(r => {
    const rawName = String(r[1]||'').trim();
    const amount = parseFloat(r[5]) || parseFloat(r[3]) || 0;
    if (!rawName || !amount) return;
    const hname = findHolding(rawName);
    if (hname) map[hname] = (map[hname]||0) + amount;
  });

  return map;
}

// ─── Calculate analytics ──────────────────────────────────────────────────────
window.calculatePortfolioAnalytics = function(portfolioData, irRatings, clientIR) {
  const { holdings, cash, totalValue } = portfolioData;

  const classified = holdings.map(h => ({
    ...h, ...classifyHolding(h),
    weight: totalValue > 0 ? h.convertedHoldingValue / totalValue : 0,
    irRating: irRatings[h.name] || (h.type === 'bond' ? 2 : h.type === 'equity' ? 4 : 3)
  }));

  const equityValue = classified.filter(h => h.assetClass==='equity').reduce((s,h)=>s+h.convertedHoldingValue,0);
  const bondValue   = classified.filter(h => h.assetClass==='bond').reduce((s,h)=>s+h.convertedHoldingValue,0);
  const cashValue   = cash;

  const equityPct = totalValue > 0 ? equityValue/totalValue : 0;
  const bondPct   = totalValue > 0 ? bondValue/totalValue : 0;
  const cashPct   = totalValue > 0 ? cashValue/totalValue : 0;

  const sectors = {};
  classified.filter(h=>h.assetClass==='equity'&&h.sector).forEach(h => {
    sectors[h.sector] = (sectors[h.sector]||0) + h.convertedHoldingValue/totalValue;
  });

  const bondSegments = {};
  classified.filter(h=>h.assetClass==='bond'&&h.bondSegment).forEach(h => {
    bondSegments[h.bondSegment] = (bondSegments[h.bondSegment]||0) + h.convertedHoldingValue/totalValue;
  });

  const waarNum = classified.reduce((s,h)=>s+h.irRating*h.convertedHoldingValue,0);
  const waar = totalValue > 0 ? waarNum/totalValue : 0;

  return { classified, equityValue, bondValue, cashValue, equityPct, bondPct, cashPct, sectors, bondSegments, waar, totalValue };
};

// ─── Format helpers ───────────────────────────────────────────────────────────
function fmtPct(v) { return (v*100).toFixed(1)+'%'; }
function fmtDev(v) { return (v>=0?'+':'')+((v*100).toFixed(1))+'pp'; }
function fmtUSD(v) { return '$'+Math.abs(v).toLocaleString('en-US',{maximumFractionDigits:0}); }
function fmtUSDSigned(v) { return (v>=0?'+':'−')+'$'+Math.abs(v).toLocaleString('en-US',{maximumFractionDigits:0}); }
function devColor(v) { return Math.abs(v)<0.02?'#3b6d11':Math.abs(v)<0.05?'#854f0b':'#a32d2d'; }
function ratingColor(r) { return r<=2?'#185fa5':r<=3?'#3b6d11':r<=4?'#854f0b':'#a32d2d'; }

// ─── Decode profile values ────────────────────────────────────────────────────
function decodeHorizon(v) {
  const map = { lt1:'Less than 1 year', lt3:'Up to 3 years', lt5:'Up to 5 years', lt10:'Up to 10 years', gt10:'Over 10 years' };
  return map[v] || v || '—';
}
function decodeObjective(v) {
  const map = { 'IR1-cap-pres':'Capital Preservation', 'IR2-defensive':'Defensive', 'IR2-income':'Income Oriented', 'IR3-income-growth':'Income & Growth', 'IR4-growth':'Growth Oriented', 'IR5-high-growth':'High Growth', 'IR6-speculation':'Market Speculation' };
  return map[v] || v || '—';
}

// ─── Section 7: Coupons ───────────────────────────────────────────────────────
function buildCouponsSection(couponRows) {
  if (!couponRows || couponRows.length === 0) return '';

  const fmtDate = v => {
    if (!v) return '—';
    const d = v instanceof Date ? v : new Date(v);
    return isNaN(d) ? '—' : d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  };
  const fmtAmt = v => {
    const n = parseFloat(v) || 0;
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  const sorted = [...couponRows].sort((a, b) => new Date(b[0]) - new Date(a[0]));
  const total  = sorted.reduce((s, r) => s + (parseFloat(r[5]) || parseFloat(r[3]) || 0), 0);

  const rows = sorted.map(r => {
    const rate = parseFloat(r[2]) ? (parseFloat(r[2]) * 100).toFixed(2) + '%' : '—';
    const converted = parseFloat(r[5]) || parseFloat(r[3]) || 0;
    return `<tr>
      <td>${fmtDate(r[0])}</td>
      <td style="min-width:200px">${String(r[1]||'').trim()}</td>
      <td>${rate}</td>
      <td>${fmtAmt(r[3])}</td>
      <td>${String(r[4]||'USD').trim()}</td>
      <td>${fmtAmt(converted)}</td>
    </tr>`;
  }).join('');

  return `
    <div class="report-section">
      <div class="report-section-title">7. Coupon Payments</div>
      <div style="overflow-x:auto">
        <table class="report-table">
          <thead><tr>
            <th>Date</th><th>Bond</th><th>Coupon Rate</th>
            <th>Amount</th><th>CCY</th><th>Converted (USD)</th>
          </tr></thead>
          <tbody>
            ${rows}
            <tr style="font-weight:600;background:var(--bg2)">
              <td colspan="5">Total</td>
              <td>${fmtAmt(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>`;
}

// ─── Section 8: Dividends ─────────────────────────────────────────────────────
function buildDividendsSection(divRows) {
  if (!divRows || divRows.length === 0) return '';

  const fmtDate = v => {
    if (!v) return '—';
    const d = v instanceof Date ? v : new Date(v);
    return isNaN(d) ? '—' : d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  };
  const fmtAmt = v => {
    const n = parseFloat(v) || 0;
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  // cols: Ex-div date[0] / Payment date[1] / Asset class[2] / Asset[3] / Pricing source[4] / Value[5] / Currency[6] / Value in portfolio currency[7]
  const sorted = [...divRows].sort((a, b) => new Date(b[1] || b[0]) - new Date(a[1] || a[0]));
  const total  = sorted.reduce((s, r) => s + (parseFloat(r[7]) || parseFloat(r[5]) || 0), 0);

  const rows = sorted.map(r => {
    const converted = parseFloat(r[7]) || parseFloat(r[5]) || 0;
    return `<tr>
      <td>${fmtDate(r[0])}</td>
      <td>${fmtDate(r[1])}</td>
      <td>${String(r[2]||'').trim()}</td>
      <td style="min-width:200px">${String(r[3]||'').trim()}</td>
      <td>${fmtAmt(r[5])}</td>
      <td>${String(r[6]||'USD').trim()}</td>
      <td>${fmtAmt(converted)}</td>
    </tr>`;
  }).join('');

  return `
    <div class="report-section">
      <div class="report-section-title">8. Dividends</div>
      <div style="overflow-x:auto">
        <table class="report-table">
          <thead><tr>
            <th>Ex-Div Date</th><th>Payment Date</th><th>Asset Class</th>
            <th>Asset</th><th>Amount</th><th>CCY</th><th>Converted (USD)</th>
          </tr></thead>
          <tbody>
            ${rows}
            <tr style="font-weight:600;background:var(--bg2)">
              <td colspan="6">Total</td>
              <td>${fmtAmt(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>`;
}

// ─── Section 9: Trades ────────────────────────────────────────────────────────
function buildTradesSection(tradeRows) {
  if (!tradeRows || tradeRows.length === 0) return '';

  const fmtDate = v => {
    if (!v) return '—';
    const d = v instanceof Date ? v : new Date(v);
    return isNaN(d) ? '—' : d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  };
  const fmtAmt = v => {
    const n = parseFloat(v) || 0;
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };
  const fmtNum = v => {
    const n = parseFloat(v);
    return isNaN(n) ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 4 });
  };

  // cols: Trade date[0] / Settlement date[1] / Direction[2] / Asset class[3] / Asset[4] /
  //       Pricing source[5] / Quantity[6] / Price[7] / Currency[8] / Accrued interest[9] /
  //       Accrued Currency[10] / Outstanding face value[11] / Trade value[12] / Fees[13] /
  //       Fee currency[14] / Converted trade value[15]
  const sorted = [...tradeRows].sort((a, b) => new Date(b[0]) - new Date(a[0]));

  const rows = sorted.map(r => {
    const dir = String(r[2]||'').trim();
    const dirColor = dir.toLowerCase() === 'buy' ? '#3b6d11' : '#a32d2d';
    const fees = parseFloat(r[13]) || 0;
    return `<tr>
      <td>${fmtDate(r[0])}</td>
      <td><span style="color:${dirColor};font-weight:600">${dir}</span></td>
      <td>${String(r[3]||'').trim()}</td>
      <td style="min-width:200px">${String(r[4]||'').trim()}</td>
      <td style="text-align:right">${fmtNum(r[6])}</td>
      <td style="text-align:right">${fmtNum(r[7])}</td>
      <td>${String(r[8]||'').trim()}</td>
      <td style="text-align:right">${fmtAmt(r[15] || r[12])}</td>
      <td style="text-align:right">${fees ? fmtAmt(fees) : '—'}</td>
    </tr>`;
  }).join('');

  return `
    <div class="report-section">
      <div class="report-section-title">9. Trade History</div>
      <div style="overflow-x:auto">
        <table class="report-table">
          <thead><tr>
            <th>Trade Date</th><th>Direction</th><th>Asset Class</th><th>Asset</th>
            <th>Qty</th><th>Price</th><th>CCY</th><th>Trade Value (USD)</th><th>Fees</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// ─── Bond Analysis section HTML ───────────────────────────────────────────────
function buildBondAnalysisSection(bonds, totalPortfolioValue) {
  if (!bonds || bonds.length === 0) return '';

  const tableRows = bonds.map(b => {
    const durYears = b.durationDays > 0 ? (b.durationDays / 365.25).toFixed(2) : '—';
    const weight   = totalPortfolioValue > 0
      ? ((b.convertedHoldingValue / totalPortfolioValue) * 100).toFixed(1) + '%'
      : (b.pctOfPortfolio ? (b.pctOfPortfolio * 100).toFixed(1) + '%' : '—');
    return `<tr>
      <td style="min-width:160px">${b.name}</td>
      <td style="font-family:monospace;font-size:11px">${b.isin || '—'}</td>
      <td>${b.issuerRating || '—'}</td>
      <td>${b.maturityDate || '—'}</td>
      <td>${durYears}</td>
      <td>${weight}</td>
    </tr>`;
  }).join('');

  let wavgNum = 0, wavgDen = 0;
  bonds.forEach(b => {
    const w = b.convertedHoldingValue || 0;
    const d = b.durationDays > 0 ? b.durationDays / 365.25 : 0;
    wavgNum += w * d;
    wavgDen += w;
  });
  const wavgDur = wavgDen > 0 ? (wavgNum / wavgDen).toFixed(2) : '—';

  return `
    <div class="report-section">
      <div class="report-section-title">6. Bond Analysis</div>
      <div style="overflow-x:auto">
        <table class="report-table">
          <thead><tr>
            <th>Bond</th><th>ISIN</th><th>Rating</th><th>Maturity</th>
            <th>Duration (yrs)</th><th>Weight</th>
          </tr></thead>
          <tbody>
            ${tableRows}
            <tr style="font-weight:600;background:var(--bg2)">
              <td colspan="4">Weighted-average duration</td>
              <td colspan="2">${wavgDur} yrs</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>`;
}

// ─── Generate HTML report ─────────────────────────────────────────────────────
window.generatePortfolioReport = function(portfolioData, analytics, benchmark, clientIR, client, reportDate, dataDate, chartSrc) {
  // Persist for Word export
  window._lastPortfolioData = portfolioData;
  window._lastReportConfig  = { clientIR, client, benchmark, reportDate, dataDate,
    horizon:   client?.profile?.timeHorizon,
    objective: client?.profile?.investmentObjective,
  };

  const bm = benchmark[clientIR] || {};
  const { equityPct, bondPct, cashPct, sectors, bondSegments, waar, totalValue, classified } = analytics;
  const { totalUnrealizedPnL } = portfolioData;
  const incomeMap = buildIncomeMap(portfolioData);

  const irBandLocal = (w) => { if(w<2)return'IR1';if(w<3)return'IR2';if(w<4)return'IR3';if(w<5)return'IR4';if(w<6)return'IR5';return'IR6'; };

  // Asset allocation rows
  const allocationRows = [
    ['Equities', bm.equities||0, equityPct],
    ['Bonds',    bm.bonds||0,    bondPct],
    ['Cash',     bm.cash||0,     cashPct],
  ].map(([label, rec, cli]) => {
    const dev = cli - rec;
    return `<tr>
      <td>${label}</td><td>${fmtPct(rec)}</td><td>${fmtPct(cli)}</td>
      <td style="color:${devColor(dev)}">${fmtDev(dev)}</td>
    </tr>`;
  }).join('');

  // Equity sector rows
  const allSectors = ['Info Tech','Financials','Health Care','Consumer Discretionary','Industrials','Communication Services','Consumer Staples','Energy','Materials','Utilities','Real Estate'];
  const sectorRows = allSectors.map(s => {
    const rec = bm.sectors?.[s]||0, cli = sectors[s]||0, dev = cli - rec;
    return `<tr><td>${s}</td><td>${fmtPct(rec)}</td><td>${fmtPct(cli)}</td><td style="color:${devColor(dev)}">${fmtDev(dev)}</td></tr>`;
  }).join('');

  // Bond segment rows
  const allSegs = ['Government','Investment Grade','High Yield','EM Debt'];
  const segmentRows = allSegs.map(s => {
    const rec = bm.bondSegments?.[s]||0, cli = bondSegments[s]||0, dev = cli - rec;
    return `<tr><td>${s}</td><td>${fmtPct(rec)}</td><td>${fmtPct(cli)}</td><td style="color:${devColor(dev)}">${fmtDev(dev)}</td></tr>`;
  }).join('');

  // Performance: cost basis helper
  const getCostBasis = (h) => h.type === 'bond'
    ? (h.purchasePrice/100) * h.faceValueNum
    : h.purchasePrice * (h.quantity||0);

  // Bonds performance
  const bondPerfRows = (portfolioData.bonds||[]).map(h => {
    const cost = getCostBasis(h);
    const coupons = incomeMap[h.name]||0;
    const totalPnL = h.unrealizedPnL + coupons;
    const pct = cost > 0 ? (totalPnL/cost*100).toFixed(1)+'%' : '—';
    const c = totalPnL>=0?'#3b6d11':'#a32d2d';
    return `<tr>
      <td style="min-width:160px">${h.name}</td>
      <td>${h.isin||'—'}</td>
      <td>${h.quantity||'—'}</td>
      <td>${h.faceValueStr||'—'}</td>
      <td>${h.price?h.price.toFixed(2)+'%':'—'}</td>
      <td>${fmtUSD(h.holdingValue)}</td>
      <td>${h.purchasePrice?h.purchasePrice.toFixed(2)+'%':'—'}</td>
      <td>${fmtUSD(h.convertedHoldingValue)}</td>
      <td style="color:${h.unrealizedPnL>=0?'#3b6d11':'#a32d2d'}">${h.unrealizedPnL>=0?'+':''}${fmtUSD(h.unrealizedPnL)}</td>
      <td>${fmtUSD(coupons)}</td>
      <td style="color:${c}">${totalPnL>=0?'+':''}${fmtUSD(totalPnL)}</td>
      <td style="color:${c}">${totalPnL>=0?'+':''}${pct}</td>
    </tr>`;
  }).join('');

  const bondTotUnreal = (portfolioData.bonds||[]).reduce((s,h)=>s+h.unrealizedPnL,0);
  const bondTotIncome = (portfolioData.bonds||[]).reduce((s,h)=>s+(incomeMap[h.name]||0),0);
  const bondTotPnL = bondTotUnreal + bondTotIncome;
  const bondTotCost = (portfolioData.bonds||[]).reduce((s,h)=>s+getCostBasis(h),0);
  const bondTotPct = bondTotCost>0?(bondTotPnL/bondTotCost*100).toFixed(1)+'%':'—';
  const bc = bondTotPnL>=0?'#3b6d11':'#a32d2d';

  // Funds performance
  const fundPerfRows = (portfolioData.funds||[]).map(h => {
    const cost = getCostBasis(h);
    const divs = incomeMap[h.name]||0;
    const totalPnL = h.unrealizedPnL + divs;
    const pct = cost>0?(totalPnL/cost*100).toFixed(1)+'%':'—';
    const c = totalPnL>=0?'#3b6d11':'#a32d2d';
    return `<tr>
      <td style="min-width:150px">${h.name}</td>
      <td>${h.isin||'—'}</td>
      <td>${h.quantity||'—'}</td>
      <td>${h.price?h.price.toFixed(2):'—'}</td>
      <td>${fmtUSD(h.holdingValue)}</td>
      <td>${h.purchasePrice?h.purchasePrice.toFixed(4):'—'}</td>
      <td>${fmtUSD(h.convertedHoldingValue)}</td>
      <td style="color:${h.unrealizedPnL>=0?'#3b6d11':'#a32d2d'}">${h.unrealizedPnL>=0?'+':''}${fmtUSD(h.unrealizedPnL)}</td>
      <td>${fmtUSD(divs)}</td>
      <td style="color:${c}">${totalPnL>=0?'+':''}${fmtUSD(totalPnL)}</td>
      <td style="color:${c}">${totalPnL>=0?'+':''}${pct}</td>
    </tr>`;
  }).join('');

  const fundTotUnreal = (portfolioData.funds||[]).reduce((s,h)=>s+h.unrealizedPnL,0);
  const fundTotIncome = (portfolioData.funds||[]).reduce((s,h)=>s+(incomeMap[h.name]||0),0);
  const fundTotPnL = fundTotUnreal + fundTotIncome;
  const fundTotCost = (portfolioData.funds||[]).reduce((s,h)=>s+getCostBasis(h),0);
  const fundTotPct = fundTotCost>0?(fundTotPnL/fundTotCost*100).toFixed(1)+'%':'—';
  const fc = fundTotPnL>=0?'#3b6d11':'#a32d2d';

  // Portfolio summary
  const totalCostBasis = bondTotCost + fundTotCost;
  const totalIncome = bondTotIncome + fundTotIncome;
  const totalPnL = totalUnrealizedPnL + totalIncome;
  const totalPnLPct = totalCostBasis>0?(totalPnL/totalCostBasis*100).toFixed(1)+'%':'—';
  const pc = totalPnL>=0?'#3b6d11':'#a32d2d';

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
        <div class="report-section-title">5. Performance</div>

        <div style="font-size:13px;font-weight:600;margin:0.75rem 0 0.4rem">Bonds</div>
        <div style="overflow-x:auto">
        <table class="report-table">
          <thead><tr>
            <th>Bond</th><th>ISIN</th><th>Qty</th><th>Face Value</th><th>Price</th>
            <th>Holding Value</th><th>Purch. Price</th><th>Conv. Value USD</th>
            <th>Unrealized PnL</th><th>Coupons Paid</th><th>Total PnL</th><th>Total PnL %</th>
          </tr></thead>
          <tbody>${bondPerfRows}
            <tr style="font-weight:600;background:var(--bg2)">
              <td colspan="8">Bonds total</td>
              <td style="color:${bondTotUnreal>=0?'#3b6d11':'#a32d2d'}">${bondTotUnreal>=0?'+':''}${fmtUSD(bondTotUnreal)}</td>
              <td>${fmtUSD(bondTotIncome)}</td>
              <td style="color:${bc}">${bondTotPnL>=0?'+':''}${fmtUSD(bondTotPnL)}</td>
              <td style="color:${bc}">${bondTotPnL>=0?'+':''}${bondTotPct}</td>
            </tr>
          </tbody>
        </table>
        </div>

        <div style="font-size:13px;font-weight:600;margin:1.25rem 0 0.4rem">Funds / ETFs</div>
        <div style="overflow-x:auto">
        <table class="report-table">
          <thead><tr>
            <th>Name</th><th>ISIN</th><th>Qty</th><th>Price</th>
            <th>Holding Value</th><th>Purchase Price</th><th>Conv. Value USD</th>
            <th>Unrealized PnL</th><th>Dividends Paid</th><th>Total P&amp;L</th><th>Total P&amp;L %</th>
          </tr></thead>
          <tbody>${fundPerfRows}
            <tr style="font-weight:600;background:var(--bg2)">
              <td colspan="7">Funds total</td>
              <td style="color:${fundTotUnreal>=0?'#3b6d11':'#a32d2d'}">${fundTotUnreal>=0?'+':''}${fmtUSD(fundTotUnreal)}</td>
              <td>${fmtUSD(fundTotIncome)}</td>
              <td style="color:${fc}">${fundTotPnL>=0?'+':''}${fmtUSD(fundTotPnL)}</td>
              <td style="color:${fc}">${fundTotPnL>=0?'+':''}${fundTotPct}</td>
            </tr>
          </tbody>
        </table>
        </div>

        <table class="report-table" style="margin-top:0.5rem">
          <thead><tr>
            <th>Summary</th><th>Portfolio Value</th><th>Cost Basis</th><th>Income</th>
            <th>Unrealized PnL</th><th>Total PnL $</th><th>Total PnL %</th>
          </tr></thead>
          <tbody>
            <tr>
              <td>Bonds</td><td>—</td><td>${fmtUSD(bondTotCost)}</td><td>${fmtUSD(bondTotIncome)}</td>
              <td style="color:${bondTotUnreal>=0?'#3b6d11':'#a32d2d'}">${bondTotUnreal>=0?'+':''}${fmtUSD(bondTotUnreal)}</td>
              <td style="color:${bc}">${bondTotPnL>=0?'+':''}${fmtUSD(bondTotPnL)}</td>
              <td style="color:${bc}">${bondTotPnL>=0?'+':''}${bondTotPct}</td>
            </tr>
            <tr>
              <td>Funds / ETFs</td><td>—</td><td>${fmtUSD(fundTotCost)}</td><td>${fmtUSD(fundTotIncome)}</td>
              <td style="color:${fundTotUnreal>=0?'#3b6d11':'#a32d2d'}">${fundTotUnreal>=0?'+':''}${fmtUSD(fundTotUnreal)}</td>
              <td style="color:${fc}">${fundTotPnL>=0?'+':''}${fmtUSD(fundTotPnL)}</td>
              <td style="color:${fc}">${fundTotPnL>=0?'+':''}${fundTotPct}</td>
            </tr>
            <tr style="font-weight:600;background:var(--bg2)">
              <td>PORTFOLIO TOTAL</td>
              <td>${fmtUSD(totalValue)}</td>
              <td>${fmtUSD(totalCostBasis)}</td>
              <td>${fmtUSD(totalIncome)}</td>
              <td style="color:${totalUnrealizedPnL>=0?'#3b6d11':'#a32d2d'}">${totalUnrealizedPnL>=0?'+':''}${fmtUSD(totalUnrealizedPnL)}</td>
              <td style="color:${pc}">${totalPnL>=0?'+':''}${fmtUSD(totalPnL)}</td>
              <td style="color:${pc}">${totalPnL>=0?'+':''}${totalPnLPct}</td>
            </tr>
          </tbody>
        </table>
      </div>

      ${buildBondAnalysisSection(portfolioData.bonds || [], totalValue)}

      ${buildCouponsSection(portfolioData.couponRows || [])}

      ${buildDividendsSection(portfolioData.divRows || [])}

      ${buildTradesSection(portfolioData.tradeRows || [])}

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

// ─── Export to Word ───────────────────────────────────────────────────────────
window.exportReportToWord = async function() {
  const previewEl = document.getElementById('r-reportContent');
  if (!previewEl || !previewEl.innerHTML.trim()) {
    alert('Please generate the report first.'); return;
  }

  // Grab inline styles from the live stylesheet so Word renders correctly
  const styles = Array.from(document.styleSheets)
    .flatMap(ss => { try { return Array.from(ss.cssRules); } catch(e) { return []; } })
    .map(r => r.cssText)
    .join('\n');

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <title>Portfolio Report</title>
  <!--[if gte mso 9]>
  <xml><w:WordDocument><w:View>Print</w:View><w:Zoom>90</w:Zoom>
    <w:DoNotOptimizeForBrowser/>
  </w:WordDocument></xml>
  <![endif]-->
  <style>
    /* Word page setup — A4 landscape */
    @page { size: 29.7cm 21cm; margin: 1.5cm; }
    body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1f2937; }
    ${styles}
    /* Word overrides */
    .report-doc { max-width: 100%; }
    .report-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    .report-table th { background: #1f4e79; color: #fff; padding: 4pt 6pt; text-align: left; font-size: 9pt; }
    .report-table td { padding: 3pt 6pt; border: 0.5pt solid #d1d5db; font-size: 9pt; }
    .report-table tbody tr:nth-child(even) { background: #f5f7fa; }
    .report-section-title { font-size: 14pt; font-weight: bold; color: #1f4e79;
      border-bottom: 1.5pt solid #1f4e79; padding-bottom: 3pt; margin: 14pt 0 6pt; }
    .report-header { margin-bottom: 12pt; }
    .report-logo { font-size: 22pt; font-weight: bold; color: #1f4e79; }
    .report-confidential { color: #9ca3af; font-size: 8pt; margin-top: 4pt; }
  </style>
</head>
<body>
  ${previewEl.innerHTML}
</body>
</html>`;

  const blob = new Blob([html], { type: 'application/msword;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `Portfolio_Report_${new Date().toISOString().slice(0,10)}.doc`;
  a.click();
  URL.revokeObjectURL(url);
};
