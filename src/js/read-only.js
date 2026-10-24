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
        // Query parent links navigate on mouseup and intentionally have no href.
        ".breadcrumb.block-parents a",
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

