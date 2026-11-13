// Holds every line of an order, or none of them.
export function placeOrder(inventory, lines) {
  const made = [];
  try {
    for (const { sku, qty } of lines) made.push(inventory.reserve(sku, qty));
  } catch (error) {
    for (const id of made) inventory.release(id);
    throw error;
  }
  return made;
}
