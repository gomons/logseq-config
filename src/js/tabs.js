/* Experimental desktop and mobile route tabs. Keep native navigation within the active tab. */
(() => {
  window.notesDesktopTabs?.abort();
  const controller = new AbortController();
  window.notesDesktopTabs = controller;
  const { signal } = controller;
  const location = window.location;
  if (!location) return;
  let tabs = [{ route: location.hash || '#/' }];
  let active = 0;
  let graph = null;
  const save = () => {
    if (!graph) return;
    try { window.localStorage.setItem('notes.tabs.v1:' + graph, JSON.stringify({ tabs, active })); }
    catch (_) { /* Storage may be unavailable; tabs still work in memory. */ }
  };
  const restore = () => {
    const current = window.logseq?.api?.get_state_from_store?.('git/current-repo');
    if (!current || current === graph) return;
    graph = current;
    tabs = [{ route: location.hash || '#/' }];
    active = 0;
    try {
      const saved = JSON.parse(window.localStorage.getItem('notes.tabs.v1:' + graph));
      if (Array.isArray(saved?.tabs) && saved.tabs.length &&
          saved.tabs.every(tab => typeof tab.route === 'string' && tab.route.startsWith('#/'))) {
        tabs = saved.tabs;
        active = Number.isInteger(saved.active) ? Math.max(0, Math.min(saved.active, tabs.length - 1)) : 0;
        location.hash = tabs[active].route;
      }
    } catch (_) {}
  };
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
  let cancelDrag = () => {};
  const render = () => {
    cancelDrag();
    const head = document.querySelector('#main-content-container .cp__sidebar-main-content');
    if (!head) return;
    if (!bar.isConnected) head.prepend(bar);
    save();
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
      const handle = document.createElement('button');
      handle.className = 'notes-tab-drag';
      handle.textContent = '⠿';
      handle.setAttribute('aria-label', `Move ${label(tab.route)}`);
      let ghost = null;
      let destination = -1;
      const clearDrag = () => {
        ghost?.remove();
        ghost = null;
        destination = -1;
        item.classList.remove('notes-tab-dragging');
        bar.querySelectorAll('.notes-tab-drop-before, .notes-tab-drop-after').forEach(node =>
          node.classList.remove('notes-tab-drop-before', 'notes-tab-drop-after'));
      };
      const moveDrag = event => {
        if (!ghost) return;
        ghost.style.left = `${Math.min(event.clientX + 12, Math.max(8, window.innerWidth - ghost.offsetWidth - 8))}px`;
        ghost.style.top = `${Math.max(8, event.clientY - ghost.offsetHeight - 18)}px`;
        bar.querySelectorAll('.notes-tab-drop-before, .notes-tab-drop-after').forEach(node =>
          node.classList.remove('notes-tab-drop-before', 'notes-tab-drop-after'));
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.notes-desktop-tab');
        const targetIndex = [...bar.querySelectorAll('.notes-desktop-tab')].indexOf(target);
        destination = -1;
        if (targetIndex < 0 || target === item) return;
        const rect = target.getBoundingClientRect();
        const after = event.clientX >= rect.left + rect.width / 2;
        const slot = targetIndex + (after ? 1 : 0);
        destination = slot > index ? slot - 1 : slot;
        target.classList.add(after ? 'notes-tab-drop-after' : 'notes-tab-drop-before');
      };
      handle.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        event.preventDefault();
        cancelDrag();
        cancelDrag = clearDrag;
        handle.setPointerCapture(event.pointerId);
        item.classList.add('notes-tab-dragging');
        ghost = document.createElement('div');
        ghost.className = 'notes-tab-drag-preview';
        ghost.textContent = label(tab.route);
        ghost.setAttribute('aria-hidden', 'true');
        document.body.append(ghost);
        moveDrag(event);
      }, { signal });
      handle.addEventListener('pointermove', moveDrag, { signal });
      handle.addEventListener('pointerup', event => {
        if (!handle.hasPointerCapture(event.pointerId)) return;
        moveDrag(event);
        const to = destination;
        clearDrag();
        handle.releasePointerCapture(event.pointerId);
        if (to < 0 || to === index) return;
        const selected = tabs[active];
        tabs.splice(to, 0, tabs.splice(index, 1)[0]);
        active = tabs.indexOf(selected);
        render();
      }, { signal });
      handle.addEventListener('pointercancel', clearDrag, { signal });
      handle.addEventListener('lostpointercapture', clearDrag, { signal });
      handle.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const to = index + (event.key === 'ArrowLeft' ? -1 : 1);
        if (to < 0 || to >= tabs.length) return;
        const selected = tabs[active];
        tabs.splice(to, 0, tabs.splice(index, 1)[0]);
        active = tabs.indexOf(selected);
        render();
        bar.querySelectorAll('.notes-tab-drag')[to].focus();
      }, { signal });
      button.className = 'notes-tab-label';
      item.append(handle, button, close);
      bar.append(item);
    });
    const add = document.createElement('button');
    add.className = 'notes-tab-open-next';
    add.textContent = '+';
    add.setAttribute('aria-label', 'Duplicate current tab');
    add.addEventListener('click', () => {
      tabs.splice(active + 1, 0, { route: tabs[active].route });
      select(active + 1);
    }, { signal });
    bar.append(add);
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
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey ||
          (event.button != null && event.button !== 0)) return;
      const route = event.target.closest && targetRoute(event.target);
      if (!route) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (type !== 'click') return;
      const index = tabs.findIndex(tab => tab.route === route);
      if (index >= 0) select(index);
      else { tabs.push({ route }); select(tabs.length - 1); }
    }, { capture: true, passive: false, signal });
  }
  window.addEventListener('hashchange', () => {
    tabs[active].route = location.hash || '#/';
    render();
  }, { signal });
  const timer = setInterval(() => { const previous = graph; restore(); if (previous !== graph || !bar.isConnected) render(); }, 500);
  signal.addEventListener('abort', () => { clearInterval(timer); cancelDrag(); bar.remove(); });
  restore();
  render();
})();
