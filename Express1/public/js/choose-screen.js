import {backButtonClickHandler, setupButtonClickHandler, saveBubbleValuesToLocalStorage, setupFooterNavigation, ensureAttemptsInitialized, getAttemptsLeft, decrementAttempt, getTelegramUser, getBackendBaseUrl } from "./utils.js";

backButtonClickHandler('index.html');

// Ensure attempts are initialized on this screen as well (in case of deep link)
ensureAttemptsInitialized(0);

// For deep links: capture Telegram user and ensure server user exists
try {
  const tgUser = getTelegramUser();
  if (tgUser?.id) {
    try { localStorage.setItem('tg_id', String(tgUser.id)); } catch (_) {}
    const backendBaseUrl = getBackendBaseUrl();
    fetch(`${backendBaseUrl}/ensureUser/${tgUser.id}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then(data => {
        if (data && typeof data.attempts === 'number') {
          try { localStorage.setItem('attemptsLeft', String(data.attempts)); } catch (_) {}
        }
      })
      .catch(err => {
        console.error('Failed to sync attempts with backend', err);
      });
  }
} catch (_) {}

// Wrap navigation with attempts check: spend exactly 1 attempt per request
setupButtonClickHandler('ask-guru-btn', 'table-screen.html', () => {
    saveBubbleValuesToLocalStorage();
    const left = getAttemptsLeft();
    if (left <= 0) {
        alert('Попытки закончились. Пополните баланс попыток.');
        return false; // cancel navigation
    }
    decrementAttempt();
    return true;
});

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
        if (number >= 6 && bubble.classList.contains('gold')) {
            return;
        }
        number += step;
    } else if (operation === 'decrease') {
        number -= step;
        // Запрещаем значения меньше 1 для золотого круга
        if (bubble.classList.contains('gold') && number < 3) {
            number = 3;
        }
    }

    // Форматирование вывода
    if (bubble.classList.contains('gold')) {
        element.textContent = Math.round(number).toString();
    } else {
        element.textContent = number.toFixed(1).replace('.', ','); // Один знак после запятой
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
    const activeSports = Array.from(document.querySelectorAll('.sport-button.active'))
        .map(btn => btn.querySelector('img')?.classList[0]) // классы: soccer, tennis, puck

    localStorage.setItem('activeSports', JSON.stringify(activeSports));
    updateGuruBtnState();
}

export function getRandomSportImage() {
    // Берем из localStorage активные виды спорта
    const activeSports = JSON.parse(localStorage.getItem('activeSports') || '[]');

    // Если есть активные виды спорта, выбираем случайный
    if (activeSports.length > 0) {
        const randomIndex = Math.floor(Math.random() * activeSports.length);
        const randomSport = activeSports[randomIndex];
        return randomSport;
    }
    return null; // Если нет активных видов спорта, возвращаем null
}

function updateGuruBtnState() {
    const btn = document.getElementById('ask-guru-btn');
    if (!btn) return;

    // смотрим, есть ли на странице хоть один .sport-button.active
    const activeButtons = document.querySelectorAll('.sport-button.active');

    if (activeButtons.length > 0) {
        btn.classList.add('active');
        btn.disabled = false;
    } else {
        btn.classList.remove('active');
        btn.disabled = true;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    sportButtonClickHandler();   // навешиваем обработчики на кнопки спорта
    updateGuruBtnState();        // сразу выставляем корректное состояние ASK GURU
});

setupFooterNavigation();

