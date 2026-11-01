/*
 * Dropdown menus: the toolbar's Add and Export, and menus the inspector builds on the fly
 * (Add arrow to…).
 *
 * Markup: <div class="menu"> holding a button with aria-haspopup="menu" and a role="menu" list
 * of role="menuitem" buttons. The items keep their own click handlers; this only opens and
 * closes the list. Click or ↓ opens it, ↑/↓ move between items, Escape or a click elsewhere
 * closes it, and choosing an item closes it. Add class "inline" to show the list in the page
 * flow instead of floating (for menus inside the scrolling inspector).
 */

const CHEVRON_SVG =
  '<svg class="chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>';

const menuRegistry = [];

/** Make one .menu element work. Safe to call on menus created after start-up. */
function setupMenu(m) {
  const btn = m.querySelector('[aria-haspopup="menu"]');
  const list = m.querySelector('[role="menu"]');
  const items = () => [...list.querySelectorAll('[role="menuitem"]')];
  const close = () => {
    list.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  };
  const open = focusFirst => {
    menuRegistry.forEach(o => o !== menu && o.close());
    list.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    if (focusFirst && items().length) items()[0].focus();
  };
  const menu = { el: m, close };

  btn.addEventListener('click', () => (list.hidden ? open(false) : close()));
  btn.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      open(true);
    }
  });
  list.addEventListener('click', e => {
    if (e.target.closest('[role="menuitem"]')) close();
  });
  list.addEventListener('keydown', e => {
    const it = items(),
      i = it.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      it[(i + step + it.length) % it.length].focus();
    } else if (e.key === 'Tab') close();
  });
  // Escape works from the button as well as the list (clicking the button focuses it)
  m.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || list.hidden) return;
    e.preventDefault();
    e.stopPropagation(); // don't also clear the diagram selection
    close();
    btn.focus();
  });
  menuRegistry.push(menu);
  return menu;
}

function initMenus() {
  document.querySelectorAll('.menu').forEach(setupMenu);
  document.addEventListener('pointerdown', e => {
    for (let i = menuRegistry.length - 1; i >= 0; i--) {
      const m = menuRegistry[i];
      if (!m.el.isConnected)
        menuRegistry.splice(i, 1); // the inspector was redrawn
      else if (!m.el.contains(e.target)) m.close();
    }
  });
}
