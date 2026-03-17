
import { PROJECT_DATA } from './data.js';
import { applyTheme, nextTheme } from './theme.js';
import { qs, qsa, deepClone, loadUiState, saveUiState, formatCurrency, formatCompactCurrency, formatNumber, downloadCsv, escapeHtml, toast, openModal, closeModal, unique } from './ui.js';
import { visibleBlocks, getAllContractors, getAllWorkClasses } from './filters.js';
import { renderBudget } from './budget.js';
import { renderVor } from './vor.js';
import { renderLocalEstimates } from './localsmeta.js';
import { openKs2Modal } from './ks2.js';

const persisted = loadUiState();
const state = {
  data: deepClone(PROJECT_DATA),
  route: persisted.route || 'dashboard',
  theme: persisted.theme || 'dark',
  selectedBlocks: persisted.selectedBlocks?.length ? persisted.selectedBlocks : PROJECT_DATA.blocks.map(block => block.id),
  search: persisted.search || '',
  dashboard: {
    groupBy: persisted.dashboard?.groupBy || 'block',
    detailLevel: persisted.dashboard?.detailLevel || 'workClass'
  },
  budget: {
    groupBy: persisted.budget?.groupBy || 'levelMark',
    detailLevel: persisted.budget?.detailLevel || 'medium',
    contractor: persisted.budget?.contractor || 'all',
    workClass: persisted.budget?.workClass || 'all',
    onlyProblems: Boolean(persisted.budget?.onlyProblems),
    onlyWithBalance: Boolean(persisted.budget?.onlyWithBalance),
    onlyWithoutKs2: Boolean(persisted.budget?.onlyWithoutKs2),
    sortKey: persisted.budget?.sortKey || 'plannedCost',
    sortDir: persisted.budget?.sortDir || 'desc'
  },
  vor: {
    contractor: persisted.vor?.contractor || 'all',
    workClass: persisted.vor?.workClass || 'all',
    onlyDiff: Boolean(persisted.vor?.onlyDiff),
    onlyOpen: Boolean(persisted.vor?.onlyOpen),
    onlyKs2: Boolean(persisted.vor?.onlyKs2),
    limitMode: persisted.vor?.limitMode ?? true,
    mode: persisted.vor?.mode || 'works'
  },
  locals: {
    contractor: persisted.locals?.contractor || 'all',
    workClass: persisted.locals?.workClass || 'all',
    selectedEstimateId: persisted.locals?.selectedEstimateId || null
  },
  ui: {
    blockDropdownOpen: false,
    expandedBudget: {}
  },
  exportPayload: { name: 'export', rows: [] },
  ks2Draft: null
};

applyTheme(state.theme);

function selectedBlockLabel(){
  if(state.selectedBlocks.length === state.data.blocks.length) return 'Все блоки';
  if(state.selectedBlocks.length === 1) return state.selectedBlocks[0];
  return `${state.selectedBlocks.length} блока`;
}

function patchDeep(target, patch){
  Object.entries(patch).forEach(([key, value]) => {
    if(value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])){
      patchDeep(target[key], value);
    }else{
      target[key] = value;
    }
  });
}

function patchState(patch){
  patchDeep(state, patch);
  saveUiState(state);
  render();
}

function setExport(name, rows){
  state.exportPayload = { name, rows };
}

function getState(){
  return state;
}

function getVorRow(id){
  for(const block of state.data.blocks){
    const row = block.vorRows.find(item => item.id === id);
    if(row) return row;
  }
  return null;
}

function updateVorRow(id, values){
  for(const block of state.data.blocks){
    const row = block.vorRows.find(item => item.id === id);
    if(row){
      Object.assign(row, values);
      if(values.factVolume !== undefined){
        row.deviation = Number((Number(row.factVolume || 0) - Number(row.planVolume || 0)).toFixed(3));
      }
      row.history = [...(row.history || []), {
        date: values.updatedAt || '2026-03-17 21:00',
        user: values.updatedBy || 'Пользователь',
        action: 'Обновление строки ВОР',
        value: row.factVolume
      }];
      render();
      return;
    }
  }
}

function applyKs2Draft(draft){
  const block = state.data.blocks.find(item => item.id === draft.recognizedBlock) || state.data.blocks[0];
  block.ks2Acts.unshift({
    id: `${block.id}-KS2-new-${Date.now()}`,
    block: block.id,
    actNumber: draft.actNumber || `Новый-${block.ks2Acts.length + 1}`,
    contractor: draft.contractor || 'Не определён',
    fileName: draft.fileName || 'manual-entry.pdf',
    path: `${block.id}/КС-2/${draft.fileName || 'manual-entry.pdf'}`,
    status: 'Сопоставлен',
    confidence: draft.confidence || 0.9,
    sum: Number(draft.sum || 0),
    itemsCount: Number(draft.itemsCount || 8),
    recognizedBlock: block.id
  });

  block.summary.ks2Count += 1;
  block.summary.docsCount += 1;
  block.summary.ks2Accepted += Number(draft.sum || 0);
  block.summary.factTotal += Number(draft.sum || 0);
  block.summary.paidTotal += Number((draft.sum || 0) * 0.82);
  block.summary.remainingToPay = Math.max(block.summary.factTotal - block.summary.paidTotal, 0);

  const candidate = block.budgetRows.find(row =>
    (!draft.contractor || row.contractor === draft.contractor) &&
    (!draft.workType || row.workType.toLowerCase().includes(draft.workType.toLowerCase()))
  ) || block.budgetRows[0];

  if(candidate){
    candidate.ks2Accepted = Number(candidate.ks2Accepted || 0) + Number(draft.sum || 0);
    candidate.factCost = Number(candidate.factCost || 0) + Number(draft.sum || 0);
    candidate.paidAmount = Number(candidate.paidAmount || 0) + Number((draft.sum || 0) * 0.82);
    candidate.remainingToPay = Math.max(Number(candidate.factCost || 0) - Number(candidate.paidAmount || 0), 0);
    candidate.comment = [candidate.comment, 'Добавлен КС-2 вручную'].filter(Boolean).join('; ');
  }

  state.ks2Draft = null;
  render();
}

function renderTopbar(){
  const topbar = qs('#topbar');
  const dropdownOpen = state.ui.blockDropdownOpen;
  topbar.innerHTML = `
    <div class="toolbar-group">
      <div class="dropdown ${dropdownOpen ? 'open' : ''}" id="blockDropdown">
        <button class="dropdown-toggle" id="blockDropdownToggle">${selectedBlockLabel()}</button>
        <div class="dropdown-panel">
          <div class="dropdown-actions">
            <button class="btn soft" id="selectAllBlocks">Все</button>
            <button class="btn" id="clearAllBlocks">Снять всё</button>
          </div>
          <div class="checkbox-list">
            ${state.data.blocks.map(block => `
              <label class="checkbox-item">
                <span>${block.id}</span>
                <input type="checkbox" value="${block.id}" ${state.selectedBlocks.includes(block.id) ? 'checked' : ''}/>
              </label>
            `).join('')}
          </div>
        </div>
      </div>

      <input class="field-input search-box" id="globalSearch" placeholder="Поиск по подрядчику, КС-2, виду работ, расценке, материалу, файлу" value="${escapeHtml(state.search)}"/>
    </div>

    <div class="toolbar-group">
      <button class="btn" id="refreshBtn">Обновить данные</button>
      <button class="btn" id="uploadBtn">Загрузка файлов</button>
      <button class="btn primary" id="ks2Btn">КС-2</button>
      <div class="dropdown" id="exportDropdown">
        <button class="dropdown-toggle" id="exportToggle">Экспорт</button>
        <div class="dropdown-panel" style="left:auto;right:0;width:220px">
          <div class="checkbox-list">
            <button class="btn soft" id="exportCsvBtn">CSV текущего экрана</button>
            <button class="btn" id="exportJsonBtn">JSON текущего экрана</button>
          </div>
        </div>
      </div>
      <button class="btn" id="themeToggle">${state.theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}</button>
    </div>
  `;

  qs('#blockDropdownToggle').addEventListener('click', () => patchState({ ui: { blockDropdownOpen: !state.ui.blockDropdownOpen } }));
  qs('#selectAllBlocks').addEventListener('click', () => patchState({ selectedBlocks: state.data.blocks.map(block => block.id), ui: { blockDropdownOpen: true } }));
  qs('#clearAllBlocks').addEventListener('click', () => patchState({ selectedBlocks: [state.data.blocks[0].id], ui: { blockDropdownOpen: true } }));
  qsa('#blockDropdown input[type="checkbox"]').forEach(input => input.addEventListener('change', () => {
    const checked = qsa('#blockDropdown input[type="checkbox"]:checked').map(el => el.value);
    patchState({ selectedBlocks: checked.length ? checked : [state.data.blocks[0].id], ui: { blockDropdownOpen: true } });
  }));

  const searchEl = qs('#globalSearch');
  searchEl.addEventListener('input', (e) => {
    state.search = e.target.value;
    saveUiState(state);
    renderScreen();
  });

  qs('#refreshBtn').addEventListener('click', () => {
    toast('Данные на экране обновлены');
    render();
  });

  qs('#themeToggle').addEventListener('click', () => {
    state.theme = nextTheme(state.theme);
    applyTheme(state.theme);
    saveUiState(state);
    renderTopbar();
  });

  qs('#uploadBtn').addEventListener('click', () => {
    const files = visibleBlocks(state).flatMap(block => block.files).slice(0, 20);
    openModal({
      title: 'Загрузка и обработка файлов',
      subtitle: 'Интерфейс готов к приёму Excel, PDF и вспомогательных документов.',
      body: `
        <div class="upload-box" style="margin-bottom:14px">
          <p style="margin:0 0 12px">Выберите файлы для загрузки. На демо-слое файлы добавляются в локальное состояние браузера.</p>
          <input type="file" id="genericFileUpload" multiple />
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Файл</th><th>Тип</th><th>Путь</th></tr></thead>
            <tbody>
              ${files.map(file => `
                <tr>
                  <td>${escapeHtml(file.name)}</td>
                  <td>${escapeHtml(file.type)}</td>
                  <td>${escapeHtml(file.path)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      `,
      footer: `<button class="btn primary" data-close-upload="true">Закрыть</button>`
    });
    qs('[data-close-upload="true"]').addEventListener('click', closeModal);
    qs('#genericFileUpload').addEventListener('change', (event) => {
      const count = event.target.files?.length || 0;
      toast(`Добавлено файлов: ${count}`);
    });
  });

  qs('#ks2Btn').addEventListener('click', () => openKs2Modal(state, actions));

  const exportDropdown = qs('#exportDropdown');
  qs('#exportToggle').addEventListener('click', () => exportDropdown.classList.toggle('open'));
  qs('#exportCsvBtn').addEventListener('click', () => downloadCsv(`${state.exportPayload.name}-${Date.now()}.csv`, state.exportPayload.rows));
  qs('#exportJsonBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state.exportPayload.rows, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.exportPayload.name}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.addEventListener('click', onClickOutsideTopbar, { once: true });
}

function onClickOutsideTopbar(event){
  if(!event.target.closest('#blockDropdown')){
    state.ui.blockDropdownOpen = false;
    renderTopbar();
  }
}

function renderSidebar(){
  const sidebarBlocks = qs('#sidebarBlocks');
  const sidebarMeta = qs('#sidebarMeta');
  const blocks = visibleBlocks(state);

  sidebarBlocks.innerHTML = blocks.map(block => `
    <div class="block-pill">
      <div>
        <b>${escapeHtml(block.id)}</b>
        <span>${block.summary.contractorsCount} подрядч.</span>
      </div>
      <span>${block.summary.ks2Count} КС-2</span>
    </div>
  `).join('');

  const totals = blocks.reduce((acc, block) => {
    acc.budgetTotal += block.summary.budgetTotal;
    acc.ks2Accepted += block.summary.ks2Accepted;
    acc.paidTotal += block.summary.paidTotal;
    acc.docsCount += block.summary.docsCount;
    return acc;
  }, { budgetTotal:0, ks2Accepted:0, paidTotal:0, docsCount:0 });

  sidebarMeta.innerHTML = `
    <div class="meta-row"><span>Бюджет</span><strong>${formatCompactCurrency(totals.budgetTotal)}</strong></div>
    <div class="meta-row"><span>Принято по КС-2</span><strong>${formatCompactCurrency(totals.ks2Accepted)}</strong></div>
    <div class="meta-row"><span>Оплачено</span><strong>${formatCompactCurrency(totals.paidTotal)}</strong></div>
    <div class="meta-row"><span>Документы</span><strong>${formatNumber(totals.docsCount)}</strong></div>
  `;

  qsa('.menu-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.route === state.route);
    btn.onclick = () => patchState({ route: btn.dataset.route });
  });
}

function renderDashboard(container){
  const blocks = visibleBlocks(state);
  const allBudgetRows = blocks.flatMap(block => block.budgetRows);
  const allActs = blocks.flatMap(block => block.ks2Acts);
  const totals = blocks.reduce((acc, block) => {
    acc.budgetTotal += block.summary.budgetTotal;
    acc.ks2Accepted += block.summary.ks2Accepted;
    acc.factTotal += block.summary.factTotal;
    acc.paidTotal += block.summary.paidTotal;
    acc.remainingToPay += block.summary.remainingToPay;
    acc.contractorsCount += block.summary.contractorsCount;
    acc.localEstimatesCount += block.summary.localEstimatesCount;
    acc.ks2Count += block.summary.ks2Count;
    return acc;
  }, {
    budgetTotal:0, ks2Accepted:0, factTotal:0, paidTotal:0, remainingToPay:0, contractorsCount:0, localEstimatesCount:0, ks2Count:0
  });

  const groupedMode = state.dashboard.detailLevel;
  const summaryGroups = {
    block: blocks.map(block => ({
      name: block.id,
      budget: block.summary.budgetTotal,
      ks2: block.summary.ks2Accepted,
      paid: block.summary.paidTotal,
      fact: block.summary.factTotal
    })),
    contractor: unique(allBudgetRows.map(row => row.contractor)).slice(0, 8).map(contractor => {
      const rows = allBudgetRows.filter(row => row.contractor === contractor);
      return {
        name: contractor,
        budget: rows.reduce((acc, row) => acc + Number(row.plannedCost || 0), 0),
        ks2: rows.reduce((acc, row) => acc + Number(row.ks2Accepted || 0), 0),
        paid: rows.reduce((acc, row) => acc + Number(row.paidAmount || 0), 0),
        fact: rows.reduce((acc, row) => acc + Number(row.factCost || 0), 0)
      };
    }),
    workClass: unique(allBudgetRows.map(row => row.workClass)).map(workClass => {
      const rows = allBudgetRows.filter(row => row.workClass === workClass);
      return {
        name: workClass,
        budget: rows.reduce((acc, row) => acc + Number(row.plannedCost || 0), 0),
        ks2: rows.reduce((acc, row) => acc + Number(row.ks2Accepted || 0), 0),
        paid: rows.reduce((acc, row) => acc + Number(row.paidAmount || 0), 0),
        fact: rows.reduce((acc, row) => acc + Number(row.factCost || 0), 0)
      };
    }),
    workType: unique(allBudgetRows.map(row => row.workType)).slice(0, 8).map(workType => {
      const rows = allBudgetRows.filter(row => row.workType === workType);
      return {
        name: workType,
        budget: rows.reduce((acc, row) => acc + Number(row.plannedCost || 0), 0),
        ks2: rows.reduce((acc, row) => acc + Number(row.ks2Accepted || 0), 0),
        paid: rows.reduce((acc, row) => acc + Number(row.paidAmount || 0), 0),
        fact: rows.reduce((acc, row) => acc + Number(row.factCost || 0), 0)
      };
    })
  };

  const summaryRows = summaryGroups[groupedMode];
  setExport('dashboard', summaryRows.map(row => ({
    Срез: row.name,
    Бюджет: row.budget,
    'Принято по КС-2': row.ks2,
    Факт: row.fact,
    Оплачено: row.paid
  })));

  const signals = unique(blocks.flatMap(block => block.signals.map(signal => `${signal.type}|${signal.text}`))).map(item => {
    const [type, text] = item.split('|');
    return { type, text };
  });

  const blocksMarkup = blocks.map(block => `
    <button class="block-card" data-focus-block="${block.id}">
      <div class="top">
        <h3>${escapeHtml(block.id)}</h3>
        <span class="chip">${block.summary.ks2Count} КС-2</span>
      </div>
      <p>${formatCompactCurrency(block.summary.budgetTotal)} · подрядчиков ${block.summary.contractorsCount} · файлов ${block.summary.docsCount}</p>
    </button>
  `).join('');

  const summaryMarkup = summaryRows.map(row => `
    <tr>
      <td>${escapeHtml(row.name)}</td>
      <td>${formatCurrency(row.budget)}</td>
      <td>${formatCurrency(row.ks2)}</td>
      <td>${formatCurrency(row.fact)}</td>
      <td>${formatCurrency(row.paid)}</td>
    </tr>
  `).join('');

  container.innerHTML = `
    <section class="hero">
      <div class="hero-top">
        <div>
          <h1>Контур данных по сметам, объёмам, КС-2 и оплатам</h1>
        </div>
        <div class="hero-chip">${selectedBlockLabel()}</div>
      </div>

      <div class="hero-grid">
        <div class="kpi-card"><div class="kpi-label">Акты КС-2</div><div class="kpi-value">${formatNumber(allActs.length)}</div><div class="kpi-note">Реестр и сопоставление</div></div>
        <div class="kpi-card"><div class="kpi-label">Подрядчики</div><div class="kpi-value">${formatNumber(unique(allBudgetRows.map(row => row.contractor)).length)}</div><div class="kpi-note">Активные контрагенты</div></div>
        <div class="kpi-card"><div class="kpi-label">Локальные сметы</div><div class="kpi-value">${formatNumber(totals.localEstimatesCount)}</div><div class="kpi-note">Загруженные сметы</div></div>
        <div class="kpi-card"><div class="kpi-label">Файлы</div><div class="kpi-value">${formatNumber(blocks.reduce((acc, block) => acc + block.files.length, 0))}</div><div class="kpi-note">PDF и Excel по блокам</div></div>
      </div>
    </section>

    <section class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">Общий бюджет</div><div class="kpi-value">${formatCompactCurrency(totals.budgetTotal)}</div><div class="kpi-note">Сумма по выбранным блокам</div></div>
      <div class="kpi-card"><div class="kpi-label">Принято по КС-2</div><div class="kpi-value">${formatCompactCurrency(totals.ks2Accepted)}</div><div class="kpi-note">Подтверждено актами</div></div>
      <div class="kpi-card"><div class="kpi-label">Факт</div><div class="kpi-value">${formatCompactCurrency(totals.factTotal)}</div><div class="kpi-note">Фактическое исполнение</div></div>
      <div class="kpi-card"><div class="kpi-label">Оплачено</div><div class="kpi-value">${formatCompactCurrency(totals.paidTotal)}</div><div class="kpi-note">Платёжный контур</div></div>
      <div class="kpi-card"><div class="kpi-label">Остаток к оплате</div><div class="kpi-value">${formatCompactCurrency(totals.remainingToPay)}</div><div class="kpi-note">Открытые обязательства</div></div>
      <div class="kpi-card"><div class="kpi-label">Отклонение факт / план</div><div class="kpi-value">${formatCompactCurrency(totals.factTotal - totals.budgetTotal)}</div><div class="kpi-note">По выбранным блокам</div></div>
      <div class="kpi-card"><div class="kpi-label">Подрядчики</div><div class="kpi-value">${formatNumber(unique(allBudgetRows.map(row => row.contractor)).length)}</div><div class="kpi-note">Уникальные подрядчики</div></div>
      <div class="kpi-card"><div class="kpi-label">Локальные сметы</div><div class="kpi-value">${formatNumber(totals.localEstimatesCount)}</div><div class="kpi-note">Загруженные сметы</div></div>
      <div class="kpi-card"><div class="kpi-label">Акты КС-2</div><div class="kpi-value">${formatNumber(totals.ks2Count)}</div><div class="kpi-note">Всего в контуре</div></div>
      <div class="kpi-card"><div class="kpi-label">Файлы</div><div class="kpi-value">${formatNumber(blocks.reduce((acc, block) => acc + block.files.length, 0))}</div><div class="kpi-note">PDF и Excel по блокам</div></div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Карта блоков</h2>
        </div>
      </div>
      <div class="block-grid">${blocksMarkup}</div>
    </section>

    <div class="layout-grid">
      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>Сводка по выбранной детализации</h2>
          </div>
          <div class="segbar">
            ${[
              ['block','По блокам'],
              ['contractor','По подрядчикам'],
              ['workClass','По классам работ'],
              ['workType','По видам работ']
            ].map(([value, label]) => `
              <button class="${state.dashboard.detailLevel === value ? 'active' : ''}" data-dashboard-detail="${value}">${label}</button>
            `).join('')}
          </div>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Срез</th><th>Бюджет</th><th>Принято по КС-2</th><th>Факт</th><th>Оплачено</th></tr></thead>
            <tbody>${summaryMarkup}</tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>Сигналы и статусы</h2>
          </div>
        </div>
        <div class="signal-stack">
          ${signals.length ? signals.map(signal => `
            <div class="metric-card">
              <div class="row">
                <b>${escapeHtml(signal.text)}</b>
                <span class="status ${signal.type}">${signal.type === 'alert' ? 'Критично' : 'Проверить'}</span>
              </div>
            </div>
          `).join('') : `<div class="empty">Критичных сигналов по текущему срезу нет.</div>`}
        </div>

        <div class="panel-head" style="margin-top:14px">
          <div>
            <h2>Быстрые переходы</h2>
          </div>
        </div>
        <div class="quick-grid">
          <button class="mini-card" data-jump="vor"><div class="row"><b>Открыть ВОР</b><span>→</span></div><span>Работа с объёмами и корректировками.</span></button>
          <button class="mini-card" data-jump="budget"><div class="row"><b>Открыть бюджет</b><span>→</span></div><span>Иерархия по отметкам, классам и видам работ.</span></button>
          <button class="mini-card" data-jump="locals"><div class="row"><b>Локальные сметы</b><span>→</span></div><span>Просмотр смет подрядчиков и связей.</span></button>
          <button class="mini-card" id="jumpKs2"><div class="row"><b>Обработать КС-2</b><span>→</span></div><span>Загрузка PDF и сопоставление строк.</span></button>
        </div>
      </section>
    </div>
  `;

  container.querySelectorAll('[data-dashboard-detail]').forEach(btn => btn.addEventListener('click', () => {
    patchState({ dashboard: { detailLevel: btn.dataset.dashboardDetail } });
  }));
  container.querySelectorAll('[data-focus-block]').forEach(btn => btn.addEventListener('click', () => {
    patchState({ selectedBlocks: [btn.dataset.focusBlock] });
  }));
  container.querySelectorAll('[data-jump]').forEach(btn => btn.addEventListener('click', () => {
    patchState({ route: btn.dataset.jump });
  }));
  qs('#jumpKs2', container).addEventListener('click', () => openKs2Modal(state, actions));
}

function renderScreen(){
  const host = qs('#screenHost');
  if(state.route === 'dashboard'){
    renderDashboard(host);
  }else if(state.route === 'budget'){
    renderBudget(host, state, actions);
  }else if(state.route === 'vor'){
    renderVor(host, state, actions);
  }else if(state.route === 'locals'){
    renderLocalEstimates(host, state, actions);
  }
}

function render(){
  renderSidebar();
  renderTopbar();
  renderScreen();
}

const actions = {
  patchState,
  setExport,
  getState,
  updateVorRow,
  getVorRow,
  applyKs2Draft
};

render();
