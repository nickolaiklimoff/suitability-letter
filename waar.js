// ─── WAAR Calculation ─────────────────────────────────────────────────────────

// ── IR Corridor definitions ───────────────────────────────────────────────────
// Max permitted WAAR = IR number + 0.49 (per Orion Ridge Capital policy)
// Min WAAR = IR number (lower corridor)
const IR_CORRIDORS = {
  IR1: { min: 1.00, max: 1.49 },
  IR2: { min: 2.00, max: 2.49 },
  IR3: { min: 3.00, max: 3.49 },
  IR4: { min: 4.00, max: 4.49 },
  IR5: { min: 5.00, max: 5.49 },
  IR6: { min: 6.00, max: 6.49 },
};

// Assess WAAR against client IR profile
// Returns: { status, breach, message }
// status: 'ok' | 'above' | 'below'
window.assessWAAR = function(waar, clientIR) {
  if (!waar || !clientIR || !IR_CORRIDORS[clientIR]) return null;
  const { min, max } = IR_CORRIDORS[clientIR];
  if (waar > max) return {
    status: 'above',
    breach: +(waar - max).toFixed(2),
    message: `WAAR ${waar.toFixed(2)} exceeds ${clientIR} maximum of ${max.toFixed(2)} by +${(waar-max).toFixed(2)}`,
    corridor: `${min.toFixed(2)}–${max.toFixed(2)}`,
  };
  if (waar < min) return {
    status: 'below',
    breach: +(min - waar).toFixed(2),
    message: `WAAR ${waar.toFixed(2)} is below ${clientIR} minimum of ${min.toFixed(2)} by ${(min-waar).toFixed(2)}`,
    corridor: `${min.toFixed(2)}–${max.toFixed(2)}`,
  };
  return {
    status: 'ok',
    breach: 0,
    message: `WAAR ${waar.toFixed(2)} is within ${clientIR} corridor (${min.toFixed(2)}–${max.toFixed(2)})`,
    corridor: `${min.toFixed(2)}–${max.toFixed(2)}`,
  };
};

window.IR_CORRIDORS = IR_CORRIDORS;

function irBand(waar) {
  if (!waar || isNaN(waar)) return '';
  if (waar < 2) return 'IR1'; if (waar < 3) return 'IR2'; if (waar < 4) return 'IR3';
  if (waar < 5) return 'IR4'; if (waar < 6) return 'IR5'; return 'IR6';
}

function calcWAAR(rows) {
  const valid = rows.filter(r => r.amount > 0 && r.rating > 0);
  const total = valid.reduce((s,r) => s + r.amount, 0);
  if (!total) return null;
  return valid.reduce((s,r) => s + r.rating * r.amount, 0) / total;
}

function formatWAAR(waar) {
  if (waar === null || waar === undefined || isNaN(waar)) return '—';
  const ir = irBand(waar);
  return `${waar.toFixed(2)}${ir ? ' (' + ir + ')' : ''}`;
}

// Read existing portfolio (ISIN | Name | Amount | Rating)
function readExistingRows() {
  return Array.from(document.querySelectorAll('#l-existingRows tr')).map(tr => {
    const inputs = tr.querySelectorAll('input');
    return {
      amount: parseFloat(inputs[2]?.value) || 0,
      rating: parseFloat(inputs[3]?.value) || 0
    };
  }).filter(r => r.amount > 0 && r.rating > 0);
}

// New transaction ratings — set by portfolio-import.js after Claude assigns ratings
window._transactionRatings = [];

window.updateWAAR = window.recalcWAAR = function() {
  const existing = readExistingRows();
  const waarBefore = calcWAAR(existing);

  const newTx = (window._transactionRatings || []).filter(r => r.amount > 0 && r.rating > 0);
  const all = [...existing, ...newTx];
  const waarAfter = calcWAAR(all);

  const elBefore = document.getElementById('waar-before');
  const elAfter  = document.getElementById('waar-after');
  if (elBefore) elBefore.textContent = formatWAAR(waarBefore);
  if (elAfter)  elAfter.textContent  = formatWAAR(waarAfter);

  // Return values for collectLetterData
  return {
    waarBefore: waarBefore ? parseFloat(waarBefore.toFixed(2)) : null,
    waarAfter:  waarAfter  ? parseFloat(waarAfter.toFixed(2))  : null,
    irBefore:   irBand(waarBefore) || '',
    irAfter:    irBand(waarAfter)  || ''
  };
};
