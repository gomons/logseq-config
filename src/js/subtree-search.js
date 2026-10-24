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
        const marker = content.trimStart().match(/^(CHECKED|CHECK)(?=\s|$)/)?.[1];
        const statusMatch = filter === "all" ||
          (filter === "checked" ? marker === "CHECKED" : marker === "CHECK");
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

