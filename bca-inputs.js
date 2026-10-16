// BCA GAA inputs: parse the "Portfolio Construction - Public" page pasted as text.
// Output is stored in macro-dashboard data/bca_inputs.json and is the single
// source for the benchmark, the recommended allocation and the BCA views.
(function (root) {
  const SECTIONS = {
    'asset allocation': 'assets',
    'equity allocation by country': 'regions',
    'bond allocation': 'bonds',
    'global sector allocation': 'sectors',
  };
  const NAME_FIX = {
    'Comsumer Discretionary': 'Consumer Discretionary',   // BCA typo
    'High-Yield': 'High Yield',
    'Bonds': 'Fixed Income',
  };
  const ROW = /^(.*?)\s+(?:(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\s+)?(?:(overweight|neutral|underweight))?(Overweight|Neutral|Underweight)\s+(-?[\d.]+)\s*%\s+(-?[\d.]+)\s*%\s*$/;
  const PERF = /^(YTD|12 Months|5 Years)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*$/;

  function parseBcaInputs(text) {
    const lines = String(text || '').replace(/\r/g, '').split('\n')
      .map(l => l.replace(/\t+/g, '  ').replace(/\s+$/, '').replace(/^\s+/, '')).filter(Boolean);
    const out = { assets: [], regions: [], bonds: [], sectors: [], performance: {}, as_of_text: '' };
    let sec = null, last = null, perfGroup = null;
    for (const line of lines) {
      const key = line.toLowerCase();
      if (key === 'performance') { sec = 'perf'; last = null; continue; }
      if (sec !== 'perf' && SECTIONS[key]) { sec = SECTIONS[key]; last = null; continue; }
      const asof = line.match(/^AS OF (.+?)\.?$/i);
      if (asof) { out.as_of_text = asof[1].trim(); continue; }
      if (sec === 'perf') {
        const p = line.match(PERF);
        if (p && perfGroup) {
          (out.performance[perfGroup] = out.performance[perfGroup] || {})[p[1]] =
            { gaa: +p[2], benchmark: +p[3], diff: +p[4] };
        } else if (/^(Overall Portfolio|Asset Allocation|Bond Allocation|Equity Allocation)/i.test(line)) {
          perfGroup = line.replace(/\*+$/, '').trim();
        }
        continue;
      }
      if (!sec) continue;
      const m = line.match(ROW);
      if (m) {
        let name = m[1].trim();
        name = NAME_FIX[name] || name;
        const prev = m[3] ? m[3][0].toUpperCase() + m[3].slice(1) : m[4];
        last = { name, view: m[4], prev_view: prev, changed: m[2] || null,
                 allocation: +m[5], benchmark: +m[6], research: '' };
        out[sec].push(last);
      } else if (last && !last.research && !/^(View|Allocation %|Benchmark %|Latest Research|Region|GAA \(%\)|Benchmark \(%\)|Difference \(%\))$/i.test(line)) {
        last.research = line;
      }
    }
    return out;
  }

  // Sum check used by the UI: each block's allocation and benchmark should be ~100
  function bcaInputsChecks(d) {
    const sum = (a, k) => a.reduce((s, r) => s + r[k], 0);
    const res = [];
    [['assets', 'Asset classes'], ['regions', 'Countries'], ['bonds', 'Bond segments'], ['sectors', 'Sectors']].forEach(([k, label]) => {
      const rows = d[k];
      if (!rows.length) { res.push({ ok: false, msg: `${label}: not found in the pasted text` }); return; }
      const a = sum(rows, 'allocation'), b = sum(rows, 'benchmark');
      const ok = Math.abs(a - 100) < 0.7 && Math.abs(b - 100) < 0.7;
      res.push({ ok, msg: `${label}: ${rows.length} rows, allocation ${a.toFixed(1)}%, benchmark ${b.toFixed(1)}%` });
    });
    return res;
  }

  root.parseBcaInputs = parseBcaInputs;
  root.bcaInputsChecks = bcaInputsChecks;
  if (typeof module !== 'undefined') module.exports = { parseBcaInputs, bcaInputsChecks };
})(typeof window !== 'undefined' ? window : globalThis);
