/* Keep the Contents shortcut above the page in the native toolbar. */
(() => {
  window.notesGlobalNavigation?.abort();
  const controller = new AbortController();
  window.notesGlobalNavigation = controller;
  const { signal } = controller;
  // Navigation API exposes existing entries where supported. Older WebViews need
  // our own entry markers; preserve the router's state and retain bounds on reload.
  const history = window.history;
  const marker = "notesToolbarHistory";
  const storageKey = "notes-toolbar-history";
  const originalPush = history?.pushState;
  const originalReplace = history?.replaceState;
  let cursor = 0, end = 0, session = String(Date.now()) + Math.random();
  try {
    const saved = JSON.parse(window.sessionStorage?.getItem(storageKey) || "null");
    const entry = history?.state?.[marker];
    if (saved && entry?.session === saved.session) {
      session = saved.session; cursor = entry.index; end = Math.max(cursor, saved.end);
    }
  } catch (_) { /* Storage may be unavailable in mobile WebViews. */ }
  const persist = () => {
    try { window.sessionStorage?.setItem(storageKey, JSON.stringify({ session, end })); } catch (_) {}
  };
  const withMarker = (state) => ({ ...(state || {}), [marker]: { session, index: cursor } });
  const tagEntry = () => {
    if (originalReplace && (history.state == null || typeof history.state === "object"))
      originalReplace.call(history, withMarker(history.state), "");
    persist();
  };
  tagEntry();
  const push = function(state, title, url) {
    const next = cursor + 1;
    const result = originalPush.call(history, { ...(state || {}), [marker]: { session, index: next } }, title, url);
    cursor = end = next; persist(); render(); return result;
  };
  const replace = function(state, title, url) {
    const result = originalReplace.call(history, withMarker(state), title, url);
    render(); return result;
  };
  if (originalPush) history.pushState = push;
  if (originalReplace) history.replaceState = replace;
  const visit = () => {
    if (signal.aborted) return;
    const entry = history?.state?.[marker];
    if (entry?.session === session) cursor = entry.index;
    else { cursor += 1; end = cursor; tagEntry(); }
    persist(); render();
  };
  const availability = () => {
    const navigation = window.navigation;
    if (navigation?.currentEntry && navigation.entries?.().length)
      return [navigation.canGoBack, navigation.canGoForward];
    return [cursor > 0, cursor < end];
  };
  let contentsLink = null;
  let toolbarIcons = null;
  let actions = null;
  let newPageButton = null;
  const renderToolbar = (header) => {
    if (!header) { toolbarIcons?.remove(); actions?.remove(); return; }
    if (!toolbarIcons) {
      toolbarIcons = document.createElement("div");
      toolbarIcons.className = "notes-toolbar-navigation";
      for (const type of ["pointerdown", "mousedown", "touchstart", "click", "dblclick"])
        toolbarIcons.addEventListener(type, (event) => event.stopPropagation(), { signal });
      for (const [label, drawing] of [
        ["Go back", '<path d="m12 5-7 7 7 7M5 12h16"/>'],
        ["Go forward", '<path d="m12 5 7 7-7 7M19 12H3"/>'],
        ["Home", '<path d="m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9"/>'],
        ["Global search", '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>'],
        ["New page", '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M12 11v6M9 14h6"/>'],
      ]) {
        const button = document.createElement("button");
        button.type = "button"; button.className = "button icon";
        button.title = label; button.setAttribute("aria-label", label);
        button.innerHTML = `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${drawing}</svg>`;
        button.addEventListener("click", async () => {
          if (button.disabled) return;
          const api = window.logseq?.api;
          if (["Home", "Go back", "Go forward"].includes(label)) {
            const native = [...header.querySelectorAll("button, a.button")].find((element) =>
              !element.closest(".notes-toolbar-navigation") && (
                element.getAttribute("aria-label") === label || element.title === label ||
                element.querySelector(label === "Home" ? ".ti-home, .tabler-icon-home, .ls-icon-home" :
                  label === "Go back" ? ".ti-arrow-left, .tabler-icon-arrow-left" : ".ti-arrow-right, .tabler-icon-arrow-right")));
            if (native) { if (!native.disabled) native.click(); }
            else if (label === "Home") api?.invoke_external_command?.("logseq.go/home");
            else if (label === "Go back") window.history?.back();
            else window.history?.forward();
            return;
          }
          if (label === "Global search") { api?.invoke_external_command?.("logseq.go/search"); return; }
          if (button.disabled) return;
          button.disabled = true;
          try {
            if (!api?.get_page || !api?.create_page) throw new Error("Page creation is unavailable");
            const graph = api.get_state_from_store?.("git/current-repo");
            let name = "Page", number = 2;
            while (await api.get_page(name)) name = `Page ${number++}`;
            if (signal.aborted || graph !== api.get_state_from_store?.("git/current-repo")) return;
            await api.create_page(name, {}, {redirect: true, createFirstBlock: true});
          } catch (error) { console.error("New page:", error); }
          finally { button.disabled = false; }
        }, {signal});
        toolbarIcons.append(button);
        if (label === "New page") { newPageButton = button; button.classList.add("notes-new-page"); }
      }
      contentsLink = document.createElement("button");
      contentsLink.type = "button";
      contentsLink.className = "notes-contents-shortcut button icon";
      contentsLink.addEventListener("click", () => {
        if (!contentsLink.disabled) window.location.hash = "#/page/contents";
      }, { signal });
      contentsLink.title = "Open Contents";
      contentsLink.setAttribute("aria-label", "Open Contents");
      contentsLink.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M13 5h8M13 9h5M13 15h8M13 19h5"/><rect x="3" y="4" width="6" height="6" rx="1"/><rect x="3" y="14" width="6" height="6" rx="1"/></svg>';
      actions = document.createElement("div");
      actions.className = "notes-toolbar-actions";
      actions.append(contentsLink);
    }
    if (toolbarIcons.parentElement !== header) header.append(toolbarIcons);
    if (actions.parentElement !== toolbarIcons) toolbarIcons.append(actions);
    // Contents lives beside Home; Favorites stays at the end of the group.
    if (toolbarIcons.querySelector('[aria-label="Home"]')?.nextElementSibling !== contentsLink) toolbarIcons.querySelector('[aria-label="Home"]').after(contentsLink);
    toolbarIcons.setAttribute("role", "group");
    toolbarIcons.setAttribute("aria-label", "Page tools");
    const title = document.querySelector("#main-content-container .ls-page-title, #main-content-container .journal-title");
    const pageName = title?.getAttribute("data-ref") ||
      title?.querySelector("[data-ref]")?.getAttribute("data-ref") || "";
    const homeButton = toolbarIcons.querySelector('[aria-label="Home"]');
    const route = window.location?.hash || "";
    if (["", "#", "#/", "#/home"].includes(route)) homeButton?.setAttribute("aria-current", "page");
    else homeButton?.removeAttribute("aria-current");
    const [canBack, canForward] = availability();
    toolbarIcons.querySelector('[aria-label="Go back"]').disabled = !canBack;
    toolbarIcons.querySelector('[aria-label="Go forward"]').disabled = !canForward;
    contentsLink.hidden = false;
    const enabled = window.notesFeatureEnabled("notes/contents-shortcut?");
    contentsLink.setAttribute("aria-disabled", String(!enabled));
    contentsLink.disabled = !enabled;
    if (pageName.toLowerCase() === "contents") contentsLink.setAttribute("aria-current", "page");
    else contentsLink.removeAttribute("aria-current");
    for (const element of header.querySelectorAll("button, a.button")) {
      if (element.closest(".notes-toolbar-navigation")) continue;
      const label = element.getAttribute("aria-label") || element.title;
      if (element.matches(".navigation.nav-left, .navigation.nav-right") ||
          ["Home", "Go back", "Go forward", "Search"].includes(label) ||
          element.id === "search-button" ||
          element.querySelector(".ti-home, .tabler-icon-home, .ls-icon-home, .ti-arrow-left, .ti-arrow-right, .tabler-icon-arrow-left, .tabler-icon-arrow-right"))
        element.classList.add("notes-native-toolbar-replaced");
    }
    window.notesUpdateParentPath?.();
  };
  let toolbarInset = 0;
  const render = () => {
    if (signal.aborted) return;
    renderToolbar(document.querySelector("#head"));
    const mobile = window.matchMedia?.("(max-width: 640px)").matches ||
      /is-native-(android|ios|iphone|ipad)/.test(document.documentElement.className);
    const anchor = document.querySelector("#main-content-container .notes-header-path, #main-content-container .notes-block-path, #main-content-container .ls-page-title, #main-content-container .journal-title");
    const left = anchor?.getBoundingClientRect?.().left;
    const actual = toolbarIcons?.getBoundingClientRect?.().left;
    if (!mobile && Number.isFinite(left) && Number.isFinite(actual)) {
      const next = Math.round(toolbarInset + left - actual);
      if (next !== toolbarInset) {
        toolbarInset = next;
        toolbarIcons.style.setProperty("--notes-toolbar-align-inset", `${next}px`);
      }
    }
  };
  const observer = new MutationObserver((changes) => {
    if (changes.some(({ target, addedNodes, removedNodes }) => {
      const element = target.nodeType === 1 ? target : target.parentElement;
      if (element?.closest(".notes-toolbar-navigation")) return false;
      return element?.closest("#head, .ls-page-title") ||
        [...addedNodes, ...removedNodes].some((node) => node.nodeType === 1 &&
          (node.matches("#head, .ls-page-title") || node.querySelector("#head, .ls-page-title")));
    })) render();
  });
  observer.observe(document.body, {
    childList: true, subtree: true, attributes: true, attributeFilter: ["data-ref", "disabled", "aria-disabled"],
  });
  const timer = setInterval(render, 1000);
  window.addEventListener("hashchange", visit, { signal });
  window.addEventListener("popstate", visit, { signal });
  window.navigation?.addEventListener("currententrychange", render, { signal });
  window.addEventListener("resize", render, { signal });
  signal.addEventListener("abort", () => {
    observer.disconnect();
    if (history?.pushState === push) history.pushState = originalPush;
    if (history?.replaceState === replace) history.replaceState = originalReplace;
    clearInterval(timer);
    newPageButton?.remove();
    toolbarIcons?.remove();
    actions?.remove();
    document.querySelectorAll(".notes-native-toolbar-replaced").forEach((element) => element.classList.remove("notes-native-toolbar-replaced"));
  }, { once: true });
  render();
})();

