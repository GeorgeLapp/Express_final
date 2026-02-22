import { backButtonClickHandler, setupFooterNavigation, getBackendBaseUrl, getTelegramUser } from './utils.js';

function formatRecommendedLabel(outcome) {
  const key = (outcome || '').toString().trim().toLowerCase();
  if (key === 'outcome1') return '1';
  if (key === 'outcomex') return 'X';
  if (key === 'outcome2') return '2';
  if (key === 'outcome1x') return '1X';
  if (key === 'outcomex2') return 'X2';
  return '';
}

function resolveRecommendedCoef(item, shownOutcome) {
  if (item.recommended_coef != null) {
    const existing = Number(item.recommended_coef);
    return Number.isFinite(existing) ? existing : null;
  }

  if (shownOutcome === 'outcome1') return Number(item.event?.outcome1);
  if (shownOutcome === 'outcomex') return Number(item.event?.outcomeX);
  if (shownOutcome === 'outcome2') return Number(item.event?.outcome2);
  if (shownOutcome === 'outcome1x') return Number(item.event?.outcome1X);
  if (shownOutcome === 'outcomex2') return Number(item.event?.outcomeX2);
  return null;
}

function resolveResult(shownOutcome, winningOutcome) {
  if (!shownOutcome || !winningOutcome) return 'pending';

  if (shownOutcome === 'outcome1x') {
    return (winningOutcome === 'outcome1' || winningOutcome === 'outcomex') ? 'win' : 'lose';
  }
  if (shownOutcome === 'outcomex2') {
    return (winningOutcome === 'outcome2' || winningOutcome === 'outcomex') ? 'win' : 'lose';
  }
  return winningOutcome === shownOutcome ? 'win' : 'lose';
}

function mapHistoryItem(item) {
  const teams =
    item.teams ||
    [item.event?.team1, item.event?.team2].filter(Boolean).join(' / ');

  const shownOutcome = (item.shown_outcome || '').toString().trim().toLowerCase();
  const recommended =
    item.recommended_label ||
    formatRecommendedLabel(shownOutcome);

  const coefRaw = resolveRecommendedCoef(item, shownOutcome);
  const coef = Number.isFinite(coefRaw) ? coefRaw : null;

  const winningOutcome = (item.event?.winning_outcome || '').toString().trim().toLowerCase();
  const result = resolveResult(shownOutcome, winningOutcome);

  return {
    teams: teams || '-',
    recommended: recommended || '-',
    coef,
    result
  };
}

function parseShownAt(shownAt) {
  const raw = (shownAt || '').toString().trim();
  if (!raw) return null;
  const isoBase = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const isoUtc = isoBase.endsWith('Z') ? isoBase : `${isoBase}Z`;
  const date = new Date(isoUtc);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatShownAtLabel(shownAt) {
  const date = parseShownAt(shownAt);
  if (!date) return 'Время неизвестно';
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function buildHistoryGroups(history) {
  const groups = [];
  const groupsByBatchId = new Map();
  let legacyGroupCounter = 0;

  for (const item of history) {
    const batchId = (item.batch_id || '').toString().trim();
    if (batchId) {
      let group = groupsByBatchId.get(batchId);
      if (!group) {
        group = {
          key: `batch-${batchId}`,
          batchId,
          shownAt: item.shown_at || '',
          items: []
        };
        groupsByBatchId.set(batchId, group);
        groups.push(group);
      }
      if (!group.shownAt && item.shown_at) {
        group.shownAt = item.shown_at;
      }
      group.items.push(item);
      continue;
    }

    // Фолбэк для старых записей без batch_id: группируем подряд идущие строки с одинаковым shown_at.
    const shownAt = (item.shown_at || '').toString().trim();
    const prevGroup = groups[groups.length - 1];
    if (prevGroup && !prevGroup.batchId && prevGroup.shownAt === shownAt) {
      prevGroup.items.push(item);
      continue;
    }

    groups.push({
      key: `legacy-${shownAt}-${legacyGroupCounter++}`,
      batchId: '',
      shownAt,
      items: [item]
    });
  }

  return groups;
}

function getGroupStatus(rows) {
  const hasPending = rows.some(row => row.result === 'pending');
  if (hasPending) {
    return { label: 'В ожидании', className: 'pending' };
  }

  const hasLose = rows.some(row => row.result === 'lose');
  if (hasLose) {
    return { label: 'Проигран', className: 'lose' };
  }

  return { label: 'Выиграл', className: 'win' };
}

function createHistoryRow({ teams, recommended, coef, result }) {
  const row = document.createElement('div');
  row.classList.add('table-line', 'history-line');

  let resultDot = '';
  if (result === 'win') {
    resultDot = '<span class="result-dot green" title="Выигрыш"></span>';
  } else if (result === 'lose') {
    resultDot = '<span class="result-dot red" title="Проигрыш"></span>';
  } else {
    resultDot = '<span class="result-dot gray" title="Ожидание результата"></span>';
  }

  const coefText = Number.isFinite(coef) ? coef.toFixed(2) : '-';

  row.innerHTML = `
    <div class="cell cell-30">${teams}</div>
    <div class="divider"></div>
    <div class="cell cell-30">${recommended}</div>
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

function createHistoryGroup(group, index) {
  const rows = group.items.map(mapHistoryItem);

  let combinedCoef = 1;
  let hasCombinedCoef = false;
  rows.forEach(row => {
    if (Number.isFinite(row.coef) && row.coef > 0) {
      hasCombinedCoef = true;
      combinedCoef *= row.coef;
    }
  });

  const groupStatus = getGroupStatus(rows);
  const shownAtText = formatShownAtLabel(group.shownAt);
  const combinedCoefText = hasCombinedCoef ? combinedCoef.toFixed(2) : '-';

  const details = document.createElement('details');
  details.classList.add('history-group');
  if (index === 0) {
    details.open = true;
  }

  const summary = document.createElement('summary');
  summary.classList.add('history-group-summary');
  summary.innerHTML = `
    <span class="history-group-arrow">▸</span>
    <div class="history-group-info">
      <div class="history-group-title">Экспресс #${index + 1}</div>
      <div class="history-group-meta">${shownAtText} • ${rows.length} событий • Общий коэфф: ${combinedCoefText}</div>
    </div>
    <span class="history-group-status ${groupStatus.className}">${groupStatus.label}</span>
  `;

  const content = document.createElement('div');
  content.classList.add('history-group-content');

  const table = document.createElement('div');
  table.classList.add('history-group-rows');
  table.appendChild(createHistoryHeader());
  rows.forEach(row => table.appendChild(createHistoryRow(row)));

  content.appendChild(table);
  details.append(summary, content);
  return details;
}

async function initHistoryScreen() {
  const mainContent = document.querySelector('.main-content');
  if (!mainContent) return;

  let tg_id = localStorage.getItem('tg_id');
  let username = localStorage.getItem('username') || '';
  if (!tg_id) {
    const user = getTelegramUser();
    if (user?.id) {
      tg_id = String(user.id);
      username = user.username ? String(user.username) : username;
      try {
        localStorage.setItem('tg_id', tg_id);
        if (username) localStorage.setItem('username', username);
      } catch (_) {}
    }
  }
  if (!tg_id) {
    mainContent.textContent = 'Ошибка: Telegram ID не найден.';
    return;
  }

  const title = document.createElement('h2');
  title.classList.add('history-title');
  title.textContent = 'История экспрессов';

  const groupsScroll = document.createElement('div');
  groupsScroll.classList.add('table-scroll', 'long-scroll', 'history-groups');

  try {
    const backendBaseUrl = getBackendBaseUrl();
    if (username) {
      try {
        const url = new URL(`${backendBaseUrl}/user/${tg_id}`);
        url.searchParams.set('username', username);
        await fetch(url.toString());
      } catch (_) {}
    }

    const res = await fetch(`${backendBaseUrl}/userHistory/${tg_id}`);
    if (!res.ok) throw new Error(`Error: ${res.status}`);
    const history = await res.json();

    if (!history.length) {
      mainContent.innerHTML = '<p class="no-events">История пуста.</p>';
      return;
    }

    const groups = buildHistoryGroups(history);
    groups.forEach((group, index) => {
      groupsScroll.appendChild(createHistoryGroup(group, index));
    });

    mainContent.append(title, groupsScroll);
  } catch (err) {
    console.error(err);
    mainContent.innerHTML = '<p class="error">Ошибка при загрузке истории.</p>';
  }
}

backButtonClickHandler('index.html');

document.addEventListener('DOMContentLoaded', () => {
  setupFooterNavigation('history');
  initHistoryScreen();
});
