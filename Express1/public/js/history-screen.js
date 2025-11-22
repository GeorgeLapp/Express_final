import { backButtonClickHandler, setupFooterNavigation, mapOutcome, getBackendBaseUrl } from './utils.js';

function createHistoryRow({ date, number, coef, result }) {
  const row = document.createElement('div');
  row.classList.add('table-line', 'history-line');

  let resultDot = '';
  if (result === 'win') {
    resultDot = `<span class="result-dot green"></span>`;
  } else if (result === 'lose') {
    resultDot = `<span class="result-dot red"></span>`;
  } else if (result === 'pending') {
    resultDot = `<span class="result-dot gray" title="Ожидание результата">⏳</span>`;
  }

  row.innerHTML = `
    <div class="cell cell-30">${date}</div>
    <div class="divider"></div>
    <div class="cell cell-10">${number}</div>
    <div class="divider"></div>
    <div class="cell cell-30">${coef.toFixed(2)}</div>
    <div class="divider"></div>
    <div class="cell cell-30">${resultDot}</div>
  `;

  return row;
}

function createHistoryHeader() {
  const header = document.createElement('div');
  header.classList.add('table-line', 'history-line', 'table-header');

  header.innerHTML = `
    <div class="cell cell-30">Date</div>
    <div class="divider"></div>
    <div class="cell cell-10">№</div>
    <div class="divider"></div>
    <div class="cell cell-30">Coefficient</div>
    <div class="divider"></div>
    <div class="cell cell-30">Result</div>
  `;

  return header;
}

async function initHistoryScreen() {
  const mainContent = document.querySelector('.main-content');
  if (!mainContent) return;

  const tg_id = localStorage.getItem('tg_id');
  if (!tg_id) {
    mainContent.textContent = 'Ошибка: не найден Telegram ID пользователя.';
    return;
  }

  const title = document.createElement('h2');
  title.classList.add('history-title');
  title.textContent = 'History of actions';

  const tableScroll = document.createElement('div');
  tableScroll.classList.add('table-scroll', 'long-scroll');
  tableScroll.appendChild(createHistoryHeader());

  try {
    const backendBaseUrl = getBackendBaseUrl();
    const res = await fetch(`${backendBaseUrl}/userHistory/${tg_id}`);
    if (!res.ok) throw new Error(`Ошибка: ${res.status}`);
    const history = await res.json();

    if (!history.length) {
      mainContent.innerHTML = `<p class="no-events">История пуста.</p>`;
      return;
    }

    history.forEach((item, idx) => {
  const dateObj = new Date(item.shown_at || item.created_at || Date.now());
  const dateStr = dateObj.toLocaleDateString('en-GB');

  let coef = 1;
  if (item.shown_outcome === 'outcome1') coef = item.event?.outcome1 ?? 1;
  else if (item.shown_outcome === 'outcomeX') coef = item.event?.outcomeX ?? 1;
  else if (item.shown_outcome === 'outcome2') coef = item.event?.outcome2 ?? 1;


  let result = '';
  const winningOutcome = item.event?.winning_outcome?.trim?.()?.toLowerCase?.();
  const shownOutcome = item.shown_outcome?.trim?.()?.toLowerCase?.();

  if (winningOutcome && shownOutcome) {
  result = winningOutcome === shownOutcome ? 'win' : 'lose';
} else {
  result = 'pending';
}

  const row = createHistoryRow({
    date: dateStr,
    number: idx + 1,
    coef: (Number(coef) || 1),
    result
  });

  tableScroll.appendChild(row);
});
    mainContent.appendChild(title);
    mainContent.appendChild(tableScroll);
  } catch (err) {
    console.error(err);
    mainContent.innerHTML = `<p class="error">Ошибка при загрузке истории.</p>`;
  }
}

backButtonClickHandler('index.html');

document.addEventListener('DOMContentLoaded', () => {
  setupFooterNavigation('history');
  initHistoryScreen();
});
