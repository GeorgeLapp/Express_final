import { escapeHtml, formatNumber, openModal, closeModal, toast, unique } from './ui.js';

function todayIso(){
  return new Date().toISOString().slice(0, 10);
}

function isRowVisibleInContext(row, state){
  if(state.selectedBlocks?.length && !state.selectedBlocks.includes(row.block)) return false;
  if(!state.search) return true;
  const haystack = `${row.block} ${row.contractor} ${row.workClass} ${row.workType} ${row.rate} ${row.material}`.toLowerCase();
  return haystack.includes(String(state.search).toLowerCase());
}

function openCreateInspectionModal(state, actions){
  const rows = actions.allVorRows().filter(row => isRowVisibleInContext(row, state));
  if(!rows.length){
    toast('Нет строк ВОР для создания проверки', 'alert');
    return;
  }

  const blockOptions = unique(rows.map(row => row.block));
  const contractorOptions = unique(rows.map(row => row.contractor));
  const classOptions = unique(rows.map(row => row.workClass));
  const typeOptions = unique(rows.map(row => row.workType));

  const defaultBlock = state.inspections.block !== 'all' ? state.inspections.block : (blockOptions[0] || 'all');
  const defaultContractor = state.inspections.contractor !== 'all' ? state.inspections.contractor : (contractorOptions[0] || 'all');

  openModal({
    title: 'Создать проверку',
    subtitle: 'Фиксация фактических объёмов стройконтролем',
    body: `
      <div class="form-grid">
        <div class="field-card">
          <label>Дата проверки</label>
          <input class="field-input" type="date" id="checkDate" value="${todayIso()}"/>
        </div>
        <div class="field-card">
          <label>Подрядчик</label>
          <select class="field-select" id="checkContractor">
            ${contractorOptions.map(item => `<option value="${escapeHtml(item)}" ${item === defaultContractor ? 'selected' : ''}>${escapeHtml(item)}</option>`).join('')}
          </select>
        </div>
        <div class="field-card">
          <label>ТБ</label>
          <select class="field-select" id="checkBlock">
            ${blockOptions.map(item => `<option value="${escapeHtml(item)}" ${item === defaultBlock ? 'selected' : ''}>${escapeHtml(item)}</option>`).join('')}
          </select>
        </div>
        <div class="field-card">
          <label>Класс работ</label>
          <select class="field-select" id="checkClass">
            ${classOptions.map(item => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('')}
          </select>
        </div>
        <div class="field-card">
          <label>Вид работ</label>
          <select class="field-select" id="checkType">
            ${typeOptions.map(item => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('')}
          </select>
        </div>
        <div class="field-card">
          <label>Расценка</label>
          <select class="field-select" id="checkRate"></select>
        </div>
        <div class="field-card">
          <label>Объём, выполненный за период</label>
          <input class="field-input" type="number" step="0.001" min="0" id="checkVolume" placeholder="Например, 12.5"/>
        </div>
        <div class="field-card">
          <label>Текущее фактическое выполнение (из ВОР)</label>
          <div class="value" id="currentFactValue">0</div>
        </div>
        <div class="field-card">
          <label>Период проверки (с)</label>
          <input class="field-input" type="date" id="checkPeriodFrom" value="${todayIso()}"/>
        </div>
        <div class="field-card">
          <label>Период проверки (по)</label>
          <input class="field-input" type="date" id="checkPeriodTo" value="${todayIso()}"/>
        </div>
      </div>
      <div class="field-card" style="margin-top:12px">
        <label>Примечание (опционально)</label>
        <textarea class="field-input" id="checkNote" rows="3" placeholder="Дополнительная информация по проверке"></textarea>
      </div>
    `,
    footer: `
      <button class="btn" data-close-check="true">Отмена</button>
      <button class="btn primary" data-save-check="true">Создать проверку</button>
    `,
    small: false
  });

  const blockEl = document.querySelector('#checkBlock');
  const contractorEl = document.querySelector('#checkContractor');
  const classEl = document.querySelector('#checkClass');
  const typeEl = document.querySelector('#checkType');
  const rateEl = document.querySelector('#checkRate');
  const factEl = document.querySelector('#currentFactValue');

  function filteredRows(){
    return rows.filter(row => (
      row.block === blockEl.value &&
      row.contractor === contractorEl.value &&
      row.workClass === classEl.value &&
      row.workType === typeEl.value
    ));
  }

  function refreshRateOptions(){
    const rowsForRate = filteredRows();
    const options = rowsForRate.map(row => `
      <option value="${escapeHtml(row.id)}">${escapeHtml(row.rate)} · ${escapeHtml(row.unit)}</option>
    `).join('');
    rateEl.innerHTML = options || '<option value="">Нет подходящих расценок</option>';
  }

  function refreshDependentFilters(){
    const contractorsByBlock = unique(rows.filter(row => row.block === blockEl.value).map(row => row.contractor));
    const selectedContractor = contractorsByBlock.includes(contractorEl.value) ? contractorEl.value : contractorsByBlock[0];
    contractorEl.innerHTML = contractorsByBlock.map(item => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
    contractorEl.value = selectedContractor || '';

    const rowsByBlockContractor = rows.filter(row => row.block === blockEl.value && row.contractor === contractorEl.value);
    const classes = unique(rowsByBlockContractor.map(row => row.workClass));
    const selectedClass = classes.includes(classEl.value) ? classEl.value : classes[0];
    classEl.innerHTML = classes.map(item => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
    classEl.value = selectedClass || '';

    const rowsByClass = rowsByBlockContractor.filter(row => row.workClass === classEl.value);
    const types = unique(rowsByClass.map(row => row.workType));
    const selectedType = types.includes(typeEl.value) ? typeEl.value : types[0];
    typeEl.innerHTML = types.map(item => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
    typeEl.value = selectedType || '';
  }

  function refreshFactInfo(){
    const selectedRow = rows.find(row => row.id === rateEl.value);
    if(!selectedRow){
      factEl.textContent = 'Нет данных';
      return;
    }
    factEl.textContent = `${formatNumber(selectedRow.factVolume, 3)} ${selectedRow.unit}`;
  }

  function fullRefresh(){
    refreshDependentFilters();
    refreshRateOptions();
    refreshFactInfo();
  }

  blockEl.addEventListener('change', fullRefresh);
  contractorEl.addEventListener('change', fullRefresh);
  classEl.addEventListener('change', () => {
    const rowsByClass = rows.filter(row => (
      row.block === blockEl.value &&
      row.contractor === contractorEl.value &&
      row.workClass === classEl.value
    ));
    const types = unique(rowsByClass.map(row => row.workType));
    typeEl.innerHTML = types.map(item => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
    typeEl.value = types[0] || '';
    refreshRateOptions();
    refreshFactInfo();
  });
  typeEl.addEventListener('change', () => {
    refreshRateOptions();
    refreshFactInfo();
  });
  rateEl.addEventListener('change', refreshFactInfo);

  fullRefresh();

  document.querySelector('[data-close-check="true"]').addEventListener('click', closeModal);
  document.querySelector('[data-save-check="true"]').addEventListener('click', () => {
    const selectedRow = rows.find(row => row.id === rateEl.value);
    if(!selectedRow){
      toast('Выберите корректную расценку для привязки к ВОР', 'alert');
      return;
    }

    const volume = Number(document.querySelector('#checkVolume').value || 0);
    if(volume <= 0){
      toast('Введите объём выполненных работ больше нуля', 'alert');
      return;
    }

    const periodFrom = document.querySelector('#checkPeriodFrom').value;
    const periodTo = document.querySelector('#checkPeriodTo').value;
    if(!periodFrom || !periodTo){
      toast('Укажите период проверки', 'alert');
      return;
    }
    if(periodTo < periodFrom){
      toast('Дата окончания периода не может быть раньше даты начала', 'alert');
      return;
    }

    actions.createInspectionCheck({
      inspectionDate: document.querySelector('#checkDate').value || todayIso(),
      periodFrom,
      periodTo,
      contractor: contractorEl.value,
      block: blockEl.value,
      workClass: classEl.value,
      workType: typeEl.value,
      rate: selectedRow.rate,
      performedVolume: volume,
      note: document.querySelector('#checkNote').value || '',
      vorRowId: selectedRow.id
    });

    closeModal();
    toast('Проверка успешно создана');
  });
}

export function renderInspectionsJournal(container, state, actions){
  const rows = state.data.inspectionChecks
    .slice()
    .sort((a, b) => String(b.inspectionDate).localeCompare(String(a.inspectionDate), 'ru'));

  actions.setExport('inspections-journal', rows.map(item => ({
    'Дата проверки': item.inspectionDate,
    Подрядчик: item.contractor,
    ТБ: item.block,
    'Класс работ': item.workClass,
    'Вид работ': item.workType,
    Расценка: item.rate,
    'Факт за период': item.performedVolume,
    Период: `${item.periodFrom} — ${item.periodTo}`,
    Примечание: item.note || ''
  })));

  container.innerHTML = `
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Журнал проверок стройконтроля</h2>
          <p>Созданные проверки автоматически попадают в «Факт выполненных работ» таблицы ВОР.</p>
        </div>
        <div class="panel-tools">
          <button class="btn primary" id="createCheckBtn">Создать проверку</button>
        </div>
      </div>

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Дата проверки</th>
              <th>Подрядчик</th>
              <th>ТБ</th>
              <th>Вид работ</th>
              <th>Расценка</th>
              <th>Зафиксированный объём</th>
              <th>Период</th>
              <th>Примечание</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map(item => `
              <tr>
                <td>${escapeHtml(item.inspectionDate)}</td>
                <td>${escapeHtml(item.contractor)}</td>
                <td>${escapeHtml(item.block)}</td>
                <td>${escapeHtml(item.workType)}</td>
                <td>${escapeHtml(item.rate)}</td>
                <td>${formatNumber(item.performedVolume, 3)}</td>
                <td>${escapeHtml(item.periodFrom)} — ${escapeHtml(item.periodTo)}</td>
                <td>${escapeHtml(item.note || '—')}</td>
                <td><button class="btn" data-remove-check="${escapeHtml(item.id)}">Удалить</button></td>
              </tr>
            `).join('') : `<tr><td colspan="9"><div class="empty">Проверки пока не созданы.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;

  container.querySelector('#createCheckBtn').addEventListener('click', () => openCreateInspectionModal(state, actions));
  container.querySelectorAll('[data-remove-check]').forEach(btn => btn.addEventListener('click', () => {
    actions.removeInspectionCheck(btn.dataset.removeCheck);
    toast('Проверка удалена');
  }));
}
