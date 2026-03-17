
import { filterBudgetRows, getAllContractors, getAllWorkClasses } from './filters.js';
import { formatCurrency, formatNumber, sortRows, escapeHtml, statusClass } from './ui.js';

function buildTree(rows, dims, sortKey, sortDir, path = ''){
  if(!dims.length){
    return sortRows(rows, sortKey, sortDir).map(row => ({ type: 'leaf', key: `${path}-${row.id}`, row }));
  }
  const [dim, ...rest] = dims;
  const groups = new Map();
  rows.forEach(row => {
    const value = row[dim] || '—';
    if(!groups.has(value)) groups.set(value, []);
    groups.get(value).push(row);
  });

  return [...groups.entries()]
    .sort((a,b) => String(a[0]).localeCompare(String(b[0]), 'ru'))
    .map(([value, groupRows]) => {
      const key = `${path}-${dim}-${value}`;
      const totals = groupRows.reduce((acc, row) => {
        acc.planVolume += Number(row.planVolume || 0);
        acc.factVolume += Number(row.factVolume || 0);
        acc.plannedCost += Number(row.plannedCost || 0);
        acc.ks2Accepted += Number(row.ks2Accepted || 0);
        acc.paidAmount += Number(row.paidAmount || 0);
        acc.remainingToPay += Number(row.remainingToPay || 0);
        acc.deviation += Number(row.deviation || 0);
        return acc;
      }, {
        planVolume:0,factVolume:0,plannedCost:0,ks2Accepted:0,paidAmount:0,remainingToPay:0,deviation:0
      });

      return {
        type: 'group',
        key,
        dim,
        value,
        totals,
        children: buildTree(groupRows, rest, sortKey, sortDir, key)
      };
    });
}

function renderNodes(nodes, state, depth = 0){
  return nodes.map(node => {
    if(node.type === 'leaf'){
      const row = node.row;
      const problem = Object.values(row.problemFlags || {}).some(Boolean);
      const changed = row.comment && row.comment.length > 0;
      return `
        <tr class="${problem ? 'problem' : ''} ${changed ? 'changed' : ''}">
          <td>
            <div class="tree-cell">
              <span class="tree-indent" style="--indent:${depth * 18}px"></span>
              <span class="leaf-dot"></span>
              <div>
                <div>${escapeHtml(row.estimateName)}</div>
                <div class="small-note">${escapeHtml(row.workType || '—')}</div>
              </div>
            </div>
          </td>
          <td>${escapeHtml(row.contractor || '—')}</td>
          <td>${escapeHtml(row.levelMark || '—')}</td>
          <td>${escapeHtml(row.workClass || '—')}</td>
          <td>${formatNumber(row.planVolume, 2)}</td>
          <td>${formatCurrency(row.plannedCost)}</td>
          <td>${formatCurrency(row.ks2Accepted)}</td>
          <td>${formatCurrency(row.paidAmount)}</td>
          <td>${formatCurrency(row.remainingToPay)}</td>
          <td>${formatCurrency(row.deviation)}</td>
          <td>${escapeHtml(row.comment || '—')}</td>
        </tr>
      `;
    }

    const expanded = state.ui.expandedBudget[node.key] !== false;
    return `
      <tr class="selected">
        <td colspan="4">
          <div class="tree-cell">
            <span class="tree-indent" style="--indent:${depth * 18}px"></span>
            <button class="tree-toggle" data-budget-toggle="${escapeHtml(node.key)}">${expanded ? '−' : '+'}</button>
            <strong>${escapeHtml(node.value)}</strong>
          </div>
        </td>
        <td>${formatNumber(node.totals.planVolume, 2)}</td>
        <td>${formatCurrency(node.totals.plannedCost)}</td>
        <td>${formatCurrency(node.totals.ks2Accepted)}</td>
        <td>${formatCurrency(node.totals.paidAmount)}</td>
        <td>${formatCurrency(node.totals.remainingToPay)}</td>
        <td>${formatCurrency(node.totals.deviation)}</td>
        <td><span class="status ${statusClass(Math.abs(node.totals.deviation) > 0 ? 'wait' : 'ok')}">${expanded ? 'Развернуто' : 'Свернуто'}</span></td>
      </tr>
      ${expanded ? renderNodes(node.children, state, depth + 1) : ''}
    `;
  }).join('');
}

export function renderBudget(container, state, actions){
  const rows = filterBudgetRows(state.data.blocks.flatMap(block => block.budgetRows), state);
  const contractorOptions = ['all', ...getAllContractors(state)];
  const classOptions = ['all', ...getAllWorkClasses(state)];
  const dimsBase = [state.budget.groupBy, 'levelMark', 'workClass', 'workType', 'estimateName'].filter((v, i, arr) => v && arr.indexOf(v) === i);
  const dims = state.budget.detailLevel === 'compact'
    ? dimsBase.slice(0, 2)
    : state.budget.detailLevel === 'medium'
      ? dimsBase.slice(0, 4)
      : dimsBase;

  const tree = buildTree(rows, dims, state.budget.sortKey, state.budget.sortDir);
  const exportRows = rows.map(row => ({
    Блок: row.block,
    Подрядчик: row.contractor,
    Отметка: row.levelMark,
    'Класс работ': row.workClass,
    'Вид работ': row.workType,
    Расценка: row.estimateName,
    'План. объем': row.planVolume,
    'Стоимость по смете': row.plannedCost,
    'Принято по КС-2': row.ks2Accepted,
    Оплачено: row.paidAmount,
    Остаток: row.remainingToPay,
    Факт: row.factCost,
    Отклонение: row.deviation
  }));
  actions.setExport('budget', exportRows);

  container.innerHTML = `
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Бюджет</h2>
        </div>
        <div class="panel-tools">
          <div class="segbar">
            <button class="${state.budget.detailLevel === 'compact' ? 'active' : ''}" data-budget-detail="compact">Укрупнённо</button>
            <button class="${state.budget.detailLevel === 'medium' ? 'active' : ''}" data-budget-detail="medium">Средняя детализация</button>
            <button class="${state.budget.detailLevel === 'detailed' ? 'active' : ''}" data-budget-detail="detailed">До материалов</button>
          </div>
        </div>
      </div>

      <div class="filters-bar">
        <select class="field-select" id="budgetGroupBy">
          ${['block','contractor','levelMark','workClass','workType'].map(v => `
            <option value="${v}" ${state.budget.groupBy === v ? 'selected' : ''}>${({
              block:'Блок',
              contractor:'Подрядчик',
              levelMark:'Отметка',
              workClass:'Класс работ',
              workType:'Вид работ'
            })[v]}</option>`).join('')}
        </select>

        <select class="field-select" id="budgetContractor">
          ${contractorOptions.map(v => `<option value="${escapeHtml(v)}" ${state.budget.contractor === v ? 'selected' : ''}>${v === 'all' ? 'Все подрядчики' : escapeHtml(v)}</option>`).join('')}
        </select>

        <select class="field-select" id="budgetWorkClass">
          ${classOptions.map(v => `<option value="${escapeHtml(v)}" ${state.budget.workClass === v ? 'selected' : ''}>${v === 'all' ? 'Все классы работ' : escapeHtml(v)}</option>`).join('')}
        </select>

        <select class="field-select" id="budgetSortKey">
          ${[
            ['plannedCost','Стоимость по смете'],
            ['ks2Accepted','Принято по КС-2'],
            ['paidAmount','Оплачено'],
            ['remainingToPay','Остаток'],
            ['deviation','Отклонение']
          ].map(([value, label]) => `<option value="${value}" ${state.budget.sortKey === value ? 'selected' : ''}>Сортировка: ${label}</option>`).join('')}
        </select>

        <label class="checkline"><input type="checkbox" id="budgetOnlyProblems" ${state.budget.onlyProblems ? 'checked' : ''}/> Только проблемные</label>
        <label class="checkline"><input type="checkbox" id="budgetOnlyWithBalance" ${state.budget.onlyWithBalance ? 'checked' : ''}/> Только с остатком</label>
        <label class="checkline"><input type="checkbox" id="budgetOnlyWithoutKs2" ${state.budget.onlyWithoutKs2 ? 'checked' : ''}/> Только без КС-2</label>
      </div>

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Иерархия</th>
              <th>Подрядчик</th>
              <th>Отметка</th>
              <th>Класс работ</th>
              <th class="sortable" data-budget-sort="planVolume">Объём</th>
              <th class="sortable" data-budget-sort="plannedCost">Стоимость по смете</th>
              <th class="sortable" data-budget-sort="ks2Accepted">Принято по КС-2</th>
              <th class="sortable" data-budget-sort="paidAmount">Оплачено</th>
              <th class="sortable" data-budget-sort="remainingToPay">Остаток</th>
              <th class="sortable" data-budget-sort="deviation">Отклонение</th>
              <th>Комментарий</th>
            </tr>
          </thead>
          <tbody>${rows.length ? renderNodes(tree, state) : `<tr><td colspan="11"><div class="empty">По текущему фильтру ничего не найдено.</div></td></tr>`}</tbody>
        </table>
      </div>
    </section>
  `;

  container.querySelector('#budgetGroupBy').addEventListener('change', e => actions.patchState({ budget: { groupBy: e.target.value } }));
  container.querySelector('#budgetContractor').addEventListener('change', e => actions.patchState({ budget: { contractor: e.target.value } }));
  container.querySelector('#budgetWorkClass').addEventListener('change', e => actions.patchState({ budget: { workClass: e.target.value } }));
  container.querySelector('#budgetSortKey').addEventListener('change', e => actions.patchState({ budget: { sortKey: e.target.value } }));

  ['budgetOnlyProblems','budgetOnlyWithBalance','budgetOnlyWithoutKs2'].forEach(id => {
    container.querySelector(`#${id}`).addEventListener('change', e => {
      const map = {
        budgetOnlyProblems:'onlyProblems',
        budgetOnlyWithBalance:'onlyWithBalance',
        budgetOnlyWithoutKs2:'onlyWithoutKs2'
      };
      actions.patchState({ budget: { [map[id]]: e.target.checked } });
    });
  });

  container.querySelectorAll('[data-budget-detail]').forEach(btn => btn.addEventListener('click', () => {
    actions.patchState({ budget: { detailLevel: btn.dataset.budgetDetail } });
  }));

  container.querySelectorAll('[data-budget-toggle]').forEach(btn => btn.addEventListener('click', () => {
    const key = btn.dataset.budgetToggle;
    const expandedBudget = { ...state.ui.expandedBudget, [key]: !(state.ui.expandedBudget[key] !== false) };
    actions.patchState({ ui: { expandedBudget } });
  }));

  container.querySelectorAll('[data-budget-sort]').forEach(th => th.addEventListener('click', () => {
    const sortKey = th.dataset.budgetSort;
    const sortDir = state.budget.sortKey === sortKey && state.budget.sortDir === 'desc' ? 'asc' : 'desc';
    actions.patchState({ budget: { sortKey, sortDir } });
  }));
}
