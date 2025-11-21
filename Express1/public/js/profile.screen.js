import { setupFooterNavigation, backButtonClickHandler, getTelegramUser, getAttemptsLeft } from "./utils2.js";

setupFooterNavigation('profile');
backButtonClickHandler('index.html');

function updateAttemptsDisplay(attempts) {
  const attemptsInfo = document.getElementById('attemptsInfo');
  if (attemptsInfo) {
    attemptsInfo.textContent = `Attempts left: ${attempts}`;
  }
}

const attempts = getAttemptsLeft();
const tg_id = localStorage.getItem('tg_id');

const user = getTelegramUser();

if (user) {
  const fullName = user.username ? `@${user.username}` : `${user.first_name} ${user.last_name || ''}`;
  const usernameElem = document.getElementById('telegramUsername');
  if (usernameElem) {
    usernameElem.textContent = fullName;
  }
}

updateAttemptsDisplay(attempts);

