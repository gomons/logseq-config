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
  const pageLink = (row) => row.querySelector(
    ":scope > a, :scope > details > summary > a, "
    + ":scope > .notes-contents-path > a:last-of-type, "
    + ":scope > details > summary > .notes-contents-path > a:last-of-type");
  const catalogRows = (catalog) => catalog.querySelectorAll(":scope > .notes-catalog-item");
  const filterCatalog = (catalog, terms) => {
    let count = 0;
    for (const row of catalogRows(catalog)) {
      const text = normalize([...row.querySelectorAll(".notes-catalog-field:not([hidden])")]
        .map((field) => {
          const references = [...field.querySelectorAll('[data-ref], a[href*="#/page/"]')];
          if (field.matches('[data-ref], a[href*="#/page/"]')) references.push(field);
          const aliases = references.flatMap((reference) =>
            window.notesAliasesForReference?.(reference) || []);
          return [field.textContent, ...aliases].join(" ");
        }).join(" "));
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
    const index = window.notesPageSearchIndex;
    const graph = window.logseq?.api?.get_state_from_store?.("git/current-repo");
    const pages = index ? (index.graph === graph ? index.pages : [])
      : [...state.tree.querySelectorAll("li")].map(pageLink).filter(Boolean).map((link) => ({
        name: decodeURIComponent(link.getAttribute("href").split("#/page/")[1]),
        label: link.title || link.textContent,
        aliases: window.notesAliasesForReference?.(link) || [],
      }));
    for (const page of pages) {
      const alias = page.aliases.find((value) =>
        terms.every((term) => normalize(value).includes(term))) || "";
      const leaf = normalize(page.label.split("/").at(-1));
      if (!alias && !terms.every((term) => leaf.includes(term))) continue;
      const result = document.createElement("li");
      const path = page.label.split("/");
      path.forEach((name, index) => {
        if (index) result.append(document.createTextNode(" / "));
        const segment = document.createElement("a");
        segment.textContent = name;
        segment.title = path.slice(0, index + 1).join("/");
        segment.setAttribute("href", index === path.length - 1
          ? `#/page/${encodeURIComponent(page.name)}`
          : `#/page/${encodeURIComponent(segment.title.toLocaleLowerCase())}`);
        result.append(segment);
      });
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
    input.setAttribute("aria-label", catalog ? "Search visible catalog fields" : "Search all pages");
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

