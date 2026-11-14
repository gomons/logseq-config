/* Desktop route tabs. Keep native navigation within the active tab. */
(() => {
  window.notesDesktopTabs?.abort();
  const controller = new AbortController();
  window.notesDesktopTabs = controller;
  const { signal } = controller;
  if (/is-native|is-mobile/.test(document.documentElement.className) ||
      window.matchMedia?.('(pointer: coarse)').matches) return;
  const location = window.location;
  if (!location) return;
  const tabs = [{ route: location.hash || '#/' }];
  let active = 0;
  const bar = document.createElement('nav');
  bar.className = 'notes-desktop-tabs';
  bar.setAttribute('aria-label', 'Open pages');
  const label = route => {
    try { return route.startsWith('#/page/') ? decodeURIComponent(route.slice(7)).split('/').pop() : 'Home'; }
    catch { return route; }
  };
  const select = index => {
    active = index;
    location.hash = tabs[index].route;
    render();
  };
  const render = () => {
    const head = document.querySelector('#main-content-container .cp__sidebar-main-content');
    if (!head) return;
    if (!bar.isConnected) head.prepend(bar);
    bar.replaceChildren();
    tabs.forEach((tab, index) => {
      const item = document.createElement('span');
      item.className = 'notes-desktop-tab';
      const button = document.createElement('button');
      button.textContent = label(tab.route);
      button.title = tab.route;
      button.setAttribute('aria-current', String(index === active));
      button.addEventListener('click', () => select(index), { signal });
      const close = document.createElement('button');
      close.textContent = '×';
      close.setAttribute('aria-label', `Close ${label(tab.route)}`);
      close.disabled = tabs.length === 1;
      close.addEventListener('click', () => {
        const wasActive = index === active;
        tabs.splice(index, 1);
        if (index < active) active--;
        if (wasActive) select(Math.min(index, tabs.length - 1));
        else render();
      }, { signal });
      item.append(button, close);
      bar.append(item);
    });
  };
  const targetRoute = target => {
    const link = target.closest('a');
    if (!link || link.closest('.notes-desktop-tabs')) return null;
    const href = link.getAttribute('href');
    if (href?.startsWith('#/page/')) return href;
    const ref = link.getAttribute('data-ref');
    return ref && link.matches('.page-ref, .page-reference, [data-ref]')
      ? '#/page/' + encodeURIComponent(ref) : null;
  };
  for (const type of ['mousedown', 'mouseup', 'click']) {
    document.addEventListener(type, event => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.button !== 0) return;
      const route = event.target.closest && targetRoute(event.target);
      if (!route) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (type !== 'click') return;
      const index = tabs.findIndex(tab => tab.route === route);
      if (index >= 0) select(index);
      else { tabs.push({ route }); select(tabs.length - 1); }
    }, { capture: true, signal });
  }
  window.addEventListener('hashchange', () => {
    tabs[active].route = location.hash || '#/';
    render();
  }, { signal });
  const timer = setInterval(() => { if (!bar.isConnected) render(); }, 500);
  signal.addEventListener('abort', () => { clearInterval(timer); bar.remove(); });
  render();
})();
