import crypto from "node:crypto";
import { config } from "./config.mjs";

function isScalar(value) {
  const t = typeof value;
  return t === "string" || t === "number" || t === "boolean";
}

function normalizeBaseUrl(raw) {
  return String(raw || "").replace(/\/+$/, "");
}

function resolveInitUrl(rawApiBaseUrl) {
  const normalized = normalizeBaseUrl(rawApiBaseUrl);
  if (!normalized) {
    return "https://securepay.tinkoff.ru/v2/Init";
  }

  if (/\/v2\/init$/i.test(normalized)) {
    return normalized;
  }

  return `${normalized}/v2/Init`;
}

function toBool(value) {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export function resolveTbankPublicUrls() {
  const base = normalizeBaseUrl(config.tbank.publicBaseUrl);

  return {
    notificationUrl:
      config.tbank.notificationUrl || `${base}/api/tbank/notification`,
    successUrl:
      config.tbank.successUrl || `${base}/api/tbank/success`,
    failUrl:
      config.tbank.failUrl || `${base}/api/tbank/fail`
  };
}

/**
 * T-Bank token algorithm:
 * - only root-level scalar fields take part in hash
 * - nested objects/arrays are ignored
 * - Password is appended as a virtual root field
 * - values are concatenated after key sort
 */
export function calcTbankToken(payload, password = config.tbank.password) {
  const fields = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (key === "Token") continue;
    if (!isScalar(value)) continue;
    if (value === undefined || value === null) continue;
    fields[key] = String(value);
  }

  fields.Password = String(password || "");

  const source = Object.keys(fields)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => fields[key])
    .join("");

  return crypto.createHash("sha256").update(source, "utf8").digest("hex");
}

export function verifyTbankToken(payload, password = config.tbank.password) {
  const expected = calcTbankToken(payload, password);
  const actual = String(payload?.Token || "").trim().toLowerCase();
  return !!actual && actual === expected.toLowerCase();
}

function normalizeAmountMinor(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const int = Math.trunc(num);
  return int >= 0 ? int : null;
}

export async function initTbankPayment({
  orderId,
  amountMinor,
  description = "Digital goods"
}) {
  const normalizedAmountMinor = normalizeAmountMinor(amountMinor);
  if (!config.tbank.terminalKey || !config.tbank.password) {
    throw new Error("TBANK_TERMINAL_KEY or TBANK_PASSWORD is not configured");
  }
  if (!normalizedAmountMinor || normalizedAmountMinor <= 0) {
    throw new Error("Invalid amountMinor");
  }

  const urls = resolveTbankPublicUrls();
  const requestBody = {
    TerminalKey: String(config.tbank.terminalKey),
    Amount: normalizedAmountMinor,
    OrderId: String(orderId),
    Description: String(description),
    NotificationURL: urls.notificationUrl,
    SuccessURL: urls.successUrl,
    FailURL: urls.failUrl
  };
  requestBody.Token = calcTbankToken(requestBody, config.tbank.password);

  const initUrl = resolveInitUrl(config.tbank.apiBaseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  let response;
  let payload;
  try {
    response = await fetch(initUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    payload = await response.json().catch(() => ({}));
  } finally {
    clearTimeout(timer);
  }

  if (!response?.ok) {
    const status = response?.status || 500;
    const details = payload?.Message || payload?.Details || `HTTP ${status}`;
    throw new Error(`T-Bank Init failed: ${details}`);
  }

  if (!toBool(payload?.Success)) {
    const details = payload?.Message || payload?.Details || payload?.ErrorCode || "unknown error";
    throw new Error(`T-Bank Init rejected: ${details}`);
  }

  const paymentUrl = payload?.PaymentURL ? String(payload.PaymentURL) : "";
  if (!paymentUrl) {
    throw new Error("T-Bank Init response has no PaymentURL");
  }

  const paymentId = payload?.PaymentId != null ? String(payload.PaymentId) : null;
  const status = payload?.Status != null ? String(payload.Status) : null;

  return {
    paymentUrl,
    paymentId,
    status
  };
}
