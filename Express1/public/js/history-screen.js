import { backButtonClickHandler, setupFooterNavigation, getBackendBaseUrl } from './utils.js';

function formatRecommendedLabel(outcome) {
  const key = (outcome || '').toString().trim().toLowerCase();
  if (key === 'outcome1') return '1';
  if (key === 'outcomex') return 'X';
  if (key === 'outcome2') return '2';
  if (key === 'outcome1x') return '1X';
  if (key === 'outcomex2') return 'X2';
  return '';
}



function createHistoryRow({ teams, recommended, coef, result }) {
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

  const coefNum = Number(coef);
  const coefText = Number.isFinite(coefNum) ? coefNum.toFixed(2) : '-';

  row.innerHTML = `
    <div class="cell cell-30">${teams || '-'}</div>
    <div class="divider"></div>
    <div class="cell cell-30">${recommended || '-'}</div>
    <div class="divider"></div>
    <div class="cell cell-20">${coefText}</div>
    <div class="divider"></div>
    <div class="cell cell-20">${resultDot}</div>
  `;

  return row;
}

function createHistoryHeader() {
  const header = document.createElement('div');
  header.classList.add('table-line', 'history-line', 'table-header');

  header.innerHTML = `
    <div class="cell cell-30">Команды</div>
    <div class="divider"></div>
    <div class="cell cell-30">Рекомендация</div>
    <div class="divider"></div>
    <div class="cell cell-20">Коэфф</div>
    <div class="divider"></div>
    <div class="cell cell-20">Результат</div>
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

            history.forEach((item) => {
      const teams =
        item.teams ||
        [item.event?.team1, item.event?.team2].filter(Boolean).join(' / ');

      const shownOutcome = item.shown_outcome?.trim?.()?.toLowerCase?.();
      const recommended =
        item.recommended_label ||
        formatRecommendedLabel(shownOutcome);

      let coef = item.recommended_coef;
      if (coef == null) {
        if (shownOutcome === 'outcome1') coef = item.event?.outcome1 ?? 1;
        else if (shownOutcome === 'outcomex') coef = item.event?.outcomeX ?? 1;
        else if (shownOutcome === 'outcome2') coef = item.event?.outcome2 ?? 1;
        else if (shownOutcome === 'outcome1x') coef = item.event?.outcome1X ?? 1;
        else if (shownOutcome === 'outcomex2') coef = item.event?.outcomeX2 ?? 1;
      }

            let result = '';
      const winningOutcome = item.event?.winning_outcome?.trim?.()?.toLowerCase?.();

      if (winningOutcome && shownOutcome) {
        if (shownOutcome === 'outcome1x') {
          result = (winningOutcome === 'outcome1' || winningOutcome === 'outcomex')
            ? 'win'
            : 'lose';
        } else if (shownOutcome === 'outcomex2') {
          result = (winningOutcome === 'outcome2' || winningOutcome === 'outcomex')
            ? 'win'
            : 'lose';
        } else {
          result = winningOutcome === shownOutcome ? 'win' : 'lose';
        }
      } else {
        result = 'pending';
      }

      const row = createHistoryRow({
        teams,
        recommended,
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
