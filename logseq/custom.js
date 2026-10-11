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
      const anchor = heading.parentElement.querySelector(":scope > .notes-read-mode-toggle") || heading;
      anchor.insertAdjacentElement("afterend", link);
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
  const createPathDisclosure = (toolbar, parts, names) => {
    const disclosure = document.createElement("details");
    disclosure.className = "notes-header-path-overflow";
    const summary = document.createElement("summary");
    summary.textContent = "… /";
    summary.setAttribute("aria-label", "Show parent path");
    const menu = document.createElement("div");
    menu.className = "notes-header-path-menu";
    parts.forEach((part, index) => {
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
        menu.style.top = `${toolbar.getBoundingClientRect().bottom + 8}px`;
    }, { signal });
    return disclosure;
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
    if (parts.length > 1)
      breadcrumb.append(createPathDisclosure(toolbar, parts, names));
    parts.forEach((part, index) => {
      if (index) {
        breadcrumb.append(createPathSeparator());
      }
      const link = createPathLink(parts, names, index);
      link.className = "notes-header-path-segment";
      if (index === parts.length - 1) link.classList.add("notes-header-path-parent");
      breadcrumb.append(link);
    });
    toolbar.insertBefore(breadcrumb, toolbar.querySelector(":scope > .r"));
  };
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
    document.querySelector(".notes-header-path")?.remove();
    document.querySelectorAll(".notes-namespace-title").forEach((title) => title.remove());
    document.querySelectorAll(".notes-has-namespace-title").forEach((heading) =>
      heading.classList.remove("notes-has-namespace-title"));
  }, { once: true });
  render();
})();

/* Per-page reading mode. Stored in the page's preamble.
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
  // A first block may contain a query after its properties, and the native API
  // does not always expose pre-block? immediately after reindexing/insertion.
  const preamble = (blocks) =>
    blocks.find((b) => b.preBlock || b["pre-block?"]) ||
    (/^[\w-]+::/.test(blocks[0]?.content?.trimStart() || "")
      ? blocks[0]
      : null);
  const read = async (name) => {
    const page = await api().get_page(name);
    const blocks = (await api().get_page_blocks_tree(name)) || [];
    const holder = preamble(blocks);
    return {
      blocks,
      holder,
      locked: truth(holder ? property(holder) : property(page)),
    };
  };
  const paint = (page, button, locked) => {
    if (locked && !page.classList.contains("notes-read-only"))
      clearBlockSelection();
    page.classList.toggle("notes-read-only", locked);
    button.dataset.mode = locked ? "view" : "edit";
    if (!button.querySelector(".notes-edit-switch")) {
      button.innerHTML =
        '<span class="notes-edit-switch" aria-hidden="true"></span><span>Edit</span>';
    }
    button.setAttribute("role", "switch");
    button.setAttribute("aria-checked", String(!locked));
    button.setAttribute(
      "aria-label",
      "Edit mode",
    );
    button.title = locked
      ? "Reading mode. Switch to editing."
      : "Editing mode. Switch to reading.";
  };
  const saveMode = async (name, info, locked) => {
    const holder = info.holder;
    if (holder) {
      const content = /^read-only::[^\n]*/im.test(
        holder.content || "",
      )
        ? holder.content.replace(
            /^read-only::[^\n]*/im,
            `read-only:: ${locked}`,
          )
        : `read-only:: ${locked}\n${holder.content || ""}`;
      await api().update_block(holder.uuid, content);
    } else {
      const first = info.blocks[0];
      const created = await api().insert_block(
        first?.uuid || name,
        `read-only:: ${locked}`,
        { before: true, sibling: Boolean(first), focus: false },
      );
      if (created?.uuid)
        await api().update_block(
          created.uuid,
          `read-only:: ${locked}`,
        );
    }
  };

  const toggleMode = async (page, button, event) => {
    event.preventDefault();
    event.stopPropagation();
    const current = states.get(page);
    if (!current || current.busy) return;
    current.busy = true;
    button.disabled = true;
    try {
      await api().exit_editing_mode?.();
      const info = await read(current.name);
      const locked = !info.locked;
      await saveMode(current.name, info, locked);
      const saved = await read(current.name);
      if (saved.locked !== locked)
        throw new Error("The reading mode was not saved.");
      if (!signal.aborted && states.get(page) === current)
        paint(page, button, saved.locked);
    } catch (error) {
      console.error("Reading mode:", error);
      button.title = "Could not save reading mode. Try again.";
      button.setAttribute("aria-label", button.title);
    } finally {
      current.busy = false;
      button.disabled = false;
    }
  };

  const createToggle = (page, title) => {
    let button = page.querySelector(".notes-read-mode-toggle");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "notes-read-mode-toggle";
      button.setAttribute("aria-label", "Edit page");
      title.insertAdjacentElement("afterend", button);
      button.addEventListener(
        "click",
        (event) => void toggleMode(page, button, event),
        { signal },
      );
    }
    // A journal can mount before its title; never leave controls on a stale host.
    if (title.nextElementSibling !== button)
      title.insertAdjacentElement("afterend", button);
    return button;
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
      if (!title || !name || !(await api().get_page(name))) continue;
      if (signal.aborted || !title.isConnected || !page.contains(title)) continue;
      let state = states.get(page);
      if (state?.busy && state.name === name) continue;
      const button = createToggle(page, title);
      state = { name, busy: true };
      states.set(page, state);
      try {
        const info = await read(name);
        if (!signal.aborted && page.isConnected && states.get(page) === state) {
          paint(page, button, info.locked);
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
        ".notes-read-mode-toggle", ".breadcrumb .page-reference", ".sidebar-item-header",
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
    target.matches('input[type="search"]');
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
  const mounts = ".page, .journal-item, .sidebar-item, " + metadata;
  const observer = new MutationObserver((changes) => {
    if (changes.some((change) => {
      const element = change.target.nodeType === 1 ? change.target : change.target.parentElement;
      if (element?.closest(".notes-read-mode-toggle")) return false;
      return element?.closest(metadata) ||
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
    document.querySelectorAll(".notes-read-mode-toggle").forEach((button) => button.remove());
    document.querySelectorAll(".notes-read-only").forEach((page) => page.classList.remove("notes-read-only"));
  });
  void refresh().catch((error) => console.warn("Reading mode:", error));
})();
