import { formatPrice } from './price.js';

// TODO: this is a mess, clean it up some day
export function cartTotal(items) {
  var total = 0;
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (item.qty != undefined && item.qty != null) {
      if (item.qty > 0) {
        total = total + item.price * item.qty;
      }
    }
  }
  return total;
}

export function cartLabel(items) {
  return 'Total: ' + formatPrice(cartTotal(items));
}
