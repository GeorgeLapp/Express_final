import { filterVorRows, getAllContractors, getAllWorkClasses } from './filters.js';
import { formatNumber, escapeHtml, openModal, closeModal, toast } from './ui.js';

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
  const allRows = actions.allVorRows ? actions.allVorRows() : state.data.blocks.flatMap(block => block.vorRows || []);
  const rows = filterVorRows(allRows, state);
  const blockOptions = ['all', ...state.data.blocks.map(block => block.id)];
  const contractorOptions = ['all', ...getAllContractors(state)];
  const classOptions = ['all', ...getAllWorkClasses(state)];

  const exportRows = rows.map(row => ({
    'Класс работ': row.workClass,
    'Вид работ': row.workType,
    Расценка: row.rate,
    Позиции: row.material || row.rate,
    'Единицы измерения': row.unit,
    'Объёмы по рабочей документации': row.planVolume,
    'Факт выполненных работ': row.factVolume,
    Остаток: row.deviation,
    Комментарий: row.comment,
    'Дата изменения': row.updatedAt,
    'Кто изменил': row.updatedBy
  }));
  actions.setExport('vor', exportRows);

  container.innerHTML = `
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Ведомость объёмов работ (ВОР)</h2>
        </div>
      </div>

      <div class="filters-bar">
        <select class="field-select" id="vorBlock">
          ${blockOptions.map(v => `<option value="${escapeHtml(v)}" ${state.vor.block === v ? 'selected' : ''}>${v === 'all' ? 'Все ТБ' : escapeHtml(v)}</option>`).join('')}
        </select>

        <select class="field-select" id="vorContractor">
          ${contractorOptions.map(v => `<option value="${escapeHtml(v)}" ${state.vor.contractor === v ? 'selected' : ''}>${v === 'all' ? 'Все подрядчики' : escapeHtml(v)}</option>`).join('')}
        </select>

        <select class="field-select" id="vorClass">
          ${classOptions.map(v => `<option value="${escapeHtml(v)}" ${state.vor.workClass === v ? 'selected' : ''}>${v === 'all' ? 'Все классы работ' : escapeHtml(v)}</option>`).join('')}
        </select>

        <label class="checkline"><input type="checkbox" id="vorOnlyDiff" ${state.vor.onlyDiff ? 'checked' : ''}/> Только позиции с остатком</label>
        <label class="checkline"><input type="checkbox" id="vorOnlyOpen" ${state.vor.onlyOpen ? 'checked' : ''}/> Только незакрытые</label>
      </div>

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th class="vor-key">Класс работ</th>
              <th class="vor-key">Вид работ</th>
              <th class="vor-key">Расценка</th>
              <th class="vor-key">Позиции</th>
              <th class="vor-key">Единицы измерения</th>
              <th class="vor-volume">Объёмы по рабочей документации</th>
              <th class="vor-volume">Факт выполненных работ</th>
              <th class="vor-volume">Остаток</th>
              <th>Комментарий</th>
              <th>Дата изменения</th>
              <th>Кто изменил</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map(row => {
              const hasLeftVolume = Number(row.deviation || 0) > 0.001;
              return `
                <tr class="${hasLeftVolume ? 'changed' : ''}">
                  <td class="vor-key">${escapeHtml(row.workClass)}</td>
                  <td class="vor-key">${escapeHtml(row.workType)}</td>
                  <td class="vor-key">${escapeHtml(row.rate)}</td>
                  <td class="vor-key">${escapeHtml(row.material || row.rate || '—')}</td>
                  <td class="vor-key">${escapeHtml(row.unit)}</td>
                  <td class="vor-volume">${formatNumber(row.planVolume, 3)}</td>
                  <td class="vor-volume">${formatNumber(row.factVolume, 3)}</td>
                  <td class="vor-volume">${formatNumber(row.deviation, 3)}</td>
                  <td><input class="table-input comment" value="${escapeHtml(row.comment || '')}" data-vor-comment="${escapeHtml(row.id)}"/></td>
                  <td>${escapeHtml(row.updatedAt)}</td>
                  <td>${escapeHtml(row.updatedBy)}</td>
                  <td>
                    <div class="row-actions">
                      <button class="btn soft" data-vor-save="${escapeHtml(row.id)}">Сохранить</button>
                      <button class="btn" data-vor-history="${escapeHtml(row.id)}">История</button>
                    </div>
                  </td>
                </tr>
              `;
            }).join('') : `<tr><td colspan="12"><div class="empty">Нет строк под выбранный фильтр.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;

  container.querySelector('#vorBlock').addEventListener('change', e => actions.patchState({ vor: { block: e.target.value } }));
  container.querySelector('#vorContractor').addEventListener('change', e => actions.patchState({ vor: { contractor: e.target.value } }));
  container.querySelector('#vorClass').addEventListener('change', e => actions.patchState({ vor: { workClass: e.target.value } }));
  container.querySelector('#vorOnlyDiff').addEventListener('change', e => actions.patchState({ vor: { onlyDiff: e.target.checked } }));
  container.querySelector('#vorOnlyOpen').addEventListener('change', e => actions.patchState({ vor: { onlyOpen: e.target.checked } }));

  container.querySelectorAll('[data-vor-save]').forEach(btn => btn.addEventListener('click', () => {
    const rowId = btn.dataset.vorSave;
    const commentValue = container.querySelector(`[data-vor-comment="${CSS.escape(rowId)}"]`).value || '';
    actions.updateVorRow(rowId, {
      comment: commentValue,
      updatedAt: '2026-03-18 10:55',
      updatedBy: 'ПТО'
    });
    toast('Комментарий по строке ВОР сохранён');
  }));

  container.querySelectorAll('[data-vor-history]').forEach(btn => btn.addEventListener('click', () => {
    const row = actions.getVorRow(btn.dataset.vorHistory);
    if(!row){
      toast('Строка ВОР не найдена', 'alert');
      return;
    }
    openModal({
      title: 'История корректировок',
      subtitle: `${row.block} · ${row.rate}`,
      body: renderHistory(row.history || []),
      footer: `<button class="btn primary" data-close-history="true">Закрыть</button>`,
      small: true
    });
    document.querySelector('[data-close-history="true"]').addEventListener('click', closeModal);
  }));
}
