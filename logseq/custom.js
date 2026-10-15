/* Global feature flags come from the current graph's config.edn. */
window.notesFeatureEnabled = (key) => {
  const api = window.logseq?.api;
  const graph = api?.get_state_from_store?.("git/current-repo");
  if (!graph) return true;
  // Read the value directly: Logseq normalizes keyword names in returned maps.
  const path = ["config", `@${graph}`];
  if (key === "notes/contents-shortcut?") {
    const platform = window.Capacitor?.getPlatform?.();
    const navigator = window.navigator;
    const mobile = platform === "ios" || platform === "android" ||
      /Android|iPhone|iPad|iPod/i.test(navigator?.userAgent || "") ||
      (navigator?.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const override = api.get_state_from_store([
      ...path, mobile ? "notes/mobile" : "notes/desktop", key.slice(6),
    ]);
    if (typeof override === "boolean") return override;
  }
  return api.get_state_from_store([...path, key]) !== false;
};

/* Alias lookups share the page snapshot already read by automatic Contents. */
window.notesPageAliasIndex = null;
window.notesMatchingAlias = (link, terms) => {
  if (!terms.length) return "";
  const index = window.notesPageAliasIndex;
  const graph = window.logseq?.api?.get_state_from_store?.("git/current-repo");
  if (!index || index.graph !== graph) return "";
  const destination = link?.getAttribute("href") || link?.querySelector("a:last-of-type")?.getAttribute("href");
  if (!destination?.includes("#/page/")) return "";
  let name;
  try { name = decodeURIComponent(destination.split("#/page/")[1]).toLowerCase(); }
  catch { return ""; }
  return (index.pages.get(name) || []).find((alias) => {
    const text = alias.normalize("NFKC").toLocaleLowerCase().replace(/ё/g, "е");
    return terms.every((term) => text.includes(term));
  }) || "";
};

/* Hide Unlinked References only when enabled in config.edn. */
(() => {
  window.notesUnlinkedReferences?.abort();
  const controller = new AbortController();
  window.notesUnlinkedReferences = controller;
  const refresh = () => document.documentElement.classList.toggle(
    "notes-hide-unlinked-references",
    window.notesFeatureEnabled("notes/hide-unlinked-references?"),
  );
  const timer = setInterval(refresh, 1000);
  window.addEventListener("hashchange", refresh, { signal: controller.signal });
  controller.signal.addEventListener("abort", () => {
    clearInterval(timer);
    document.documentElement.classList.remove("notes-hide-unlinked-references");
  }, { once: true });
  refresh();
})();

/* Page navigation and reference search. */
(() => {
  window.notesPageNavigation?.abort();
  const controller = new AbortController();
  window.notesPageNavigation = controller;
  const { signal } = controller;
  const panelSelector = ".page-hierarchy, .references.page-tags, .references.page-linked";
  const titleSelector = ".ls-page-title .title[data-ref], .ls-page-title[data-ref]";
  const pendingPanels = new Set();
  const searchFields = new Set();
  const normalize = (value) =>
    (value || "").normalize("NFKC").toLocaleLowerCase().replace(/ё/g, "е");
  const isDirectChild = (parent, target) => {
    const prefix = parent.toLowerCase() + "/";
    const child = target.slice(prefix.length);
    return !!parent && target.toLowerCase().startsWith(prefix) &&
      !!child && !child.includes("/");
  };
  const matchesSearch = (label, query) => {
    const text = normalize(label);
    return normalize(query).trim().split(/\s+/).filter(Boolean)
      .every((term) => text.includes(term));
  };

  // Click also covers touch taps; the native fold handler lives on the arrow.
  document.addEventListener("click", (event) => {
    if (event.button !== 0) return;
    const title = event.target.closest?.(".references.page-tags .foldable-title");
    if (!title || title.matches(".cursor") || event.target.closest("a, button, input")) return;
    const control = title.querySelector("a.block-control");
    if (!control) return;
    event.preventDefault();
    event.stopPropagation();
    control.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  }, { signal });

  // Preserve DOM nodes when their displayed text has not changed.
  const setText = (element, text) => {
    if (element && element.textContent !== text) element.textContent = text;
  };

  const filterRows = (panel) => {
    const input = panel.querySelector(".notes-page-list-filter");
    if (!input) return;
    if (panel.matches(".references.page-linked")) {
      // Native filters determine which blocks are rendered, including folded groups.
      panel.querySelectorAll(".references-blocks-item").forEach((group) => {
        group.classList.toggle("notes-page-filter-hidden",
          !matchesSearch(group.textContent, input.value));
      });
      return;
    }
    panel.querySelectorAll(".notes-navigation-row").forEach((row) => {
      const link = row.querySelector(".notes-navigation-link");
      if (!link) return;
      const terms = normalize(input.value).trim().split(/\s+/).filter(Boolean);
      const alias = window.notesMatchingAlias?.(link, terms) || "";
      row.classList.toggle("notes-page-filter-hidden",
        !matchesSearch(link.dataset.searchText || link.textContent, input.value) && !alias);
      let caption = row.querySelector(":scope > .notes-search-alias");
      if (alias) {
        if (!caption) {
          caption = document.createElement("span");
          caption.className = "notes-search-alias";
          row.append(caption);
        }
        if (caption.textContent !== alias) caption.textContent = alias;
      } else caption?.remove();
    });
  };

  const addSearch = (panel, name) => {
    if (panel.querySelector(".notes-page-list-filter")) return;
    const header = panel.querySelector(".foldable-title")?.parentElement;
    if (!header) return;
    const input = document.createElement("input");
    input.type = "search";
    input.className = "notes-page-list-filter";
    input.placeholder = "Search";
    input.autocomplete = "off";
    input.setAttribute("aria-label", `Filter ${name.toLowerCase()}`);
    for (const type of ["pointerdown", "mousedown", "click", "keydown"])
      input.addEventListener(type, (event) => event.stopPropagation(), { signal });
    input.addEventListener("input", () => filterRows(panel), { signal });
    searchFields.add(input);
    // Keep search with the heading, outside the native collapsible content.
    header.append(input);
  };

  const showLeafLink = (row, ref) => {
    const target = ref.getAttribute("data-ref");
    const label = (ref.textContent || target).replace(/^\[\[|\]\]$/g, "")
      .trim().split("/").pop();
    let link = row.querySelector(":scope > .notes-navigation-link");
    if (!link) {
      link = document.createElement("a");
      link.className = "notes-navigation-link";
      row.append(link);
    }
    setText(link, label);
    const href = "#/page/" + encodeURIComponent(target);
    if (link.getAttribute("href") !== href) link.setAttribute("href", href);
    link.title = target;
    row.classList.add("notes-navigation-row");
  };

  const showPathLinks = (row, ref) => {
    const target = ref.getAttribute("data-ref");
    const parts = target.split("/");
    const label = (ref.textContent || target).replace(/^\[\[|\]\]$/g, "").trim();
    const labels = label.split("/");
    const names = labels.length === parts.length ? labels : parts;
    const signature = JSON.stringify([target, names]);
    let path = row.querySelector(":scope > .notes-navigation-link");
    if (path?.dataset.signature === signature) return;
    path?.remove();
    path = document.createElement("span");
    path.className = "notes-navigation-link";
    path.dataset.signature = signature;
    path.dataset.searchText = names.join("/");
    parts.forEach((_, index) => {
      if (index) path.append(document.createTextNode(" / "));
      const link = document.createElement("a");
      const destination = parts.slice(0, index + 1).join("/");
      link.textContent = names[index];
      link.href = "#/page/" + encodeURIComponent(destination);
      link.title = destination;
      path.append(link);
    });
    row.append(path);
    row.classList.add("notes-navigation-row");
  };

  const updatePanel = (panel) => {
    if (panel.matches(".references.page-linked")) {
      addSearch(panel, "Linked References");
      filterRows(panel);
      return;
    }
    const hierarchy = panel.matches(".page-hierarchy");
    const list = panel.querySelector(hierarchy ? "ul.namespaces" : "ul");
    if (!list) return;
    const page = panel.closest(".page");
    const current = page?.querySelector(titleSelector)?.getAttribute("data-ref") || "";
    // The title can mount after the list. Wait rather than hide valid rows.
    if (hierarchy && !current) return;
    const name = hierarchy ? "Subpages" : "Tagged pages";
    list.classList.add("notes-navigation-list");
    addSearch(panel, name);
    let count = 0;
    for (const row of list.children) {
      if (!row.matches("li")) continue;
      const refs = row.querySelectorAll("[data-ref]");
      const ref = hierarchy ? refs[refs.length - 1] : refs[0];
      const target = ref?.getAttribute("data-ref") || "";
      const eligible = !!target && (!hierarchy || isDirectChild(current, target));
      row.classList.toggle("notes-navigation-excluded", !eligible);
      if (!eligible) continue;
      count++;
      if (hierarchy) showLeafLink(row, ref);
      else showPathLinks(row, ref);
    }
    const heading = panel.querySelector(".foldable-title h2");
    setText(heading, `${count} ${name}`);
    panel.classList.toggle("notes-navigation-empty", hierarchy && count === 0);
    filterRows(panel);
  };

  const observerOptions = {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ["data-ref"],
  };
  let frame = null;
  const flush = () => {
    frame = null;
    // Our own links and headings must not trigger another refresh.
    observer.disconnect();
    try {
      for (const panel of pendingPanels) {
        if (panel.isConnected) updatePanel(panel);
      }
    } finally {
      pendingPanels.clear();
      if (!signal.aborted) observer.observe(document.body, observerOptions);
    }
  };
  const collectPanels = (node) => {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!element) return;
    const panel = element.closest(panelSelector);
    if (panel) pendingPanels.add(panel);
    element.querySelectorAll(panelSelector).forEach((panel) => pendingPanels.add(panel));
    if (element.closest(".ls-page-title") || element.querySelector(".ls-page-title")) {
      element.closest(".page")?.querySelectorAll(panelSelector)
        .forEach((panel) => pendingPanels.add(panel));
    }
  };
  const observer = new MutationObserver((changes) => {
    for (const change of changes) {
      collectPanels(change.target);
      change.addedNodes.forEach(collectPanels);
    }
    if (pendingPanels.size && frame === null) frame = requestAnimationFrame(flush);
  });
  signal.addEventListener("abort", () => {
    observer.disconnect();
    if (frame !== null) cancelAnimationFrame(frame);
    pendingPanels.clear();
    searchFields.forEach((input) => input.remove());
    searchFields.clear();
  }, { once: true });
  window.addEventListener("notes-aliases-changed", () => {
    document.querySelectorAll(panelSelector).forEach((panel) => pendingPanels.add(panel));
    if (frame === null) frame = requestAnimationFrame(flush);
  }, { signal });
  document.querySelectorAll(panelSelector).forEach((panel) => pendingPanels.add(panel));
  flush();
})();

/* Remember native navigation folds per graph and page on this device. */
(() => {
  window.notesNavigationFolds?.abort();
  const controller = new AbortController();
  window.notesNavigationFolds = controller;
  const { signal } = controller;
  const panels = ".page-hierarchy, .references.page-tags, .references.page-linked";
  const titleSelector = ".ls-page-title .title[data-ref], .ls-page-title[data-ref]";
  const storageKey = "notes.navigation-folds.v2";
  const watched = new Map();
  let saved = {};
  let frame = null;
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || "{}");
    if (value && typeof value === "object" && !Array.isArray(value)) saved = value;
  } catch (_) {
    // Preferences remain usable in memory when browser storage is unavailable.
  }

  const persist = (key, collapsed) => {
    if (saved[key] === collapsed) return;
    saved[key] = collapsed;
    try {
      localStorage.setItem(storageKey, JSON.stringify(saved));
    } catch (_) {
      // Storage can be disabled or full; native folding must still work.
    }
  };

  const refresh = () => {
    frame = null;
    const graph = window.logseq?.api?.get_state_from_store?.("git/current-repo");
    if (typeof graph !== "string" || !graph) return;
    for (const [content, state] of watched) {
      if (!content.isConnected) {
        state.observer.disconnect();
        watched.delete(content);
      }
    }
    document.querySelectorAll(panels).forEach((panel) => {
      const name = panel.closest(".page")?.querySelector(titleSelector)
        ?.getAttribute("data-ref");
      const title = panel.querySelector(".foldable-title");
      const content = title?.parentElement.nextElementSibling;
      const control = title?.matches(".cursor") ? title : title?.querySelector("a.block-control");
      if (!name || !content || !control) return;
      const kind = panel.matches(".page-hierarchy") ? "hierarchy"
        : panel.matches(".page-tags") ? "tags" : "linked";
      const key = JSON.stringify([graph, name.toLowerCase(), kind]);
      if (watched.get(content)?.key === key) return;
      watched.get(content)?.observer.disconnect();
      const collapsed = () => content.classList.contains("hidden");
      // Restore through Logseq's handler, so its internal state stays consistent.
      if (typeof saved[key] === "boolean" && saved[key] !== collapsed())
        control.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      let previous = collapsed();
      const observer = new MutationObserver(() => {
        const currentGraph = window.logseq?.api?.get_state_from_store?.("git/current-repo");
        const currentPage = panel.closest(".page")?.querySelector(titleSelector)
          ?.getAttribute("data-ref")?.toLowerCase();
        if (signal.aborted || currentGraph !== graph || currentPage !== name.toLowerCase()) return;
        const current = collapsed();
        if (current === previous) return;
        previous = current;
        persist(key, current);
      });
      observer.observe(content, { attributes: true, attributeFilter: ["class"] });
      watched.set(content, { key, observer });
    });
  };
  const schedule = () => {
    if (!signal.aborted && frame === null) frame = requestAnimationFrame(refresh);
  };
  // Discover mounted sections; fold changes are observed on their content only.
  const observer = new MutationObserver((changes) => {
    if (changes.some((change) => {
      const element = change.target.nodeType === Node.ELEMENT_NODE
        ? change.target : change.target.parentElement;
      return element?.closest(panels + ", .ls-page-title") ||
        [...change.addedNodes].some((node) => node.nodeType === Node.ELEMENT_NODE &&
          (node.matches(panels + ", .ls-page-title") ||
           node.querySelector(panels + ", .ls-page-title")));
    })) schedule();
  });
  observer.observe(document.body, {
    childList: true, subtree: true, attributes: true, attributeFilter: ["data-ref", "blockid"],
  });
  window.addEventListener("hashchange", schedule, { signal });
  signal.addEventListener("abort", () => {
    observer.disconnect();
    watched.forEach((state) => state.observer.disconnect());
    watched.clear();
    if (frame !== null) cancelAnimationFrame(frame);
  }, { once: true });
  schedule();
})();

/* Keep the Contents shortcut above the page in the native toolbar. */
(() => {
  window.notesGlobalNavigation?.abort();
  const controller = new AbortController();
  window.notesGlobalNavigation = controller;
  const { signal } = controller;
  let contentsLink = null;
  let toolbarIcons = null;
  let actions = null;
  const renderToolbar = (header) => {
    if (!header) { toolbarIcons?.remove(); actions?.remove(); return; }
    if (!toolbarIcons) {
      toolbarIcons = document.createElement("div");
      toolbarIcons.className = "notes-toolbar-navigation";
      for (const type of ["pointerdown", "mousedown", "touchstart", "click", "dblclick"])
        toolbarIcons.addEventListener(type, (event) => event.stopPropagation(), { signal });
      contentsLink = document.createElement("a");
      contentsLink.className = "notes-contents-shortcut button icon";
      contentsLink.href = "#/page/contents";
      contentsLink.title = "Open Contents";
      contentsLink.setAttribute("aria-label", "Open Contents");
      contentsLink.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M13 5h8M13 9h5M13 15h8M13 19h5"/><rect x="3" y="4" width="6" height="6" rx="1"/><rect x="3" y="14" width="6" height="6" rx="1"/></svg>';
      actions = document.createElement("div");
      actions.className = "notes-toolbar-actions";
      actions.append(contentsLink);
    }
    if (toolbarIcons.parentElement !== header) header.append(toolbarIcons);
    const rightGroup = header.querySelector(".r");
    if (rightGroup) {
      const home = rightGroup.querySelector("button:has(.ti-home), button:has(.tabler-icon-home), button:has(.icon-tabler-home), button.inline.mx-1");
      let homeSlot = home;
      while (homeSlot && homeSlot.parentElement !== rightGroup) homeSlot = homeSlot.parentElement;
      const position = homeSlot ? homeSlot.nextSibling : rightGroup.firstChild;
      if (position !== actions) rightGroup.insertBefore(actions, position);
    }
    const title = document.querySelector("#main-content-container .ls-page-title");
    const pageName = title?.getAttribute("data-ref") ||
      title?.querySelector("[data-ref]")?.getAttribute("data-ref") || "";
    contentsLink.hidden = pageName.toLowerCase() === "contents" ||
      !window.notesFeatureEnabled("notes/contents-shortcut?");
    toolbarIcons.hidden = !pageName.includes("/");
    const bounds = header.getBoundingClientRect();
    const content = document.querySelector("#main-content-container")?.getBoundingClientRect();
    // Native header groups reserve extra space on mobile; use visible controls.
    const leftControls = [...header.querySelectorAll(".l button, .l a.button")]
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0);
    const controlsRight = Math.max(bounds.left, ...leftControls.map((rect) => rect.right));
    const left = `${Math.max(content?.left ?? bounds.left, controlsRight) - bounds.left + 8}px`;
    if (toolbarIcons.style.left !== left) toolbarIcons.style.left = left;
    // The native right container fills all free space; measure its controls.
    const navigation = [...header.querySelector(".r")?.children || []]
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0)
      .sort((a, b) => a.left - b.left)[0];
    const right = `${Math.max(8, bounds.right - (navigation?.left || bounds.right) + 8)}px`;
    if (toolbarIcons.style.right !== right) toolbarIcons.style.right = right;
    // Mobile headers include top safe-area padding; follow the actual icon row.
    const icon = [...header.querySelectorAll(".r .button.icon")]
      .map((element) => element.getBoundingClientRect())
      .find((rect) => rect.width > 0 && rect.height > 0);
    const top = icon ? `${icon.top + icon.height / 2 - bounds.top}px` : "50%";
    if (toolbarIcons.style.top !== top) toolbarIcons.style.top = top;
    window.notesUpdateParentPath?.();
  };
  const render = () => {
    if (signal.aborted) return;
    renderToolbar(document.querySelector("#head"));
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
    childList: true, subtree: true, attributes: true, attributeFilter: ["data-ref"],
  });
  const timer = setInterval(render, 1000);
  window.addEventListener("hashchange", render, { signal });
  window.addEventListener("resize", render, { signal });
  signal.addEventListener("abort", () => {
    observer.disconnect();
    clearInterval(timer);
    toolbarIcons?.remove();
    actions?.remove();
  }, { once: true });
  render();
})();

/* Show leaf page titles and clickable parent namespaces beside Contents. */
(() => {
  window.notesPageHeadings?.abort();
  const controller = new AbortController();
  window.notesPageHeadings = controller;
  const { signal } = controller;
  const selector = ".ls-page-title h1";
  let frame = null;
  const render = () => {
    frame = null;
    observer.disconnect();
    document.querySelectorAll(selector).forEach((heading) => {
      const original = heading.querySelector(".title[data-ref]");
      const previous = heading.querySelector(".notes-namespace-title");
      const path = original?.getAttribute("data-ref") || "";
      const label = original?.textContent.trim() || "";
      const signature = JSON.stringify([path, label]);
      if (!original || !path.includes("/") || heading.querySelector("input, textarea")) {
        previous?.remove();
        heading.classList.remove("notes-has-namespace-title");
        return;
      }
      if (previous?.dataset.signature === signature) return;
      previous?.remove();
      const title = document.createElement("span");
      title.className = "notes-namespace-title";
      title.dataset.signature = signature;
      const parts = path.split("/");
      const labels = label.split("/");
      const names = labels.length === parts.length ? labels : parts;
      const leaf = document.createElement("span");
      leaf.className = "notes-namespace-current";
      leaf.textContent = names.at(-1);
      leaf.title = "Rename page";
      title.append(leaf);
      original.insertAdjacentElement("afterend", title);
      heading.classList.add("notes-has-namespace-title");
    });
    updateParentPath();
    if (!signal.aborted) observer.observe(document.body, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ["data-ref"],
    });
  };
  const createPathLink = (parts, names, index) => {
    const link = document.createElement("a");
    link.textContent = names[index];
    link.href = "#/page/" + encodeURIComponent(parts.slice(0, index + 1).join("/"));
    link.title = names.slice(0, index + 1).join(" / ");
    return link;
  };
  const createPathSeparator = () => {
    const separator = document.createElement("span");
    separator.className = "notes-header-path-separator";
    separator.textContent = "/";
    separator.setAttribute("aria-hidden", "true");
    return separator;
  };
  const createPathDisclosure = (parts, names) => {
    const disclosure = document.createElement("details");
    disclosure.className = "notes-header-path-overflow";
    const summary = document.createElement("summary");
    summary.textContent = "… /";
    summary.setAttribute("aria-label", "Show parent path");
    const menu = document.createElement("div");
    menu.className = "notes-header-path-menu";
    parts.forEach((_, index) => {
      if (index) {
        menu.append(createPathSeparator());
      }
      const link = createPathLink(parts, names, index);
      link.addEventListener("click", () => { disclosure.open = false; }, { signal });
      menu.append(link);
    });
    disclosure.append(summary, menu);
    disclosure.addEventListener("toggle", () => {
      if (disclosure.open)
        menu.style.top = `${summary.getBoundingClientRect().bottom + 8}px`;
    }, { signal });
    return disclosure;
  };
  const updateParentPath = () => {
    const toolbar = document.querySelector(".notes-toolbar-navigation");
    const source = document.querySelector("#main-content-container .ls-page-title .title[data-ref]");
    const path = source?.getAttribute("data-ref") || "";
    const old = document.querySelector(".notes-header-path");
    if (!toolbar || !path.includes("/")) {
      old?.remove();
      return;
    }
    const label = source.textContent.trim();
    const signature = JSON.stringify([path, label]);
    if (old?.dataset.signature === signature && old.parentElement === toolbar) return;
    old?.remove();
    const parts = path.split("/").slice(0, -1);
    const labels = label.split("/").slice(0, -1);
    const names = labels.length === parts.length ? labels : parts;
    const breadcrumb = document.createElement("nav");
    breadcrumb.className = "notes-header-path";
    breadcrumb.dataset.signature = signature;
    breadcrumb.setAttribute("aria-label", "Page path");
    if (parts.length > 1)
      breadcrumb.append(createPathDisclosure(parts.slice(0, -1), names.slice(0, -1)));
    parts.forEach((_, index) => {
      if (index) {
        const separator = createPathSeparator();
        breadcrumb.append(separator);
      }
      const link = createPathLink(parts, names, index);
      link.className = "notes-header-path-segment";
      if (index === parts.length - 1) link.classList.add("notes-header-path-parent");
      breadcrumb.append(link);
    });
    toolbar.append(breadcrumb);
  };
  window.notesUpdateParentPath = updateParentPath;
  document.addEventListener("pointerdown", (event) => {
    const disclosure = document.querySelector(".notes-header-path-overflow[open]");
    if (disclosure && !disclosure.contains(event.target)) disclosure.open = false;
  }, { signal, capture: true });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const disclosure = document.querySelector(".notes-header-path-overflow[open]");
    if (disclosure) {
      disclosure.open = false;
      disclosure.querySelector("summary").focus();
    }
  }, { signal });
  const observer = new MutationObserver((changes) => {
    if (changes.some((change) => {
      const target = change.target.nodeType === Node.ELEMENT_NODE ? change.target : change.target.parentElement;
      return target?.closest(selector) || [...change.addedNodes, ...change.removedNodes].some((node) =>
        node.nodeType === Node.ELEMENT_NODE && (node.matches(selector + ", #head") || node.querySelector(selector + ", #head")));
    }) && frame === null) frame = requestAnimationFrame(render);
  });
  signal.addEventListener("abort", () => {
    observer.disconnect();
    if (frame !== null) cancelAnimationFrame(frame);
    if (window.notesUpdateParentPath === updateParentPath) delete window.notesUpdateParentPath;
    document.querySelector(".notes-header-path")?.remove();
    document.querySelectorAll(".notes-namespace-title").forEach((title) => title.remove());
    document.querySelectorAll(".notes-has-namespace-title").forEach((heading) =>
      heading.classList.remove("notes-has-namespace-title"));
  }, { once: true });
  render();
})();

/* Reading mode inherits page and ancestor block locks.
   Stop Logseq's delegated edit handlers, but preserve browser text selection. */
(() => {
  window.notesReadMode?.abort();
  const controller = new AbortController();
  window.notesReadMode = controller;
  const signal = controller.signal;
  const key = "read-only";
  const states = new WeakMap();
  const api = () => window.logseq?.api;
  // Logseq's block selection is separate from the browser's text selection.
  const clearBlockSelection = () => {
    const app = api();
    if (!app?.get_state_from_store || !app?.set_state_from_store) return;
    if (
      !app.get_state_from_store("selection/mode") &&
      !app.get_state_from_store("selection/blocks")?.length
    )
      return;
    for (const [name, value] of Object.entries({
      "selection/mode": false,
      "selection/blocks": null,
      "selection/start-block": null,
      "selection/selected-all?": false,
    }))
      app.set_state_from_store(name, value);
  };
  const truth = (value) =>
    value === true || String(value).toLowerCase() === "true";
  const property = (block) =>
    block?.content?.match(/^read-only::[ \t]*(true|false)[ \t]*$/im)?.[1] ??
    block?.properties?.[key] ??
    block?.properties?.readOnly;
  const read = async (name) => {
    const page = await api().get_page(name);
    const blocks = (await api().get_page_blocks_tree(name)) || [];
    // A normal first block with properties still locks only its own subtree.
    const holder = blocks.find((block) => block.preBlock || block["pre-block?"]);
    const locked = truth(property(page)) || truth(property(holder));
    const blockLocks = new Map();
    const visit = (block, inherited) => {
      const blocked = inherited || truth(property(block));
      blockLocks.set(String(block.uuid), blocked);
      for (const child of block.children || []) visit(child, blocked);
    };
    for (const block of blocks) visit(block, locked);
    return { locked, blockLocks };
  };
  const paint = (page, locked) => {
    if (locked && !page.classList.contains("notes-read-only"))
      clearBlockSelection();
    page.classList.toggle("notes-read-only", locked);
  };

  async function refresh() {
    if (!api()?.get_page_blocks_tree) return;
    for (const page of document.querySelectorAll(
      ".page, .journal-item, .sidebar-item",
    )) {
      if (page.matches(".page") && page.closest(".journal-item, .sidebar-item"))
        continue;
      let title = page.querySelector(".ls-page-title");
      let name = (
        title?.matches("[data-ref]")
          ? title
          : title?.querySelector("[data-ref]")
      )?.getAttribute("data-ref");
      if (!name && page.matches(".journal-item")) {
        title = page.querySelector(".journal-title");
        const link = title?.matches('a[href*="#/page/"]') ? title
          : title?.querySelector('a[href*="#/page/"]');
        const href = link?.getAttribute("href");
        if (href) name = decodeURIComponent(href.split("#/page/")[1]);
      }
      if (!name && page.matches(".sidebar-item")) {
        title = page.querySelector(
          ".sidebar-item-header > button[aria-controls]",
        );
        name = title?.textContent.trim();
      }
      // Block-focused pages and sidebar blocks may have no page heading.
      if (name && !(await api().get_page(name))) name = null;
      if (!name) {
        const uuid = page.querySelector(".ls-block[blockid]")?.getAttribute("blockid");
        const block = uuid && await api().get_block?.(uuid);
        const owner = block?.page && await api().get_page(block.page.id || block.page);
        name = owner?.name || owner?.originalName;
      }
      if (!name) continue;
      if (signal.aborted || !page.isConnected || (title && !page.contains(title))) continue;
      let state = states.get(page);
      if (state?.busy && state.name === name) continue;
      state = { name, busy: true };
      states.set(page, state);
      try {
        const info = await read(name);
        if (!signal.aborted && page.isConnected && states.get(page) === state) {
          paint(page, info.locked);
          for (const block of page.querySelectorAll(".ls-block[blockid]")) {
            if (block.closest(".page, .journal-item, .sidebar-item") !== page &&
                !page.matches(".journal-item, .sidebar-item")) continue;
            paint(block, info.blockLocks.get(block.getAttribute("blockid")) || false);
          }
        }
      } catch (error) {
        console.warn("Reading mode:", error);
      } finally {
        state.busy = false;
      }
    }
  }
  const safeControl = (target) =>
    target.closest(
      [
        ".notes-property-toggle", ".notes-tag-action", ".notes-tag-input", ".notes-page-favorite", ".breadcrumb .page-reference", ".sidebar-item-header",
        ".block-control", ".bullet-link-wrap", ".block-children-left-border",
        ".open-block-ref-link", ".block-ref-wrap", ".page-blocks-collapse-control",
        ".foldable-title", ".notes-page-list-filter", ".notes-subtree-search",
        ".notes-contents-search", ".notes-catalog-search",
        "summary", "a[href]", ".page-ref", ".tag", "audio[controls]", "video[controls]",
        ".asset-action-btn.text-left", ".asset-action-btn:has(.ti-copy, .ti-maximize)",
        ".custom-query a:has(.ti-refresh)",
      ].join(", "),
    );
  const editableSearch = (target) =>
    target.matches('input[type="search"], .notes-tag-input');
  function guard(event) {
    const target =
      event.target instanceof Element
        ? event.target
        : event.target.parentElement;
    const page = target?.closest(".notes-read-only");
    if (!page) return;
    // Viewing controls must never permit content changes or block dragging.
    if (["beforeinput", "paste", "cut", "drop", "dragstart"].includes(event.type)) {
      if (editableSearch(target)) return;
      event.stopImmediatePropagation();
      event.preventDefault();
      return;
    }
    if (
      ["pointerdown", "mousedown", "touchstart", "click"].includes(
        event.type,
      ) ||
      (event.type === "keydown" && event.key === "Escape")
    )
      clearBlockSelection();
    // Reading mode locks text editing but keeps checklists and task statuses interactive.
    if (event.type !== "contextmenu" && event.type !== "dblclick" && (
      target.closest('input[type="checkbox"], .task-status, .marker-switch') ||
      safeControl(target)
    ))
      return;
    // These must keep their default action: dragging selects text; mouseup retains it.
    if (
      [
        "pointerdown",
        "pointerup",
        "pointermove",
        "mousedown",
        "mouseup",
        "mousemove",
        "touchstart",
        "touchend",
      ].includes(event.type)
    ) {
      event.stopImmediatePropagation();
      return;
    }
    if (event.type === "keydown") {
      if (editableSearch(target)) return;
      const copy =
        (event.ctrlKey || event.metaKey) &&
        ["c", "a"].includes(event.key.toLowerCase());
      const navigation = [
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "PageUp",
        "PageDown",
        "Home",
        "End",
        "Tab",
        "Escape",
      ].includes(event.key);
      event.stopImmediatePropagation();
      if (!copy && !navigation) event.preventDefault();
      return;
    }
    event.stopImmediatePropagation();
    // Context menu keeps the native Copy action. Double click keeps word selection.
    if (!["contextmenu", "dblclick"].includes(event.type))
      event.preventDefault();
  }
  for (const type of [
    "pointerdown",
    "pointerup",
    "pointermove",
    "mousedown",
    "mouseup",
    "mousemove",
    "touchstart",
    "touchend",
    "click",
    "dblclick",
    "keydown",
    "beforeinput",
    "paste",
    "cut",
    "drop",
    "dragstart",
    "contextmenu",
  ]) {
    document.addEventListener(type, guard, { capture: true, signal });
  }
  let timer = null;
  const schedule = () => {
    if (timer !== null || signal.aborted) return;
    timer = setTimeout(() => {
      timer = null;
      if (!signal.aborted) void refresh().catch((error) => console.warn("Reading mode:", error));
    }, 150);
  };
  const metadata = ".ls-page-title, .journal-title, .sidebar-item-header, .block-properties";
  const mounts = ".page, .journal-item, .sidebar-item, .ls-block, " + metadata;
  const observer = new MutationObserver((changes) => {
    if (changes.some((change) => {
      const element = change.target.nodeType === 1 ? change.target : change.target.parentElement;
      return element?.closest(metadata) ||
        (change.type === "attributes" && element?.matches(".ls-block")) ||
        [...change.addedNodes, ...change.removedNodes].some((node) =>
          node.nodeType === 1 && (node.matches(mounts) || node.querySelector(mounts)));
    })) schedule();
  });
  observer.observe(document.body, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ["data-ref"],
  });
  window.addEventListener("hashchange", schedule, { signal });
  signal.addEventListener("abort", () => {
    observer.disconnect();
    if (timer !== null) clearTimeout(timer);
    document.querySelectorAll(".notes-read-only").forEach((page) => page.classList.remove("notes-read-only"));
  });
  void refresh().catch((error) => console.warn("Reading mode:", error));
})();

/* Independent subtree text search and CHECK/CHECKED filtering. */
window.notesSubtreeSearch?.abort();
window.notesSubtreeSearch = new AbortController();
(() => {
  const { signal } = window.notesSubtreeSearch;
  const states = new Map();
  let mountTimer = null;
  let mounting = false;
  let mountAgain = false;
  const api = () => window.logseq?.api;
  const normalize = (value) =>
    String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase()
      .replace(/ё/g, "е");
  const uuidOf = (node) => node.getAttribute("blockid");
  const nodesOf = (state) => [...state.scope.querySelectorAll(".ls-block")].filter((node) =>
    node !== state.host && !node.closest(".custom-query, .references") &&
    (!state.pageName || node.closest(".page, .journal-item, .sidebar-item") === state.scope));
  const restore = (state) => {
    for (const [uuid, collapsed] of state.opened)
      api()?.set_block_collapsed(uuid, collapsed);
    state.opened.clear();
    clearTimeout(state.timer);
    nodesOf(state).forEach((node) => node.classList.remove("notes-subtree-hidden"));
  };
  const isActive = (state) => !!state.input.value || state.filterValue !== "all";
  const removeState = (state) => {
    state.version++;
    restore(state);
    state.panel.remove();
    states.delete(state.host);
  };
  const scheduleSearch = (state, delay) => {
    clearTimeout(state.timer);
    state.timer = setTimeout(() => void search(state), delay);
  };
  const apply = () => {
    const hidden = new Map();
    for (const state of states.values()) {
      for (const node of nodesOf(state)) {
        hidden.set(node, hidden.get(node) ||
          (!!state.keep && !state.keep.has(uuidOf(node))));
      }
    }
    for (const [node, excluded] of hidden)
      node.classList.toggle("notes-subtree-hidden", excluded);
  };
  const search = async (state) => {
    const version = ++state.version;
    const terms = normalize(state.input.value)
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const filter = state.filterValue;
    if (!terms.length && filter === "all") {
      state.keep = null;
      restore(state);
      state.status.textContent = "";
      apply();
      return;
    }
    try {
      const tree = state.pageName
        ? { children: ((await api().get_page_blocks_tree(state.pageName)) || [])
            .filter((block) => block.uuid !== state.uuid) }
        : await api().get_block(state.uuid, { includeChildren: true });
      if (
        signal.aborted ||
        version !== state.version ||
        !state.host.isConnected
      )
        return;
      const keep = new Set(),
        expand = new Map();
      let count = 0;
      const visit = (node, parents, inherited) => {
        const content = String(node.content || "").replace(
          /^\s*[\w-]+::.*$/gm,
          "",
        );
        const marker = content.trimStart().match(/^(CHECKED|CHECKING|CHECK)(?=\s|$)/)?.[1];
        const statusMatch = filter === "all" ||
          (filter === "checked" ? marker === "CHECKED" : marker === "CHECK" || marker === "CHECKING");
        const match = statusMatch && terms.every((term) => normalize(content).includes(term));
        if (match) {
          count++;
          parents.forEach((parent) => {
            keep.add(parent.uuid);
            expand.set(parent.uuid, parent);
          });
        }
        if (match || inherited) keep.add(node.uuid);
        for (const child of node.children || [])
          visit(child, [...parents, node], filter === "all" && (inherited || match));
      };
      if (!tree) throw new Error("Search root is unavailable");
      for (const child of tree.children || []) visit(child, state.pageName ? [] : [tree], false);
      state.keep = keep;
      // Open only paths to hits. Remember the original fold state for clearing.
      for (const [uuid, node] of expand) {
        const collapsed =
          node.collapsed === true ||
          node.properties?.collapsed === true ||
          node.properties?.collapsed === "true";
        if (collapsed) {
          if (!state.opened.has(uuid)) state.opened.set(uuid, true);
          api().set_block_collapsed(uuid, false);
        }
      }
      state.status.textContent = count ? `${count} found` : "No matches";
      apply();
    } catch (error) {
      if (signal.aborted || version !== state.version) return;
      state.status.textContent = "Search unavailable";
      console.warn("Subtree search:", error);
    }
  };
  const mount = async () => {
    if (!api()) return;
    for (const [host, state] of states) {
      if (!host.isConnected) {
        removeState(state);
      }
    }
    try {
      const rows = await api().datascript_query(
        "[:find (pull ?b [:block/uuid :block/properties :block/pre-block? {:block/page [:block/name]}]) :where [?b :block/properties ?props] (or [(get ?props :searchable)] [(get ?props :checklist)])]",
      );
      if (signal.aborted) return;
      const enabled = new Map();
      const isTrue = (value) => value === true || value === "true";
      for (const [block] of rows || []) {
        const properties = block.properties || block["block/properties"] || {};
        const preBlock = block.preBlock ?? block["pre-block?"] ?? block["block/pre-block?"];
        const page = block.page || block["block/page"];
        const options = { search: isTrue(properties.searchable), checklist: isTrue(properties.checklist),
          pageName: preBlock ? page?.name || page?.["block/name"] : null };
        if (options.search || options.checklist)
          enabled.set(block.uuid || block["block/uuid"], options);
      }
      for (const host of document.querySelectorAll(".ls-block[blockid]")) {
        const uuid = uuidOf(host);
        if (!enabled.has(uuid) || host.closest(".custom-query, .references"))
          continue;
        const options = enabled.get(uuid);
        const scope = options.pageName ? host.closest(".page, .journal-item, .sidebar-item") : host;
        if (!scope) continue;
        const existing = states.get(host);
        if (existing?.panel.isConnected &&
            existing.options.search === options.search && existing.options.checklist === options.checklist &&
            existing.scope === scope && existing.pageName === options.pageName)
          continue;
        if (existing) removeState(existing);
        const content = [...host.querySelectorAll(".block-content")].find(
          (n) => n.closest(".ls-block") === host,
        );
        if (!content) continue;
        const panel = document.createElement("div");
        panel.className = "notes-subtree-search";
        const input = document.createElement("input");
        input.type = "search";
        input.placeholder = "Search";
        input.setAttribute("aria-label", options.pageName ? "Search page blocks" : "Search nested blocks");
        const status = document.createElement("span");
        status.setAttribute("aria-live", "polite");
        const filter = document.createElement("div");
        filter.className = "notes-checklist-filters";
        filter.setAttribute("role", "group");
        filter.setAttribute("aria-label", "Filter checklist status");
        for (const [value, label] of [["all", "All"], ["unchecked", "Unchecked"], ["checked", "Checked"]]) {
          const button = document.createElement("button");
          button.type = "button";
          button.dataset.filter = value;
          button.textContent = label;
          button.setAttribute("aria-pressed", String(value === "all"));
          filter.append(button);
        }
        if (options.search) panel.append(input);
        if (options.checklist) panel.append(filter);
        panel.append(status);
        content.append(panel);
        const state = {
          host,
          scope,
          pageName: options.pageName,
          uuid,
          input,
          filterValue: "all",
          options,
          status,
          panel,
          opened: new Map(),
          keep: null,
          version: 0,
        };
        states.set(host, state);
        for (const event of [
          "mousedown",
          "click",
          "keydown",
          "keyup",
          "pointerdown",
          "pointerup",
          "mouseup",
          "touchstart",
          "touchend",
        ])
          panel.addEventListener(event, (e) => e.stopPropagation(), { signal });
        input.addEventListener(
          "input",
          () => scheduleSearch(state, 120),
          { signal },
        );
        filter.addEventListener("click", (event) => {
          const button = event.target.closest("button[data-filter]");
          if (!button || state.filterValue === button.dataset.filter) return;
          state.filterValue = button.dataset.filter;
          filter.querySelectorAll("button").forEach((item) =>
            item.setAttribute("aria-pressed", String(item === button)));
          void search(state);
        }, { signal });
        scope.addEventListener(
          "change",
          (e) => {
            if (e.target.matches('input[type="checkbox"]') && isActive(state))
              scheduleSearch(state, 100);
          },
          { signal },
        );
      }
      for (const state of states.values()) {
        if (!enabled.has(state.uuid)) {
          removeState(state);
        }
      }
    } catch (error) {
      console.warn("Searchable blocks:", error);
    }
  };
  const refresh = async () => {
    mountTimer = null;
    if (signal.aborted) return;
    if (mounting) { mountAgain = true; return; }
    mounting = true;
    try {
      await mount();
      if (!signal.aborted) {
        for (const state of states.values()) {
          if (isActive(state))
            await search(state);
        }
        apply();
      }
    } finally {
      mounting = false;
      if (mountAgain && !signal.aborted) { mountAgain = false; schedule(); }
    }
  };
  const schedule = () => {
    clearTimeout(mountTimer);
    mountTimer = setTimeout(refresh, 120);
  };
  const observer = new MutationObserver((changes) => {
    if (changes.some((change) => {
      const element = change.target.nodeType === Node.ELEMENT_NODE
        ? change.target : change.target.parentElement;
      if (element?.closest(".notes-subtree-search")) return false;
      return element?.closest(".ls-block") ||
        [...change.addedNodes, ...change.removedNodes].some((node) =>
          node.nodeType === Node.ELEMENT_NODE &&
          (node.matches(".ls-block") || node.querySelector(".ls-block")));
    })) schedule();
  });
  observer.observe(document.body, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ["blockid"],
  });
  signal.addEventListener("abort", () => {
    clearTimeout(mountTimer);
    observer.disconnect();
    for (const state of states.values()) removeState(state);
  });
  window.addEventListener(
    "beforeunload",
    () => {
      for (const s of states.values()) restore(s);
    },
    { signal },
  );
  refresh();
})();

/* Opt-in Contents: automatic pages, tags and Favorites on any block. */
(() => {
  window.notesAutomaticContents?.abort();
  const controller = new AbortController();
  window.notesAutomaticContents = controller;
  const { signal } = controller;
  const states = new Map();
  let timer = null;
  let running = false;
  let rerun = false;
  let aliasSignature = null;
  const query = `[:find (pull ?page [:block/name :block/original-name
                    {:block/namespace [:block/name]} {:block/tags [:block/name]}
                    {:block/alias [:block/name :block/original-name]}])
                  :where [?page :block/name]]`;
  const field = (entity, key) => entity?.[key] ?? entity?.[`block/${key}`];
  const enabled = (value) => value === true || String(value).toLowerCase() === "true";
  const option = (block, key) => {
    const value = field(block, "content")?.match(
      new RegExp(`^${key}::[ \t]*(true|false)[ \t]*$`, "im"),
    )?.[1] ?? field(block, "properties")?.[key];
    return enabled(value);
  };
  const tagQuery = `[:find (pull ?block [:block/content
                          {:block/refs [:block/name :block/original-name]}])
                    :where [?block :block/content ?content]
                    [?block :block/refs ?page] [?page :block/name]
                    [(re-pattern "#") ?hashtag] [(re-find ?hashtag ?content)]]`;
  const countTags = (rows) => {
    const counts = new Map();
    for (const [block] of rows || []) {
      const refs = new Map((field(block, "refs") || []).map((page) => [field(page, "name"), page]));
      const content = String(field(block, "content") || "").replace(/^\s*[\w-]+::.*$/gm, "");
      const names = new Set([...content.matchAll(/(?:^|[\s(,;])#(?:\[\[([^\]]+)\]\]|([^\s#\[\](),;!?]+))/g)]
        .map((match) => (match[1] || match[2]).toLowerCase()));
      for (const name of names) {
        const page = refs.get(name);
        if (!page) continue;
        const tag = counts.get(name) || { name, label: field(page, "original-name") || name, count: 0 };
        tag.count++;
        counts.set(name, tag);
      }
    }
    return [...counts.values()].sort((a, b) => a.name.localeCompare(b.name));
  };
  const renderTags = (tags) => {
    const cloud = document.createElement("div");
    cloud.className = "notes-tag-cloud";
    const maximum = Math.max(1, ...tags.map((tag) => tag.count));
    for (const tag of tags) {
      const link = document.createElement("a");
      link.setAttribute("href", `#/page/${encodeURIComponent(tag.name)}`);
      link.textContent = tag.label;
      link.title = `${tag.label} · ${tag.count} blocks`;
      link.style.fontSize = `${0.85 + 0.55 * tag.count / maximum}rem`;
      cloud.append(link);
    }
    if (!tags.length) cloud.textContent = "No tags yet";
    return cloud;
  };
  const renderFavorites = (favorites) => {
    const list = document.createElement("div");
    list.className = "notes-automatic-favorites notes-tag-cloud";
    favorites.forEach(({ name, label }, index) => {
      const item = document.createElement("span");
      item.className = "notes-automatic-favorite";
      const link = document.createElement("a");
      link.href = `#/page/${encodeURIComponent(name)}`;
      link.textContent = label.split("/").at(-1);
      link.title = label;
      item.append(link);
      if (index < favorites.length - 1) {
        const separator = document.createElement("span");
        separator.className = "notes-favorite-separator";
        separator.textContent = "·";
        separator.setAttribute("aria-hidden", "true");
        item.append(separator);
      }
      list.append(item);
    });
    if (!favorites.length) list.textContent = "No Favorites yet";
    return list;
  };
  const blockQuery = `[:find (pull ?block [:block/uuid :block/content :block/properties])
                      :where [?block :block/properties ?props]
                      (or [(get ?props :auto-contents)] [(get ?props :auto-tags)]
                          [(get ?props :auto-favorites)])]`;
  const remove = (anchor) => {
    states.get(anchor)?.section.remove();
    states.delete(anchor);
  };
  const renderTree = (pages, previous) => {
    const children = new Map();
    const roots = [];
    for (const page of pages) {
      if (page.tags.includes("contents")) roots.push(page);
      if (!children.has(page.parent)) children.set(page.parent, []);
      children.get(page.parent).push(page);
    }
    const open = new Map([...previous?.querySelectorAll("details") || []]
      .map((details) => [details.dataset.page, details.open]));
    const branch = (page, root, ancestors = new Set()) => {
      const row = document.createElement("li");
      const link = document.createElement("a");
      link.setAttribute("href", `#/page/${encodeURIComponent(page.name)}`);
      link.title = page.label;
      link.textContent = page.label.split("/").at(-1);
      const descendants = (children.get(page.name) || [])
        .filter((child) => !ancestors.has(child.name));
      if (descendants.length) {
        const details = document.createElement("details");
        details.dataset.page = page.name;
        details.open = open.get(page.name) ?? root;
        const summary = document.createElement("summary");
        summary.append(link);
        const list = document.createElement("ul");
        const path = new Set([...ancestors, page.name]);
        descendants.forEach((child) => list.append(branch(child, false, path)));
        details.append(summary, list);
        row.append(details);
      } else row.append(link);
      return row;
    };
    const tree = document.createElement("ul");
    tree.className = "notes-contents-tree";
    roots.forEach((page) => tree.append(branch(page, true)));
    return tree;
  };
  const refresh = async () => {
    timer = null;
    if (signal.aborted) return;
    if (running) { rerun = true; return; }
    const api = window.logseq?.api;
    if (!api?.datascript_query) return;
    running = true;
    try {
      const graph = api.get_state_from_store?.("git/current-repo");
      const rows = await api.datascript_query(query);
      if (signal.aborted || graph !== api.get_state_from_store?.("git/current-repo")) return;
      const pages = (rows || []).map(([page]) => ({
        name: field(page, "name"),
        label: field(page, "original-name") || field(page, "name"),
        aliases: (field(page, "alias") || []).map((alias) =>
          field(alias, "original-name") || field(alias, "name")).filter(Boolean),
        parent: field(field(page, "namespace"), "name"),
        tags: (field(page, "tags") || []).map((tag) => field(tag, "name")),
      })).sort((a, b) => a.name.localeCompare(b.name));
      const aliases = pages.map((page) => [page.name.toLowerCase(), page.aliases]);
      const nextAliases = JSON.stringify([graph, aliases]);
      if (nextAliases !== aliasSignature) {
        aliasSignature = nextAliases;
        window.notesPageAliasIndex = { graph, pages: new Map(aliases) };
        window.dispatchEvent(new window.Event("notes-aliases-changed"));
      }
      const blockRows = await api.datascript_query(blockQuery);
      const candidates = (blockRows || []).map(([block]) => ({
        uuid: field(block, "uuid"),
        options: { pages: option(block, "auto-contents"), tags: option(block, "auto-tags"),
          favorites: option(block, "auto-favorites") },
      })).filter(({ options }) => options.pages || options.tags || options.favorites);
      const tags = candidates.some(({ options }) => options.tags)
        ? countTags(await api.datascript_query(tagQuery)) : [];
      if (signal.aborted) return;
      const favoriteNames = candidates.some(({ options }) => options.favorites)
        ? await api.get_current_graph_favorites?.() || [] : [];
      if (signal.aborted) return;
      const pageLabels = new Map(pages.map((page) => [page.name, page.label]));
      const favorites = favoriteNames.filter((name) => typeof name === "string" && name.trim())
        .map((name) => ({ name, label: pageLabels.get(name.toLowerCase()) || name }));
      const favoriteSignature = JSON.stringify(favorites);
      const treeSignature = JSON.stringify(pages);
      const tagSignature = JSON.stringify(tags);
      const active = new Set();
      for (const { uuid, options } of candidates) {
        for (const anchor of document.querySelectorAll(".ls-block[blockid]")) {
          if (anchor.getAttribute("blockid") !== uuid || anchor.closest(".references, .custom-query")) continue;
          const content = [...anchor.querySelectorAll(".block-content")]
            .find((element) => element.closest(".ls-block") === anchor);
          if (!content) continue;
          active.add(anchor);
          let state = states.get(anchor);
          if (!state?.section.isConnected || state.section.parentElement !== content) {
            remove(anchor);
            const section = document.createElement("section");
            section.className = "notes-automatic-contents";
            section.setAttribute("aria-label", "Contents");
            content.append(section);
            for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup",
              "touchstart", "touchend", "click", "keydown", "keyup"])
              section.addEventListener(type, (event) => event.stopPropagation(), { signal });
            state = { section, groups: new Map() };
            states.set(anchor, state);
          }
          let groupIndex = 0;
          for (const [key, label, signature] of [
            ["favorites", "Favorites", favoriteSignature],
            ["pages", "Pages", treeSignature], ["tags", "Tags", tagSignature],
          ]) {
            let group = state.groups.get(key);
            if (!options[key]) {
              group?.element.remove();
              state.groups.delete(key);
              continue;
            }
            if (!group) {
              const element = document.createElement("details");
              element.className = "notes-automatic-group";
              element.open = true;
              const summary = document.createElement("summary");
              const heading = document.createElement("h3");
              heading.textContent = label;
              summary.append(heading);
              element.append(summary);
              group = { element, signature: null };
              state.groups.set(key, group);
            }
            const position = state.section.children[groupIndex++] || null;
            if (position !== group.element)
              state.section.insertBefore(group.element, position);
            if (group.signature === signature) continue;
            const old = group.element.querySelector(".notes-contents-tree, .notes-tag-cloud");
            const body = key === "pages" ? renderTree(pages, old)
              : key === "favorites" ? renderFavorites(favorites) : renderTags(tags);
            if (old) old.replaceWith(body);
            else group.element.append(body);
            group.signature = signature;
          }
        }
      }
      for (const anchor of states.keys()) if (!active.has(anchor)) remove(anchor);
    } catch (error) {
      console.warn("Automatic Contents:", error);
    } finally {
      running = false;
      if (rerun && !signal.aborted) { rerun = false; schedule(); }
    }
  };
  const schedule = () => {
    if (signal.aborted) return;
    clearTimeout(timer);
    timer = setTimeout(refresh, 150);
  };
  const observer = new MutationObserver((changes) => {
    if (changes.some(({ target, addedNodes, removedNodes }) => {
      const element = target.nodeType === 1 ? target : target.parentElement;
      if (element?.closest(".notes-automatic-contents")) return false;
      return element?.closest(".block-properties") ||
        [...addedNodes, ...removedNodes].some((node) => node.nodeType === 1 &&
          (node.matches(".ls-block, .page, .sidebar-item") || node.querySelector(".ls-block")));
    })) schedule();
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  // Also pick up graph/index changes that have no visible DOM mutation.
  const interval = setInterval(schedule, 3000);
  window.addEventListener("hashchange", schedule, { signal });
  signal.addEventListener("abort", () => {
    observer.disconnect();
    clearTimeout(timer);
    clearInterval(interval);
    for (const anchor of states.keys()) remove(anchor);
  }, { once: true });
  void refresh();
})();

/* Search native query trees and catalogs without changing their query results. */
(() => {
  window.notesContentsSearch?.abort();
  const controller = new AbortController();
  window.notesContentsSearch = controller;
  const { signal } = controller;
  const selector = ".notes-contents-tree, .notes-catalog";
  const states = new Map();
  let frame = null;
  const normalize = (text) => text.normalize("NFKC").toLocaleLowerCase().replace(/ё/g, "е");
  const pageLink = (row) => row.querySelector(":scope > a, :scope > details > summary > a");
  const catalogRows = (catalog) => catalog.querySelectorAll(":scope > .notes-catalog-item");
  const filterCatalog = (catalog, terms) => {
    let count = 0;
    for (const row of catalogRows(catalog)) {
      const text = normalize([...row.querySelectorAll(".notes-catalog-field:not([hidden])")]
        .map((field) => field.textContent).join(" "));
      const matches = terms.every((term) => text.includes(term));
      row.classList.toggle("notes-catalog-search-hidden", !matches);
      if (matches) count++;
    }
    return count;
  };
  const restore = (state) => {
    state.tree.classList.remove("notes-contents-search-hidden");
    state.tree.querySelectorAll(".notes-catalog-search-hidden").forEach((row) =>
      row.classList.remove("notes-catalog-search-hidden"));
    state.results.replaceChildren();
  };
  const apply = (state) => {
    const terms = normalize(state.input.value).trim().split(/\s+/).filter(Boolean);
    if (state.catalog) {
      const count = filterCatalog(state.tree, terms);
      state.status.textContent = !terms.length ? "" : count ? `${count} found` : "No matches";
      return;
    }
    restore(state);
    state.status.textContent = "";
    if (!terms.length) return;
    state.tree.classList.add("notes-contents-search-hidden");
    const rows = [];
    for (const row of state.tree.querySelectorAll("li")) {
      const link = pageLink(row);
      if (!link) continue;
      const alias = window.notesMatchingAlias?.(link, terms) || "";
      if (!alias && !terms.every((term) => normalize(link.textContent).includes(term))) continue;
      const result = document.createElement("li");
      const path = (link.title || link.textContent).split("/");
      path.forEach((name, index) => {
        if (index) result.append(document.createTextNode(" / "));
        const segment = document.createElement("a");
        segment.textContent = name;
        segment.title = path.slice(0, index + 1).join("/");
        segment.setAttribute("href", index === path.length - 1
          ? link.getAttribute("href")
          : `#/page/${encodeURIComponent(segment.title.toLocaleLowerCase())}`);
        result.append(segment);
      });
      if (alias) {
        const caption = document.createElement("span");
        caption.className = "notes-search-alias";
        caption.textContent = alias;
        result.append(caption);
      }
      rows.push(result);
    }
    state.results.replaceChildren(...rows);
    state.status.textContent = rows.length ? `${rows.length} found` : "No matches";
  };
  const mount = (tree, previous) => {
    const panel = document.createElement("div");
    panel.className = "notes-contents-search";
    const input = document.createElement("input");
    input.type = "search";
    input.className = "notes-page-list-filter";
    const catalog = tree.matches(".notes-catalog");
    input.placeholder = catalog ? "Search…" : "Search pages…";
    input.setAttribute("aria-label", catalog ? "Search visible catalog fields" : "Search Contents pages");
    input.autocomplete = "off";
    input.value = previous?.input.value || "";
    const status = document.createElement("span");
    status.setAttribute("aria-live", "polite");
    panel.append(input, status);
    const results = document.createElement("ul");
    results.className = "notes-contents-search-results";
    panel.append(results);
    tree.before(panel);
    const state = { tree, panel, input, status, results, catalog,
      host: tree.closest(".custom-query") || tree.parentElement };
    states.set(tree, state);
    for (const type of ["pointerdown", "mousedown", "click", "keydown", "keyup"])
      input.addEventListener(type, (event) => event.stopPropagation(), { signal });
    input.addEventListener("input", () => apply(state), { signal });
    return state;
  };
  const refresh = () => {
    frame = null;
    observer.disconnect();
    try {
      document.querySelectorAll(selector).forEach((tree) => {
        let state = states.get(tree);
        if (!state || !state.panel.isConnected) {
          const host = tree.closest(".custom-query") || tree.parentElement;
          const previous = [...states.values()].find((item) =>
            !item.tree.isConnected && item.host === host);
          if (state) { restore(state); state.panel.remove(); }
          state = mount(tree, previous || state);
        }
        apply(state);
      });
      for (const [tree, state] of states) {
        if (!tree.isConnected) {
          restore(state);
          state.panel.remove();
          states.delete(tree);
        }
      }
    } finally {
      if (!signal.aborted) observer.observe(document.body, {
        childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ["title", "href", "hidden"],
      });
    }
  };
  const observer = new MutationObserver((changes) => {
    if (changes.some((change) => {
      const target = change.target.nodeType === Node.ELEMENT_NODE
        ? change.target : change.target.parentElement;
      return target?.closest(selector) ||
        [...change.addedNodes, ...change.removedNodes].some((node) =>
          node.nodeType === Node.ELEMENT_NODE && (node.matches(selector) || node.querySelector(selector)));
    }) && frame === null) frame = requestAnimationFrame(refresh);
  });
  window.addEventListener("notes-aliases-changed", () => {
    if (frame === null) frame = requestAnimationFrame(refresh);
  }, { signal });
  signal.addEventListener("abort", () => {
    observer.disconnect();
    if (frame !== null) cancelAnimationFrame(frame);
    for (const state of states.values()) { restore(state); state.panel.remove(); }
    states.clear();
  }, { once: true });
  refresh();
})();

/* Render CHECK tasks with native TODO/DONE controls and styling. */
(() => {
  window.notesCheckTasks?.abort();
  const controller = new AbortController();
  window.notesCheckTasks = controller;
  const { signal } = controller;
  const prefix = /^(CHECKING|CHECKED|CHECK)(?=\s|$)/;
  const storedPrefix = /^((?:[ \t]*[\w-]+::[^\n]*\n)*[ \t]*)(CHECKING|CHECKED|CHECK)(?=\s|$)/;
  const nativeClass = { CHECK: "todo", CHECKING: "todo", CHECKED: "done" };
  const controls = new Map();
  const pending = new Set();
  const saving = new Set();
  let frame = null;
  let readyTimer = null;

  const changeStatus = async (uuid, requested) => {
    if (saving.has(uuid)) return;
    saving.add(uuid);
    try {
      const api = window.logseq.api;
      const block = await api.get_block(uuid);
      const match = block?.content?.match(storedPrefix);
      if (!match || signal.aborted) return;
      await api.update_block(uuid, block.content.replace(storedPrefix,
        (_, properties) => properties + requested));
    } catch (error) {
      console.warn("CHECK task:", error);
    } finally {
      saving.delete(uuid);
      schedule();
    }
  };

  const mount = async (content) => {
    if (!content.isConnected || content.querySelector(".notes-check-controls")) return;
    const host = content.closest(".ls-block[blockid]");
    const uuid = host?.getAttribute("blockid");
    if (!uuid || host.querySelector("textarea")) return;
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    let text;
    while ((text = walker.nextNode()) && !text.textContent.trim()) {}
    if (!text || text.parentElement.closest("a, pre, code, .block-properties")) return;
    const match = text.textContent.match(prefix);
    if (!match || pending.has(content)) return;
    pending.add(content);
    try {
      // Check the stored prefix so quoted text and nested blocks aren't tasks.
      const block = await window.logseq.api.get_block(uuid);
      if (signal.aborted || !text.isConnected ||
          text.textContent.match(prefix)?.[1] !== match[1] ||
          block?.content?.match(storedPrefix)?.[2] !== match[1]) return;
      const status = match[1];
      const title = text.parentElement.closest(".inline, h1, h2, h3, h4, h5, h6");
      if (!title || title.closest(".ls-block") !== host) return;
      const control = document.createElement("span");
      control.className = "notes-check-controls";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "form-checkbox h-4 w-4 transition duration-150 ease-in-out mr-1 cursor" +
        (status === "CHECKED" ? " checked" : "");
      checkbox.style.marginRight = "5px";
      checkbox.checked = status === "CHECKED";
      checkbox.setAttribute("aria-label", checkbox.checked ? "Reset CHECK task" : "Complete CHECK task");
      control.append(checkbox);
      // Stop the entire gesture: Logseq handles touchend as a block tap.
      for (const type of [
        "pointerdown", "pointerup", "mousedown", "mouseup",
        "touchstart", "touchmove", "touchend", "touchcancel", "click", "keydown",
      ])
        control.addEventListener(type, (event) => event.stopPropagation(), { signal });
      checkbox.addEventListener("change", () => {
        const requested = checkbox.checked ? "CHECKED" : "CHECK";
        // Keep the displayed state consistent until Logseq renders the saved block.
        checkbox.checked = status === "CHECKED";
        void changeStatus(uuid, requested);
      }, { signal });
      const original = text.textContent;
      text.textContent = original.replace(prefix, "").replace(/^\s/, "");
      text.before(control);
      const className = nativeClass[status];
      const addedClass = !title.classList.contains(className);
      title.classList.add(className);
      controls.set(control, { text, original, title, className, addedClass });
    } catch (error) {
      console.warn("CHECK task rendering:", error);
    } finally {
      pending.delete(content);
    }
  };
  const refresh = () => {
    frame = null;
    if (signal.aborted) return;
    if (!window.logseq?.api?.get_block) {
      readyTimer = setTimeout(schedule, 250);
      return;
    }
    for (const [control, state] of controls) {
      // React can update the task text while retaining our inserted control.
      // Rebuild it when native rendering restores the marker or replaces text.
      if (!control.isConnected || !state.text.isConnected ||
          !control.querySelector('input[type="checkbox"]') ||
          prefix.test(state.text.textContent)) {
        control.remove();
        if (state.addedClass) state.title.classList.remove(state.className);
        controls.delete(control);
      }
    }
    document.querySelectorAll(".ls-block[blockid] .block-content")
      .forEach((content) => void mount(content));
  };
  const schedule = () => {
    if (!signal.aborted && frame === null) frame = requestAnimationFrame(refresh);
  };
  const observer = new MutationObserver((changes) => {
    if (changes.some(({ target, addedNodes }) => {
      const element = target.nodeType === 1 ? target : target.parentElement;
      if (element?.closest(".notes-check-controls")) return false;
      return element?.closest(".ls-block") || [...addedNodes].some((node) =>
        node.nodeType === 1 && (node.matches(".ls-block") || node.querySelector(".ls-block")));
    })) schedule();
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  signal.addEventListener("abort", () => {
    observer.disconnect();
    if (frame !== null) cancelAnimationFrame(frame);
    clearTimeout(readyTimer);
    controls.forEach(({ text, original, title, className, addedClass }, control) => {
      if (control.isConnected) {
        text.textContent = original;
        control.remove();
      }
      if (addedClass) title.classList.remove(className);
    });
    controls.clear();
  }, { once: true });
  refresh();
})();

/* Boolean property checkboxes preserve native property labels and values. */
(() => {
  window.notesBooleanProperties?.abort();
  const controller = new AbortController();
  window.notesBooleanProperties = controller;
  const { signal } = controller;
  const controls = new Map();
  const saving = new Set();
  let timer = null;
  const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const valueOf = (element) => {
    const copy = element.cloneNode(true);
    copy.querySelectorAll(".notes-property-toggle").forEach((button) => button.remove());
    return copy.textContent.trim().toLowerCase();
  };
  const paint = (state) => {
    state.button.checked = state.value === "true";
    state.button.classList.toggle("checked", state.button.checked);
    state.button.setAttribute("aria-label", `Toggle ${state.key}`);
    state.button.disabled = saving.has(`${state.uuid}:${state.key}`);
  };
  const change = async (state) => {
    const id = `${state.uuid}:${state.key}`;
    if (saving.has(id)) return;
    saving.add(id);
    for (const item of controls.values()) paint(item);
    try {
      const api = window.logseq.api;
      const block = await api.get_block(state.uuid);
      if (signal.aborted) return;
      // Use the latest stored content, preserving all other properties and text.
      const pattern = new RegExp(`^([ \\t]*${escape(state.key)}::[ \\t]*)(true|false)([ \\t]*)(?=\\r?$)`, "im");
      if (!pattern.test(block?.content || "")) return;
      const content = block.content.replace(pattern,
        (_, prefix, value, suffix) => prefix + (value.toLowerCase() === "true" ? "false" : "true") + suffix);
      await api.update_block(state.uuid, content);
    } catch (error) {
      state.button.title = "Could not update property";
      console.warn("Boolean property:", error);
    } finally {
      saving.delete(id);
      for (const item of controls.values()) paint(item);
      schedule();
    }
  };
  const refresh = () => {
    timer = null;
    if (signal.aborted) return;
    observer.disconnect();
    try {
      for (const [element, state] of controls) {
        if (!element.isConnected || !state.button.isConnected) {
          state.button.remove();
          controls.delete(element);
        }
      }
      for (const element of document.querySelectorAll(".block-properties .page-property-value")) {
        const value = valueOf(element);
        const host = element.closest(".ls-block[blockid]");
        const keyElement = element.parentElement.querySelector(".page-property-key");
        const key = (keyElement?.getAttribute("data-ref") ||
          keyElement?.querySelector("[data-ref]")?.getAttribute("data-ref") ||
          keyElement?.textContent.replace(/:\s*$/, "").trim() || "").toLowerCase();
        const uuid = host?.getAttribute("blockid");
        const existing = controls.get(element);
        if (!uuid || ["tags", "alias", "aliases"].includes(key) || !/^[\w-]+$/.test(key) || !["true", "false"].includes(value) || host.querySelector("textarea")) {
          existing?.button.remove();
          controls.delete(element);
          continue;
        }
        let state = existing;
        if (state && (state.uuid !== uuid || state.key !== key)) {
          state.button.remove();
          controls.delete(element);
          state = null;
        }
        if (!state) {
          const button = document.createElement("input");
          button.type = "checkbox";
          button.className = "notes-property-toggle form-checkbox h-4 w-4 transition duration-150 ease-in-out cursor";
          state = { button, uuid, key, value };
          controls.set(element, state);
          for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup",
            "touchstart", "touchmove", "touchend", "touchcancel", "click", "keydown", "keyup"])
            button.addEventListener(type, (event) => event.stopPropagation(), { signal });
          button.addEventListener("change", () => void change(state), { signal });
          element.append(button);
        }
        state.value = value;
        paint(state);
      }
    } finally {
      if (!signal.aborted) observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
  };
  const schedule = () => {
    if (signal.aborted || timer !== null) return;
    timer = setTimeout(refresh, 50);
  };
  const observer = new MutationObserver((changes) => {
    if (changes.some(({ target, addedNodes, removedNodes }) => {
      const element = target.nodeType === 1 ? target : target.parentElement;
      if (element?.closest(".notes-property-toggle")) return false;
      return element?.closest(".block-properties, .ls-block") ||
        [...addedNodes, ...removedNodes].some((node) => node.nodeType === 1 &&
          (node.matches(".ls-block, .block-properties") || node.querySelector(".block-properties")));
    })) schedule();
  });
  signal.addEventListener("abort", () => {
    observer.disconnect();
    clearTimeout(timer);
    for (const state of controls.values()) state.button.remove();
    controls.clear();
  }, { once: true });
  refresh();
})();

/* Toggle the current page in the graph's native Favorites list. */
(() => {
  window.notesPageFavorite?.abort();
  const controller = new AbortController();
  window.notesPageFavorite = controller;
  const { signal } = controller;
  const buttons = new Map();
  let refreshing = false;
  let saving = false;
  const graph = () => window.logseq?.api?.get_state_from_store?.("git/current-repo");
  const refresh = async () => {
    const api = window.logseq?.api;
    if (signal.aborted || refreshing || saving || !api?.get_current_graph_favorites || !api?.set_current_graph_configs) return;
    refreshing = true;
    const requestedGraph = graph();
    try {
      const favorites = await api.get_current_graph_favorites();
      if (signal.aborted || requestedGraph !== graph()) return;
      const active = new Set();
      document.querySelectorAll("#main-content-container .ls-page-title h1").forEach((heading) => {
        const source = heading.querySelector(".title[data-ref]");
        const name = source?.getAttribute("data-ref");
        if (!name || heading.querySelector("input, textarea")) return;
        const actions = document.querySelector("#head .notes-toolbar-actions");
        if (!actions) return;
        active.add(heading);
        let button = buttons.get(heading);
        if (!button?.isConnected) {
          button = document.createElement("button");
          button.type = "button";
          button.className = "notes-page-favorite button icon";
          button.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="m12 2 3 6.4 7 .9-5.1 4.9 1.3 7-6.2-3.4-6.2 3.4 1.3-7L2 9.3l7-.9Z"/></svg>';
          for (const type of ["pointerdown", "mousedown", "touchstart", "dblclick"])
            button.addEventListener(type, (event) => event.stopPropagation(), { signal });
          button.addEventListener("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (saving) return;
            const name = button.dataset.page;
            const requestedGraph = graph();
            saving = true;
            button.disabled = true;
            try {
              const names = [...await api.get_current_graph_favorites()];
              if (signal.aborted || requestedGraph !== graph()) return;
              const exists = names.some((entry) => entry.toLowerCase() === name.toLowerCase());
              const next = exists ? names.filter((entry) => entry.toLowerCase() !== name.toLowerCase()) : [...names, name];
              await api.set_current_graph_configs({ favorites: next });
            } catch (error) {
              console.warn("Page Favorite:", error);
            } finally {
              saving = false;
              button.disabled = false;
              void refresh();
            }
          }, { signal });
          actions.append(button);
          buttons.set(heading, button);
        }
        button.dataset.page = name;
        const selected = favorites.some((entry) => entry.toLowerCase() === name.toLowerCase());
        button.setAttribute("aria-pressed", String(selected));
        const label = selected ? "Remove from Favorites" : "Add to Favorites";
        button.setAttribute("aria-label", label);
        button.title = label;
      });
      for (const [heading, button] of buttons) {
        if (!active.has(heading)) { button.remove(); buttons.delete(heading); }
      }
    } catch (error) {
      console.warn("Page Favorite:", error);
    } finally { refreshing = false; }
  };
  const timer = setInterval(refresh, 1000);
  window.addEventListener("hashchange", refresh, { signal });
  signal.addEventListener("abort", () => {
    clearInterval(timer);
    for (const button of buttons.values()) button.remove();
    buttons.clear();
  }, { once: true });
  void refresh();
})();


/* Edit tag and alias lists without replacing the native property edit target. */
(() => {
  window.notesTagProperties?.abort();
  const controller = new AbortController();
  window.notesTagProperties = controller;
  const { signal } = controller;
  const states = new Map();
  const saving = new Set();
  const propertyLine = (key) => new RegExp(`^([ \t]*${key}::[ \t]*)([^\r\n]*)(?=\r?$)`, "im");
  let timer = null;
  let running = false;
  let rerun = false;
  const parse = (value) => {
    const parts = [];
    let start = 0;
    let wiki = false;
    for (let i = 0; i < value.length; i++) {
      if (value.slice(i, i + 2) === "[[") { wiki = true; i++; }
      else if (value.slice(i, i + 2) === "]]") { wiki = false; i++; }
      else if (value[i] === "," && !wiki) { parts.push(value.slice(start, i)); start = i + 1; }
    }
    parts.push(value.slice(start));
    return parts.flatMap((part) => {
      const refs = [...part.matchAll(/#?\[\[([^\]]+)\]\]/g)];
      return refs.length && !part.replace(/#?\[\[[^\]]+\]\]/g, "").trim()
        ? refs.map((match) => match[0]) : [part.trim()];
    }).filter(Boolean);
  };
  const remove = (element, state) => {
    state.editor.remove();
    element.classList.remove("notes-tag-property");
    states.delete(element);
  };
  const wikiName = (value) => value.match(/^#?\[\[([^\]]+)\]\]$/)?.[1];
  const format = (value, kind) => kind === "tag" && !wikiName(value) && !value.startsWith("#")
    ? `[[${value}]]` : value;
  const change = async (state, name, add) => {
    name = format(name.trim(), state.kind);
    if (!name) { state.status.textContent = `Enter a ${state.kind} name`; return; }
    if (saving.has(state.uuid)) return;
    saving.add(state.uuid);
    for (const view of states.values()) {
      if (view.uuid === state.uuid)
        view.editor.querySelectorAll("button, input").forEach((control) => { control.disabled = true; });
    }
    try {
      const api = window.logseq.api;
      const graph = api.get_state_from_store?.("git/current-repo");
      if (state.graph !== graph) return;
      const block = await api.get_block(state.uuid);
      if (signal.aborted || graph !== api.get_state_from_store?.("git/current-repo")) return;
      const match = block?.content?.match(state.pattern);
      if (!match) return;
      const original = parse(match[2]);
      const names = original.map((value) => format(value, state.kind)).filter(Boolean)
        .filter((value, index, values) => values.findIndex((entry) =>
          entry.toLowerCase() === value.toLowerCase()) === index);
      const equal = (tag) => tag.toLowerCase() === name.toLowerCase();
      const next = add ? names.some(equal) ? names : [...names, name] : names.filter((tag) => !equal(tag));
      const content = block.content.replace(state.pattern, (_, prefix) =>
        prefix.replace(/[ \t]*$/, " ") + next.join(", "));
      if (content !== block.content) await api.update_block(state.uuid, content);
      state.input.value = "";
      state.input.hidden = true;
      state.confirm.hidden = true;
      state.entry.hidden = true;
      state.add.setAttribute("aria-expanded", "false");
    } catch (error) {
      state.status.textContent = `Could not update ${state.key}`;
      console.warn("List properties:", error);
    } finally {
      saving.delete(state.uuid);
      for (const view of states.values()) {
        if (view.uuid === state.uuid)
          view.editor.querySelectorAll("button, input").forEach((control) => { control.disabled = false; });
      }
      schedule();
    }
  };
  const stopGesture = (control) => {
    for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart",
      "touchend", "touchcancel", "click", "dblclick", "keydown", "keyup"])
      control.addEventListener(type, (event) => event.stopPropagation(), { signal });
  };
  const mount = (element, uuid, key) => {
    const kind = key === "tags" ? "tag" : "alias";
    const editor = document.createElement("span");
    editor.className = "notes-tag-editor";
    editor.dataset.property = key;
    const chips = document.createElement("span");
    chips.className = "notes-tag-chips";
    const add = document.createElement("button");
    add.type = "button";
    add.className = "notes-tag-action";
    add.textContent = "+";
    add.title = `Add ${kind}`;
    add.setAttribute("aria-label", `Add ${kind}`);
    add.setAttribute("aria-expanded", "false");
    const input = document.createElement("input");
    input.type = "text";
    input.setAttribute("enterkeyhint", "done");
    input.className = "notes-tag-input";
    input.placeholder = kind === "tag" ? "Page name" : "Alias";
    input.setAttribute("aria-label", `New ${kind}; press Enter to add`);
    input.hidden = true;
    const confirm = document.createElement("button");
    confirm.type = "submit";
    confirm.className = "notes-tag-action";
    confirm.textContent = "✓";
    confirm.title = `Save ${kind}`;
    confirm.setAttribute("aria-label", `Save ${kind}`);
    confirm.hidden = true;
    const entry = document.createElement("form");
    entry.className = "notes-tag-entry";
    entry.hidden = true;
    entry.append(input, confirm);
    const status = document.createElement("span");
    status.className = "notes-tag-status";
    status.setAttribute("aria-live", "polite");
    const graph = window.logseq.api.get_state_from_store?.("git/current-repo");
    const state = { uuid, graph, key, kind, pattern: propertyLine(key),
      editor, chips, add, input, confirm, entry, status, signature: null };
    stopGesture(add);
    stopGesture(input);
    stopGesture(confirm);
    add.addEventListener("click", (event) => {
      event.preventDefault();
      input.hidden = !input.hidden;
      confirm.hidden = input.hidden;
      entry.hidden = input.hidden;
      add.setAttribute("aria-expanded", String(!input.hidden));
      if (!input.hidden) input.focus();
    }, { signal });
    const submit = () => {
      const name = input.value.trim();
      if (!name) return;
      if (/[\r\n]/.test(name) || ((/\[\[|\]\]/.test(name)) && !wikiName(name))) {
        status.textContent = kind === "tag" ? "Enter a page name" : "Enter an alias";
        return;
      }
      status.textContent = "";
      void change(state, name, true);
    };
    entry.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopPropagation();
      submit();
    }, { signal });
    input.addEventListener("beforeinput", (event) => {
      if (!event.isComposing && ["insertLineBreak", "insertParagraph"].includes(event.inputType)) {
        event.preventDefault();
        submit();
      }
    }, { signal });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        input.hidden = true;
        confirm.hidden = true;
        entry.hidden = true;
        add.setAttribute("aria-expanded", "false");
        add.focus();
      }
      if (event.key !== "Enter" || event.isComposing) return;
      event.preventDefault();
      submit();
    }, { signal });
    editor.append(chips, add, entry, status);
    element.append(editor);
    element.classList.add("notes-tag-property");
    states.set(element, state);
    return state;
  };
  const refresh = async () => {
    timer = null;
    if (signal.aborted) return;
    if (running) { rerun = true; return; }
    const api = window.logseq?.api;
    if (!api?.get_block || !api?.update_block) return;
    running = true;
    const graph = api.get_state_from_store?.("git/current-repo");
    try {
      const active = new Set();
      const blocks = new Map();
      for (const element of document.querySelectorAll(".block-properties .page-property-value")) {
        const row = element.parentElement;
        const key = row.querySelector(".page-property-key");
        const name = (key?.getAttribute("data-ref") || key?.querySelector("[data-ref]")?.getAttribute("data-ref") ||
          key?.textContent.replace(/:\s*$/, "").trim() || "").toLowerCase();
        const host = element.closest(".ls-block[blockid]");
        const uuid = host?.getAttribute("blockid");
        if (!["tags", "alias", "aliases"].includes(name) || !uuid || host.querySelector("textarea")) continue;
        if (!blocks.has(uuid)) blocks.set(uuid, api.get_block(uuid));
        const block = await blocks.get(uuid);
        if (signal.aborted || graph !== api.get_state_from_store?.("git/current-repo")) return;
        if (!element.isConnected || host.getAttribute("blockid") !== uuid) continue;
        const match = block?.content?.match(propertyLine(name));
        if (!match) continue;
        active.add(element);
        let state = states.get(element);
        if (state && (state.uuid !== uuid || state.key !== name || state.graph !== graph || !state.editor.isConnected)) {
          remove(element, state);
          state = null;
        }
        if (!state) state = mount(element, uuid, name);
        if (saving.has(uuid)) continue;
        const tags = parse(match[2]);
        const signature = JSON.stringify(tags);
        if (state.signature === signature) continue;
        state.chips.replaceChildren();
        for (const tag of tags) {
          const chip = document.createElement("span");
          chip.className = "notes-tag-chip" + (state.kind === "alias" ? " notes-alias-item" : "");
          const text = wikiName(tag) || tag;
          const linked = state.kind === "tag" || !!wikiName(tag) || tag.startsWith("#");
          const destination = wikiName(tag) || tag.replace(/^#/, "");
          const label = document.createElement(linked ? "a" : "span");
          label.textContent = text;
          if (linked) {
            label.setAttribute("href", `#/page/${encodeURIComponent(destination.toLowerCase())}`);
            label.title = text;
            stopGesture(label);
          }
          const minus = document.createElement("button");
          minus.type = "button";
          minus.className = "notes-tag-action";
          minus.textContent = "−";
          minus.setAttribute("aria-label", `Remove ${state.kind} ${text}`);
          minus.title = `Remove ${tag}`;
          stopGesture(minus);
          minus.addEventListener("click", (event) => {
            event.preventDefault();
            void change(state, tag, false);
          }, { signal });
          chip.append(label, minus);
          state.chips.append(chip);
        }
        state.signature = signature;
      }
      for (const [element, state] of states) if (!active.has(element)) remove(element, state);
    } catch (error) { console.warn("List properties:", error); }
    finally {
      running = false;
      if (rerun && !signal.aborted) { rerun = false; schedule(); }
    }
  };
  const schedule = () => {
    if (!signal.aborted && timer === null) timer = setTimeout(refresh, 80);
  };
  const observer = new MutationObserver((changes) => {
    if (changes.some(({ target, addedNodes }) => {
      const element = target.nodeType === 1 ? target : target.parentElement;
      if (element?.closest(".notes-tag-editor")) return false;
      return element?.closest(".block-properties, .ls-block") ||
        [...addedNodes].some((node) => node.nodeType === 1 &&
          (node.matches(".block-properties") || node.querySelector(".block-properties")));
    }) || [...states.keys()].some((element) => !element.isConnected)) schedule();
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ["blockid", "data-ref"] });
  window.addEventListener("hashchange", schedule, { signal });
  signal.addEventListener("abort", () => {
    observer.disconnect();
    if (timer !== null) clearTimeout(timer);
    for (const [element, state] of states) remove(element, state);
  }, { once: true });
  void refresh();
})();
