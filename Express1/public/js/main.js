// /public/js/main.js

import {
  setupButtonClickHandler,
  setupFooterNavigation,
  ensureAttemptsInitialized,
  getBackendBaseUrl,
  getTelegramUser,
  sendFrontendLog
} from "./utils.js";

// Initialize user id (Telegram user or fallback web test user)
const user = getTelegramUser();
if (user?.id) {
  try {
    localStorage.setItem('tg_id', String(user.id));
    if (user.username) {
      localStorage.setItem('username', String(user.username));
    }
  } catch (_) {}

  // Ensure server-side user exists and sync initial attempts
  const backendBaseUrl = getBackendBaseUrl();
  try {
    const url = new URL(`${backendBaseUrl}/user/${user.id}`);
    if (user.username) {
      url.searchParams.set('username', user.username);
    }
    fetch(url.toString())
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data && typeof data.attempts === 'number') {
          try { localStorage.setItem('attemptsLeft', String(data.attempts)); } catch (_) {}
        }
      })
      .catch(() => {});
  } catch (_) {}
}

// Telegram-specific sendData button support
if (window.Telegram && window.Telegram.WebApp) {
  const tg = Telegram.WebApp;
  document.getElementById('btnSendData')?.addEventListener('click', () => {
    tg.sendData(JSON.stringify({ action: 'test', value: 42 }));
  });
}

// Initialize attempts on first app load
ensureAttemptsInitialized(0);
setupButtonClickHandler('wakeup-guru-button', 'choose-page.html');
setupFooterNavigation();
