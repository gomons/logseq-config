/* Property-driven catalogs of namespace descendants. No catalog types or graph paths. */
(() => {
  window.notesCatalogs?.abort();
  const controller = new AbortController();
  window.notesCatalogs = controller;
  const {signal} = controller;
  const states = new Map();
  const folds = new Map();
  const field = (object, key) => object?.[key] ?? object?.[`block/${key}`];
  const values = value => value == null || value === "" ? [] : Array.isArray(value) ? value : [value];
  const name = page => field(page, "name") || "";
  const label = page => field(page, "original-name") || name(page);
  const aliases = page => values(field(page, "alias")).map(value => typeof value === "string" ? value : label(value));
  const query = `[:find (pull ?page [:block/name :block/original-name :block/properties
    {:block/file [:file/path]} {:block/alias [:block/name :block/original-name]}
    {:block/_page [:block/uuid :block/pre-block? :block/properties]}])
    :where [?page :block/name]]`;
  const settings = page => {
    const preamble = values(field(page, "_page")).find(block => field(block, "pre-block?") || block.preBlock);
    return {preamble, properties: {...field(preamble, "properties"), ...field(page, "properties")}};
  };
  const keysFor = ({preamble, properties}) => {
    const raw = field(preamble, "content")?.match(/^catalog-property::[ \t]*(.*)$/m)?.[1]
      ?? properties["catalog-property"];
    const fields = new Map();
    for (const entry of values(raw).flatMap(value => String(value).split(","))) {
      const separator = entry.indexOf(":");
      const key = (separator < 0 ? entry : entry.slice(0, separator)).trim().replace(/^\[\[|\]\]$/g, "");
      const caption = separator < 0 ? key : entry.slice(separator + 1).trim() || key;
      if (key && !fields.has(key)) fields.set(key, {key, caption});
    }
    return [...fields.values()];
  };
  const link = (pageName, caption) => {
    const a = document.createElement("a");
    a.href = `#/page/${encodeURIComponent(pageName)}`;
    a.textContent = caption; a.title = pageName;
    return a;
  };
  const renderValue = (container, value, pages) => {
    const text = typeof value === "object" ? label(value) : String(value);
    const reference = pages.get(text.replace(/^\[\[|\]\]$/g, "").toLowerCase());
    if (reference) {
      container.append(link(name(reference), label(reference).split("/").at(-1)));
      const names = aliases(reference);
      if (names.length) container.append(document.createTextNode(` (${names.join("; ")})`));
    } else if (/\[\[[^\]]+\]\]/.test(text)) {
      let offset = 0;
      for (const match of text.matchAll(/\[\[([^\]]+)\]\]/g)) {
        container.append(document.createTextNode(text.slice(offset, match.index)));
        if (pages.has(match[1].toLowerCase())) renderValue(container, match[1], pages);
        else container.append(link(match[1], match[1].split("/").at(-1)));
        offset = match.index + match[0].length;
      }
      container.append(document.createTextNode(text.slice(offset)));
    } else container.append(document.createTextNode(text));
  };
  const render = (children, keys, pages) => {
    const list = document.createElement("ul"); list.className = "notes-catalog";
    // Expose configured order even when some properties are empty on every page.
    list.dataset.properties = JSON.stringify(keys.map(field => field.key));
    for (const page of children) {
      const row = document.createElement("li"); row.className = "notes-catalog-item";
      const add = (key, items, title = false, displayName = key) => {
        if (!items.length) return;
        const node = document.createElement("div");
        node.className = "notes-catalog-field" + (title ? " notes-catalog-title" : "");
        node.dataset.field = key;
        if (title) node.append(link(name(page), label(page).split("/").at(-1)));
        else {
          if (key !== "page-alias") {
            const caption = document.createElement("span"); caption.className = "notes-catalog-label";
            caption.textContent = `${displayName}: `; node.append(caption);
          }
          items.forEach((value, index) => {
            if (index) node.append(document.createTextNode("; "));
            if (key === "page-alias") node.append(document.createTextNode(String(value)));
            else renderValue(node, value, pages);
          });
        }
        row.append(node);
      };
      add("page-title", [name(page)], true);
      add("page-alias", aliases(page));
      const props = settings(page).properties;
      for (const {key, caption} of keys) add(key, values(props[key]), false, caption);
      list.append(row);
    }
    return list;
  };
  const remove = state => {
    state.section.remove(); state.toggle?.remove();
    state.host?.classList.remove("notes-catalog-host");
    state.controls?.forEach(node => node.classList.remove("notes-catalog-native-fold"));
  };
  let running = false;
  const refresh = async () => {
    if (running || signal.aborted) return;
    running = true;
    try {
      const api = window.logseq?.api;
      if (!api?.datascript_query) return;
      const graph = api.get_state_from_store?.("git/current-repo");
      const rows = await api.datascript_query(query);
      if (signal.aborted || graph !== api.get_state_from_store?.("git/current-repo")) return;
      const all = (rows || []).map(([page]) => page);
      const pages = new Map(all.map(page => [name(page).toLowerCase(), page]));
      for (const page of all) for (const alias of aliases(page))
        if (!pages.has(alias.toLowerCase())) pages.set(alias.toLowerCase(), page);
      const wanted = new Set();
      for (const page of all) {
        for (const block of values(field(page, "_page"))) {
          const config = {preamble: block, properties: field(block, "properties") || {}};
          if (![true, "true"].includes(config.properties["catalog-show"])) continue;
          const uuid = field(config.preamble, "uuid");
          if (!uuid) continue;
          const hosts = [...document.querySelectorAll(".ls-block[blockid]")].filter(host =>
            host.getAttribute("blockid") === String(uuid) && !host.closest(".references, .custom-query"));
          if (!hosts.length) continue;
          const stored = await api.get_block?.(uuid);
          if (stored) config.preamble = stored;
          if (signal.aborted || graph !== api.get_state_from_store?.("git/current-repo")) return;
          const keys = keysFor(config);
          const children = all.filter(child => name(child).startsWith(name(page) + "/") && field(child, "file"))
            .sort((a,b) => name(a).localeCompare(name(b)));
          // Include linked page aliases so updates refresh both labels and search.
          const signature = JSON.stringify([graph, keys, children, all.map(p => [name(p), label(p), aliases(p)])]);
          for (const host of hosts) {
            if (host.getAttribute("blockid") !== String(uuid) || host.closest(".references, .custom-query")) continue;
            const content = [...host.querySelectorAll(".block-content")]
              .find(element => element.closest(".ls-block") === host);
            if (!content) continue;
            wanted.add(host);
            let state = states.get(host);
            if (!state?.section.isConnected || state.section.parentElement !== content) {
              if (state) remove(state);
              const section = document.createElement("section"); section.className = "notes-generated-catalog";
              section.setAttribute("aria-label", "Catalog"); content.append(section);
              for (const type of ["pointerdown","mousedown","click","keydown","keyup","change"])
                section.addEventListener(type, event => event.stopPropagation(), {signal});
              const toggle = document.createElement("button");
              toggle.type = "button"; toggle.className = "notes-catalog-fold";
              host.classList.add("notes-catalog-host"); host.prepend(toggle);
              state = {section, toggle, host, controls: []}; states.set(host,state);
              for (const type of ["pointerdown", "mousedown", "keydown", "keyup"])
                toggle.addEventListener(type, event => event.stopPropagation(), {signal});
              toggle.addEventListener("click", async event => {
                event.preventDefault(); event.stopPropagation();
                const collapsed = !state.section.hidden;
                folds.set(`${graph}:${uuid}`, collapsed);
                state.section.hidden = collapsed;
                state.toggle.setAttribute("aria-expanded", String(!collapsed));
                try { await api.set_block_collapsed(uuid, collapsed); }
                catch (error) { console.warn("Catalog collapse:", error); }
                void refresh();
              }, {signal});
            }
            state.section.hidden = folds.get(`${graph}:${uuid}`) ?? (field(stored, "collapsed?") === true || stored?.collapsed === true
              || stored?.properties?.collapsed === true || stored?.properties?.collapsed === "true");
            state.toggle.setAttribute("aria-expanded", String(!state.section.hidden));
            state.toggle.setAttribute("aria-label", state.section.hidden ? "Expand catalog block" : "Collapse catalog block");
            state.controls = [...host.querySelectorAll(".block-control")]
              .filter(node => node.closest(".ls-block") === host);
            state.controls.forEach(node => node.classList.add("notes-catalog-native-fold"));
            const control = state.controls[0];
            if (control && state.toggle.parentElement !== control) control.append(state.toggle);
            if (state.signature !== signature) {
              state.section.replaceChildren(render(children, keys, pages)); state.signature = signature;
            }
          }
      }
      }
      for (const [host,state] of states) if (!wanted.has(host) || !host.isConnected) {
        remove(state); states.delete(host);
      }
    } catch (error) { console.warn("Catalogs:",error); }
    finally {running=false;}
  };
  const timer = setInterval(refresh, 2000);
  window.addEventListener("hashchange",refresh,{signal});
  signal.addEventListener("abort",()=>{clearInterval(timer);for(const state of states.values())remove(state);states.clear();},{once:true});
  void refresh();
})();
