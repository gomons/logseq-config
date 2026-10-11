/* Global feature flags come from the current graph's config.edn. */
window.notesFeatureEnabled = (key) => {
  const api = window.logseq?.api;
  const graph = api?.get_state_from_store?.("git/current-repo");
  if (!graph) return true;
  // Read the value directly: Logseq normalizes keyword names in returned maps.
  return api.get_state_from_store(["config", `@${graph}`, key]) !== false;
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

  // Tagged pages exposes its native fold handler only on the arrow.
  document.addEventListener("mousedown", (event) => {
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
      row.classList.toggle("notes-page-filter-hidden",
        !matchesSearch(link.dataset.searchText || link.textContent, input.value));
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
    parts.forEach((part, index) => {
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
    childList: true, subtree: true, attributes: true, attributeFilter: ["data-ref"],
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

/* Open Contents from page and journal headings. */
(() => {
  window.notesContentsShortcut?.abort();
  const controller = new AbortController();
  window.notesContentsShortcut = controller;
  const { signal } = controller;
  const headings = ".ls-page-title, .journal-title, .sidebar-item-header > button[aria-controls]";
  const links = new Set();
  let frame = null;
  const refresh = () => {
    frame = null;
    observer.disconnect();
    document.querySelectorAll(headings).forEach((heading) => {
      const existing = heading.parentElement.querySelector(":scope > .notes-contents-shortcut");
      const name = heading.getAttribute("data-ref") ||
        heading.querySelector("[data-ref]")?.getAttribute("data-ref") || heading.textContent.trim();
      if (name.toLowerCase() === "contents") {
        existing?.remove();
        return;
      }
      if (existing) return;
      const link = document.createElement("a");
      link.className = "notes-contents-shortcut";
      link.href = "#/page/contents";
      link.title = "Open Contents";
      link.setAttribute("aria-label", "Open Contents");
      link.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1"/></svg><span>Contents</span>';
      for (const type of ["pointerdown", "mousedown", "click"])
        link.addEventListener(type, (event) => event.stopPropagation(), { signal });
      heading.insertAdjacentElement("afterend", link);
      links.add(link);
    });
    for (const link of links) if (!link.isConnected) links.delete(link);
    if (!signal.aborted) observer.observe(document.body, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ["data-ref"],
    });
  };
  const observer = new MutationObserver((changes) => {
    if (changes.some((change) =>
      (change.target.nodeType === Node.ELEMENT_NODE ? change.target : change.target.parentElement)
        ?.closest(headings) || [...change.addedNodes].some((node) =>
      node.nodeType === Node.ELEMENT_NODE &&
      (node.matches(headings) || node.querySelector(headings)))) && frame === null)
      frame = requestAnimationFrame(refresh);
  });
  signal.addEventListener("abort", () => {
    observer.disconnect();
    if (frame !== null) cancelAnimationFrame(frame);
    links.forEach((link) => link.remove());
    links.clear();
  }, { once: true });
  refresh();
})();

/* Show leaf page titles and clickable parent namespaces in the toolbar. */
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
    updateHeaderPath();
    if (!signal.aborted) observer.observe(document.body, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ["data-ref"],
    });
  };
  const updateHeaderPath = () => {
    const toolbar = document.querySelector("#head");
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
    const labels = label.split("/");
    const names = labels.length === parts.length + 1 ? labels.slice(0, -1) : parts;
    const breadcrumb = document.createElement("nav");
    breadcrumb.className = "notes-header-path";
    breadcrumb.dataset.signature = signature;
    breadcrumb.setAttribute("aria-label", "Parent pages");
    parts.forEach((part, index) => {
      if (index) {
        const separator = document.createElement("span");
        separator.className = "notes-header-path-separator";
        separator.textContent = "/";
        separator.setAttribute("aria-hidden", "true");
        breadcrumb.append(separator);
      }
      const link = document.createElement("a");
      link.className = "notes-header-path-segment";
      if (index === parts.length - 1) link.classList.add("notes-header-path-parent");
      link.textContent = names[index];
      link.href = "#/page/" + encodeURIComponent(parts.slice(0, index + 1).join("/"));
      link.title = names.slice(0, index + 1).join(" / ");
      breadcrumb.append(link);
    });
    toolbar.insertBefore(breadcrumb, toolbar.querySelector(":scope > .r"));
  };
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
    document.querySelector(".notes-header-path")?.remove();
    document.querySelectorAll(".notes-namespace-title").forEach((title) => title.remove());
    document.querySelectorAll(".notes-has-namespace-title").forEach((heading) =>
      heading.classList.remove("notes-has-namespace-title"));
  }, { once: true });
  render();
})();
