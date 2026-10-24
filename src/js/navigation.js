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

  // Native mobile Tagged pages has neither an arrow nor a title fold handler.
  document.addEventListener("click", (event) => {
    if (event.button != null && event.button !== 0) return;
    const title = event.target.closest?.(".references.page-tags .foldable-title");
    if (!title || title.matches(".cursor") || event.target.closest("a, button, input")) return;
    const control = title.querySelector("a.block-control");
    const content = title.parentElement.nextElementSibling;
    if (!control && !content) return;
    event.preventDefault();
    event.stopPropagation();
    if (control) {
      control.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    } else {
      const collapsed = content.classList.toggle("hidden");
      content.classList.toggle("initial", !collapsed);
      title.setAttribute("aria-expanded", String(!collapsed));
    }
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
      row.querySelector(":scope > .notes-search-alias")?.remove();
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

  const addSubpageCreator = (panel, parent) => {
    panel.dataset.notesParent = parent;
    if (panel.querySelector(".notes-subpage-create")) return;
    const heading = panel.querySelector(".foldable-title");
    if (!heading) return;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "notes-subpage-create";
    toggle.textContent = "+";
    toggle.title = "Create subpage";
    toggle.setAttribute("aria-label", "Create subpage");
    toggle.setAttribute("aria-expanded", "false");
    const form = document.createElement("form");
    form.className = "notes-subpage-form";
    form.hidden = true;
    const input = document.createElement("input");
    input.placeholder = "Page name";
    input.setAttribute("aria-label", "New subpage name");
    input.setAttribute("enterkeyhint", "done");
    input.required = true;
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = "Create";
    const status = document.createElement("span");
    status.setAttribute("role", "status");
    form.append(input, submit, status);
    heading.append(toggle);
    heading.parentElement.append(form);
    for (const type of ["pointerdown", "mousedown", "click", "keydown", "keyup"])
      form.addEventListener(type, (event) => event.stopPropagation(), { signal });
    toggle.addEventListener("mousedown", (event) => event.stopPropagation(), { signal });
    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      form.hidden = !form.hidden;
      toggle.setAttribute("aria-expanded", String(!form.hidden));
      if (!form.hidden) input.focus();
    }, { signal });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (submit.disabled) return;
      const leaf = input.value.trim();
      if (!leaf || /[\/\[\]\n\r]/.test(leaf)) {
        status.textContent = "Enter a name without / or brackets.";
        return;
      }
      const parent = panel.dataset.notesParent;
      submit.disabled = true;
      status.textContent = "";
      try {
        const api = window.logseq?.api;
        if (!api?.create_page) throw new Error("Page creation is unavailable. Reload Logseq.");
        // data-ref is Logseq's normalized lookup name, not its original spelling.
        const page = await api.get_page(parent);
        const original = page?.originalName || page?.["original-name"] || page?.["block/original-name"];
        if (!original) throw new Error("Could not read the parent page name.");
        if (signal.aborted || !panel.isConnected || panel.dataset.notesParent !== parent) return;
        const name = original + "/" + leaf;
        // Logseq does not persist a new page containing only one blank block.
        const created = await api.create_page(name, { "read-only": false },
          { redirect: false, createFirstBlock: true });
        if (!created) throw new Error("Could not create the page.");
        // create_page returns existing implicit pages without initializing them.
        const blocks = await api.get_page_blocks_tree(name) || [];
        if (!blocks.length) {
          await api.insert_block(name, "read-only:: false", { isPageBlock: true });
        } else if (blocks.length === 1 && !blocks[0].content?.trim()
          && !blocks[0].children?.length) {
          await api.update_block(blocks[0].uuid, "read-only:: false");
        }
        window.location.hash = "#/page/" + encodeURIComponent(name);
        input.value = "";
        form.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
      } catch (error) {
        status.textContent = error.message || "Could not create the page.";
      } finally { submit.disabled = false; }
    }, { signal });
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
    if (hierarchy) addSubpageCreator(panel, current);
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
    panel.classList.toggle("notes-navigation-empty", false);
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
      for (const page of document.querySelectorAll(".page")) {
        if (!page.querySelector(titleSelector)) continue;
        const panels = [...page.querySelectorAll(".page-hierarchy")];
        if (panels.some((panel) => !panel.hasAttribute("data-notes-synthetic"))) {
          panels.filter((panel) => panel.hasAttribute("data-notes-synthetic"))
            .forEach((panel) => panel.remove());
        } else if (!panels.length) {
          const panel = document.createElement("div");
          panel.className = "page-hierarchy";
          panel.setAttribute("data-notes-synthetic", "true");
          const header = document.createElement("div");
          const heading = document.createElement("div");
          heading.className = "foldable-title";
          heading.append(document.createElement("h2"));
          header.append(heading);
          const list = document.createElement("ul");
          list.className = "namespaces";
          panel.append(header, list);
          page.append(panel);
          pendingPanels.add(panel);
        }
      }
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
    document.querySelectorAll(".notes-subpage-create, .notes-subpage-form, [data-notes-synthetic]")
      .forEach((element) => element.remove());
  }, { once: true });
  window.addEventListener("notes-aliases-changed", () => {
    document.querySelectorAll(panelSelector).forEach((panel) => pendingPanels.add(panel));
    if (frame === null) frame = requestAnimationFrame(flush);
  }, { signal });
  document.querySelectorAll(panelSelector).forEach((panel) => pendingPanels.add(panel));
  flush();
})();

