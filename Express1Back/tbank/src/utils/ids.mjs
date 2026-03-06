/**
 * ID generation.
 * We use UUIDv4 with prefixes for debugging convenience.
 */
import crypto from "node:crypto";

export function genId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}
