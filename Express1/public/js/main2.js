// /public/js/main.js

import { setupButtonClickHandler, setupFooterNavigation, ensureAttemptsInitialized, getBackendBaseUrl,sendFrontendLog } from "./utils2.js";

// Initialize Telegram WebApp and persist user id
if (window.Telegram && window.Telegram.WebApp) {
 // console.log('Frontend Log:');
  const tg = Telegram.WebApp;
  const user = tg.initDataUnsafe?.user;
  if (user?.id) {
    try { localStorage.setItem('tg_id', String(user.id)); } catch (_) {}
    // Ensure server-side user exists and sync initial attempts
    const backendBaseUrl = getBackendBaseUrl();
    try {
      fetch(`${backendBaseUrl}/ensureUser/${user.id}`)
        .then(res => (res.ok ? res.json() : null))
        .then(data => {
          if (data && typeof data.attempts === 'number') {
            try { localStorage.setItem('attemptsLeft', String(data.attempts)); } catch (_) {}
          }
        })
        .catch(() => {});
    } catch (_) {}
  }

  document.getElementById('btnSendData')?.addEventListener('click', () => {
    tg.sendData(JSON.stringify({ action: 'test', value: 42 }));
  });
}

// Initialize attempts on first app load
ensureAttemptsInitialized(0);
setupButtonClickHandler('wakeup-guru-button', 'choose-page.html');
setupFooterNavigation();
