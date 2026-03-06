import { config } from "../src/config.mjs";
import { calcTbankToken, resolveTbankPublicUrls } from "../src/tbank.mjs";

function readArg(name, fallback = "") {
  const p = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(p));
  if (!found) return fallback;
  return found.slice(p.length);
}

function toPositiveInt(raw) {
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function normalizeBaseUrl(raw) {
  return String(raw || "").replace(/\/+$/, "");
}

function resolveInitUrl(rawApiBaseUrl) {
  const normalized = normalizeBaseUrl(rawApiBaseUrl);
  if (!normalized) return "https://securepay.tinkoff.ru/v2/Init";
  if (/\/v2\/init$/i.test(normalized)) return normalized;
  return `${normalized}/v2/Init`;
}

async function main() {
  const amountMinor = toPositiveInt(readArg("amount", "50000"));
  const orderId = readArg("order", `${Date.now()}`);
  const description = readArg("description", "Digital goods");
  const email = readArg("email", "");
  const phone = readArg("phone", "");
  const dryRun = readArg("dry-run", "false").toLowerCase() === "true";

  if (!amountMinor) {
    console.error("ERROR: --amount must be a positive integer in kopecks (e.g. 50000)");
    process.exit(2);
  }

  if (!config.tbank.terminalKey || !config.tbank.password) {
    console.error("ERROR: TBANK_TERMINAL_KEY or TBANK_PASSWORD is not configured");
    process.exit(2);
  }

  const urls = resolveTbankPublicUrls();
  const initUrl = resolveInitUrl(config.tbank.apiBaseUrl);

  const body = {
    TerminalKey: String(config.tbank.terminalKey),
    Amount: amountMinor,
    OrderId: String(orderId),
    Description: String(description),
    NotificationURL: urls.notificationUrl,
    SuccessURL: urls.successUrl,
    FailURL: urls.failUrl
  };

  if (email || phone) {
    body.DATA = {};
    if (email) body.DATA.Email = email;
    if (phone) body.DATA.Phone = phone;
  }

  body.Token = calcTbankToken(body, config.tbank.password);

  console.log(`INIT_URL=${initUrl}`);
  console.log(`ORDER_ID=${body.OrderId}`);
  console.log(`AMOUNT=${body.Amount}`);

  if (dryRun) {
    console.log("DRY_RUN=true");
    console.log(`REQUEST_BODY=${JSON.stringify(body)}`);
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(initUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const raw = await response.text();
    let payload = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch (_) {
      payload = null;
    }

    console.log(`HTTP_STATUS=${response.status}`);
    if (payload) {
      console.log(`RESPONSE_JSON=${JSON.stringify(payload)}`);
    } else {
      console.log(`RESPONSE_TEXT=${raw}`);
    }

    const paymentUrl = payload?.PaymentURL ? String(payload.PaymentURL) : "";
    if (!response.ok || !paymentUrl) {
      const hint = /\/v2\/Init\/v2\/Init/i.test(initUrl)
        ? "HINT: check TBANK_API_BASE_URL. Use https://securepay.tinkoff.ru or full .../v2/Init (once)."
        : "";
      if (hint) console.error(hint);
      process.exit(1);
    }

    console.log(`PAYMENT_URL=${paymentUrl}`);
  } finally {
    clearTimeout(timer);
  }
}

main().catch((err) => {
  console.error(`ERROR: ${err?.message || err}`);
  process.exit(1);
});

