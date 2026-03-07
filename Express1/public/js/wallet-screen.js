import {
  setupFooterNavigation,
  backButtonClickHandler,
  getAttemptsLeft,
  getBackendBaseUrl,
  getTelegramUser
} from "./utils.js";

const BILLING_BASE_PATH = "/api/billing";

const PLAN_CONFIG = {
  express_100: {
    label: "100 попыток",
    productId: "p_express_100",
    priceMinor: 50000,
    keywords: ["100", "attempt", "попыт", "express", "экспресс"]
  },
  week: {
    label: "Подписка на неделю",
    productId: "p_week_1000",
    priceMinor: 100000,
    keywords: ["подписк", "week", "недел", "1000", "unlim", "безлим"]
  },
  month: {
    label: "Подписка на месяц",
    productId: "p_month",
    priceMinor: 500000,
    keywords: ["подписк", "month", "месяц"]
  },
  year: {
    label: "Подписка на год",
    productId: "p_year",
    priceMinor: 2500000,
    keywords: ["подписк", "year", "год", "annual"]
  }
};

const PLAN_ORDER = ["express_100", "week", "month", "year"];
const planProducts = new Map();
const PAYMENT_POLL_INTERVAL_MS = 2000;
const PAYMENT_POLL_TIMEOUT_MS = 45000;
const TOAST_DEFAULT_TIMEOUT_MS = 4500;

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
  const cachedAttempts = getAttemptsLeft();
  setAttemptsValue(cachedAttempts);

  const userId = getCurrentUserId();
  if (!userId) {
    return cachedAttempts;
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
      return Number(user.attempts);
    }
  } catch (error) {
    console.error("Failed to sync attempts on wallet screen:", error);
  }

  return cachedAttempts;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function ensureToastHost() {
  let host = document.getElementById("walletToastHost");
  if (host) return host;

  host = document.createElement("div");
  host.id = "walletToastHost";
  host.className = "wallet-toast-host";
  host.setAttribute("aria-live", "polite");
  document.body.appendChild(host);
  return host;
}

function showToast(message, { type = "info", timeoutMs = TOAST_DEFAULT_TIMEOUT_MS } = {}) {
  const host = ensureToastHost();
  const toast = document.createElement("div");
  toast.className = `wallet-toast wallet-toast-${type}`;
  toast.textContent = String(message || "");
  host.appendChild(toast);

  const removeToast = () => {
    toast.classList.add("hide");
    setTimeout(() => toast.remove(), 220);
  };

  setTimeout(removeToast, Math.max(1200, Number(timeoutMs) || TOAST_DEFAULT_TIMEOUT_MS));
}

function getPaymentReturnParams() {
  const params = new URLSearchParams(window.location.search || "");
  const payment = String(params.get("payment") || "")
    .trim()
    .toLowerCase();
  const invRaw = params.get("invId");
  const invId = Number.parseInt(String(invRaw || ""), 10);

  return {
    hasPaymentParam: params.has("payment"),
    payment,
    invId: Number.isFinite(invId) ? invId : null
  };
}

function clearPaymentReturnParamsFromUrl() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("payment") && !url.searchParams.has("invId")) {
    return;
  }

  url.searchParams.delete("payment");
  url.searchParams.delete("invId");
  const nextSearch = url.searchParams.toString();
  const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ""}${url.hash || ""}`;
  window.history.replaceState(null, "", nextUrl);
}

async function fetchSaleStatusByInvId(invId) {
  if (!Number.isFinite(invId)) return null;

  const billingBaseUrl = getBillingBaseUrl();
  const response = await fetch(`${billingBaseUrl}/sales/by-inv/${encodeURIComponent(String(invId))}`);

  if (response.status === 404 || response.status === 403) {
    // Sales public API can be disabled in production, fallback to attempts polling.
    return null;
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `HTTP ${response.status}`);
  }

  if (!payload?.status) return null;
  return String(payload.status).toLowerCase();
}

async function waitForPaymentConfirmation({ invId, baselineAttempts }) {
  const startedAt = Date.now();
  let attempts = Number.isFinite(baselineAttempts) ? baselineAttempts : getAttemptsLeft();

  while (Date.now() - startedAt < PAYMENT_POLL_TIMEOUT_MS) {
    attempts = await syncAttemptsFromBackend();
    if (Number.isFinite(attempts) && attempts > baselineAttempts) {
      return { status: "paid", attempts };
    }

    if (Number.isFinite(invId)) {
      try {
        const saleStatus = await fetchSaleStatusByInvId(invId);
        if (saleStatus === "paid") {
          attempts = await syncAttemptsFromBackend();
          return { status: "paid", attempts };
        }
        if (saleStatus === "canceled" || saleStatus === "refunded") {
          return { status: saleStatus, attempts };
        }
      } catch (error) {
        console.error("Failed to poll billing sale status:", error);
      }
    }

    await sleep(PAYMENT_POLL_INTERVAL_MS);
  }

  return { status: "timeout", attempts };
}

async function handlePaymentReturnFlow() {
  if (typeof window === "undefined") return;

  const paymentParams = getPaymentReturnParams();
  if (!paymentParams.hasPaymentParam) {
    return;
  }

  clearPaymentReturnParamsFromUrl();

  if (paymentParams.payment === "fail") {
    setStatus("Оплата не прошла. Попробуйте снова.", true);
    showToast("Оплата не выполнена", { type: "error" });
    await syncAttemptsFromBackend();
    return;
  }

  if (paymentParams.payment !== "success") {
    return;
  }

  const baselineAttempts = getAttemptsLeft();
  setStatus("Проверяем оплату и обновляем баланс попыток...");
  showToast("Платеж получен. Подтверждаем оплату...", { type: "info", timeoutMs: 3200 });

  const result = await waitForPaymentConfirmation({
    invId: paymentParams.invId,
    baselineAttempts
  });

  if (result.status === "paid") {
    setStatus("");
    showToast("Оплата успешна. Попытки обновлены.", { type: "success", timeoutMs: 5500 });
    return;
  }

  if (result.status === "canceled" || result.status === "refunded") {
    setStatus("Оплата отменена или не подтверждена.", true);
    showToast("Оплата не подтверждена", { type: "error" });
    return;
  }

  setStatus("Платеж обрабатывается. Обновите экран через 15-30 секунд.");
  showToast("Не удалось подтвердить оплату сразу. Платеж еще может завершиться успешно.", {
    type: "info",
    timeoutMs: 6500
  });
}

function getPlanConfig(planKey) {
  if (!planKey) return null;
  return PLAN_CONFIG[planKey] || null;
}

function getExplicitProductId(planKey) {
  const byPlan = window?.WALLET_PRODUCT_IDS;
  if (byPlan && typeof byPlan === "object" && byPlan[planKey]) {
    return String(byPlan[planKey]);
  }

  const localByPlan = localStorage.getItem(`walletProductId:${planKey}`);
  if (localByPlan) {
    return String(localByPlan);
  }

  // Backward compatibility with old single-product setup.
  if (planKey === "express_100") {
    const fallback = window?.WALLET_PRODUCT_ID || localStorage.getItem("walletProductId");
    if (fallback) {
      return String(fallback);
    }
  }

  return "";
}

function scoreProductForPlan(plan, item) {
  const text = `${item.productId || ""} ${item.sku || ""} ${item.title || ""} ${item.payloadRef || ""}`
    .toLowerCase();

  let points = 0;
  for (const keyword of plan.keywords || []) {
    if (text.includes(keyword)) points += 3;
  }
  if (text.includes(String(plan.productId).toLowerCase())) points += 2;
  if (Number(item.priceMinor) === Number(plan.priceMinor)) points += 2;
  if (String(item.currency || "").toUpperCase() === "RUB") points += 1;
  return points;
}

function resolvePlanProduct(planKey, items) {
  if (!Array.isArray(items) || !items.length) return null;
  const plan = getPlanConfig(planKey);
  if (!plan) return null;

  const explicitProductId = getExplicitProductId(planKey);
  if (explicitProductId) {
    const explicitProduct = items.find(item => String(item.productId) === explicitProductId);
    if (explicitProduct) return explicitProduct;
  }

  const byFixedId = items.find(item => String(item.productId) === plan.productId);
  if (byFixedId) return byFixedId;

  const rubProducts = items.filter(item => String(item.currency || "").toUpperCase() === "RUB");
  const byPrice = rubProducts.filter(item => Number(item.priceMinor) === Number(plan.priceMinor));
  if (byPrice.length === 1) return byPrice[0];
  if (byPrice.length > 1) {
    return [...byPrice].sort((a, b) => scoreProductForPlan(plan, b) - scoreProductForPlan(plan, a))[0];
  }

  const byKeywords = [...rubProducts].sort(
    (a, b) => scoreProductForPlan(plan, b) - scoreProductForPlan(plan, a)
  )[0];
  if (byKeywords && scoreProductForPlan(plan, byKeywords) > 0) {
    return byKeywords;
  }

  return null;
}

async function fetchActiveProducts() {
  const billingBaseUrl = getBillingBaseUrl();
  const response = await fetch(`${billingBaseUrl}/products?limit=100&offset=0`);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.error || `Не удалось получить список товаров (${response.status})`);
  }

  return Array.isArray(payload?.items) ? payload.items : [];
}

function updatePlanButtonsState() {
  const buttons = document.querySelectorAll(".wallet-buy-button[data-plan-key]");
  for (const button of buttons) {
    const planKey = String(button.dataset.planKey || "");
    const product = planProducts.get(planKey);

    if (product?.productId) {
      button.disabled = false;
      button.dataset.productId = String(product.productId);
      button.textContent = "Купить";
    } else {
      button.disabled = true;
      button.dataset.productId = "";
      button.textContent = "Недоступно";
    }
  }
}

async function syncPlansFromBilling() {
  try {
    const items = await fetchActiveProducts();
    planProducts.clear();

    for (const planKey of PLAN_ORDER) {
      const product = resolvePlanProduct(planKey, items);
      if (product?.productId) {
        planProducts.set(planKey, product);
      }
    }

    updatePlanButtonsState();

    if (!planProducts.size) {
      setStatus("Тарифы в биллинге не настроены. Обратитесь в поддержку.", true);
      return;
    }

    if (planProducts.size < PLAN_ORDER.length) {
      setStatus("Часть тарифов временно недоступна.");
      return;
    }

    setStatus("");
  } catch (error) {
    console.error("Failed to load billing products:", error);
    updatePlanButtonsState();
    setStatus(error?.message || "Не удалось загрузить тарифы", true);
  }
}

function createIdempotencyKey(userId, planKey) {
  const randomPart = Math.random().toString(16).slice(2, 10);
  return `wallet-${planKey}-${userId}-${Date.now()}-${randomPart}`;
}

async function createPaymentLink({ productId, planKey }) {
  const userId = getCurrentUserId();
  if (!userId) {
    throw new Error("Не найден Telegram ID пользователя");
  }

  const billingBaseUrl = getBillingBaseUrl();
  const body = {
    userId,
    productId,
    idempotencyKey: createIdempotencyKey(userId, planKey)
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

async function handleBuyClick(event) {
  const button = event.currentTarget;
  const planKey = String(button?.dataset?.planKey || "");
  const plan = getPlanConfig(planKey);
  const productId = String(button?.dataset?.productId || "");

  if (!planKey || !plan || !productId) {
    setStatus("Этот тариф сейчас недоступен для покупки.", true);
    showToast("Тариф временно недоступен", { type: "error" });
    return;
  }

  button.disabled = true;
  setStatus(`Формируем ссылку на оплату: ${plan.label}...`);

  try {
    const payUrl = await createPaymentLink({ productId, planKey });
    window.location.assign(payUrl);
  } catch (error) {
    console.error("Payment link creation failed:", error);
    setStatus(error?.message || "Не удалось создать ссылку оплаты", true);
    showToast(error?.message || "Не удалось создать ссылку на оплату", { type: "error" });
    updatePlanButtonsState();
  }
}

function bindEvents() {
  const buttons = document.querySelectorAll(".wallet-buy-button[data-plan-key]");
  for (const button of buttons) {
    button.addEventListener("click", handleBuyClick);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  backButtonClickHandler("index.html");
  setupFooterNavigation("wallet");
  bindEvents();
  await syncAttemptsFromBackend();
  await syncPlansFromBilling();
  await handlePaymentReturnFlow();
});
