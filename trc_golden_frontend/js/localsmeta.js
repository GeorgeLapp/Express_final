
import { filterEstimateRows } from './filters.js';
import { formatCurrency, formatCompactCurrency, escapeHtml } from './ui.js';

export function renderLocalEstimates(container, state, actions){
  const estimates = filterEstimateRows(state.data.blocks.flatMap(block => block.localEstimates), state);
  const selected = estimates.find(item => item.id === state.locals.selectedEstimateId) || estimates[0];
  const blockData = selected ? state.data.blocks.find(block => block.id === selected.block) : null;
  const relatedBudgetRows = selected
    ? (blockData?.budgetRows || []).filter(row => selected.items.includes(row.id))
    : [];

  const exportRows = estimates.map(item => ({
    Блок: item.block,
    Подрядчик: item.contractor,
    'Класс работ': item.workClass,
    'Вид работ': item.workType,
    'Стоимость по смете': item.plannedCost,
    'Принято по КС-2': item.ks2Accepted,
    Оплачено: item.paidAmount,
    Остаток: item.remainingToPay
  }));
  actions.setExport('locals', exportRows);

  container.innerHTML = `
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Локальные сметы</h2>
        </div>
        <div class="panel-tools">
          <select class="field-select" id="localsContractor">
            <option value="all">Все подрядчики</option>
            ${Array.from(new Set(state.data.blocks.flatMap(block => block.contractors || []))).map(contractor => `
              <option value="${escapeHtml(contractor)}" ${state.locals.contractor === contractor ? 'selected' : ''}>${escapeHtml(contractor)}</option>
            `).join('')}
          </select>

          <select class="field-select" id="localsWorkClass">
            <option value="all">Все классы работ</option>
            ${Array.from(new Set(state.data.blocks.flatMap(block => (block.localEstimates || []).map(item => item.workClass)))).map(workClass => `
              <option value="${escapeHtml(workClass)}" ${state.locals.workClass === workClass ? 'selected' : ''}>${escapeHtml(workClass)}</option>
            `).join('')}
          </select>
        </div>
      </div>

      <div class="split-layout">
        <div class="list-card">
          <div class="est-list">
            ${estimates.length ? estimates.map(item => `
              <button class="est-item ${selected?.id === item.id ? 'active' : ''}" data-estimate-id="${escapeHtml(item.id)}">
                <h4>${escapeHtml(item.workType || item.estimateName)}</h4>
                <p>${escapeHtml(item.block)} · ${escapeHtml(item.contractor)}</p>
                <p>${formatCompactCurrency(item.plannedCost)} · остаток ${formatCompactCurrency(item.remainingToPay)}</p>
              </button>
            `).join('') : `<div class="empty">Нет локальных смет под текущий фильтр.</div>`}
          </div>
        </div>

        <div class="panel" style="margin-bottom:0">
          ${selected ? `
            <div class="panel-head">
              <div>
                <h3>${escapeHtml(selected.workType || selected.estimateName)}</h3>
                <p>${escapeHtml(selected.block)} · ${escapeHtml(selected.contractor)}</p>
              </div>
              <div class="chip">${formatCompactCurrency(selected.plannedCost)}</div>
            </div>

            <div class="form-grid" style="margin-bottom:14px">
              <div class="field-card"><label>Класс работ</label><div class="value">${escapeHtml(selected.workClass || '—')}</div></div>
              <div class="field-card"><label>Вид работ</label><div class="value">${escapeHtml(selected.workType || '—')}</div></div>
              <div class="field-card"><label>Принято по КС-2</label><div class="value">${formatCurrency(selected.ks2Accepted)}</div></div>
              <div class="field-card"><label>Оплачено</label><div class="value">${formatCurrency(selected.paidAmount)}</div></div>
              <div class="field-card"><label>Остаток</label><div class="value">${formatCurrency(selected.remainingToPay)}</div></div>
              <div class="field-card"><label>Связанные строки бюджета</label><div class="value">${relatedBudgetRows.length}</div></div>
            </div>

            <div class="panel-head">
              <div>
                <h3>Состав локальной сметы</h3>
                <p>Строки бюджета и детализация до материалов, связанных с выбранной сметой.</p>
              </div>
              <div class="panel-tools">
                <button class="btn" data-jump-budget="true">Открыть в бюджете</button>
                <button class="btn" data-jump-vor="true">Открыть в ВОР</button>
              </div>
            </div>

            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Подрядчик</th>
                    <th>Блок</th>
                    <th>Класс работ</th>
                    <th>Вид работ</th>
                    <th>Расценка</th>
                    <th>Материал</th>
                    <th>Объём</th>
                    <th>Цена</th>
                    <th>Сумма</th>
                    <th>Принято по КС-2</th>
                    <th>Оплачено</th>
                    <th>Остаток</th>
                  </tr>
                </thead>
                <tbody>
                  ${relatedBudgetRows.map(row => `
                    <tr>
                      <td>${escapeHtml(row.contractor)}</td>
                      <td>${escapeHtml(row.block)}</td>
                      <td>${escapeHtml(row.workClass)}</td>
                      <td>${escapeHtml(row.workType)}</td>
                      <td>${escapeHtml(row.estimateName)}</td>
                      <td>${escapeHtml(row.materialName || '—')}</td>
                      <td>${row.planVolume}</td>
                      <td>${formatCurrency(row.unitPrice)}</td>
                      <td>${formatCurrency(row.plannedCost)}</td>
                      <td>${formatCurrency(row.ks2Accepted)}</td>
                      <td>${formatCurrency(row.paidAmount)}</td>
                      <td>${formatCurrency(row.remainingToPay)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <div class="panel-head" style="margin-top:14px">
              <div>
                <h3>Связанные файлы</h3>
                <p>Файлы блока, которые доступны для выбранной сметы.</p>
              </div>
            </div>
            <div class="info-stack">
              ${(blockData?.files || []).slice(0, 8).map(file => `
                <div class="metric-card">
                  <div class="row">
                    <b>${escapeHtml(file.name)}</b>
                    <span class="chip">${escapeHtml(file.kind)}</span>
                  </div>
                  <span>${escapeHtml(file.path)}</span>
                </div>
              `).join('')}
            </div>
          ` : `<div class="empty">Выберите локальную смету слева.</div>`}
        </div>
      </div>
    </section>
  `;

  container.querySelector('#localsContractor').addEventListener('change', e => actions.patchState({ locals: { contractor: e.target.value } }));
  container.querySelector('#localsWorkClass').addEventListener('change', e => actions.patchState({ locals: { workClass: e.target.value } }));
  container.querySelectorAll('[data-estimate-id]').forEach(btn => btn.addEventListener('click', () => {
    actions.patchState({ locals: { selectedEstimateId: btn.dataset.estimateId } });
  }));

  const budgetBtn = container.querySelector('[data-jump-budget="true"]');
  if(budgetBtn){
    budgetBtn.addEventListener('click', () => {
      actions.patchState({
        route: 'budget',
        search: selected.workType
      });
    });
  }

  const vorBtn = container.querySelector('[data-jump-vor="true"]');
  if(vorBtn){
    vorBtn.addEventListener('click', () => {
      actions.patchState({
        route: 'vor',
        search: selected.workType
      });
    });
  }
}
