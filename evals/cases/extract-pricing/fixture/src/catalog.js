export const CATALOG = {
  pen: { name: 'Pen', price: 1.2, taxed: true },
  book: { name: 'Book', price: 12.5, taxed: false },
  lamp: { name: 'Lamp', price: 39.99, taxed: true },
  desk: { name: 'Desk', price: 249, taxed: true },
};

export function find(sku) {
  const item = CATALOG[sku];
  if (!item) throw new Error(`Unknown item ${sku}`);
  return item;
}
