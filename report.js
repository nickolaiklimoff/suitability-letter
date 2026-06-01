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
          holdingValueOrig:      parseFloat(r[4]) || 0,  // in original ccy (EUR/USD)
          holdingValue:          parseFloat(r[4]) || 0,
          purchasePrice:         parseFloat(r[5]) || 0,
          convertedHoldingValue: parseFloat(r[6]) || parseFloat(r[4]) || 0,
          unrealizedPnLOrig:     parseFloat(r[7]) || 0,  // in original ccy
          unrealizedPnL:         parseFloat(r[7]) || 0,
          ticker:                String(r[10]||'').trim(),
          isin:                  String(r[14]||'').trim(),
          pctOfPortfolio:        parseFloat(r[18]) || 0,
        }));

        // Parse stocks — col: 0=Name,1=Exchange,2=Qty,3=Price,4=HoldingVal,5=PurchPrice,6=ConvHoldingVal,7=UnrealPnL,8=RealPnL,12=TradingCcy,16=Ticker,18=%Port
        const stockRows = getSheet('stocks').slice(1).filter(r => r[0]);
        const stocks = stockRows.map(r => ({
          name:                  String(r[0]).trim(),
          type:                  'equity',
          exchange:              String(r[1]||'').trim(),
          quantity:              parseFloat(r[2]) || 0,
          price:                 parseFloat(r[3]) || 0,
          holdingValueOrig:      parseFloat(r[4]) || 0,  // in original ccy (EUR/USD)
          holdingValue:          parseFloat(r[4]) || 0,
          purchasePrice:         parseFloat(r[5]) || 0,
          convertedHoldingValue: parseFloat(r[6]) || parseFloat(r[4]) || 0,
          unrealizedPnLOrig:     parseFloat(r[7]) || 0,  // in original ccy
          unrealizedPnL:         parseFloat(r[7]) || 0,
          realizedPnLOrig:       parseFloat(r[8]) || 0,  // in original ccy
          realizedPnL:           parseFloat(r[8]) || 0,
          interestIncomeOrig:    parseFloat(r[9]) || 0,  // in original ccy
          interestIncome:        parseFloat(r[9]) || 0,
          currency:              (() => {
            const ccy = String(r[12]||'').trim();
            if (ccy) return ccy;
            // Infer from exchange: European exchanges → EUR, US exchanges → USD
            const exch = String(r[1]||'').toLowerCase();
            if (exch.includes('frankfurt') || exch.includes('xetra') || exch.includes('berlin') ||
                exch.includes('munich') || exch.includes('stuttgart') || exch.includes('hamburg')) return 'EUR';
            return 'USD';
          })(),
          ticker:                String(r[16]||'').trim(),
          pctOfPortfolio:        parseFloat(r[18]) || 0,
        }));

        // Auto-detect portfolio base currency from currencies sheet
        let detectedPortCcy = 'USD';
        try {
          const ccySheet = getSheet('currencies').slice(1).filter(r => r && r[0]);
          let bestRatio = Infinity;
          for (const r of ccySheet) {
            const ccy = String(r[0]||'').trim();
            const qty  = parseFloat(r[1]) || 0;
            const conv = parseFloat(r[2]) || 0;
            if (!ccy || qty <= 0) continue;
            const ratio = Math.abs(conv / qty - 1);
            if (ratio < bestRatio) { bestRatio = ratio; detectedPortCcy = ccy; }
          }
          console.log('[cbonds] detected base ccy:', detectedPortCcy);
        } catch(ccyErr) {
          console.warn('[cbonds] currency detection failed:', ccyErr.message);
        }
        // _detectedPortCcy is passed via resolve() below

        // Parse income — dividends per asset for column matching
        const divRows  = getSheet('dividends').slice(1).filter(r => r[0]);
        const couponRows = getSheet('coupons').slice(1).filter(r => r[0]);

        // Build per-asset dividend map (asset name → total converted amount)
        const divByAsset = {};
        divRows.forEach(r => {
          const assetName = String(r[3]||'').trim();
          const amount = parseFloat(r[7]) || parseFloat(r[5]) || 0;
          if (!assetName) return;
          // Strip exchange suffix like " (USD)" for matching
          const key = assetName.replace(/\s*\([^)]+\)\s*$/, '').trim();
          divByAsset[key] = (divByAsset[key] || 0) + amount;
        });

        // Attach dividends to each holding
        stocks.forEach(h => {
          h.dividendsPaid = divByAsset[h.name] || 0;
          h.totalPnL = h.unrealizedPnL + h.realizedPnL + h.dividendsPaid;
        });
        funds.forEach(h => {
          h.dividendsPaid = divByAsset[h.name] || 0;
          h.totalPnL = h.unrealizedPnL + (h.realizedPnL||0) + h.dividendsPaid;
        });

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
          tradeRows, firstPurchaseMap,
          _detectedPortCcy: detectedPortCcy,
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
  'Magnificent Seven': 'Info Tech', 'MAGS': 'Info Tech', 'Roundhill Magnificent': 'Info Tech',
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
  '20+ Year Treasury': 'Government', 'TMF': 'Government', 'TLT': 'Government',
  'Daily 20+': 'Government', 'Direxion Daily 20': 'Government',
  'International Corporate': 'Investment Grade', 'Bloomberg Barclays International': 'Investment Grade',
  'High Yield': 'High Yield', 'HYG': 'High Yield', 'JNK': 'High Yield',
  'J.P. Morgan EM': 'EM Debt', 'EM Corporate': 'EM Debt',
};

function classifyHolding(h) {
  // ETF/Fund sector map (name-based)
  for (const [key, sector] of Object.entries(SECTOR_MAP)) {
    if (h.name.includes(key)) return { assetClass: 'equity', sector };
  }
  // Bond segment map (name-based)
  for (const [key, seg] of Object.entries(BOND_SEGMENT_MAP)) {
    if (h.name.includes(key)) return { assetClass: 'bond', bondSegment: seg };
  }
  // Individual stock sector classification by ticker or name keywords
  if (h.type === 'equity') {
    const ticker = (h.ticker || '').toUpperCase();
    const name   = (h.name  || '').toLowerCase();
    // Info Tech
    if (['INTC','INL','AMD','NVDA','AAPL','MSFT','GOOGL','GOOG','META','FB2A','AMZN','TSLA','ORCL','CRM','ADBE','AVGO','QCOM','TXN','AMAT','MU','MRVL','UPST'].includes(ticker)) return { assetClass: 'equity', sector: 'Info Tech' };
    if (['BBAI','28K1'].includes(ticker) || name.includes('bigbear') || name.includes('ai holdings')) return { assetClass: 'equity', sector: 'Info Tech' };
    // Communication Services
    if (['META','FB2A','GOOGL','GOOG','NFLX','DIS','CMCSA','T','VZ','TMUS'].includes(ticker)) return { assetClass: 'equity', sector: 'Communication Services' };
    if (name.includes('meta platforms') || name.includes('alphabet') || name.includes('google')) return { assetClass: 'equity', sector: 'Communication Services' };
    // Financials
    if (['V','MA','JPM','BAC','GS','MS','WFC','BLK','SCHW'].includes(ticker)) return { assetClass: 'equity', sector: 'Financials' };
    if (name.includes('visa') || name.includes('mastercard')) return { assetClass: 'equity', sector: 'Financials' };
    // Health Care
    if (['JNJ','UNH','PFE','ABBV','MRK','TMO','ABT','DHR','BMY','AMGN','GILD','ISRG','VRTX'].includes(ticker)) return { assetClass: 'equity', sector: 'Health Care' };
    // Consumer Discretionary
    if (['AMZN','TSLA','HD','MCD','NKE','SBUX','TJX','BKNG','OPAD'].includes(ticker)) return { assetClass: 'equity', sector: 'Consumer Discretionary' };
    if (name.includes('offerpad') || name.includes('amazon')) return { assetClass: 'equity', sector: 'Consumer Discretionary' };
    // Industrials
    if (['GE','HON','UPS','BA','CAT','LMT','RTX','DE','EMR','ETN','12DA'].includes(ticker)) return { assetClass: 'equity', sector: 'Industrials' };
    if (name.includes('dell') || name.includes('eaton')) return { assetClass: 'equity', sector: 'Industrials' };
    // Energy
    if (['XOM','CVX','COP','SLB','EOG','MPC','PSX','VLO','OXY','MP','55H0'].includes(ticker)) return { assetClass: 'equity', sector: 'Energy' };
    if (name.includes('mp materials') || name.includes('exxon') || name.includes('chevron')) return { assetClass: 'equity', sector: 'Energy' };
    // Materials
    if (['LIN','APD','ECL','DD','NEM','FCX','NUE'].includes(ticker)) return { assetClass: 'equity', sector: 'Materials' };
    // Consumer Staples
    if (['PG','KO','PEP','WMT','COST','PM','MO','CL','GIS'].includes(ticker)) return { assetClass: 'equity', sector: 'Consumer Staples' };
    // Utilities
    if (['NEE','DUK','SO','D','AEP','XEL','EXC','SRE'].includes(ticker)) return { assetClass: 'equity', sector: 'Utilities' };
    // Real Estate
    if (['AMT','PLD','CCI','EQIX','PSA','SPG','WELL','DLR'].includes(ticker)) return { assetClass: 'equity', sector: 'Real Estate' };
    // Aerospace / Defense → Industrials
    if (['RKLB','6RJ0'].includes(ticker) || name.includes('rocket lab')) return { assetClass: 'equity', sector: 'Industrials' };
    // Fallback for unmatched stocks
    return { assetClass: 'equity', sector: 'Other' };
  }
  if (h.type === 'bond') return { assetClass: 'bond', bondSegment: 'Investment Grade' };
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
// Currency symbol set when report is generated
let _reportCcySym = '$';
function fmtUSD(v) {
  const abs = Math.abs(v);
  return '<span data-usd="'+v+'" data-prefix="">'+_reportCcySym+Math.round(abs).toLocaleString('en-US')+'</span>';
}
function fmtUSDSigned(v) {
  const prefix = v>=0?'+':'−';
  const abs = Math.abs(v);
  return '<span data-usd="'+v+'" data-prefix="'+prefix+'">'+prefix+_reportCcySym+Math.round(abs).toLocaleString('en-US')+'</span>';
}
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
    <div class="report-section report-section-numbered">
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
    <div class="report-section report-section-numbered">
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
    <div class="report-section report-section-numbered">
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
    <div class="report-section report-section-numbered">
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
// ─── Full Analytics Engine (from holding quotes) ─────────────────────────────

window.computeFullAnalytics = function(portfolioData, benchmarkData, irProfile) {
  try {
    const holdingQuotes = window._holdingQuotesData || {};
    if (Object.keys(holdingQuotes).length === 0) return null;

    // ── Map holding names to quote files ──────────────────────────────────────
    // Match by ticker or name keyword in filename
    const holdings = portfolioData.stocks || [];
    const funds    = portfolioData.funds  || [];
    const bonds    = portfolioData.bonds  || [];
    const allHoldings = [...holdings, ...funds, ...bonds];

    // Build price map: assetName → {date→price}
    const priceMap = {};
    for (const [fname, prices] of Object.entries(holdingQuotes)) {
      const fl = fname.toLowerCase();
      for (const h of allHoldings) {
        const name = (h.name||'').toLowerCase();
        const ticker = (h.ticker||'').toLowerCase();
        // match by ticker in filename or significant name words
        const words = name.split(/[\s,._-]+/).filter(w => w.length > 3);
        const matched = (ticker && fl.includes(ticker)) ||
          words.some(w => fl.includes(w)) ||
          (h.isin && fl.includes((h.isin||'').toLowerCase()));
        if (matched && !priceMap[h.name]) {
          priceMap[h.name] = prices;
        }
      }
    }

    const matchedCount = Object.keys(priceMap).length;
    if (matchedCount < 2) return null; // too few matches

    // ── Portfolio snapshots from trades ──────────────────────────────────────
    const tradeRows = portfolioData.tradeRows || [];
    // Build chronological snapshots
    const snapshots = buildPortfolioSnapshots(tradeRows, portfolioData);

    // ── Build weighted daily returns ──────────────────────────────────────────
    const allDates = new Set();
    for (const prices of Object.values(priceMap)) {
      for (const d of Object.keys(prices)) allDates.add(d);
    }
    const sortedDates = [...allDates].filter(d => d >= '2025-09-01').sort();

    const tradeDateSet = new Set(tradeRows.map(r => {
      if (!r[0]) return null;
      const d = r[0] instanceof Date ? r[0].toISOString().slice(0,10) : String(r[0]).slice(0,10);
      return d;
    }).filter(Boolean));

    const weightedRets = [];
    const EUR_USD = 1.08;

    for (let i = 1; i < sortedDates.length; i++) {
      const dPrev = sortedDates[i-1];
      const dCurr = sortedDates[i];
      if (tradeDateSet.has(dCurr)) continue; // skip capital inflow days

      const pos = getSnapshotOn(snapshots, dCurr);
      const posPrev = getSnapshotOn(snapshots, dPrev);
      if (!pos || !posPrev || JSON.stringify(Object.keys(pos).sort()) !== JSON.stringify(Object.keys(posPrev).sort())) continue;

      // Portfolio value on prev day (for weights)
      let portValPrev = 0;
      const assetVals = {};
      let valid = true;
      for (const [asset, qty] of Object.entries(posPrev)) {
        const prices = priceMap[asset];
        if (!prices || !prices[dPrev]) { valid = false; break; }
        const ccy = getAssetCcy(asset, portfolioData);
        let val = prices[dPrev] * qty;
        if (ccy === 'USD') val /= EUR_USD;
        assetVals[asset] = val;
        portValPrev += val;
      }
      if (!valid || portValPrev <= 0) continue;

      // Weighted return
      let rPort = 0;
      for (const [asset, qty] of Object.entries(posPrev)) {
        const prices = priceMap[asset];
        if (!prices[dCurr]) { valid = false; break; }
        const w = assetVals[asset] / portValPrev;
        const r = (prices[dCurr] - prices[dPrev]) / prices[dPrev];
        rPort += w * r;
      }
      if (valid) weightedRets.push({ date: dCurr, r: rPort, pos: pos });
    }

    if (weightedRets.length < 20) return null;

    const rets = weightedRets.map(x => x.r);
    const n = rets.length;
    const mean = rets.reduce((s,r)=>s+r,0)/n;
    const vol = Math.sqrt(rets.reduce((s,r)=>s+(r-mean)**2,0)/(n-1)*252);

    // Real total return from P&L
    const costBasis = portfolioData._realCostBasis || 1;
    const totalPnL  = portfolioData._realTotalPnL  || 0;
    const realReturn = costBasis > 0 ? totalPnL/costBasis : 0;
    const rfRates = {USD:0.043, EUR:0.026, GBP:0.044, CHF:0.008};
    const rf = rfRates[portfolioData.reportCcy||'USD'] || 0.043;
    const sharpe = vol > 0 ? (realReturn - rf)/vol : 0;

    // Max drawdown
    const equity = [1.0];
    for (const r of rets) equity.push(equity[equity.length-1]*(1+r));
    let peak=1, maxDD=0, peakI=0, ddStart=weightedRets[0].date, ddTrough=weightedRets[0].date;
    for (let i=0;i<equity.length-1;i++) {
      if (equity[i+1]>peak){peak=equity[i+1];peakI=i;}
      const dd=(equity[i+1]-peak)/peak;
      if(dd<maxDD){maxDD=dd;ddTrough=weightedRets[i].date;ddStart=weightedRets[peakI].date;}
    }
    let recovery='In progress';
    for(let i=peakI;i<equity.length-1;i++){
      if(equity[i+1]>=peak){recovery=weightedRets[i].date.slice(0,7);break;}
    }

    // Monthly returns
    const monthly = {};
    for (const {date, r} of weightedRets) {
      const m = date.slice(0,7);
      if (!monthly[m]) monthly[m] = 1;
      monthly[m] *= (1+r);
    }
    const monthlyRets = Object.fromEntries(Object.entries(monthly).map(([m,v])=>[m,v-1]));
    const mVals = Object.values(monthlyRets);
    const bestM  = Object.entries(monthlyRets).reduce((a,b)=>b[1]>a[1]?b:a);
    const worstM = Object.entries(monthlyRets).reduce((a,b)=>b[1]<a[1]?b:a);
    const posMonths = mVals.filter(v=>v>0).length;

    // ── Benchmark returns ────────────────────────────────────────────────────
    const bmData = window._benchmarkQuotesData || {};
    let bmRets = null;
    if (bmData.ACWI && bmData.BONDS) {
      const bm = buildBenchmarkReturns(bmData, benchmarkData, irProfile);
      if (bm && bm.length > 20) {
        // Beta & Alpha
        const bmMap = Object.fromEntries(bm);
        const commonDates = weightedRets.map(x=>x.date).filter(d=>bmMap[d]);
        if (commonDates.length > 20) {
          const pr = commonDates.map(d=>weightedRets.find(x=>x.date===d).r);
          const br = commonDates.map(d=>bmMap[d]);
          const np=pr.length, mp=pr.reduce((s,r)=>s+r,0)/np, mb=br.reduce((s,r)=>s+r,0)/np;
          const covPB=pr.reduce((s,r,i)=>s+(r-mp)*(br[i]-mb),0)/(np-1);
          const varB=br.reduce((s,r)=>s+(r-mb)**2,0)/(np-1);
          const beta=varB>0?covPB/varB:0;
          const alpha=(mp-beta*mb)*252;
          const corrPB=covPB/Math.sqrt(pr.reduce((s,r)=>s+(r-mp)**2,0)/(np-1)*varB)||0;
          bmRets = { beta, alpha, r2: corrPB**2 };
        }
      }
    }

    // ── Correlation matrix ───────────────────────────────────────────────────
    const finalPos = getSnapshotOn(snapshots, sortedDates[sortedDates.length-1]);
    const assetRetsMap = {};
    if (finalPos) {
      for (const asset of Object.keys(finalPos)) {
        if (!priceMap[asset]) continue;
        const ar = [];
        for (let i=1;i<sortedDates.length;i++) {
          const dp=sortedDates[i-1], dc=sortedDates[i];
          const pp=priceMap[asset][dp], pc=priceMap[asset][dc];
          if(pp&&pc&&pp>0) ar.push({date:dc,r:(pc-pp)/pp});
        }
        if(ar.length>20) assetRetsMap[asset]=ar;
      }
    }

    // ── Risk contribution ────────────────────────────────────────────────────
    let riskContrib = null;
    if (finalPos) {
      riskContrib = computeRiskContribution(finalPos, assetRetsMap, portfolioData, EUR_USD);
    }

    return {
      period: weightedRets[0].date.slice(0,7) + ' – ' + weightedRets[weightedRets.length-1].date.slice(0,7),
      n: n, matchedHoldings: matchedCount,
      totalReturn: realReturn, vol, sharpe, rf,
      maxDD, ddStart: ddStart.slice(0,7), ddTrough: ddTrough.slice(0,7), ddRecovery: recovery,
      bestMonth: bestM[1], bestMonthLabel: bestM[0].slice(2).replace('-',"'"),
      worstMonth: worstM[1], worstMonthLabel: worstM[0].slice(2).replace('-',"'"),
      posMonths, totalMonths: mVals.length,
      pctPositive: posMonths/mVals.length,
      monthlyRets,
      benchmark: bmRets,
      riskContrib,
      assetRets: assetRetsMap,
      mode: 'full',
    };
  } catch(e) {
    console.error('Full analytics error:', e);
    return null;
  }
};

// ── Helper: build portfolio snapshots from trade history ─────────────────────
function buildPortfolioSnapshots(tradeRows, portfolioData) {
  // Returns array of {date, positions:{name:qty}}
  const events = [];
  for (const row of tradeRows) {
    if (!row[0]) continue;
    let d = row[0] instanceof Date ? row[0].toISOString().slice(0,10) : String(row[0]).slice(0,10);
    const dir = String(row[1]||'').trim();
    const name = String(row[3]||'').trim();
    const qty  = parseFloat(row[4])||0;
    if (name && qty && (dir==='Buy'||dir==='Sell')) events.push({d,dir,name,qty});
  }
  events.sort((a,b)=>a.d.localeCompare(b.d));
  const snapshots = [];
  const pos = {};
  for (const {d,dir,name,qty} of events) {
    if (dir==='Buy') pos[name]=(pos[name]||0)+qty;
    else pos[name]=Math.max(0,(pos[name]||0)-qty);
    snapshots.push({date:d, positions:{...pos}});
  }
  return snapshots;
}

function getSnapshotOn(snapshots, date) {
  let result = null;
  for (const s of snapshots) {
    if (s.date <= date) result = s.positions;
    else break;
  }
  return result;
}

function getAssetCcy(assetName, portfolioData) {
  const all = [...(portfolioData.stocks||[]), ...(portfolioData.funds||[]), ...(portfolioData.bonds||[])];
  const h = all.find(x => x.name === assetName);
  return h ? (h.currency || 'USD') : 'USD';
}

function buildBenchmarkReturns(bmData, benchmarkData, irProfile) {
  // Get weights from IR benchmark
  const bm = benchmarkData[irProfile] || {};
  const wEq   = (bm.equity || 0.515);
  const wBond = (bm.bond   || 0.475);
  const wCash = (bm.cash   || 0.010);

  const acwiPrices  = bmData.ACWI  || {};
  const bondPrices  = bmData.BONDS || {};
  const cashPrices  = bmData.CASH  || {};

  const allBmDates = [...new Set([...Object.keys(acwiPrices), ...Object.keys(bondPrices)])].sort();
  const bmRets = [];
  for (let i=1; i<allBmDates.length; i++) {
    const dp=allBmDates[i-1], dc=allBmDates[i];
    const ra = acwiPrices[dp]&&acwiPrices[dc] ? (acwiPrices[dc]-acwiPrices[dp])/acwiPrices[dp] : null;
    const rb = bondPrices[dp]&&bondPrices[dc] ? (bondPrices[dc]-bondPrices[dp])/bondPrices[dp] : null;
    const rc = cashPrices[dp]&&cashPrices[dc] ? (cashPrices[dc]-cashPrices[dp])/cashPrices[dp] : 0;
    if (ra===null || rb===null) continue;
    bmRets.push([dc, wEq*ra + wBond*rb + wCash*rc]);
  }
  return bmRets;
}

function computeRiskContribution(positions, assetRetsMap, portfolioData, EUR_USD) {
  const assets = Object.keys(positions).filter(a => assetRetsMap[a]);
  if (assets.length < 2) return null;

  // Common dates
  const commonDates = assets.reduce((dates, a) => {
    const ds = new Set(assetRetsMap[a].map(x=>x.date));
    return dates ? [...dates].filter(d=>ds.has(d)) : [...ds];
  }, null);
  if (!commonDates || commonDates.length < 20) return null;

  // Returns matrix
  const retsByAsset = {};
  for (const a of assets) {
    const rmap = Object.fromEntries(assetRetsMap[a].map(x=>[x.date,x.r]));
    retsByAsset[a] = commonDates.map(d=>rmap[d]||0);
  }
  const T = commonDates.length;

  // Covariance matrix (annualised)
  const means = Object.fromEntries(assets.map(a=>[a, retsByAsset[a].reduce((s,r)=>s+r,0)/T]));
  const cov = {};
  for (const a of assets) {
    cov[a]={};
    for (const b of assets) {
      cov[a][b]=retsByAsset[a].reduce((s,r,t)=>s+(r-means[a])*(retsByAsset[b][t]-means[b]),0)/(T-1)*252;
    }
  }

  // Current weights (last available prices)
  const lastDate = commonDates[commonDates.length-1];
  let portVal = 0;
  const vals = {};
  for (const a of assets) {
    const rmap = Object.fromEntries(assetRetsMap[a].map(x=>[x.date,x.r]));
    // Approximate current price from returns chain
    let v = (positions[a]||0) * 100; // relative
    vals[a] = v;
    portVal += v;
  }
  // Better: use actual last prices
  const allHoldings = [...(portfolioData.stocks||[]),...(portfolioData.funds||[]),...(portfolioData.bonds||[])];
  portVal = 0;
  for (const a of assets) {
    const h = allHoldings.find(x=>x.name===a);
    if (h) {
      let v = (h.convertedHoldingValue || 0);
      vals[a] = v;
      portVal += v;
    }
  }

  if (portVal === 0) return null;
  const weights = Object.fromEntries(assets.map(a=>[a, vals[a]/portVal]));

  // Portfolio variance
  const portVar = assets.reduce((s,a)=>s+assets.reduce((ss,b)=>ss+weights[a]*weights[b]*cov[a][b],0),0);
  const portVol = Math.sqrt(portVar);
  if (portVol === 0) return null;

  // Component risk contribution
  const rc = assets.map(a => {
    const mcr = assets.reduce((s,b)=>s+weights[b]*cov[a][b],0)/portVol;
    const cr  = weights[a]*mcr;
    return { name: a, weight: weights[a], rc: cr, pct: cr/portVol*100 };
  });
  rc.sort((a,b)=>Math.abs(b.pct)-Math.abs(a.pct));
  return { items: rc, portVol };
}

// ─── Section 10: Portfolio Analytics ─────────────────────────────────────────
function buildAnalyticsSection(a, ccy) {
  const sym = {'USD':'$','EUR':'€','GBP':'£','CHF':'Fr '}[ccy] || ccy+' ';
  const pct = v => (v >= 0 ? '+' : '') + (v*100).toFixed(1) + '%';
  const fmt = v => sym + Math.round(Math.abs(v)).toLocaleString('en-US');
  const ddPeriod = a.ddStart && a.ddTrough
    ? a.ddStart.slice(0,7).replace('-', '/') + ' → ' + a.ddTrough.slice(0,7).replace('-', '/')
    : '—';
  const recovered = a.ddRecovery && a.ddRecovery !== 'In progress'
    ? '<span style="color:#3b6d11">✓ Recovered ' + a.ddRecovery.slice(0,7).replace('-','/') + '</span>'
    : '<span style="color:#a32d2d">In progress</span>';
  const posColor = a.pctPositive >= 0.6 ? '#3b6d11' : a.pctPositive >= 0.5 ? '#5C5148' : '#a32d2d';

  return `
    <div class="report-section report-section-numbered">
      <div class="report-section-title">10. Portfolio Analytics</div>
      <div style="font-size:11px;color:#8B7A68;margin-bottom:0.8rem">
        Based on portfolio value history · Period: ${a.period} · Risk-free rate: ${(a.rf*100).toFixed(1)}% (${ccy} 5Y gov. bond)
      </div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-bottom:1.2rem">

        <div style="background:#F5F0EB;border-radius:6px;padding:0.75rem 1rem">
          <div style="font-size:11px;color:#8B7A68;margin-bottom:0.2rem">Total Return</div>
          <div style="font-size:22px;font-weight:700;font-family:'Playfair Display',Georgia,serif;color:${a.totalReturn>=0?'#3b6d11':'#a32d2d'}">${pct(a.totalReturn)}</div>
          <div style="font-size:11px;color:#8B7A68">${a.period}</div>
        </div>

        <div style="background:#F5F0EB;border-radius:6px;padding:0.75rem 1rem">
          <div style="font-size:11px;color:#8B7A68;margin-bottom:0.2rem">Volatility (ann.)</div>
          <div style="font-size:22px;font-weight:700;font-family:'Playfair Display',Georgia,serif;color:#2C2C2C">${(a.vol*100).toFixed(1)}%</div>
          <div style="font-size:11px;color:#8B7A68">Annualised std. deviation</div>
        </div>

        <div style="background:#F5F0EB;border-radius:6px;padding:0.75rem 1rem">
          <div style="font-size:11px;color:#8B7A68;margin-bottom:0.2rem">Sharpe Ratio</div>
          <div style="font-size:22px;font-weight:700;font-family:'Playfair Display',Georgia,serif;color:${a.sharpe>=1?'#3b6d11':a.sharpe>=0?'#5C5148':'#a32d2d'}">${a.sharpe.toFixed(2)}</div>
          <div style="font-size:11px;color:#8B7A68">rf = ${(a.rf*100).toFixed(1)}%</div>
        </div>

        <div style="background:#FAF7F4;border:1px solid #E8E0D8;border-radius:6px;padding:0.75rem 1rem">
          <div style="font-size:11px;color:#8B7A68;margin-bottom:0.2rem">Max Drawdown</div>
          <div style="font-size:22px;font-weight:700;font-family:'Playfair Display',Georgia,serif;color:#a32d2d">${pct(a.maxDD)}</div>
          <div style="font-size:11px;color:#8B7A68">${ddPeriod} · ${recovered}</div>
        </div>

        <div style="background:#FAF7F4;border:1px solid #E8E0D8;border-radius:6px;padding:0.75rem 1rem">
          <div style="font-size:11px;color:#8B7A68;margin-bottom:0.2rem">Best / Worst Month</div>
          <div style="font-size:18px;font-weight:700;font-family:'Playfair Display',Georgia,serif">
            <span style="color:#3b6d11">${pct(a.bestMonth)}</span>
            <span style="color:#D4C9BE;margin:0 4px">/</span>
            <span style="color:#a32d2d">${pct(a.worstMonth)}</span>
          </div>
          <div style="font-size:11px;color:#8B7A68">${a.bestMonthLabel} / ${a.worstMonthLabel}</div>
        </div>

        <div style="background:#FAF7F4;border:1px solid #E8E0D8;border-radius:6px;padding:0.75rem 1rem">
          <div style="font-size:11px;color:#8B7A68;margin-bottom:0.2rem">Positive Months</div>
          <div style="font-size:22px;font-weight:700;font-family:'Playfair Display',Georgia,serif;color:${posColor}">${a.posMonths}/${a.totalMonths}</div>
          <div style="font-size:11px;color:#8B7A68">${(a.pctPositive*100).toFixed(0)}% of periods</div>
        </div>

      </div>

      <div style="font-size:10px;color:#8B7A68;font-style:italic">
        ${a.mode === 'full'
          ? `Full analytics from daily price data (${a.n} observations, ${a.matchedHoldings} holdings matched). Total Return from actual P&L. Sharpe: (Return − rf) / σ.`
          : `Analytics from portfolio value chart (AI image recognition, ±2–3%). Total Return from actual P&L. Sharpe: (Return − rf) / σ.`}
      </div>

      ${a.benchmark ? `
      <div style="margin-top:1.2rem">
        <div style="font-size:13px;font-weight:600;color:#5A7259;margin-bottom:0.5rem">vs Benchmark (${Math.round((a.benchmark.wEq||0.515)*100)}% ACWI + ${Math.round((a.benchmark.wBond||0.475)*100)}% Global Agg)</div>
        <div style="display:flex;gap:1.5rem;flex-wrap:wrap">
          <div><span style="font-size:11px;color:#8B7A68">Beta</span><br><strong style="font-size:18px">${a.benchmark.beta.toFixed(2)}</strong></div>
          <div><span style="font-size:11px;color:#8B7A68">Alpha (ann.)</span><br><strong style="font-size:18px;color:${a.benchmark.alpha>=0?'#3b6d11':'#a32d2d'}">${a.benchmark.alpha>=0?'+':''}${(a.benchmark.alpha*100).toFixed(1)}%</strong></div>
          <div><span style="font-size:11px;color:#8B7A68">R²</span><br><strong style="font-size:18px">${a.benchmark.r2.toFixed(2)}</strong></div>
        </div>
      </div>` : ''}

      ${a.riskContrib ? `
      <div style="margin-top:1.2rem">
        <div style="font-size:13px;font-weight:600;color:#5A7259;margin-bottom:0.5rem">Risk Contribution by Position</div>
        <table class="report-table" style="font-size:10px">
          <thead><tr><th>Position</th><th>Weight</th><th>Risk Contrib</th><th>% of Total Risk</th></tr></thead>
          <tbody>
            ${a.riskContrib.items.slice(0,10).map(rc => `
            <tr>
              <td>${rc.name}</td>
              <td>${(rc.weight*100).toFixed(1)}%</td>
              <td style="color:${rc.rc>=0?'#3b6d11':'#a32d2d'}">${rc.rc>=0?'+':''}${(rc.rc*100).toFixed(2)}%</td>
              <td style="color:${Math.abs(rc.pct)>20?'#a32d2d':Math.abs(rc.pct)>10?'#8B7A68':'#3b6d11'}">${rc.pct.toFixed(1)}%</td>
            </tr>`).join('')}
          </tbody>
        </table>
        <div style="font-size:10px;color:#8B7A68;margin-top:4px">Portfolio volatility: ${(a.riskContrib.portVol*100).toFixed(1)}% (annualised)</div>
      </div>` : ''}

    </div>`;
}

// ─── Chart analytics extractor (calls Claude API with chart image) ────────────
window.extractChartAnalytics = async function(chartSrc, apiKey, portCcy) {
  if (!chartSrc || !apiKey) return null;
  const rfRates = { USD: 0.043, EUR: 0.026, GBP: 0.044, CHF: 0.008 };
  const rf = rfRates[portCcy] || 0.043;

  try {
    // Convert src to base64 if it's a data URL, else fetch
    let b64, mime = 'image/png';
    if (chartSrc.startsWith('data:')) {
      const parts = chartSrc.split(',');
      mime = parts[0].split(':')[1].split(';')[0];
      b64 = parts[1];
    } else {
      const blob = await fetch(chartSrc).then(r => r.blob());
      const ab = await blob.arrayBuffer();
      b64 = btoa(String.fromCharCode(...new Uint8Array(ab)));
      mime = blob.type || 'image/png';
    }

    console.log('[extractChart] calling Claude API, image size:', b64.length, 'mime:', mime);
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mime, data: b64 } },
            { type: 'text', text: `This is a portfolio value chart. Extract the time series carefully.
Read Y-axis values and X-axis dates precisely using the grid lines.
Return ONLY valid JSON, no markdown, no explanation:
{"series": [{"date":"YYYY-MM","value":1234567}, ...]}
Include one data point per month (or more if visible). Be precise about values.` }
          ]
        }]
      })
    });

    const data = await resp.json();
    const text = data.content?.[0]?.text || '';
    console.log('[extractChart] Claude response:', text.slice(0, 300));
    // Extract JSON robustly — find first { ... } block
    let clean = text.replace(/```json|```/g, '').trim();
    // If response has text before/after JSON, extract just the JSON object
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response: ' + text.slice(0,100));
    clean = jsonMatch[0];
    const parsed = JSON.parse(clean);
    const series = parsed.series || parsed.data || parsed.points || Object.values(parsed)[0];
    if (!series || series.length < 3) return null;

    // Compute analytics from series
    const vals = series.map(p => parseFloat(p.value));
    const dates = series.map(p => String(p.date));
    const rets = vals.map((v,i) => i===0 ? 0 : (v-vals[i-1])/vals[i-1]).slice(1);

    const n = rets.length;
    const freq = n <= 14 ? 12 : 52; // monthly or weekly
    const mean = rets.reduce((s,r)=>s+r,0)/n;
    const variance = rets.reduce((s,r)=>s+(r-mean)**2,0)/(n-1);
    const vol = Math.sqrt(variance * freq);
    const totalReturn = (vals[vals.length-1]-vals[0])/vals[0];
    const rfPer = rf/freq;
    const sharpe = (totalReturn - rf) / vol;

    // Max drawdown
    let peak=vals[0], maxDD=0, peakIdx=0, ddStart=dates[0], ddTrough=dates[0];
    vals.forEach((v,i) => {
      if(v>peak){peak=v;peakIdx=i;}
      const dd=(v-peak)/peak;
      if(dd<maxDD){maxDD=dd;ddTrough=dates[i];ddStart=dates[peakIdx];}
    });
    let ddRecovery='In progress';
    for(let i=peakIdx;i<vals.length;i++){if(vals[i]>=peak){ddRecovery=dates[i];break;}}

    // Monthly aggregation for best/worst
    const monthlyRets = [];
    const monthLabels = [];
    // Group by month label (YYYY-MM)
    const byMonth = {};
    series.forEach((p,i) => {
      const m = String(p.date).slice(0,7);
      if(!byMonth[m]) byMonth[m] = {start: parseFloat(series[Math.max(0,i-1)?.value||p.value]), end: parseFloat(p.value), label: m};
      byMonth[m].end = parseFloat(p.value);
    });
    const mKeys = Object.keys(byMonth).sort();
    for(let i=1;i<mKeys.length;i++){
      const prev = byMonth[mKeys[i-1]].end;
      const curr = byMonth[mKeys[i]].end;
      const r = (curr-prev)/prev;
      monthlyRets.push(r);
      monthLabels.push(mKeys[i].replace('-',"'").slice(2));
    }

    const bestIdx = monthlyRets.indexOf(Math.max(...monthlyRets));
    const worstIdx = monthlyRets.indexOf(Math.min(...monthlyRets));
    const posMonths = monthlyRets.filter(r=>r>0).length;
    const months = mKeys.length - 1;
    const startMonth = mKeys[0].replace('-',"'").slice(2);
    const endMonth = mKeys[mKeys.length-1].replace('-',"'").slice(2);

    return {
      period: startMonth + ' – ' + endMonth,
      totalReturn, vol, sharpe, rf, maxDD,
      ddStart, ddTrough, ddRecovery,
      bestMonth: Math.max(...monthlyRets),
      worstMonth: Math.min(...monthlyRets),
      bestMonthLabel: monthLabels[bestIdx] || '—',
      worstMonthLabel: monthLabels[worstIdx] || '—',
      posMonths, totalMonths: months,
      pctPositive: months > 0 ? posMonths/months : 0,
    };
  } catch(e) {
    console.error('Chart analytics error:', e);
    return null;
  }
};

window.generatePortfolioReport = function(portfolioData, analytics, benchmark, clientIR, client, reportDate, dataDate, chartSrc, breakdownSrc) {
  // Set report currency symbol globally for fmtUSD
  _reportCcySym = portfolioData.reportCcySym || '$';
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

  // Stocks performance
  // Per-position: show values in ORIGINAL currency of the position (EUR/USD)
  // Totals: use convertedHoldingValue (already in report base currency, then FX-converted to USD)
  const fmtOrig = (v, ccy, signed=false) => {
    const sym = ccy==='EUR'?'€':ccy==='GBP'?'£':ccy==='CHF'?'Fr ':ccy==='USD'?'$':(ccy+' ');
    const prefix = signed ? (v>=0?'+':'−') : '';
    const abs = Math.abs(v);
    return prefix + sym + Math.round(abs).toLocaleString('en-US');
  };

  const stockPerfRows = (portfolioData.stocks||[]).map(h => {
    const ccy = h.currency || 'USD';
    // Original-currency values (from xlsx, before any FX)
    const holdOrig   = h.holdingValueOrig   || 0;
    const unrealOrig = h.unrealizedPnLOrig  || 0;
    const realOrig   = h.realizedPnLOrig    || 0;
    const divsOrig   = Math.max(h.interestIncomeOrig||0, 0);
    const totalOrig  = unrealOrig + realOrig + divsOrig;
    // Cost in orig ccy for % calc
    const costOrig   = holdOrig - unrealOrig;
    const pct        = costOrig > 0 ? (totalOrig/costOrig*100).toFixed(1)+'%' : '—';
    const c = totalOrig>=0?'#3b6d11':'#a32d2d';
    const uc = unrealOrig>=0?'#3b6d11':'#a32d2d';
    return `<tr>
      <td style="min-width:150px">${h.name}</td>
      <td>${h.ticker||'—'}</td>
      <td>${ccy}</td>
      <td>${h.quantity||'—'}</td>
      <td>${h.price ? h.price.toFixed(2)+' '+ccy : '—'}</td>
      <td>${fmtOrig(holdOrig, ccy)}</td>
      <td>${h.purchasePrice ? h.purchasePrice.toFixed(2)+' '+ccy : '—'}</td>
      <td style="color:${uc}">${fmtOrig(unrealOrig, ccy, true)}</td>
      <td style="color:${realOrig>=0?'#3b6d11':'#a32d2d'}">${realOrig!==0?fmtOrig(realOrig,ccy,true):'—'}</td>
      <td>${divsOrig!==0?fmtOrig(divsOrig, ccy):'—'}</td>
      <td style="color:${c}">${fmtOrig(totalOrig, ccy, true)}</td>
      <td style="color:${c}">${totalOrig>=0?'+':''}${pct}</td>
    </tr>`;
  }).join('');

  // All monetary totals in USD (convertedHoldingValue already USD from cbonds)
  const stockTotUnreal = (portfolioData.stocks||[]).reduce((s,h)=>s+h.unrealizedPnL,0);
  const stockTotIncome = (portfolioData.stocks||[]).reduce((s,h)=>s+(incomeMap[h.name]||0),0);
  const stockTotReal   = (portfolioData.stocks||[]).reduce((s,h)=>s+(h.realizedPnL||0),0);
  const stockTotPnL    = stockTotUnreal + stockTotReal + stockTotIncome;
  const stockTotHoldUSD = (portfolioData.stocks||[]).reduce((s,h)=>s+h.convertedHoldingValue,0);
  const stockTotCostUSD = stockTotHoldUSD - stockTotUnreal; // approx cost = converted value minus unrealized
  const stockTotPct    = stockTotCostUSD>0?(stockTotPnL/stockTotCostUSD*100).toFixed(1)+'%':'—';
  const sc = stockTotPnL>=0?'#3b6d11':'#a32d2d';

  // Portfolio summary
  const totalCostBasis = bondTotCost + fundTotCost + stockTotCostUSD;
  const totalIncome = bondTotIncome + fundTotIncome + stockTotIncome;
  const totalPnL = totalUnrealizedPnL + stockTotReal + totalIncome;
  const totalPnLPct = totalCostBasis>0?(totalPnL/totalCostBasis*100).toFixed(1)+'%':'—';
  // Expose for full analytics computation
  portfolioData._realCostBasis = totalCostBasis;
  portfolioData._realTotalPnL  = totalPnL;
  const pc = totalPnL>=0?'#3b6d11':'#a32d2d';

  // Section 10: analytics — time-series metrics from chart, Total Return from real P&L data
  let analyticsHtml = '';
  if (portfolioData._analytics) {
    const a = portfolioData._analytics;
    // Use real P&L total return (cost-basis) instead of chart-derived market return
    const realReturn = totalCostBasis > 0 ? totalPnL / totalCostBasis : a.totalReturn;
    // Recalculate Sharpe with real return (volatility still from chart)
    const realSharpe = a.vol > 0 ? (realReturn - (a.rf || 0.026)) / a.vol : a.sharpe;
    analyticsHtml = buildAnalyticsSection({
      ...a,
      totalReturn: realReturn,
      sharpe: realSharpe,
    }, portfolioData.reportCcy || 'USD');
  }

  return `
    <div class="report-cover">
      <div class="report-cover-logo">ORION RIDGE CAPITAL</div>
      <div class="report-cover-body">
        <div class="report-title">Portfolio Report</div>
        <div class="report-subtitle">Investment Analysis &amp; Advisory</div>
        <div class="report-cover-divider"></div>
        <div class="report-cover-meta">
          <div class="cover-row"><span class="label">Client</span><strong>${client.name}</strong></div>
          <div class="cover-row"><span class="label">Risk Profile</span><strong>${clientIR}</strong></div>
          <div class="cover-row"><span class="label">Portfolio Value</span><strong class="portfolio-value">${fmtUSD(totalValue)}</strong></div>
          <div class="cover-row"><span class="label">Report Date</span><strong>${reportDate}</strong></div>
          <div class="cover-row"><span class="label">Data as at</span><strong>${dataDate}</strong></div>
          <div class="cover-row"><span class="label">Currency</span><strong><span class="cover-ccy-label">${portfolioData.reportCcy||'USD'}</span></strong></div>
          <div class="cover-row"><span class="label">Prepared by</span><strong>Nikolai Klimov — Partner</strong></div>
        </div>
        <div class="report-cover-divider"></div>
        <div class="report-confidential">CONFIDENTIAL</div>
        <div class="report-fca">Orion Ridge Capital Limited &nbsp;|&nbsp; FCA Authorised &amp; Regulated (FRN 830294)</div>
      </div>
    </div>
    <div class="report-doc">

      <div class="report-section report-section-numbered">
        <div class="report-section-title">1. Client Risk Profile</div>
        <table class="report-table profile-table">
          <tr><td class="profile-label">Client</td><td>${client.name}</td></tr>
          <tr><td class="profile-label">Risk Profile</td><td><strong>${clientIR}</strong></td></tr>
          <tr><td class="profile-label">Investment Horizon</td><td>${decodeHorizon(client.profile?.timeHorizon)}</td></tr>
          <tr><td class="profile-label">Primary Objective</td><td>${decodeObjective(client.profile?.investmentObjective)}</td></tr>
          <tr><td class="profile-label">WAAR</td><td><strong>${waar.toFixed(2)}</strong></td></tr>
          ${(client.profile?.knowledge||[]).length > 0 ? `
          <tr><td class="profile-label" style="vertical-align:top">Knowledge &amp; Experience</td>
              <td style="font-size:12px">${(client.profile.knowledge).join(', ')}</td></tr>` : ''}
        </table>
      </div>

      ${chartSrc ? `
      <div class="report-section" style="page-break-inside:avoid">
        <div class="report-section-title">Portfolio Value Over Time</div>
        <img src="${chartSrc}" style="width:100%;max-height:260px;object-fit:contain;object-position:left center;border-radius:6px;display:block" />
      </div>` : ''}

      <div class="report-section report-section-numbered">
        <div class="report-section-title">2. Asset Allocation vs ${clientIR} Benchmark</div>
        <table class="report-table">
          <thead><tr><th>Asset Class</th><th>${clientIR} Rec.</th><th>Client Portfolio</th><th>Deviation</th></tr></thead>
          <tbody>${allocationRows}</tbody>
        </table>
      </div>

      <div class="report-section report-section-numbered">
        <div class="report-section-title">3. Equity Sleeve — Sector Allocation vs ${clientIR}</div>
        <table class="report-table">
          <thead><tr><th>Equity Sector</th><th>${clientIR} Rec.</th><th>Client (% of port.)</th><th>Deviation</th></tr></thead>
          <tbody>${sectorRows}</tbody>
        </table>
      </div>

      <div class="report-section report-section-numbered">
        <div class="report-section-title">4. Bond Sleeve — Segment Allocation vs ${clientIR}</div>
        <table class="report-table">
          <thead><tr><th>Bond Segment</th><th>${clientIR} Rec.</th><th>Client (% of port.)</th><th>Deviation</th></tr></thead>
          <tbody>${segmentRows}</tbody>
        </table>
      </div>

      <div class="report-section report-section-numbered">
        <div class="report-section-title">5. Performance</div>

        <div style="font-size:13px;font-weight:600;margin:0.75rem 0 0.4rem">Bonds</div>
        <div style="overflow-x:auto">
        <table class="report-table">
          <thead><tr>
            <th>Bond</th><th>ISIN</th><th>Qty</th><th>Face Value</th><th>Price</th>
            <th>Holding Value</th><th>Purch. Price</th><th>Conv. Value (<span class="ccy-label">USD</span>)</th>
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

        ${(portfolioData.stocks||[]).length > 0 ? `
        <div style="font-size:13px;font-weight:600;margin:1.25rem 0 0.4rem">Stocks</div>
        <div style="overflow-x:auto">
        <table class="report-table">
          <thead><tr>
            <th>Name</th><th>Ticker</th><th>CCY</th><th>Qty</th><th>Price</th>
            <th>Value</th><th>Purch. Price</th>
            <th>Unrealized PnL</th><th>Realized PnL</th><th>Dividends</th><th>Total P&amp;L</th><th>P&amp;L %</th>
          </tr></thead>
          <tbody>${stockPerfRows}
            <tr style="font-weight:600;background:var(--bg2)">
              <td colspan="7">Stocks total</td>
              <td style="color:${stockTotUnreal>=0?'#3b6d11':'#a32d2d'}">${stockTotUnreal>=0?'+':'−'}${fmtUSD(stockTotUnreal)}</td>
              <td style="color:${stockTotReal>=0?'#3b6d11':'#a32d2d'}">${stockTotReal!==0?(stockTotReal>=0?'+':'−')+fmtUSD(stockTotReal):'—'}</td>
              <td>${fmtUSD(stockTotIncome)}</td>
              <td style="color:${sc}">${stockTotPnL>=0?'+':'−'}${fmtUSD(stockTotPnL)}</td>
              <td style="color:${sc}">${stockTotPnL>=0?'+':''}${stockTotPct}</td>
            </tr>
          </tbody>
        </table>
        </div>` : ''}

        <div style="font-size:13px;font-weight:600;margin:1.25rem 0 0.4rem">Funds / ETFs</div>
        <div style="overflow-x:auto">
        <table class="report-table">
          <thead><tr>
            <th>Name</th><th>ISIN</th><th>Qty</th><th>Price</th>
            <th>Holding Value</th><th>Purchase Price</th><th>Conv. Value (<span class="ccy-label">USD</span>)</th>
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
            <th>Unrealized PnL</th><th>Total PnL (<span class="ccy-label">USD</span>)</th><th>Total PnL %</th>
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
            ${(portfolioData.stocks||[]).length > 0 ? `<tr>
              <td>Stocks</td><td>—</td><td>${fmtUSD(stockTotCostUSD)}</td><td>${fmtUSD(stockTotIncome)}</td>
              <td style="color:${stockTotUnreal>=0?'#3b6d11':'#a32d2d'}">${stockTotUnreal>=0?'+':''}${fmtUSD(stockTotUnreal)}</td>
              <td style="color:${sc}">${stockTotPnL>=0?'+':''}${fmtUSD(stockTotPnL)}</td>
              <td style="color:${sc}">${stockTotPnL>=0?'+':''}${stockTotPct}</td>
            </tr>` : ''}
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

      ${breakdownSrc ? `
      <div class="report-section">
        <div class="report-section-title">Holdings Breakdown</div>
        <img src="${breakdownSrc}" style="max-width:100%;height:auto;display:block;border-radius:6px;margin-top:0.5rem" />
      </div>` : ''}

      ${buildBondAnalysisSection(portfolioData.bonds || [], totalValue)}

      ${buildCouponsSection(portfolioData.couponRows || [])}

      ${buildDividendsSection(portfolioData.divRows || [])}

      ${buildTradesSection(portfolioData.tradeRows || [])}

      ${analyticsHtml}

      <div class="report-disclaimer">
        <div class="report-disclaimer-title">Important Disclaimer</div>
        <p>This report is indicative and has been compiled solely on the basis of information provided by or on behalf of the client. The holdings, valuations, performance figures, and allocations shown are approximate and aggregated for informational purposes only. Accurate and authoritative data can only be found in official statements issued by the relevant broker (Interactive Brokers). This report does not replace or supersede any official custodian reporting.</p>
        <p>This report does not constitute investment advice, a solicitation, or an offer to buy or sell any security or financial instrument. Orion Ridge Capital Ltd makes no representation or warranty, express or implied, as to the accuracy, completeness, or timeliness of the information contained herein. Past performance is not a reliable indicator of future results.</p>
        <div class="report-disclaimer-title">General Investment Risks</div>
        <p><strong>Market Risk:</strong> Equity prices are subject to significant short-term volatility driven by company-specific, sector, and macroeconomic factors.</p>
        <p><strong>Concentration Risk:</strong> This portfolio is concentrated in a limited number of positions. A decline in any single position may have a material impact on overall portfolio value.</p>
        <p><strong>Currency Exchange Risk:</strong> USD-listed positions create exchange rate risk relative to the client's base currency.</p>
        <p><strong>Fixed Income Risk:</strong> Bond prices are inversely related to interest rates. Rising rates reduce the market value of existing bonds. Credit risk arises from the possibility of issuer default.</p>
        <p><strong>Regulatory Risk:</strong> Changes in regulations could adversely affect specific holdings or the portfolio as a whole.</p>
        <p><strong>Liquidity Risk:</strong> Some holdings may be difficult to sell at fair value in adverse or illiquid market conditions.</p>
        <div class="report-disclaimer-footer">
          Orion Ridge Capital Ltd | FCA Authorised &amp; Regulated (FRN 830294)<br>
          Report generated: ${reportDate} &nbsp;|&nbsp; For internal advisor use only. Does not constitute investment advice. Investment products are not insured by any government entity, are not deposits, and are not obligations of or guaranteed by Orion Ridge Capital or its affiliates. Investments carry the risk of partial or complete loss of principal.
        </div>
      </div>
    </div>`;
};

// ─── Export to Word ───────────────────────────────────────────────────────────
window.exportReportToWord = async function() {
  const previewEl = window._savedReportViewEl || document.getElementById('r-reportContent');
  window._savedReportViewEl = null; // reset after use
  if (!previewEl || !previewEl.innerHTML.trim()) {
    alert('Please generate the report first.'); return;
  }

  const D = docx;
  const BRAND = '5A7259', GRAY = '5C5148', GREEN = '3B6D11', RED = 'A32D2D';
  const BRAND_HDR = 'EAF0EA'; // table header bg (light green from reference)
  const pt = n => n * 20;
  // A4 landscape usable width in DXA (twips): 16838 - 1400 margins = 15438
  const PAGE_W = 15438;

  // ── Border helpers ──────────────────────────────────────────────────────
  const thinBorder = { style: D.BorderStyle.SINGLE, size: 4, color: 'D1D5DB' };
  const hairBorder = { style: D.BorderStyle.SINGLE, size: 2, color: 'E5E7EB' };
  const noBorder   = { style: D.BorderStyle.NONE, size: 0, color: 'auto' };

  // ── Convert a DOM <table> to docx Table ────────────────────────────────
  function domTableToDocx(tbl) {
    const domRows = Array.from(tbl.querySelectorAll('tr'));
    if (!domRows.length) return null;

    // Measure column count respecting colspan
    const colCount = Math.max(...domRows.map(r =>
      Array.from(r.querySelectorAll('th,td')).reduce((s, td) => s + (parseInt(td.getAttribute('colspan')) || 1), 0)
    ));
    if (!colCount) return null;
    const colW = Math.floor(PAGE_W / colCount);

    const docxRows = domRows.map((tr, ri) => {
      const cells = Array.from(tr.querySelectorAll('th, td')).map(td => {
        const isHdr  = td.tagName === 'TH';
        const cs     = parseInt(td.getAttribute('colspan')) || 1;
        const text   = (td.innerText || td.textContent || '').trim();
        const isBold = isHdr || getComputedStyle(td).fontWeight >= 600;

        // Extract colour from inline style or child span
        let color = GRAY;
        const tryColor = s => {
          if (!s) return;
          const m = s.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
          if (m) {
            const hex = [m[1],m[2],m[3]].map(n=>parseInt(n).toString(16).padStart(2,'0')).join('').toUpperCase();
            if (hex !== '000000') color = hex;
          }
        };
        tryColor(td.style?.color);
        const childSpan = td.querySelector('span');
        if (childSpan) tryColor(childSpan.style?.color);

        return new D.TableCell({
          columnSpan: cs,
          children: [new D.Paragraph({
            children: [new D.TextRun({
              text, bold: isBold,
              size: isHdr ? 17 : 16,
              color: isHdr ? 'FFFFFF' : color,
              font: 'Georgia',
            })],
            spacing: { before: 30, after: 30 },
          })],
          width: { size: colW * cs, type: 'dxa' },
          shading: isHdr
            ? { fill: BRAND, type: D.ShadingType ? D.ShadingType.CLEAR : 'clear', color: 'auto' }
            : { fill: ri % 2 === 0 ? 'FFFFFF' : 'F5F0EB', type: 'clear', color: 'auto' },
          borders: {
            top: hairBorder, bottom: hairBorder,
            left: noBorder, right: noBorder,
          },
          margins: { top: 50, bottom: 50, left: 90, right: 90 },
        });
      });

      return new D.TableRow({ children: cells, tableHeader: tr.querySelector('th') !== null });
    });

    return new D.Table({
      rows: docxRows,
      width: { size: PAGE_W, type: 'dxa' },
      borders: {
        top: thinBorder, bottom: thinBorder,
        left: noBorder, right: noBorder,
        insideH: hairBorder, insideV: noBorder,
      },
    });
  }

  // ── Walk DOM and produce children ───────────────────────────────────────
  const children = [];
  const spacer = () => new D.Paragraph({ children: [], spacing: { after: pt(3) } });

  // ── Cover page — mirrors PDF layout: logo top-right, blank space, content bottom-right ──
  const coverEl = previewEl.querySelector('.report-cover');
  if (coverEl) {
    const logo     = coverEl.querySelector('.report-cover-logo');
    const title    = coverEl.querySelector('.report-title');
    const subtitle = coverEl.querySelector('.report-subtitle');
    const rows     = coverEl.querySelectorAll('.cover-row');
    const conf     = coverEl.querySelector('.report-confidential');
    const fca      = coverEl.querySelector('.report-fca');

    // ── Logo — top right ──
    if (logo) children.push(new D.Paragraph({
      children: [new D.TextRun({
        text: logo.innerText.trim(),
        size: 16, color: '8B7A68', font: 'Georgia', characterSpacing: 120,
      })],
      alignment: D.AlignmentType.RIGHT,
      spacing: { after: 0 },
    }));

    // ── Large blank space to push content to bottom ──
    // A4 landscape: usable height = 10706 twips (11906 - 1200 margins)
    // Cover content below spacer ≈ 2920 twips → spacer needs ≈ 7786 twips
    // lineRule:'exact' sets the paragraph height directly (confirmed working)
    children.push(new D.Paragraph({
      children: [new D.TextRun({ text: '' })],
      spacing: { before: 0, after: 0, line: 5600, lineRule: 'exact' },
    }));

    // ── Title ──
    if (title) children.push(new D.Paragraph({
      children: [new D.TextRun({ text: title.innerText.trim(), bold: true, size: 72, color: BRAND, font: 'Georgia' })],
      alignment: D.AlignmentType.RIGHT,
      spacing: { after: pt(3) },
    }));

    // ── Subtitle ──
    if (subtitle) children.push(new D.Paragraph({
      children: [new D.TextRun({ text: subtitle.innerText.trim(), size: 22, color: '8B7A68', font: 'Georgia' })],
      alignment: D.AlignmentType.RIGHT,
      spacing: { after: pt(10) },
    }));

    // ── Divider ──
    children.push(new D.Paragraph({
      children: [],
      border: { bottom: { style: D.BorderStyle.SINGLE, size: 8, color: BRAND, space: 1 } },
      spacing: { after: pt(8) },
    }));

    // ── Meta rows — label left, value right via tab ──
    rows.forEach(row => {
      const label = row.querySelector('.label')?.innerText?.trim() || '';
      const val   = row.querySelector('strong')?.innerText?.trim() || '';
      children.push(new D.Paragraph({
        children: [
          new D.TextRun({ text: label, size: 20, color: '8B7A68', font: 'Georgia' }),
          new D.TextRun({ text: '	' + val, size: 20, bold: true, color: '2C2C2C', font: 'Georgia' }),
        ],
        alignment: D.AlignmentType.RIGHT,
        spacing: { after: pt(3) },
        border: { bottom: { style: D.BorderStyle.SINGLE, size: 2, color: 'E8E0D8', space: 1 } },
      }));
    });

    // ── Second divider ──
    children.push(new D.Paragraph({
      children: [],
      border: { bottom: { style: D.BorderStyle.SINGLE, size: 8, color: BRAND, space: 1 } },
      spacing: { after: pt(8) },
    }));

    // ── CONFIDENTIAL ──
    if (conf) children.push(new D.Paragraph({
      children: [new D.TextRun({
        text: conf.innerText.trim(),
        size: 16, color: '8B7A68', font: 'Georgia', characterSpacing: 100,
      })],
      alignment: D.AlignmentType.RIGHT,
      spacing: { after: pt(2) },
    }));

    // ── FCA line ──
    if (fca) children.push(new D.Paragraph({
      children: [new D.TextRun({ text: fca.innerText.trim(), size: 14, color: '8B7A68', font: 'Georgia' })],
      alignment: D.AlignmentType.RIGHT,
      spacing: { after: pt(2) },
    }));

    // ── Page break after cover — merged into last para to avoid blank page ──
    // Patch the last pushed paragraph to include a page break run at the start
    if (children.length > 0) {
      const last = children[children.length - 1];
      if (last.root) {
        // docx.js internal: prepend a page break run to the last paragraph
      }
    }
    // Use a zero-height paragraph with page break
    children.push(new D.Paragraph({
      children: [new D.PageBreak()],
      spacing: { before: 0, after: 0, line: 240, lineRule: 'exact' },
    }));
  }

  const reportDoc = previewEl.querySelector('.report-doc') || previewEl;

  for (const el of reportDoc.children) {

    // ── Header ──
    if (el.classList.contains('report-header')) {
      const logo = el.querySelector('.report-logo');
      if (logo) children.push(new D.Paragraph({
        children: [new D.TextRun({ text: logo.innerText.trim(), bold: true, size: 34, color: BRAND, font: 'Georgia' })],
        spacing: { after: pt(2) },
      }));
      el.querySelectorAll('.report-title,.report-subtitle,.report-meta div,.report-confidential').forEach(m => {
        const txt = m.innerText.trim();
        if (!txt) return;
        const isTitle = m.classList.contains('report-title');
        children.push(new D.Paragraph({
          children: [new D.TextRun({ text: txt, bold: isTitle, size: isTitle ? 24 : 17, color: GRAY, font: 'Georgia' })],
          spacing: { after: pt(1) },
          alignment: D.AlignmentType ? D.AlignmentType.CENTER : 'center',
        }));
      });
      children.push(spacer());
      continue;
    }

    // ── Chart section ──
    if (el.querySelector && el.querySelector('canvas,img')) {
      const img = el.querySelector('img');
      const canvas = el.querySelector('canvas');

      // Section title
      const titleEl = el.querySelector('.report-section-title');
      if (titleEl) children.push(new D.Paragraph({
        children: [new D.TextRun({ text: titleEl.innerText.trim(), bold: true, size: 22, color: BRAND, font: 'Georgia' })],
        spacing: { before: pt(8), after: pt(4) },
        border: { bottom: { style: D.BorderStyle.SINGLE, size: 6, color: BRAND, space: 3 } },
      }));

      let src = img?.src || '';
      if (!src && canvas) src = canvas.toDataURL('image/png');
      if (src && src.startsWith('data:')) {
        try {
          const [meta, b64] = src.split(',');
          const ext = meta.includes('png') ? 'png' : 'jpg';
          children.push(new D.Paragraph({
            children: [new D.ImageRun({
              data: Uint8Array.from(atob(b64), c => c.charCodeAt(0)),
              transformation: { width: 680, height: 200 },
              type: ext,
            })],
            spacing: { after: pt(6) },
          }));
        } catch(e) { /* skip */ }
      }
      continue;
    }

    // ── Report sections ──
    if (el.classList.contains('report-section') || el.classList.contains('report-disclaimer')) {
      const isNumbered = el.classList.contains('report-section-numbered');
      // Each numbered section starts on a new page (mirrors PDF @page-break-before)
      const titleEl = el.querySelector('.report-section-title');
      if (titleEl) {
        // Page break merged INTO the title paragraph — prevents blank page between sections
        children.push(new D.Paragraph({
          children: [
            ...(isNumbered ? [new D.PageBreak()] : []),
            new D.TextRun({ text: titleEl.innerText.trim(), bold: true, size: 26, color: BRAND, font: 'Georgia' }),
          ],
          spacing: { before: pt(6), after: pt(5) },
          border: { bottom: { style: D.BorderStyle.SINGLE, size: 6, color: BRAND, space: 3 } },
        }));
      } else if (isNumbered) {
        children.push(new D.Paragraph({
          children: [new D.PageBreak()],
          spacing: { before: 0, after: 0, line: 240, lineRule: 'exact' },
        }));
      }

      // Walk direct children for sub-labels and tables
      for (const child of el.children) {
        if (child.classList.contains('report-section-title')) continue;

        // Sub-label (e.g. "Bonds", "Funds / ETFs")
        const childText = (child.innerText || '').trim();
        if (!child.querySelector('table') && !child.querySelector('img') && !child.querySelector('canvas') && childText && childText.length < 80) {
          children.push(new D.Paragraph({
            children: [new D.TextRun({ text: childText, bold: true, size: 19, color: BRAND, font: 'Georgia' })],
            spacing: { before: pt(5), after: pt(2) },
          }));
          continue;
        }

        // Tables (direct or nested in overflow div)
        child.querySelectorAll('table').forEach(tbl => {
          const t = domTableToDocx(tbl);
          if (t) { children.push(t); children.push(spacer()); }
        });
        // Direct table
        if (child.tagName === 'TABLE') {
          const t = domTableToDocx(child);
          if (t) { children.push(t); children.push(spacer()); }
        }
      }

      // Disclaimer plain text
      if (el.classList.contains('report-disclaimer')) {
        children.push(new D.Paragraph({
          children: [new D.TextRun({ text: el.innerText.trim(), size: 14, color: '9CA3AF', italics: true, font: 'Georgia' })],
          spacing: { before: pt(12) },
          border: { top: { style: D.BorderStyle.SINGLE, size: 4, color: 'D1D5DB', space: 6 } },
        }));
      }
    }
  }

  // ── Build document ──────────────────────────────────────────────────────
  const doc = new D.Document({
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838, orientation: D.PageOrientation.LANDSCAPE },
          margin: { top: 600, right: 700, bottom: 600, left: 700 },
        },
      },
      children: children.length ? children : [new D.Paragraph({ children: [new D.TextRun('No content')] })],
    }],
  });

  const blob = await D.Packer.toBlob(doc);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `Portfolio_Report_${new Date().toISOString().slice(0,10)}.docx`;
  a.click();
  URL.revokeObjectURL(url);
};
