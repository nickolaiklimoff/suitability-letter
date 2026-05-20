// ─── WAAR Calculation ─────────────────────────────────────────────────────────

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
