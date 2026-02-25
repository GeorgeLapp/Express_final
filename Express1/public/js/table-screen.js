import {
  backButtonClickHandler,
  setupFooterNavigation,
  mapOutcome,
  mapSportToImage,
  getBackendBaseUrl,
  getTelegramUser,
  sendFrontendLog
} from "./utils.js";
async function initTableScreen(tg_id, username) {
  sendFrontendLog("лог в table заработал");
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
    if (username) {
      url.searchParams.set('username', username);
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
    console.log(url.toString(),"\n",data);
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
    tableScroll.classList.add('table-scroll', 'table-scroll-main');

    for (const event of events) {
      const row = createTableRow(event);
      const coef = Number(event.shownValue);
      if (Number.isFinite(coef)) product *= coef;
      tableScroll.appendChild(row);
    }

    mainContent.appendChild(tableScroll);
    mainContent.appendChild(createTotalsBlock(product));
    mainContent.appendChild(createActionButtons({ tg_id, username, events }));
  } catch (error) {
    console.error(error);
    mainContent.innerHTML = `<p class="error">Ошибка при загрузке событий: ${error?.message || 'unknown'}</p>`;
  }
}

function createTableRow(event) {
  sendFrontendLog("лог в table заработал");
  const row = document.createElement('div');
  row.classList.add('table-line', 'table-line-main');

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

async function saveHistory(tg_id, username, events) {
  const payload = {
    tg_id,
    username,
    events: (events || [])
      .map(ev => ({ id: ev?.id, shownOutcome: ev?.shownOutcome }))
      .filter(ev => ev.id && ev.shownOutcome)
  };

  if (!payload.tg_id || !payload.events.length) {
    throw new Error('Nothing to save');
  }

  const backendBaseUrl = getBackendBaseUrl();
  const res = await fetch(`${backendBaseUrl}/saveHistory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}

function createActionButtons({ tg_id, username, events }) {
  const actionsWrapper = document.createElement('div');
  actionsWrapper.classList.add('action-buttons-wrapper');
  sendFrontendLog("лог в table заработал");
  const buttonsContainer = document.createElement('div');
  buttonsContainer.classList.add('buttons-container');
  let isSaveClicked = false;

  const betAgainButton = document.createElement('button');
  betAgainButton.classList.add('action-button', 'bet-again-button');
  betAgainButton.textContent = 'ASK ME AGAIN';
  betAgainButton.addEventListener('click', () => {
    window.location.href = 'choose-page.html';
  });

  const saveButton = document.createElement('button');
  saveButton.classList.add('action-button', 'share-button');
  saveButton.textContent = 'SAVE TO MIND';
  saveButton.addEventListener('click', async () => {
    if (isSaveClicked) return;
    isSaveClicked = true;
    saveButton.disabled = true;

    if (!tg_id) {
      alert('Telegram ID not found.');
      saveButton.disabled = false;
      isSaveClicked = false;
      return;
    }

    try {
      const result = await saveHistory(tg_id, username, events);
      if (typeof result?.attempts_left === 'number') {
        try {
          localStorage.setItem('attemptsLeft', String(result.attempts_left));
        } catch (_) {}
      }
      saveButton.textContent = 'SAVED';
    } catch (err) {
      console.error('Save history failed', err);
      alert(err?.message || 'Failed to save history.');
      saveButton.textContent = 'SAVE TO MIND';
      saveButton.disabled = false;
      isSaveClicked = false;
    }
  });

  const fonbetLinkWrap = document.createElement('div');
  fonbetLinkWrap.classList.add('fonbet-link-wrap');

  const fonbetLink = document.createElement('a');
  fonbetLink.classList.add('fonbet-link-button');
  fonbetLink.href = 'https://clicks.af-ru2e2e.com/click?offer_id=819&partner_id=29087&landing_id=3214&utm_medium=affiliate';
  fonbetLink.target = '_blank';
  fonbetLink.rel = 'noopener noreferrer';
  fonbetLink.textContent = 'ФОНБЕТ БОНУС';

  fonbetLinkWrap.appendChild(fonbetLink);
  buttonsContainer.append(betAgainButton, saveButton);
  actionsWrapper.append(buttonsContainer, fonbetLinkWrap);
  return actionsWrapper;
}

function createTotalsBlock(product) {
  sendFrontendLog("лог в table заработал");
  const totalsWrapper = document.createElement('div');
  totalsWrapper.classList.add('totals-wrapper', 'totals-wrapper-main');

  const totals = document.createElement('div');
  totals.classList.add('totals', 'totals-main');

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

  totalsWrapper.append(totals);
  return totalsWrapper;
}


backButtonClickHandler('choose-page.html');

document.addEventListener('DOMContentLoaded', () => {
  setupFooterNavigation();

  const user = getTelegramUser();
  let tg_id = '';
  let username = '';

  if (user?.id) {
    tg_id = String(user.id);
    username = user.username ? String(user.username) : '';
    try {
      localStorage.setItem('tg_id', tg_id);
      if (username) localStorage.setItem('username', username);
    } catch (_) {}
  } else {
    tg_id = localStorage.getItem('tg_id') || '';
    username = localStorage.getItem('username') || '';
  }

  if (tg_id) {
    initTableScreen(tg_id, username);
  } else {
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      mainContent.textContent = 'Ошибка: не найден Telegram ID в localStorage и через Telegram.WebApp.';
    }
  }
});
