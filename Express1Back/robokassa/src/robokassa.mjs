/**
 * Robokassa signature + PayUrl building.
 *
 * MVP goals:
 * - Support all hashing algorithms available in Robokassa cabinet:
 *   MD5, RIPEMD160, SHA1, SHA256, SHA384, SHA512
 * - Build payment URL with init signature (Password#1).
 * - Verify ResultURL signature (Password#2).
 * - Include Shp_* params in signature base in sorted order.
 *
 * IMPORTANT:
 * - Your Robokassa cabinet must be configured to use the same hash algorithm.
 */
import crypto from "node:crypto";
import { config } from "./config.mjs";

const ALGO_MAP = {
  MD5: "md5",
  RIPEMD160: "ripemd160",
  SHA1: "sha1",
  SHA256: "sha256",
  SHA384: "sha384",
  SHA512: "sha512"
};

export function getNodeHashAlgo() {
  const a = String(config.robokassa.hashAlgorithm || "MD5").toUpperCase();
  const nodeAlgo = ALGO_MAP[a];
  if (!nodeAlgo) {
    throw new Error(
      `Unsupported ROBOKASSA_HASH_ALGORITHM=${a}. Allowed: ${Object.keys(ALGO_MAP).join(", ")}`
    );
  }
  return nodeAlgo;
}

export function normalizeSig(sig) {
  return String(sig || "").trim().toLowerCase();
}

export function hashHex(str) {
  const algo = getNodeHashAlgo();
  return crypto.createHash(algo).update(str, "utf8").digest("hex");
}

/**
 * Shp_* must be included in signature base as:
 *   :Shp_key=value
 * and keys must be sorted lexicographically.
 *
 * We keep ONLY keys starting with "Shp_".
 */
export function buildShpPart(shp = {}) {
  const keys = Object.keys(shp).filter((k) => k.startsWith("Shp_")).sort();
  if (keys.length === 0) return "";
  return keys.map((k) => `:${k}=${String(shp[k])}`).join("");
}

/**
 * Init signature for payment URL (Password#1):
 *   base = MrchLogin:OutSum:InvId:Password1[:Shp_k=v...]
 */
export function calcInitSignature({ outSum, invId, shp = {} }) {
  const base =
    `${config.robokassa.merchantLogin}:${outSum}:${invId}:${config.robokassa.password1}` +
    buildShpPart(shp);
  return hashHex(base);
}

/**
 * Result signature for ResultURL (Password#2):
 *   base = OutSum:InvId:Password2[:Shp_k=v...]
 */
export function calcResultSignature({ outSum, invId, shp = {} }) {
  const base = `${outSum}:${invId}:${config.robokassa.password2}${buildShpPart(shp)}`;
  return hashHex(base);
}

export function verifyResultSignature({ outSum, invId, signatureValue, shp = {} }) {
  const expected = normalizeSig(calcResultSignature({ outSum, invId, shp }));
  const got = normalizeSig(signatureValue);
  return expected === got;
}

/**
 * Build Robokassa payment URL.
 *
 * Parameters we put:
 * - MerchantLogin
 * - OutSum
 * - InvId
 * - Description
 * - SignatureValue (init signature with Password#1)
 * - Shp_* (optional)
 * - IsTest=1 (optional)
 *
 * NOTE:
 * Robokassa endpoints can differ in different regions/cabinets.
 * For MVP we use the common:
 *   https://auth.robokassa.ru/Merchant/Index.aspx
 */
export function buildPayUrl({ invId, outSum, description = "Digital goods", shp = {} }) {
  const params = new URLSearchParams({
    MerchantLogin: config.robokassa.merchantLogin,
    OutSum: String(outSum),
    InvId: String(invId),
    Description: String(description),
    SignatureValue: calcInitSignature({ outSum: String(outSum), invId: String(invId), shp })
  });

  // Pass Shp_* through
  for (const [k, v] of Object.entries(shp)) {
    if (k.startsWith("Shp_")) params.set(k, String(v));
  }

  if (config.robokassa.isTest) {
    params.set("IsTest", "1");
  }

  return `https://auth.robokassa.ru/Merchant/Index.aspx?${params.toString()}`;
}
