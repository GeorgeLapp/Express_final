
import { openModal, closeModal, formatCurrency, escapeHtml, toast } from './ui.js';

function guessFromFileName(fileName){
  const act = (fileName.match(/С(\d{4,6})/) || [])[1] || 'Новый';
  const block = (fileName.match(/ТБ(\d+)/i) || [])[1];
  const contractor = fileName.includes('ФАВОРИТ') ? 'ООО СЗ "Фаворит"'
    : fileName.includes('БАМ') ? 'ООО "БАМ-Строй"'
    : fileName.includes('С-1') ? 'ООО "С-1"'
    : 'Не определён';
  return { actNumber: act, block: block ? `ТБ${block}` : '', contractor };
}

export function openKs2Modal(state, actions){
  const current = state.ks2Draft || {
    fileName: '',
    actNumber: '',
    recognizedBlock: state.selectedBlocks[0] || state.data.blocks[0].id,
    contractor: '',
    workType: '',
    sum: 0,
    confidence: 0.88,
    itemsCount: 6,
    step: 1
  };
  const allActs = state.data.blocks.flatMap(block => block.ks2Acts).filter(act => state.selectedBlocks.includes(act.block));

  openModal({
    title: 'КС-2',
    subtitle: 'Загрузка PDF, просмотр распознанных данных, сопоставление и применение к бюджету и ВОР.',
    body: `
      <div class="stepper">
        ${[1,2,3,4].map(step => `
          <div class="step ${current.step === step ? 'active' : ''}">
            <strong>${step}</strong>
            <span>${['Загрузка','Предпросмотр','Сопоставление','Применение'][step - 1]}</span>
          </div>`).join('')}
      </div>

      <div class="upload-box" style="margin-bottom:14px">
        <p style="margin:0 0 12px">Перетащите PDF КС-2 или выберите файл вручную.</p>
        <input type="file" accept=".pdf" id="ks2FileInput" />
      </div>

      <div class="form-grid" style="margin-bottom:14px">
        <div class="field-card"><label>Файл</label><div class="value">${escapeHtml(current.fileName || 'Файл ещё не выбран')}</div></div>
        <div class="field-card"><label>Номер КС-2</label><div class="value">${escapeHtml(current.actNumber || '—')}</div></div>
        <div class="field-card"><label>Распознанный блок</label><div class="value">${escapeHtml(current.recognizedBlock || '—')}</div></div>
        <div class="field-card"><label>Подрядчик</label><div class="value">${escapeHtml(current.contractor || '—')}</div></div>
        <div class="field-card"><label>Сумма</label><div class="value">${formatCurrency(current.sum || 0)}</div></div>
        <div class="field-card"><label>Уверенность</label><div class="value">${Math.round((current.confidence || 0) * 100)}%</div></div>
      </div>

      <div class="form-grid" style="margin-bottom:14px">
        <div class="field-card">
          <label>Блок для сопоставления</label>
          <select class="field-select" id="ks2BlockSelect">
            ${state.data.blocks.map(block => `<option value="${block.id}" ${current.recognizedBlock === block.id ? 'selected' : ''}>${block.id}</option>`).join('')}
          </select>
        </div>
        <div class="field-card">
          <label>Подрядчик</label>
          <input class="field-input" id="ks2ContractorInput" value="${escapeHtml(current.contractor || '')}" />
        </div>
        <div class="field-card">
          <label>Вид работ</label>
          <input class="field-input" id="ks2WorkTypeInput" value="${escapeHtml(current.workType || '')}" placeholder="Например: Устройство стяжек на отм. +6,500"/>
        </div>
        <div class="field-card">
          <label>Сумма</label>
          <input class="field-input" type="number" id="ks2SumInput" value="${current.sum || 0}" />
        </div>
      </div>

      <div class="panel" style="padding:0;border:none;box-shadow:none;background:transparent">
        <div class="panel-head">
          <div>
            <h3>Уже загруженные КС-2</h3>
            <p>Реестр по выбранным блокам.</p>
          </div>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Блок</th><th>№ КС-2</th><th>Подрядчик</th><th>Файл</th><th>Сумма</th><th>Статус</th></tr></thead>
            <tbody>
              ${allActs.map(act => `
                <tr>
                  <td>${escapeHtml(act.block)}</td>
                  <td>${escapeHtml(act.actNumber)}</td>
                  <td>${escapeHtml(act.contractor)}</td>
                  <td>${escapeHtml(act.fileName)}</td>
                  <td>${formatCurrency(act.sum)}</td>
                  <td>${escapeHtml(act.status)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `,
    footer: `
      <button class="btn" data-close-ks2="true">Закрыть</button>
      <button class="btn primary" data-apply-ks2="true">Применить</button>
    `
  });

  document.querySelector('[data-close-ks2="true"]').addEventListener('click', closeModal);
  document.querySelector('#ks2FileInput').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if(!file) return;
    const guessed = guessFromFileName(file.name);
    actions.patchState({
      ks2Draft: {
        fileName: file.name,
        actNumber: guessed.actNumber,
        recognizedBlock: guessed.block || state.selectedBlocks[0] || state.data.blocks[0].id,
        contractor: guessed.contractor,
        workType: '',
        sum: Number((file.size / 1024 * 320).toFixed(0)),
        confidence: 0.92,
        itemsCount: 10,
        step: 2
      }
    });
    closeModal();
    openKs2Modal(actions.getState(), actions);
  });

  document.querySelector('[data-apply-ks2="true"]').addEventListener('click', () => {
    const draft = {
      ...current,
      recognizedBlock: document.querySelector('#ks2BlockSelect').value,
      contractor: document.querySelector('#ks2ContractorInput').value,
      workType: document.querySelector('#ks2WorkTypeInput').value,
      sum: Number(document.querySelector('#ks2SumInput').value || 0),
      step: 4
    };
    if(!draft.fileName && !draft.actNumber){
      toast('Сначала выберите PDF или заполните реквизиты', 'alert');
      return;
    }
    actions.applyKs2Draft(draft);
    closeModal();
    toast('КС-2 добавлен и применён к данным');
  });
}
