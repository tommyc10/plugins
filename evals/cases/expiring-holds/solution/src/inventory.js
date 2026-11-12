// Stock on hand and the holds placed against it. `now` is injected so tests can move time.
export function createInventory({ stock = {}, now = Date.now } = {}) {
  const onHand = new Map(Object.entries(stock));
  const holds = new Map();
  let nextId = 1;

  const live = (hold) => hold.expiresAt === undefined || now() < hold.expiresAt;
  const liveHolds = () => [...holds.values()].filter(live);
  const reserved = (sku) => liveHolds().filter((h) => h.sku === sku).reduce((sum, h) => sum + h.qty, 0);

  return {
    onHand(sku) {
      if (!onHand.has(sku)) throw new Error(`Unknown item ${sku}`);
      return onHand.get(sku);
    },
    available(sku) {
      return this.onHand(sku) - reserved(sku);
    },
    reserve(sku, qty, { ttlMs } = {}) {
      if (!Number.isInteger(qty) || qty <= 0) throw new Error('Quantity must be a positive whole number');
      if (ttlMs !== undefined && !(typeof ttlMs === 'number' && ttlMs > 0)) throw new Error('ttlMs must be a positive number');
      if (qty > this.available(sku)) throw new Error(`Only ${this.available(sku)} of ${sku} free`);
      const id = `hold-${nextId++}`;
      const at = now();
      holds.set(id, { id, sku, qty, at, ...(ttlMs === undefined ? {} : { expiresAt: at + ttlMs }) });
      return id;
    },
    release(id) {
      const hold = holds.get(id);
      if (!hold || !live(hold)) throw new Error(`No hold ${id}`);
      holds.delete(id);
    },
    sweep() {
      const expired = [...holds.values()].filter((h) => !live(h)).map((h) => h.id);
      for (const id of expired) holds.delete(id);
      return expired;
    },
    holds() {
      return liveHolds().map((h) => ({ ...h }));
    },
  };
}
