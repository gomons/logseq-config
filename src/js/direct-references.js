/* Exclude namespace ancestors introduced by Logseq's reference index. */
(() => {
  window.notesDirectReferences?.abort();
  const controller = new AbortController();
  window.notesDirectReferences = controller;
  const { signal } = controller;
  const selector = ".references.page-linked";
  const excluded = "notes-indirect-reference";
  const states = new Map();
  const field = (entity, key) => entity?.[key] ?? entity?.[`block/${key}`];
  const normalize = value => String(value || "").trim().toLowerCase();
  const plainText = text => text.replace(/(^|\n)[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n[ \t]*\2[^\n]*(?=\n|$)/g, "$1")
    .replace(/(`+)[^`\n]*?\1/g, "");
  const references = block => {
    const text = plainText(field(block, "content") || "");
    const names = new Set();
    // Match complete targets, including Markdown labels around Logseq links.
    for (const match of text.matchAll(/(?<!\\)\[\[([^\[\]\n]+)\]\]/g)) names.add(normalize(match[1]));
    for (const match of text.matchAll(/(?:^|[\s(,;])#([^\s#\[\](),;!?]+)/g)) names.add(normalize(match[1]));
    const props = field(block, "properties") || {};
    const indexed = new Set((field(block, "refs") || []).map(ref => normalize(field(ref, "name"))));
    // Plain property values become references only when Logseq indexed them.
    for (const match of text.matchAll(/^\s*([\w-]+)::([^\n]*)/gm)) {
      names.add(normalize(match[1]));
      const key = match[1].replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      const value = props[match[1]] ?? props[key];
      for (const item of Array.isArray(value) ? value : [value]) {
        if (typeof item === "string" && indexed.has(normalize(item))) names.add(normalize(item));
      }
    }
    return names;
  };
  const ancestors = block => {
    const ids = new Set();
    let parent = field(block, "parent");
    while (parent && !ids.has(parent.id ?? parent["db/id"])) {
      ids.add(parent.id ?? parent["db/id"]);
      parent = field(parent, "parent");
    }
    return ids;
  };
  const load = async (api, name) => {
    const page = await api.get_page(name);
    if (!page) return null;
    const aliases = page.properties?.alias || [];
    const targets = new Set([name, page.name, ...(Array.isArray(aliases) ? aliases : [aliases])].filter(Boolean).map(normalize));
    const targetSet = `#{${[...targets].map(value => JSON.stringify(value)).join(" ")}}`;
    const rows = await api.datascript_query(`[:find (pull ?b [:db/id :block/uuid :block/content :block/properties
      {:block/page [:block/name]} {:block/refs [:block/name]}
      {:block/parent [:db/id {:block/parent ...}]}])
      :where [?target :block/name ?name] [(contains? ${targetSet} ?name)] [?b :block/refs ?target]]`);
    const candidates = (rows || []).map(row => row[0]);
    const direct = candidates.filter(block => normalize(field(field(block, "page"), "name")) !== normalize(page.name || name)
      && [...references(block)].some(ref => targets.has(ref)));
    const directIds = new Set(direct.map(block => block.id ?? block["db/id"]));
    const contextIds = new Set(directIds);
    direct.forEach(block => ancestors(block).forEach(id => contextIds.add(id)));
    return {
      keep: new Set(candidates.filter(block => contextIds.has(block.id ?? block["db/id"]))
        .map(block => String(field(block, "uuid")))),
      pages: new Set(direct.map(block => normalize(field(field(block, "page"), "name")))),
      count: direct.filter(block => ![...ancestors(block)].some(id => directIds.has(id))).length,
      filtered: !!page.properties?.filters,
    };
  };
  const paint = (panel, data) => {
    for (const group of panel.querySelectorAll(".references-blocks-item")) {
      const roots = [...group.querySelectorAll(".ls-block[blockid]")].filter(block =>
        !block.parentElement.closest(".ls-block[blockid]") || !group.contains(block.parentElement.closest(".ls-block[blockid]")));
      roots.forEach(block => block.classList.toggle(excluded, !data.keep.has(block.getAttribute("blockid"))));
      const source = normalize(group.querySelector(".foldable-title [data-ref]")?.getAttribute("data-ref"));
      const keep = source ? data.pages.has(source) : !roots.length || roots.some(block => !block.classList.contains(excluded));
      group.classList.toggle(excluded, !keep);
    }
    const heading = panel.querySelector(".foldable-title h2");
    if (heading) {
      const label = data.filtered ? "Linked References" : `${data.count} Linked References`;
      if (heading.textContent !== label) heading.textContent = label;
    }
  };
  let timer = null, running = false;
  const refresh = async () => {
    timer = null;
    if (signal.aborted || running) return;
    const api = window.logseq?.api;
    if (!api?.datascript_query || !api?.get_page) return;
    running = true;
    try {
      const graph = api.get_state_from_store?.("git/current-repo");
      for (const [panel] of states) if (!panel.isConnected) states.delete(panel);
      for (const panel of document.querySelectorAll(selector)) {
        const title = panel.closest(".page")?.querySelector(".ls-page-title .title[data-ref], .ls-page-title[data-ref]");
        const name = title?.getAttribute("data-ref");
        if (!name) continue;
        const key = JSON.stringify([graph, name]);
        let state = states.get(panel);
        if (state?.key !== key || Date.now() - state.time > 2000) {
          const data = await load(api, name);
          if (signal.aborted || !panel.isConnected || title.getAttribute("data-ref") !== name
            || api.get_state_from_store?.("git/current-repo") !== graph) continue;
          if (!data) continue;
          state = {key, time: Date.now(), data}; states.set(panel, state);
        }
        observer.disconnect();
        try { paint(panel, state.data); }
        finally { if (!signal.aborted) observer.observe(document.body, options); }
      }
    } catch (error) { console.warn("Direct references:", error); }
    finally { running = false; }
  };
  const schedule = () => {
    if (!signal.aborted && timer === null) timer = setTimeout(refresh, 100);
  };
  const options = {childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ["data-ref", "blockid"]};
  const observer = new MutationObserver(changes => {
    if (changes.some(change => {
      const element = change.target.nodeType === 1 ? change.target : change.target.parentElement;
      return element?.closest(selector + ", .ls-page-title") || [...change.addedNodes].some(node =>
        node.nodeType === 1 && (node.matches(selector) || node.querySelector(selector)));
    })) schedule();
  });
  observer.observe(document.body, options);
  const interval = setInterval(schedule, 3000);
  window.addEventListener("hashchange", schedule, {signal});
  signal.addEventListener("abort", () => {
    observer.disconnect(); clearInterval(interval); if (timer !== null) clearTimeout(timer);
    document.querySelectorAll(`.${excluded}`).forEach(element => element.classList.remove(excluded));
    states.clear();
  }, {once: true});
  schedule();
})();
