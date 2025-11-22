export const RESULTS =[
  'X',
  '1',
  '2'
]

const DEFAULT_BACKEND_BASE = 'https://express1.ru/backend';
const LOCAL_BACKEND_BASE = 'http://localhost:3001';

export const TEAMS = [
  'Шарлеруа',
  'Антверпен',
  'Вестерло',
  'Серкль Брюгге',
  'Оренбург',
  'Ахмат',
  'Краснодар'
]

export function backButtonClickHandler(targetUrl) {
  const backButton = document.querySelector('.back-button');
  if (backButton) {
    backButton.addEventListener('click', () => {
      window.location.href = targetUrl;
    });
  } else {
    console.warn('Back button with class .back-button not found');
  }
}

  export function saveBubbleValuesToLocalStorage() {
    const green = document.querySelector('.bubble.green .number')?.textContent.trim();
    const red = document.querySelector('.bubble.red .number')?.textContent.trim();
    const gold = document.querySelector('.bubble.gold .number')?.textContent.trim();
  
    if (green) localStorage.setItem('greenBubbleValue', green);
    if (red) localStorage.setItem('redBubbleValue', red);
    if (gold) localStorage.setItem('goldBubbleValue', gold);
  }
  
  export function setupButtonClickHandler(buttonId, targetUrl, beforeNavigate) {
  const button = document.getElementById(buttonId);
  if (!button) return;

  button.addEventListener('click', (event) => {
    // 1. Если кнопка выключена — просто выходим
    if (button.disabled || button.classList.contains('disabled')) {
      event.preventDefault();
      return;
    }

    // 2. Дополнительная проверка перед переходом
    if (typeof beforeNavigate === 'function') {
      const res = beforeNavigate();
      if (res === false) {
        event.preventDefault();
        return;
      }
    }

    // 3. Переход на целевую страницу
    window.location.assign(targetUrl);
  });
}


  export function setupFooterNavigation(currentPage) {
  const footerButtons = document.querySelectorAll('.footer-icon');

  // Убираем предыдущие активные классы
  footerButtons.forEach(button => {
    button.classList.remove('active');
  });

  // Добавляем active нужной кнопке
  footerButtons.forEach(button => {
    if (button.dataset.page === currentPage) {
      button.classList.add('active');
     // console.log(`Active added to:`, button);
    }

    // Навигация при клике
    const page = button.dataset.page;
    if (page) {
      button.addEventListener('click', () => {
        window.location.href = `${page}-screen.html`;
      });
    }
  });
}

// Attempts management
const ATTEMPTS_KEY = 'attemptsLeft';

export function ensureAttemptsInitialized(defaultAttempts = 0) {
  const raw = localStorage.getItem(ATTEMPTS_KEY);
  if (raw === null || raw === undefined) {
    localStorage.setItem(ATTEMPTS_KEY, String(defaultAttempts));
    return defaultAttempts;
  }
  const n = Number(raw);
  if (Number.isNaN(n)) {
    localStorage.setItem(ATTEMPTS_KEY, String(defaultAttempts));
    return defaultAttempts;
  }
  return n;
}

export function getAttemptsLeft() {
  const raw = localStorage.getItem(ATTEMPTS_KEY);
  const n = Number(raw);
  return Number.isNaN(n) ? 0 : n;
}

export function decrementAttempt() {
  const left = getAttemptsLeft();
  if (left > 0) {
    localStorage.setItem(ATTEMPTS_KEY, String(left - 1));
    return left - 1;
  }
  return left;
}

  export function getRandomValue(min, max) {
    const steps = Math.floor((max - min) / 0.1) + 1;
    const randomStep = Math.floor(Math.random() * steps);
    return (min + randomStep * 0.1).toFixed(1).replace('.', ',');
  }

  export function getRandomTeam(excludeTeam) {
    const availableTeams = TEAMS.filter(team => team !== excludeTeam);
    return availableTeams[Math.floor(Math.random() * availableTeams.length)];
  }

// Telegram helpers
export function getTelegramUser() {
  try {
    const user = window?.Telegram?.WebApp?.initDataUnsafe?.user;
    return user || null;
  } catch (_) {
    return null;
  }
}

// Mapping helpers
export function mapOutcome(outcome) {
  switch ((outcome || '').toLowerCase()) {
    case 'outcome1':
      return '1';
    case 'outcomex':
      return 'X';
    case 'outcome2':
      return '2';
    default:
      return '';
  }
}

export function mapSportToImage(sport) {
  const s = (sport || '').toString().toLowerCase();
  // теннис (латиница + кириллица)
  if (s.includes('tennis') || s.includes('теннис')) {
    return 'tennis';
  }

  // хоккей
  if (
    s.includes('hock') ||
    s.includes('nhl') ||
    s.includes('лед') ||
    s.includes('хок')
  ) {
    return 'puck';
  }

  // футбол
  if (
    s.includes('soccer') ||
    s.includes('football') ||
    s.includes('футбол')
  ) {
    return 'soccer';
  }

  // дефолт — пусть тоже будет футбол
  return 'soccer';
}

function trimTrailingSlash(url) {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

export function getBackendBaseUrl() {
  if (typeof window === 'undefined') {
    return DEFAULT_BACKEND_BASE;
  }

  const override =
    window.__BACKEND_BASE_URL__ ||
    window.BACKEND_BASE_URL ||
    (typeof window.localStorage?.getItem === 'function'
      ? window.localStorage.getItem('backendBaseUrl')
      : null);

  if (typeof override === 'string' && override.trim().length > 0) {
    return trimTrailingSlash(override.trim());
  }

  const { location } = window;
  if (!location) {
    return DEFAULT_BACKEND_BASE;
  }

  const hostname = location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return LOCAL_BACKEND_BASE;
  }

  if (hostname.endsWith('.local') || hostname.endsWith('.test')) {
    return LOCAL_BACKEND_BASE;
  }

  return trimTrailingSlash(location.origin) + '/backend';
}
export function sendFrontendLog( message) {
  //console.log('Frontend Log:', message);
  const url = "https://express1.ru/backend/frontend-log";

  try {
    const payload = { message };

     fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

  } catch (err) {
    console.error("Ошибка отправки лога:", err);
    throw err;
  }
}

// =============================================
// Перехват console.log / warn / error и отправка на бэкенд
// =============================================
(function patchConsole() {
  const original = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  ['log', 'warn', 'error'].forEach(level => {
    console[level] = (...args) => {
      // показать в обычном console (для браузера)
      original[level](...args);

      try {
        const msg = args
          .map(a => (typeof a === 'string' ? a : JSON.stringify(a)))
          .join(' ');
        if (typeof sendFrontendLog === 'function') {
          sendFrontendLog(level, msg, null);
        }
      } catch (_) {
        // если логгер упал — не ломать фронт
      }
    };
  });
})();

