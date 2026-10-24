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
      const mobileTags = !control && panel.matches(".references.page-tags");
      if (!name || !content || (!control && !mobileTags)) return;
      const kind = panel.matches(".page-hierarchy") ? "hierarchy"
        : panel.matches(".page-tags") ? "tags" : "linked";
      const key = JSON.stringify([graph, name.toLowerCase(), kind]);
      if (watched.get(content)?.key === key) return;
      watched.get(content)?.observer.disconnect();
      const collapsed = () => content.classList.contains("hidden");
      // Restore through Logseq's handler, so its internal state stays consistent.
      if (typeof saved[key] === "boolean" && saved[key] !== collapsed()) {
        if (control) control.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        else {
          content.classList.toggle("hidden", saved[key]);
          content.classList.toggle("initial", !saved[key]);
        }
      }
      if (mobileTags) title.setAttribute("aria-expanded", String(!collapsed()));
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

