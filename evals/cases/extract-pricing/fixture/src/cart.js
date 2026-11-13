import { find } from './catalog.js';

// Shown to the shopper while they add things. Totals are per line, rounded to cents.
export function cartLines(entries) {
  return entries.map(({ sku, qty }) => {
    const item = find(sku);
    let net = item.price * qty;
    if (qty >= 10) net = net * 0.9;
    const tax = item.taxed ? net * 0.2 : 0;
    const total = Math.round((net + tax) * 100) / 100;
    return { sku, qty, total };
  });
}

export function cartTotal(entries) {
  const sum = cartLines(entries).reduce((s, l) => s + l.total, 0);
  return Math.round(sum * 100) / 100;
}

export function cartSummary(entries) {
  const count = entries.reduce((s, e) => s + e.qty, 0);
  return `${count} item${count === 1 ? '' : 's'}, $${cartTotal(entries).toFixed(2)}`;
}
