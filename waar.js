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
  if (waar === null || isNaN(waar)) return '—';
  const ir = irBand(waar);
  return `${waar.toFixed(2)}${ir ? ' (' + ir + ')' : ''}`;
}

// Read existing portfolio rows (ISIN | Name | Amount | Rating)
function readExistingRows() {
  return Array.from(document.querySelectorAll('#l-existingRows tr')).map(tr => {
    const inputs = tr.querySelectorAll('input');
    return {
      amount: parseFloat(inputs[2]?.value) || 0,
      rating: parseFloat(inputs[3]?.value) || 0
    };
  }).filter(r => r.amount > 0 && r.rating > 0);
}

// New transaction ratings stored by portfolio-import.js after Claude analysis
window._transactionRatings = [];

window.updateWAAR = window.recalcWAAR = function() {
  const existing = readExistingRows();
  const waarBefore = calcWAAR(existing);
  const elBefore = document.getElementById('waar-before');
  if (elBefore) elBefore.textContent = formatWAAR(waarBefore);

  const newTx = (window._transactionRatings || []).filter(r => r.amount > 0 && r.rating > 0);
  const all = [...existing, ...newTx];
  const waarAfter = calcWAAR(all);
  const elAfter = document.getElementById('waar-after');
  if (elAfter) elAfter.textContent = formatWAAR(waarAfter);
};
