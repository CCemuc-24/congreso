// src/domain/buyOrder.ts
// Ported from Purchase.generateBuyOrder (@BeforeCreate hook), ccemuc-api/src/models/purchase.model.ts.
import { createHash } from 'crypto';

export function generateBuyOrder(): string {
  const randomString = Math.random().toString(36).substring(2, 15);
  const timestamp = Date.now().toString(36);
  const rawBuyOrder = `${timestamp}${randomString}`;

  const hash = createHash('sha256').update(rawBuyOrder).digest('hex');

  // 26 is not a stylistic choice: it is exactly transbank-sdk's BUY_ORDER_LENGTH,
  // the maximum Transaction.create accepts (it calls hasTextWithMaxLength(buyOrder,
  // BUY_ORDER_LENGTH) and throws before the POST when the value is longer). There is
  // zero headroom, so prefixing this value — e.g. an environment tag like 'TEST-' —
  // would start throwing from inside the SDK rather than failing a check here.
  // Shorten the hash slice by however many characters any prefix adds.
  return hash.substring(0, 26);
}
