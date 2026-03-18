
export const STORAGE_KEY = 'golden-frontend-state-v3';

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function formatNumber(value, digits = 0){
  const n = Number(value || 0);
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(n);
}

export function formatCurrency(value){
  const n = Number(value || 0);
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0
  }).format(n);
}

export function formatCompactCurrency(value){
  const n = Number(value || 0);
  const abs = Math.abs(n);
  if(abs >= 1000000){
    return `${formatNumber(n / 1000000, 1)} млн ₽`;
  }
  if(abs >= 1000){
    return `${formatNumber(n / 1000, 0)} тыс ₽`;
  }
  return formatCurrency(n);
}

export function unique(list){
  return [...new Set(list.filter(Boolean))];
}

export function deepClone(obj){
  return JSON.parse(JSON.stringify(obj));
}

export function saveUiState(state){
  const payload = {
    route: state.route,
    theme: state.theme,
    selectedBlocks: state.selectedBlocks,
    search: state.search,
    budget: state.budget,
    vor: state.vor,
    locals: state.locals,
    dashboard: state.dashboard,
    inspections: state.inspections
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function loadUiState(){
  try{
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  }catch{
    return {};
  }
}

export function escapeHtml(value = ''){
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function toast(message, type = 'ok'){
  const root = qs('#toastRoot');
  if(!root) return;
  root.className = 'toast-stack';
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<div>${escapeHtml(message)}</div>`;
  root.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 220);
  }, 2600);
}

export function openModal({ title, subtitle = '', body = '', footer = '', small = false }){
  const root = qs('#modalRoot');
  root.innerHTML = `
    <div class="modal-backdrop" data-close-modal="true">
      <div class="modal ${small ? 'sm' : ''}" onclick="event.stopPropagation()">
        <div class="modal-header">
          <div>
            <h3>${escapeHtml(title)}</h3>
            ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
          </div>
          <button class="icon-btn" data-close-modal="true">✕</button>
        </div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
      </div>
    </div>
  `;
  root.querySelector('[data-close-modal="true"]').addEventListener('click', closeModal);
  root.querySelector('.modal-backdrop').addEventListener('click', (e) => {
    if(e.target.hasAttribute('data-close-modal')) closeModal();
  });
}

export function closeModal(){
  const root = qs('#modalRoot');
  if(root) root.innerHTML = '';
}

export function downloadCsv(filename, rows){
  if(!rows || !rows.length){
    toast('Нет данных для экспорта', 'alert');
    return;
  }
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(';'),
    ...rows.map(row => headers.map(h => {
      const value = row[h] ?? '';
      return `"${String(value).replaceAll('"', '""')}"`;
    }).join(';'))
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function sortRows(rows, sortKey, dir = 'asc'){
  const factor = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a,b) => {
    const av = a?.[sortKey];
    const bv = b?.[sortKey];
    const an = Number(av);
    const bn = Number(bv);
    if(!Number.isNaN(an) && !Number.isNaN(bn) && String(av).trim() !== '' && String(bv).trim() !== ''){
      return (an - bn) * factor;
    }
    return String(av ?? '').localeCompare(String(bv ?? ''), 'ru') * factor;
  });
}

export function statusClass(type){
  if(type === 'ok') return 'ok';
  if(type === 'wait') return 'wait';
  if(type === 'alert') return 'alert';
  return 'gray';
}

export function slugify(value){
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '');
}
