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


