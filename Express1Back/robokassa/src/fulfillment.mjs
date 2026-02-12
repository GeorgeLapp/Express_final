/**
 * Digital goods fulfillment.
 *
 * MVP behavior:
 * - Generate a deterministic "fulfillmentRef" based on sale + product delivery params.
 * - This is NOT a secret and NOT a license key. It's just a reference.
 *
 * Production versions:
 * - license_key: allocate a key from a pool and mark issued (needs extra table)
 * - download_link: generate signed URL (needs storage + signing)
 * - subscription: create entitlement (needs entitlements table)
 */
import crypto from "node:crypto";

export async function fulfillDigital({ deliveryType, payloadRef, saleId, invId }) {
  const token = crypto
    .createHash("sha256")
    .update(`${deliveryType}:${payloadRef}:${saleId}:${invId}`, "utf8")
    .digest("hex")
    .slice(0, 24);

  return `${deliveryType}:${payloadRef}:${token}`;
}
