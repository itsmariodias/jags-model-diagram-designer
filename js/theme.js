/*
 * Colour theme: follow the system setting, or force light or dark.
 *
 * Loaded in <head> so the saved theme is applied before first paint (no flash of the wrong
 * theme). The choice is stored in localStorage; "system" removes the override entirely.
 * The diagram paper stays white in every theme so it matches what you export.
 */

const THEME_KEY = 'jags-model-diagram-designer-theme';
const THEMES = ['system', 'light', 'dark'];

function getTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return THEMES.includes(t) ? t : 'system';
  } catch (e) {
    return 'system';
  }
}

function applyTheme(theme) {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

applyTheme(getTheme());

/** Wire the toolbar button that cycles System → Light → Dark. */
function initThemeToggle() {
  const btn = $('#btnTheme');
  const label = $('#themeLabel');
  const sync = theme => {
    btn.dataset.mode = theme;
    label.textContent = theme[0].toUpperCase() + theme.slice(1);
    btn.title = `Theme: ${label.textContent} (click to change)`;
  };
  sync(getTheme());
  btn.addEventListener('click', () => {
    const next = THEMES[(THEMES.indexOf(getTheme()) + 1) % THEMES.length];
    try {
      if (next === 'system') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, next);
    } catch (e) {}
    applyTheme(next);
    sync(next);
  });
}
