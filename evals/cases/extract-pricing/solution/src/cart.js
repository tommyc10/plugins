import { priceLine, roundCents } from './pricing.js';

// Shown to the shopper while they add things. Totals are per line, rounded to cents.
export function cartLines(entries) {
  return entries.map((entry) => {
    const { net, tax } = priceLine(entry);
    return { sku: entry.sku, qty: entry.qty, total: roundCents(net + tax) };
  });
}

export function cartTotal(entries) {
  return roundCents(cartLines(entries).reduce((s, l) => s + l.total, 0));
}

export function cartSummary(entries) {
  const count = entries.reduce((s, e) => s + e.qty, 0);
  return `${count} item${count === 1 ? '' : 's'}, $${cartTotal(entries).toFixed(2)}`;
}
