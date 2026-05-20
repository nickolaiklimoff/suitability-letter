// ─── WAAR Calculation ─────────────────────────────────────────────────────────

const IR_LIMITS = {
  IR1:{min:1.0,max:1.99}, IR2:{min:2.0,max:2.99}, IR3:{min:3.0,max:3.99},
  IR4:{min:4.0,max:4.99}, IR5:{min:5.0,max:5.99}, IR6:{min:6.0,max:9.99}
};

function irBand(waar) {
  if (!waar || isNaN(waar)) return null;
  for (const [ir, r] of Object.entries(IR_LIMITS)) {
    if (waar >= r.min && waar <= r.max) return ir;
  }
  return waar < 1 ? 'IR1' : 'IR6';
}

function readRows(tbodyId) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return [];
  return Array.from(tbody.querySelectorAll('tr')).map(tr => {
    const nums = tr.querySelectorAll('input[type=number]');
    return { amount: parseFloat(nums[0]?.value)||0, rating: parseFloat(nums[1]?.value)||0 };
  }).filter(h => h.amount > 0 && h.rating > 0);
}

function calcWAAR(rows) {
  const total = rows.reduce((s,h) => s + h.amount, 0);
  if (!total) return null;
  return rows.reduce((s,h) => s + h.rating * h.amount, 0) / total;
}

function formatWAAR(waar) {
  if (waar === null || isNaN(waar)) return '—';
  const ir = irBand(waar);
  return `${waar.toFixed(2)}${ir ? ' (' + ir + ')' : ''}`;
}

// Called on any input change
window.updateWAAR = window.recalcWAAR = function() {
  // WAAR before = existing portfolio only
  const existingRows = readRows('l-existingRows');
  const waarBefore = calcWAAR(existingRows);
  const elBefore = document.getElementById('waar-before');
  if (elBefore) elBefore.textContent = formatWAAR(waarBefore);

  // WAAR after = existing + new transactions combined
  const newRows = readRows('l-newRows');
  const allRows = [...existingRows, ...newRows];
  const waarAfter = calcWAAR(allRows);
  const elAfter = document.getElementById('waar-after');
  if (elAfter) elAfter.textContent = formatWAAR(waarAfter);
};
