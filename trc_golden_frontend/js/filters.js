
import { unique } from './ui.js';

export function normalizeText(value){
  return String(value ?? '').toLowerCase();
}

export function matchSearch(row, term){
  if(!term) return true;
  const hay = Object.values(row || {}).join(' ').toLowerCase();
  return hay.includes(term.toLowerCase());
}

export function blockAllowed(selectedBlocks, block){
  if(!selectedBlocks?.length) return true;
  return selectedBlocks.includes(block);
}

export function filterBudgetRows(rows, state){
  return rows.filter(row => {
    if(!blockAllowed(state.selectedBlocks, row.block)) return false;
    if(state.budget.onlyProblems){
      const flags = row.problemFlags || {};
      if(!Object.values(flags).some(Boolean)) return false;
    }
    if(state.budget.contractor !== 'all' && row.contractor !== state.budget.contractor) return false;
    if(state.budget.workClass !== 'all' && row.workClass !== state.budget.workClass) return false;
    if(state.budget.onlyWithBalance && row.remainingToPay <= 0) return false;
    if(state.budget.onlyWithoutKs2 && row.ks2Accepted > 0) return false;
    if(!matchSearch(row, state.search)) return false;
    return true;
  });
}

export function filterVorRows(rows, state){
  return rows.filter(row => {
    if(!blockAllowed(state.selectedBlocks, row.block)) return false;
    if(state.vor.block && state.vor.block !== 'all' && row.block !== state.vor.block) return false;
    if(state.vor.contractor !== 'all' && row.contractor !== state.vor.contractor) return false;
    if(state.vor.workClass !== 'all' && row.workClass !== state.vor.workClass) return false;
    if(state.vor.onlyDiff && Math.abs(Number(row.deviation || 0)) < 0.001) return false;
    if(state.vor.onlyOpen && Number(row.planVolume || 0) <= Number(row.factVolume || 0)) return false;
    if(state.vor.onlyKs2 && Number(row.ks2Accepted || 0) <= 0) return false;
    if(!matchSearch(row, state.search)) return false;
    return true;
  });
}

export function filterEstimateRows(estimates, state){
  return estimates.filter(row => {
    if(!blockAllowed(state.selectedBlocks, row.block)) return false;
    if(state.locals.contractor !== 'all' && row.contractor !== state.locals.contractor) return false;
    if(state.locals.workClass !== 'all' && row.workClass !== state.locals.workClass) return false;
    if(!matchSearch(row, state.search)) return false;
    return true;
  });
}

export function visibleBlocks(state){
  return state.data.blocks.filter(block => blockAllowed(state.selectedBlocks, block.id));
}

export function getAllContractors(state){
  return unique(state.data.blocks.flatMap(block => block.contractors || []));
}

export function getAllWorkClasses(state){
  return unique(state.data.blocks.flatMap(block => (block.budgetRows || []).map(row => row.workClass)));
}
