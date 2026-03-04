import {
  backButtonClickHandler,
  setupButtonClickHandler,
  saveBubbleValuesToLocalStorage,
  setupFooterNavigation,
  ensureAttemptsInitialized,
  getAttemptsLeft,
  getTelegramUser,
  getBackendBaseUrl
} from "./utils.js";

// Кнопка "назад" на индекс
backButtonClickHandler('index.html');

// Инициализируем попытки (на случай deep link на этот экран)
ensureAttemptsInitialized(0);

// Для deep link: берём Telegram user и синхронизируем пользователя на бэке
try {
  const tgUser = getTelegramUser();
  if (tgUser?.id) {
    try {
      localStorage.setItem('tg_id', String(tgUser.id));
      if (tgUser.username) {
        localStorage.setItem('username', String(tgUser.username));
      }
    } catch (_) {}

    const backendBaseUrl = getBackendBaseUrl();
    const url = new URL(`${backendBaseUrl}/user/${tgUser.id}`);
    if (tgUser.username) {
      url.searchParams.set('username', tgUser.username);
    }
    fetch(url.toString())
      .then(res =>
        res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))
      )
      .then(data => {
        if (data && typeof data.attempts === 'number') {
          try {
            localStorage.setItem('attemptsLeft', String(data.attempts));
          } catch (_) {}
        }
      })
      .catch(err => {
        console.error('Failed to sync attempts with backend', err);
      });
  }
} catch (_) {}

// ----- Логика пузырей -----

const decreaseButtons = document.querySelectorAll('.decrease');
const increaseButtons = document.querySelectorAll('.increase');

function changeNumber(element, operation) {
  const bubble = element.closest('.bubble');
  let number = parseFloat(element.textContent.replace(',', '.'));
  let step = 0.1;

  if (bubble.classList.contains('gold')) {
    step = 1;
  }

  if (operation === 'increase') {
    if (bubble.classList.contains('gold') && number >= 6) {
      return;
    }
    number += step;
  } else if (operation === 'decrease') {
    number -= step;
    // Запрещаем значения меньше 3 для золотого круга
    if (bubble.classList.contains('gold') && number < 3) {
      number = 3;
    }
  }

  if (bubble.classList.contains('gold')) {
    element.textContent = Math.round(number).toString();
  } else {
    element.textContent = number.toFixed(1).replace('.', ',');
  }
}

decreaseButtons.forEach(button => {
  button.addEventListener('click', () => {
    const numberElement = button.closest('.bubble').querySelector('.number');
    changeNumber(numberElement, 'decrease');
  });
});

increaseButtons.forEach(button => {
  button.addEventListener('click', () => {
    const numberElement = button.closest('.bubble').querySelector('.number');
    changeNumber(numberElement, 'increase');
  });
});

function setupBubbleGestureControls() {
  const bubbles = document.querySelectorAll('.bubble');
  const swipeThreshold = 24;

  bubbles.forEach((bubble) => {
    const numberElement = bubble.querySelector('.number');
    if (!numberElement) return;

    bubble.addEventListener('wheel', (event) => {
      event.preventDefault();
      if (event.deltaY < 0) {
        changeNumber(numberElement, 'increase');
      } else if (event.deltaY > 0) {
        changeNumber(numberElement, 'decrease');
      }
    }, { passive: false });

    let startX = 0;
    let startY = 0;

    bubble.addEventListener('touchstart', (event) => {
      const touch = event.changedTouches?.[0];
      if (!touch) return;
      startX = touch.clientX;
      startY = touch.clientY;
    }, { passive: true });

    bubble.addEventListener('touchend', (event) => {
      const touch = event.changedTouches?.[0];
      if (!touch) return;

      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Math.abs(dx) < swipeThreshold && Math.abs(dy) < swipeThreshold) {
        return;
      }

      if (Math.abs(dx) > Math.abs(dy)) {
        changeNumber(numberElement, dx > 0 ? 'increase' : 'decrease');
        return;
      }

      changeNumber(numberElement, dy < 0 ? 'increase' : 'decrease');
    }, { passive: true });
  });
}

// ----- Логика выбора видов спорта -----

function sportButtonClickHandler() {
  const buttons = document.querySelectorAll('.sport-button');

  buttons.forEach(button => {
    button.addEventListener('click', () => {
      // Переключаем класс active при клике
      button.classList.toggle('active');

      // Сохраняем активные виды спорта
      saveActiveSportsToStorage();
    });
  });
}

function saveActiveSportsToStorage() {
  const activeSports = Array.from(
    document.querySelectorAll('.sport-button.active')
  ).map(btn => btn.querySelector('img')?.classList[0]); // soccer / tennis / puck

  try {
    localStorage.setItem('activeSports', JSON.stringify(activeSports));
  } catch (_) {}

  updateGuruBtnState();
}

export function getRandomSportImage() {
  const activeSports = JSON.parse(localStorage.getItem('activeSports') || '[]');

  if (activeSports.length > 0) {
    const randomIndex = Math.floor(Math.random() * activeSports.length);
    const randomSport = activeSports[randomIndex];
    return randomSport;
  }
  return null;
}

// ----- Состояние кнопки ASK GURU -----

function updateGuruBtnState() {
  const btn = document.getElementById('ask-guru-btn');
  if (!btn) return;

  const activeButtons = document.querySelectorAll('.sport-button.active');

  if (activeButtons.length > 0) {
    btn.classList.add('active');
    btn.disabled = false;
  } else {
    btn.classList.remove('active');
    btn.disabled = true;
  }
}

// ----- Инициализация экрана -----

function resetSportSelectionAndGuruBtn() {
  const buttons = document.querySelectorAll('.sport-button');
  buttons.forEach(btn => btn.classList.remove('active'));

  try {
    localStorage.setItem('activeSports', JSON.stringify([]));
  } catch (_) {}

  const guruBtn = document.getElementById('ask-guru-btn');
  if (guruBtn) {
    guruBtn.classList.remove('active');
    guruBtn.disabled = true;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  resetSportSelectionAndGuruBtn();

  sportButtonClickHandler();
  setupBubbleGestureControls();

  setupButtonClickHandler('ask-guru-btn', 'table-screen.html', () => {
    saveBubbleValuesToLocalStorage();
    const left = getAttemptsLeft();
    if (left <= 0) {
      alert('Экспрессы закончились. Пополните баланс.');
      return false;
    }
    return true;
  });
});


// Нижнее меню
setupFooterNavigation();
