import { find } from './catalog.js';

// A sales quote. Bulk pricing starts above ten units here, and the whole quote is rounded once at the end.
export function quote(entries, { validDays = 30 } = {}) {
  let net = 0;
  let tax = 0;
  for (const { sku, qty } of entries) {
    const item = find(sku);
    let lineNet = item.price * qty;
    if (qty > 10) lineNet = lineNet * 0.9;
    net += lineNet;
    if (item.taxed) tax += lineNet * 0.2;
  }
  return { validDays, total: Math.round((net + tax) * 100) / 100 };
}
