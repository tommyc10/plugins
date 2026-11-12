import { priceLine, roundCents, taxOn } from './pricing.js';

// The legal document. Net and tax are kept apart per line, and tax is rounded per line.
export function invoice(entries, { number }) {
  const lines = entries.map((entry) => {
    const { item, net: raw, taxed } = priceLine(entry);
    const net = roundCents(raw);
    return { description: `${entry.qty} x ${item.name}`, net, tax: taxed ? roundCents(taxOn(net)) : 0 };
  });
  const net = roundCents(lines.reduce((s, l) => s + l.net, 0));
  const tax = roundCents(lines.reduce((s, l) => s + l.tax, 0));
  return { number, lines, net, tax, total: roundCents(net + tax) };
}
