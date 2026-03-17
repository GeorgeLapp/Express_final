
import { filterVorRows, getAllContractors, getAllWorkClasses } from './filters.js';
import { formatCurrency, formatNumber, escapeHtml, openModal, closeModal, toast } from './ui.js';

function renderHistory(history = []){
  return `
    <div class="table-wrap">
      <table class="table" style="min-width:0">
        <thead><tr><th>Дата</th><th>Пользователь</th><th>Действие</th><th>Значение</th></tr></thead>
        <tbody>
          ${history.map(item => `
            <tr>
              <td>${escapeHtml(item.date)}</td>
              <td>${escapeHtml(item.user)}</td>
              <td>${escapeHtml(item.action)}</td>
              <td>${escapeHtml(String(item.value))}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

export function renderVor(container, state, actions){
  const allRows = state.data.blocks.flatMap(block => block.vorRows);
  const rows = filterVorRows(allRows, state);
  const contractorOptions = ['all', ...getAllContractors(state)];
  const classOptions = ['all', ...getAllWorkClasses(state)];

  const exportRows = rows.map(row => ({
    Блок: row.block,
    Подрядчик: row.contractor,
    'Класс работ': row.workClass,
    'Вид работ': row.workType,
    Расценка: row.rate,
    Материал: row.material,
    Ед: row.unit,
    'Плановый объем': row.planVolume,
    'Фактический объем': row.factVolume,
    'Принято по КС-2': row.ks2Accepted,
    'Итоговая цена': row.totalPrice,
    Комментарий: row.comment
  }));
  actions.setExport('vor', exportRows);

  container.innerHTML = `
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>ВОР</h2>
        </div>
        <div class="segbar">
          <button class="${state.vor.mode === 'compact' ? 'active' : ''}" data-vor-mode="compact">Укрупнённо</button>
          <button class="${state.vor.mode === 'works' ? 'active' : ''}" data-vor-mode="works">По видам работ</button>
          <button class="${state.vor.mode === 'rates' ? 'active' : ''}" data-vor-mode="rates">Расценки</button>
          <button class="${state.vor.mode === 'materials' ? 'active' : ''}" data-vor-mode="materials">Материалы</button>
        </div>
      </div>

      <div class="filters-bar">
        <select class="field-select" id="vorContractor">
          ${contractorOptions.map(v => `<option value="${escapeHtml(v)}" ${state.vor.contractor === v ? 'selected' : ''}>${v === 'all' ? 'Все подрядчики' : escapeHtml(v)}</option>`).join('')}
        </select>

        <select class="field-select" id="vorClass">
          ${classOptions.map(v => `<option value="${escapeHtml(v)}" ${state.vor.workClass === v ? 'selected' : ''}>${v === 'all' ? 'Все классы работ' : escapeHtml(v)}</option>`).join('')}
        </select>

        <label class="checkline"><input type="checkbox" id="vorOnlyDiff" ${state.vor.onlyDiff ? 'checked' : ''}/> Только расхождения</label>
        <label class="checkline"><input type="checkbox" id="vorOnlyOpen" ${state.vor.onlyOpen ? 'checked' : ''}/> Только незакрытые</label>
        <label class="checkline"><input type="checkbox" id="vorOnlyKs2" ${state.vor.onlyKs2 ? 'checked' : ''}/> Только позиции с КС-2</label>
        <label class="checkline"><input type="checkbox" id="vorLimitMode" ${state.vor.limitMode ? 'checked' : ''}/> Ограничение суммой общего объёма</label>
      </div>

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>ТБ</th>
              <th>Подрядчик</th>
              <th>Класс работ</th>
              <th>Вид работ</th>
              <th>${state.vor.mode === 'rates' ? 'Расценка' : 'Расценка / позиция'}</th>
              ${state.vor.mode === 'materials' ? '<th>Материал</th>' : ''}
              <th>Ед.</th>
              <th>План</th>
              <th>Факт</th>
              <th>Отклонение</th>
              <th>Принято по КС-2</th>
              ${state.vor.mode === 'rates' ? '<th>Работы</th><th>Материалы</th><th>Итог</th>' : ''}
              <th>Комментарий</th>
              <th>Дата изменения</th>
              <th>Кто изменил</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map(row => {
              const problem = Math.abs(Number(row.deviation || 0)) > Math.max(Number(row.planVolume || 0) * 0.08, 0.2);
              return `
                <tr class="${problem ? 'problem' : ''}">
                  <td>${escapeHtml(row.block)}</td>
                  <td>${escapeHtml(row.contractor)}</td>
                  <td>${escapeHtml(row.workClass)}</td>
                  <td>${escapeHtml(row.workType)}</td>
                  <td>${escapeHtml(row.rate)}</td>
                  ${state.vor.mode === 'materials' ? `<td>${escapeHtml(row.material || '—')}</td>` : ''}
                  <td>${escapeHtml(row.unit)}</td>
                  <td>${formatNumber(row.planVolume, 2)}</td>
                  <td><input class="table-input" type="number" step="0.001" value="${row.factVolume}" data-vor-fact="${escapeHtml(row.id)}"/></td>
                  <td>${formatNumber(row.deviation, 2)}</td>
                  <td>${formatNumber(row.ks2Accepted, 2)}</td>
                  ${state.vor.mode === 'rates' ? `
                    <td>${formatCurrency(row.laborPrice)}</td>
                    <td>${formatCurrency(row.materialPrice)}</td>
                    <td>${formatCurrency(row.totalPrice)}</td>` : ''}
                  <td><input class="table-input comment" value="${escapeHtml(row.comment || '')}" data-vor-comment="${escapeHtml(row.id)}"/></td>
                  <td>${escapeHtml(row.updatedAt)}</td>
                  <td>${escapeHtml(row.updatedBy)}</td>
                  <td>
                    <div class="row-actions">
                      <button class="btn soft" data-vor-save="${escapeHtml(row.id)}">Сохранить</button>
                      <button class="btn" data-vor-split="${escapeHtml(row.id)}">Подрядчики</button>
                      <button class="btn" data-vor-history="${escapeHtml(row.id)}">История</button>
                    </div>
                  </td>
                </tr>
              `;
            }).join('') : `<tr><td colspan="${state.vor.mode === 'rates' ? 16 : state.vor.mode === 'materials' ? 14 : 13}"><div class="empty">Нет строк под выбранный фильтр.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;

  container.querySelector('#vorContractor').addEventListener('change', e => actions.patchState({ vor: { contractor: e.target.value } }));
  container.querySelector('#vorClass').addEventListener('change', e => actions.patchState({ vor: { workClass: e.target.value } }));
  container.querySelector('#vorOnlyDiff').addEventListener('change', e => actions.patchState({ vor: { onlyDiff: e.target.checked } }));
  container.querySelector('#vorOnlyOpen').addEventListener('change', e => actions.patchState({ vor: { onlyOpen: e.target.checked } }));
  container.querySelector('#vorOnlyKs2').addEventListener('change', e => actions.patchState({ vor: { onlyKs2: e.target.checked } }));
  container.querySelector('#vorLimitMode').addEventListener('change', e => actions.patchState({ vor: { limitMode: e.target.checked } }));

  container.querySelectorAll('[data-vor-mode]').forEach(btn => btn.addEventListener('click', () => {
    actions.patchState({ vor: { mode: btn.dataset.vorMode } });
  }));

  container.querySelectorAll('[data-vor-save]').forEach(btn => btn.addEventListener('click', () => {
    const rowId = btn.dataset.vorSave;
    const factValue = Number(container.querySelector(`[data-vor-fact="${CSS.escape(rowId)}"]`).value || 0);
    const commentValue = container.querySelector(`[data-vor-comment="${CSS.escape(rowId)}"]`).value || '';
    actions.updateVorRow(rowId, {
      factVolume: factValue,
      deviation: Number((factValue - Number(actions.getVorRow(rowId)?.planVolume || 0)).toFixed(3)),
      comment: commentValue,
      updatedAt: '2026-03-17 21:00',
      updatedBy: 'Пользователь'
    });
    toast('Изменения по строке ВОР сохранены');
  }));

  container.querySelectorAll('[data-vor-history]').forEach(btn => btn.addEventListener('click', () => {
    const row = actions.getVorRow(btn.dataset.vorHistory);
    openModal({
      title: 'История корректировок',
      subtitle: `${row.block} · ${row.rate}`,
      body: renderHistory(row.history || []),
      footer: `<button class="btn primary" data-close-history="true">Закрыть</button>`,
      small: true
    });
    document.querySelector('[data-close-history="true"]').addEventListener('click', closeModal);
  }));

  container.querySelectorAll('[data-vor-split]').forEach(btn => btn.addEventListener('click', () => {
    const row = actions.getVorRow(btn.dataset.vorSplit);
    const block = state.data.blocks.find(item => item.id === row.block);
    const contractors = block?.contractors?.length ? block.contractors : [row.contractor];
    const initial = contractors.map((contractor, index) => {
      const total = Number(row.factVolume || 0);
      const portion = index === 0 ? total : Number((total / Math.max(contractors.length, 1)).toFixed(3));
      return { contractor, volume: portion };
    });
    openModal({
      title: 'Распределение объёма по подрядчикам',
      subtitle: `${row.block} · ${row.rate}`,
      body: `
        <div class="small-note" style="margin-bottom:10px">Общий фактический объём: ${formatNumber(row.factVolume, 3)} ${escapeHtml(row.unit)}</div>
        <div class="table-wrap">
          <table class="table" style="min-width:0">
            <thead><tr><th>Подрядчик</th><th>Объём</th></tr></thead>
            <tbody>
              ${initial.map(item => `
                <tr>
                  <td>${escapeHtml(item.contractor)}</td>
                  <td><input class="table-input" type="number" step="0.001" value="${item.volume}" data-split-input="${escapeHtml(item.contractor)}"/></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      `,
      footer: `
        <button class="btn" data-close-split="true">Отмена</button>
        <button class="btn primary" data-save-split="true">Сохранить распределение</button>
      `,
      small: true
    });
    document.querySelector('[data-close-split="true"]').addEventListener('click', closeModal);
    document.querySelector('[data-save-split="true"]').addEventListener('click', () => {
      const volumes = Array.from(document.querySelectorAll('[data-split-input]')).map(input => Number(input.value || 0));
      const sum = volumes.reduce((acc, value) => acc + value, 0);
      if(state.vor.limitMode && sum > Number(row.factVolume || 0) + 0.001){
        toast('Сумма по подрядчикам превышает общий объём', 'alert');
        return;
      }
      actions.updateVorRow(row.id, {
        history: [...(row.history || []), {
          date: '2026-03-17 21:05',
          user: 'Пользователь',
          action: 'Изменено распределение по подрядчикам',
          value: sum
        }]
      });
      closeModal();
      toast('Распределение сохранено');
    });
  }));
}
