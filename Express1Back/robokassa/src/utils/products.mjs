/**
 * Validation for product create/update.
 * Strict MVP: require all fields on PUT and POST.
 */
export function validateProductPayload(body) {
  const errors = [];
  const sku = body?.sku;
  const title = body?.title;
  const priceMinor = body?.priceMinor;
  const currency = body?.currency;
  const deliveryType = body?.deliveryType;
  const payloadRef = body?.payloadRef;
  const isActive = body?.isActive;

  if (!sku || typeof sku !== "string") errors.push("sku is required (string)");
  if (!title || typeof title !== "string") errors.push("title is required (string)");
  if (!Number.isInteger(priceMinor) || priceMinor < 0) errors.push("priceMinor is required (integer >= 0)");
  if (!currency || typeof currency !== "string") errors.push("currency is required (string, e.g. RUB)");
  if (!deliveryType || typeof deliveryType !== "string") errors.push("deliveryType is required (string)");
  if (!payloadRef || typeof payloadRef !== "string") errors.push("payloadRef is required (string)");
  if (isActive != null && typeof isActive !== "boolean") errors.push("isActive must be boolean if provided");

  return errors;
}
