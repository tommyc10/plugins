// Stock on hand and the holds placed against it. `now` is injected so tests can move time.
export function createInventory({ stock = {}, now = Date.now } = {}) {
  const onHand = new Map(Object.entries(stock));
  const holds = new Map();
  let nextId = 1;

  const reserved = (sku) => [...holds.values()].filter((h) => h.sku === sku).reduce((sum, h) => sum + h.qty, 0);

  return {
    onHand(sku) {
      if (!onHand.has(sku)) throw new Error(`Unknown item ${sku}`);
      return onHand.get(sku);
    },
    available(sku) {
      return this.onHand(sku) - reserved(sku);
    },
    reserve(sku, qty) {
      if (!Number.isInteger(qty) || qty <= 0) throw new Error('Quantity must be a positive whole number');
      if (qty > this.available(sku)) throw new Error(`Only ${this.available(sku)} of ${sku} free`);
      const id = `hold-${nextId++}`;
      holds.set(id, { id, sku, qty, at: now() });
      return id;
    },
    release(id) {
      if (!holds.has(id)) throw new Error(`No hold ${id}`);
      holds.delete(id);
    },
    holds() {
      return [...holds.values()].map((h) => ({ ...h }));
    },
  };
}
