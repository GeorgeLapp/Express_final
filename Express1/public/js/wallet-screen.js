import {
  setupFooterNavigation,
  backButtonClickHandler,
  getAttemptsLeft,
  getBackendBaseUrl,
  getTelegramUser
} from "./utils.js";

const BILLING_BASE_PATH = "/api/billing";
const ATTEMPTS_PRODUCT_PRICE_MINOR = 10000; // 100.00 RUB

function getBillingBaseUrl() {
  if (typeof window === "undefined" || !window.location) {
    return BILLING_BASE_PATH;
  }
  return `${window.location.origin}${BILLING_BASE_PATH}`;
}

function getCurrentUserId() {
  const telegramUser = getTelegramUser();
  if (telegramUser?.id) {
    return String(telegramUser.id);
  }
  return localStorage.getItem("tg_id") || "";
}

function setAttemptsValue(value) {
  const el = document.getElementById("attemptsValue");
  if (!el) return;
  const numeric = Number(value);
  el.textContent = Number.isFinite(numeric) ? String(Math.max(0, Math.floor(numeric))) : "0";
}

function setStatus(message, isError = false) {
  const statusEl = document.getElementById("walletStatus");
  if (!statusEl) return;
  statusEl.textContent = message || "";
  statusEl.classList.toggle("wallet-status-error", Boolean(isError));
}

async function syncAttemptsFromBackend() {
  setAttemptsValue(getAttemptsLeft());

  const userId = getCurrentUserId();
  if (!userId) {
    return;
  }

  try {
    const backendBaseUrl = getBackendBaseUrl();
    const response = await fetch(`${backendBaseUrl}/user/${encodeURIComponent(userId)}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const user = await response.json();
    if (typeof user?.attempts === "number") {
      localStorage.setItem("attemptsLeft", String(user.attempts));
      setAttemptsValue(user.attempts);
    }
  } catch (error) {
    console.error("Failed to sync attempts on wallet screen:", error);
  }
}

function chooseAttemptsProduct(items) {
  if (!Array.isArray(items) || !items.length) return null;

  const score = (item) => {
    const text = `${item.productId || ""} ${item.sku || ""} ${item.title || ""} ${item.payloadRef || ""}`
      .toLowerCase();

    let points = 0;
    if (text.includes("attempt") || text.includes("попыт")) points += 4;
    if (text.includes("10")) points += 2;
    if (Number(item.priceMinor) === ATTEMPTS_PRODUCT_PRICE_MINOR) points += 3;
    if (String(item.currency || "").toUpperCase() === "RUB") points += 1;
    return points;
  };

  const sorted = [...items].sort((a, b) => score(b) - score(a));
  return sorted[0] || null;
}

async function resolveProductId() {
  const explicitProductId = window?.WALLET_PRODUCT_ID || localStorage.getItem("walletProductId");
  if (explicitProductId) {
    return String(explicitProductId);
  }

  const billingBaseUrl = getBillingBaseUrl();
  const response = await fetch(`${billingBaseUrl}/products?limit=100&offset=0`);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.error || `Не удалось получить список товаров (${response.status})`);
  }

  const product = chooseAttemptsProduct(payload?.items || []);
  if (!product?.productId) {
    throw new Error("В биллинге нет активного товара для покупки попыток");
  }

  return String(product.productId);
}

function createIdempotencyKey(userId) {
  const randomPart = Math.random().toString(16).slice(2, 10);
  return `wallet-${userId}-${Date.now()}-${randomPart}`;
}

async function createPaymentLink() {
  const userId = getCurrentUserId();
  if (!userId) {
    throw new Error("Не найден Telegram ID пользователя");
  }

  const productId = await resolveProductId();
  const billingBaseUrl = getBillingBaseUrl();
  const body = {
    userId,
    productId,
    idempotencyKey: createIdempotencyKey(userId)
  };

  const response = await fetch(`${billingBaseUrl}/checkout/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `Ошибка создания оплаты (${response.status})`);
  }

  if (!payload?.payUrl) {
    throw new Error("API не вернул ссылку оплаты");
  }

  return payload.payUrl;
}

async function handleBuyClick() {
  const button = document.getElementById("buyAttemptsButton");
  if (!button) return;

  button.disabled = true;
  setStatus("Формируем ссылку на оплату...");

  try {
    const payUrl = await createPaymentLink();
    window.location.assign(payUrl);
  } catch (error) {
    console.error("Payment link creation failed:", error);
    setStatus(error?.message || "Не удалось создать ссылку оплаты", true);
    button.disabled = false;
  }
}

function bindEvents() {
  const buyButton = document.getElementById("buyAttemptsButton");
  if (buyButton) {
    buyButton.addEventListener("click", handleBuyClick);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  backButtonClickHandler("index.html");
  setupFooterNavigation("wallet");
  bindEvents();
  syncAttemptsFromBackend();
});
