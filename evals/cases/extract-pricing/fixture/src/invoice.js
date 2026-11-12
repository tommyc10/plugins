import { find } from './catalog.js';

// The legal document. Net and tax are kept apart per line, and tax is rounded per line.
export function invoice(entries, { number }) {
  const lines = entries.map(({ sku, qty }) => {
    const item = find(sku);
    let net = item.price * qty;
    if (qty >= 10) net = net * 0.9;
    net = Math.round(net * 100) / 100;
    const tax = item.taxed ? Math.round(net * 0.2 * 100) / 100 : 0;
    return { description: `${qty} x ${item.name}`, net, tax };
  });
  const net = Math.round(lines.reduce((s, l) => s + l.net, 0) * 100) / 100;
  const tax = Math.round(lines.reduce((s, l) => s + l.tax, 0) * 100) / 100;
  return { number, lines, net, tax, total: Math.round((net + tax) * 100) / 100 };
}
