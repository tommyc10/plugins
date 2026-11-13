import { find } from './catalog.js';

export const TAX_RATE = 0.2;
export const BULK_FACTOR = 0.9;

export const roundCents = (amount) => Math.round(amount * 100) / 100;

// Net and tax for one line, unrounded. The cart and invoice give the bulk price at ten units; quotes start above ten.
export function priceLine({ sku, qty }, { bulkFrom = 10 } = {}) {
  const item = find(sku);
  const net = item.price * qty * (qty >= bulkFrom ? BULK_FACTOR : 1);
  return { item, net, taxed: item.taxed, tax: item.taxed ? net * TAX_RATE : 0 };
}

export const taxOn = (net) => net * TAX_RATE;
