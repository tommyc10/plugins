import { priceLine, roundCents } from './pricing.js';

// A sales quote. Bulk pricing starts above ten units here, and the whole quote is rounded once at the end.
export function quote(entries, { validDays = 30 } = {}) {
  const lines = entries.map((entry) => priceLine(entry, { bulkFrom: 11 }));
  const net = lines.reduce((s, l) => s + l.net, 0);
  const tax = lines.reduce((s, l) => s + l.tax, 0);
  return { validDays, total: roundCents(net + tax) };
}
