import {
  backButtonClickHandler,
  setupFooterNavigation,
  mapOutcome,
  mapSportToImage,
  getBackendBaseUrl,
  getTelegramUser
} from "./utils.js";
async function initTableScreen(tg_id) {
  const mainContent = document.querySelector('.main-content');
  if (!mainContent) return;

  const green = parseFloat(localStorage.getItem('greenBubbleValue')?.replace(',', '.') || '1.0');
  const red = parseFloat(localStorage.getItem('redBubbleValue')?.replace(',', '.') || '2.0');
  const gold = parseInt(localStorage.getItem('goldBubbleValue') || '3', 10);
  const minCoef = Math.min(green, red);
  const maxCoef = Math.max(green, red);
  const activeSports = JSON.parse(localStorage.getItem('activeSports') || '[]');

  try {
    const backendBaseUrl = getBackendBaseUrl();
    const url = new URL(`${backendBaseUrl}/events`);
    url.searchParams.set('count', gold);
    url.searchParams.set('min_coef', minCoef);
    url.searchParams.set('max_coef', maxCoef);

    if (tg_id) {
      url.searchParams.set('tg_id', tg_id);
    }

    if (activeSports.length) {
      const expand = (key) => {
        switch (key) {
          case 'soccer':
            return ['soccer','football','Футбол'];
          case 'tennis':
            return ['tennis','Теннис'];
          case 'puck':
            return ['hockey','ice hockey','Хоккей','nhl'];
          default:
            return [key];
        }
      };
      const expanded = Array.from(new Set(activeSports.flatMap(expand)));
      url.searchParams.set('sport', expanded.join(','));
    }

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (!Array.isArray(data)) {
      const msg = data && data.error ? data.error : 'No data';
      throw new Error(`Backend error: ${msg}`);
    }
    const events = data;
    if (!events.length) {
      mainContent.innerHTML = `<p class="no-events">Нет подходящих событий.</p>`;
      return;
    }

    let product = 1;
    const tableScroll = document.createElement('div');
    tableScroll.classList.add('table-scroll');

    for (const event of events) {
      const row = createTableRow(event);
      const coef = Number(event.shownValue);
      if (Number.isFinite(coef)) product *= coef;
      tableScroll.appendChild(row);
    }

    mainContent.appendChild(tableScroll);
    mainContent.appendChild(createTotalsBlock(product));
    mainContent.appendChild(createActionButtons());
  } catch (error) {
    console.error(error);
    mainContent.innerHTML = `<p class="error">Ошибка при загрузке событий: ${error?.message || 'unknown'}</p>`;
  }
}

function createTableRow(event) {
  const row = document.createElement('div');
  row.classList.add('table-line');

  const team1 = event.team1 || 'Team A';
  const team2 = event.team2 || 'Team B';
  const sportClass = mapSportToImage(event.sport);
  const outcomeText = mapOutcome(event.shownOutcome);
  const n = Number(event.shownValue);
  const coef = Number.isFinite(n) ? n.toFixed(2) : '—';

  row.innerHTML = `
    <div class="cell cell-70">
      <img src="./images/${sportClass}.png" alt="${sportClass}" class="table-sport" />
      <div class="teams">
        <span class="team-title">${team1}</span>
        <span class="vs">VS</span>
        <span class="team-title">${team2}</span>
      </div>
    </div>
    <div class="divider"></div>
    <div class="cell cell-10">${outcomeText}</div>
    <div class="divider"></div>
    <div class="cell cell-20">${coef}</div>
  `;
  return row;
}

function createActionButtons() {
  const buttonsContainer = document.createElement('div');
  buttonsContainer.classList.add('buttons-container');

  const betAgainButton = document.createElement('button');
  betAgainButton.classList.add('action-button', 'bet-again-button');
  betAgainButton.textContent = 'ASK ME AGAIN';
  betAgainButton.addEventListener('click', () => {
    window.location.href = 'choose-page.html';
  });

  const saveButton = document.createElement('button');
  saveButton.classList.add('action-button', 'share-button');
  saveButton.textContent = 'SAVE TO MIND';
  saveButton.addEventListener('click', () => {
    console.log('Сохранение пока не реализовано.');
  });

  buttonsContainer.append(betAgainButton, saveButton);
  return buttonsContainer;
}

function createTotalsBlock(product) {
  const totalsWrapper = document.createElement('div');
  totalsWrapper.classList.add('totals-wrapper');

  const guruDiv = document.createElement('div');
  guruDiv.classList.add('guru-center');
  guruDiv.innerHTML = `<img src="./images/guru 2.png" alt="guru">`;

  const totals = document.createElement('div');
  totals.classList.add('totals');

  const formattedCoef = Number.isFinite(product) ? product.toFixed(2) : '—';
  const winAmountNum = Number.isFinite(product) ? product * 50 : 0;
  const winAmount = winAmountNum.toFixed(2);

  totals.innerHTML = `
    <div class="coef-amount">
      ${formattedCoef}
      <div class="coin-circle">50</div>    
    </div>
    <div class="win-amount">${winAmount}</div>
  `;

  totalsWrapper.append(guruDiv, totals);
  return totalsWrapper;
}


backButtonClickHandler('choose-page.html');

document.addEventListener('DOMContentLoaded', () => {
  setupFooterNavigation();

  let tg_id = localStorage.getItem('tg_id');
  if (!tg_id) {
    const user = getTelegramUser();
    if (user?.id) {
      tg_id = String(user.id);
      try { localStorage.setItem('tg_id', tg_id); } catch (_) {}
    }
  }

  if (tg_id) {
    initTableScreen(tg_id);
  } else {
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      mainContent.textContent = 'Ошибка: не найден Telegram ID в localStorage и через Telegram.WebApp.';
    }
  }
});