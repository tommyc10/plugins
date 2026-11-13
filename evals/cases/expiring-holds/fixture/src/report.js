// One line per item for the warehouse screen.
export function stockReport(inventory, skus) {
  const holds = inventory.holds();
  return skus
    .map((sku) => {
      const reserved = holds.filter((h) => h.sku === sku).reduce((sum, h) => sum + h.qty, 0);
      const onHand = inventory.onHand(sku);
      return `${sku.padEnd(10)}${String(onHand).padStart(5)} on hand${String(reserved).padStart(5)} reserved${String(onHand - reserved).padStart(5)} free`;
    })
    .join('\n');
}
