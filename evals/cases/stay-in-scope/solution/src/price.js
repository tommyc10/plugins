export function formatPrice(amount) {
  return '$' + (Math.round(amount * 100) / 100).toFixed(2);
}
