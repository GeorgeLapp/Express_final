
export function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
}

export function nextTheme(theme){
  return theme === 'dark' ? 'light' : 'dark';
}
