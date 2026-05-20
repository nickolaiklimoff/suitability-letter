// ─── WAAR Calculation ────────────────────────────────────────────────────────
// Weighted Average Asset Rating = sum(RiskRating_i * Amount_i) / TotalAmount

function calcWAAR(holdings) {
  const valid = holdings.filter(h => h.amount > 0 && h.riskRating >= 1);
  if (!valid.length) return null;
  const total = valid.reduce((s, h) => s + h.amount, 0);
  if (total === 0) return null;
  const weighted = valid.reduce((s, h) => s + h.riskRating * h.amount, 0);
  return weighted / total;
}

function waarToIR(waar) {
  if (!waar) return null;
  for (const [ir, range] of Object.entries(IR_LIMITS)) {
    if (waar >= range.min && waar <= range.max) return ir;
  }
  if (waar < 1.5) return 'IR1';
  return 'IR6';
}

function formatWAAR(waar) {
  if (waar === null) return '—';
  return waar.toFixed(2);
}

// ─── Live WAAR update ────────────────────────────────────────────────────────

function updateWAAR() {
  const before = readPortfolioRows('existing');
  const after  = readPortfolioRows('new');

  const waarBefore = calcWAAR(before);
  const waarAfter  = calcWAAR(after);

  const irBefore = waarToIR(waarBefore);
  const irAfter  = waarToIR(waarAfter);

  const elBefore = document.getElementById('waar-before');
  const elAfter  = document.getElementById('waar-after');

  if (elBefore) elBefore.textContent = waarBefore !== null
    ? `${formatWAAR(waarBefore)} (${irBefore})`
    : '—';

  if (elAfter) elAfter.textContent = waarAfter !== null
    ? `${formatWAAR(waarAfter)} (${irAfter})`
    : '—';

  return { waarBefore, waarAfter, irBefore, irAfter };
}

function readPortfolioRows(prefix) {
  const tbody = document.getElementById(`l-${prefix}Rows`);
  if (!tbody) return [];
  return Array.from(tbody.querySelectorAll('tr')).map(tr => {
    const inputs = tr.querySelectorAll('input');
    return {
      product:    inputs[0]?.value || '',
      currency:   inputs[1]?.value || 'USD',
      amount:     parseFloat(inputs[2]?.value) || 0,
      riskRating: parseFloat(inputs[3]?.value) || 0
    };
  }).filter(h => h.product);
}
