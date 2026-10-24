/* Opt-in Contents: automatic pages, tags and Favorites on any block. */
(() => {
  window.notesAutomaticContents?.abort();
  const controller = new AbortController();
  window.notesAutomaticContents = controller;
  const { signal } = controller;
  const states = new Map();
  let timer = null;
  let running = false;
  let rerun = false;
  let aliasSignature = null;
  const query = `[:find (pull ?page [:block/name :block/original-name :block/properties
                    :block/journal? {:block/file [:file/path]}
                    {:block/namespace [:block/name]}
                    {:block/alias [:block/name :block/original-name]}])
                  :where [?page :block/name]]`;
  const field = (entity, key) => entity?.[key] ?? entity?.[`block/${key}`];
  const enabled = (value) => value === true || String(value).toLowerCase() === "true";
  const option = (block, key) => {
    const value = field(block, "content")?.match(
      new RegExp(`^${key}::[ \t]*(true|false)[ \t]*$`, "im"),
    )?.[1] ?? field(block, "properties")?.[key];
    return enabled(value);
  };
  const tagQuery = `[:find (pull ?block [:block/content
                          {:block/refs [:block/name :block/original-name]}])
                    :where [?block :block/content ?content]
                    [?block :block/refs ?page] [?page :block/name]
                    [(re-pattern "#") ?hashtag] [(re-find ?hashtag ?content)]]`;
  const countTags = (rows) => {
    const counts = new Map();
    for (const [block] of rows || []) {
      const refs = new Map((field(block, "refs") || []).map((page) => [field(page, "name"), page]));
      const content = String(field(block, "content") || "").replace(/^\s*[\w-]+::.*$/gm, "");
      const names = new Set([...content.matchAll(/(?:^|[\s(,;])#(?:\[\[([^\]]+)\]\]|([^\s#\[\](),;!?]+))/g)]
        .map((match) => (match[1] || match[2]).toLowerCase()));
      for (const name of names) {
        const page = refs.get(name);
        if (!page) continue;
        const tag = counts.get(name) || { name, label: field(page, "original-name") || name, count: 0 };
        tag.count++;
        counts.set(name, tag);
      }
    }
    return [...counts.values()].sort((a, b) => a.name.localeCompare(b.name));
  };
  const renderTags = (tags) => {
    const cloud = document.createElement("div");
    cloud.className = "notes-tag-cloud";
    const maximum = Math.max(1, ...tags.map((tag) => tag.count));
    for (const tag of tags) {
      const link = document.createElement("a");
      link.setAttribute("href", `#/page/${encodeURIComponent(tag.name)}`);
      link.textContent = tag.label;
      link.title = `${tag.label} · ${tag.count} blocks`;
      link.style.fontSize = `${0.85 + 0.55 * tag.count / maximum}rem`;
      cloud.append(link);
    }
    if (!tags.length) cloud.textContent = "No tags yet";
    return cloud;
  };
  const renderFavorites = (favorites) => {
    const list = document.createElement("div");
    list.className = "notes-automatic-favorites notes-tag-cloud";
    favorites.forEach(({ name, label }, index) => {
      const item = document.createElement("span");
      item.className = "notes-automatic-favorite";
      const link = document.createElement("a");
      link.href = `#/page/${encodeURIComponent(name)}`;
      link.textContent = label.split("/").at(-1);
      link.title = label;
      item.append(link);
      if (index < favorites.length - 1) {
        const separator = document.createElement("span");
        separator.className = "notes-favorite-separator";
        separator.textContent = "·";
        separator.setAttribute("aria-hidden", "true");
        item.append(separator);
      }
      list.append(item);
    });
    if (!favorites.length) list.textContent = "No Favorites yet";
    return list;
  };
  const blockQuery = `[:find (pull ?block [:block/uuid :block/content :block/properties])
                      :where [?block :block/properties ?props]
                      (or [(get ?props :auto-contents)] [(get ?props :auto-tags)]
                          [(get ?props :auto-favorites)])]`;
  const remove = (anchor) => {
    states.get(anchor)?.section.remove();
    states.delete(anchor);
  };
  const renderTree = (pages, previous) => {
    const children = new Map();
    const roots = [];
    const names = new Set(pages.map((page) => page.name));
    const parents = new Map();
    for (const page of pages) {
      let parent = page.parent;
      while (parent && !names.has(parent))
        parent = parent.includes("/") ? parent.slice(0, parent.lastIndexOf("/")) : null;
      if (page.pinned) parent = null;
      parents.set(page.name, parent);
      if (!parent) roots.push(page);
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(page);
    }
    const order = (a, b) => Number(b.pinned) - Number(a.pinned)
      || a.name.localeCompare(b.name);
    roots.sort(order);
    for (const siblings of children.values()) siblings.sort(order);
    const open = new Map([...previous?.querySelectorAll("details") || []]
      .map((details) => [details.dataset.page, details.open]));
    const branch = (page, ancestors = new Set()) => {
      const row = document.createElement("li");
      row.classList.toggle("notes-contents-page-pinned", page.pinned);
      const link = document.createElement("a");
      link.setAttribute("href", `#/page/${encodeURIComponent(page.name)}`);
      link.title = page.label;
      const pathLabels = page.label.split("/");
      const parent = parents.get(page.name);
      const start = page.pinned ? 0 : parent ? parent.split("/").length : 0;
      link.textContent = pathLabels.at(-1);
      let label = link;
      if (pathLabels.length - start > 1) {
        label = document.createElement("span");
        label.className = "notes-contents-path";
        for (let index = start; index < pathLabels.length; index++) {
          if (index > start) {
            const separator = document.createElement("span");
            separator.className = "notes-contents-path-separator";
            separator.textContent = " › ";
            separator.setAttribute("aria-hidden", "true");
            label.append(separator);
          }
          const segment = index === pathLabels.length - 1 ? link : document.createElement("a");
          if (segment !== link) {
            segment.textContent = pathLabels[index];
            segment.title = pathLabels.slice(0, index + 1).join("/");
            segment.href = `#/page/${encodeURIComponent(page.name.split("/").slice(0, index + 1).join("/"))}`;
          }
          label.append(segment);
        }
      }
      const descendants = (children.get(page.name) || [])
        .filter((child) => !ancestors.has(child.name));
      if (descendants.length) {
        const details = document.createElement("details");
        details.dataset.page = page.name;
        details.open = open.get(page.name) ?? false;
        const summary = document.createElement("summary");
        summary.append(label);
        const list = document.createElement("ul");
        const path = new Set([...ancestors, page.name]);
        descendants.forEach((child) => list.append(branch(child, path)));
        details.append(summary, list);
        row.append(details);
      } else row.append(label);
      return row;
    };
    const tree = document.createElement("ul");
    tree.className = "notes-contents-tree";
    roots.forEach((page) => {
      const row = branch(page);
      tree.append(row);
    });
    return tree;
  };
  const refresh = async () => {
    timer = null;
    if (signal.aborted) return;
    if (running) { rerun = true; return; }
    const api = window.logseq?.api;
    if (!api?.datascript_query) return;
    running = true;
    try {
      const graph = api.get_state_from_store?.("git/current-repo");
      const rows = await api.datascript_query(query);
      if (signal.aborted || graph !== api.get_state_from_store?.("git/current-repo")) return;
      // Pages lists note files, not implicit entities created by references.
      const pages = (rows || []).filter(([page]) => {
        const file = field(page, "file");
        const path = String(file?.path ?? file?.["file/path"] ?? "").replace(/\\/g, "/");
        if (!path) return false;
        if (/(^|\/)(?:logseq|\.backup|assets)\//i.test(path)
          || /^(?:AGENTS|README)\.md$/i.test(path)) return false;
        return !enabled(field(page, "journal?")) && !/(^|\/)journals\//i.test(path);
      }).map(([page]) => ({
        name: field(page, "name"),
        label: field(page, "original-name") || field(page, "name"),
        aliases: (field(page, "alias") || []).map((alias) =>
          field(alias, "original-name") || field(alias, "name")).filter(Boolean),
        parent: field(field(page, "namespace"), "name"),
        pinned: enabled(field(page, "properties")?.["contents-pin"]),
        ignored: enabled(field(page, "properties")?.["contents-exclude"]),
      })).sort((a, b) => a.name.localeCompare(b.name));
      const visiblePages = pages.filter((page) => !page.ignored);
      const aliases = pages.map((page) => [page.name.toLowerCase(), page.aliases]);
      const nextAliases = JSON.stringify([graph, pages.map(({ name, label, aliases, ignored }) =>
        [name, label, aliases, ignored])]);
      if (nextAliases !== aliasSignature) {
        aliasSignature = nextAliases;
        window.notesPageAliasIndex = { graph, pages: new Map(aliases) };
        window.notesPageSearchIndex = { graph, pages: visiblePages };
        window.dispatchEvent(new window.Event("notes-aliases-changed"));
      }
      const blockRows = await api.datascript_query(blockQuery);
      const candidates = (blockRows || []).map(([block]) => ({
        uuid: field(block, "uuid"),
        options: { pages: option(block, "auto-contents"), tags: option(block, "auto-tags"),
          favorites: option(block, "auto-favorites") },
      })).filter(({ options }) => options.pages || options.tags || options.favorites);
      const tags = candidates.some(({ options }) => options.tags)
        ? countTags(await api.datascript_query(tagQuery)) : [];
      if (signal.aborted) return;
      const favoriteNames = candidates.some(({ options }) => options.favorites)
        ? await api.get_current_graph_favorites?.() || [] : [];
      if (signal.aborted) return;
      const pageLabels = new Map(pages.map((page) => [page.name, page.label]));
      const favorites = favoriteNames.filter((name) => typeof name === "string" && name.trim())
        .map((name) => ({ name, label: pageLabels.get(name.toLowerCase()) || name }));
      const favoriteSignature = JSON.stringify(favorites);
      const treeSignature = JSON.stringify(pages);
      const tagSignature = JSON.stringify(tags);
      const active = new Set();
      for (const { uuid, options } of candidates) {
        for (const anchor of document.querySelectorAll(".ls-block[blockid]")) {
          if (anchor.getAttribute("blockid") !== uuid || anchor.closest(".references, .custom-query")) continue;
          const content = [...anchor.querySelectorAll(".block-content")]
            .find((element) => element.closest(".ls-block") === anchor);
          if (!content) continue;
          active.add(anchor);
          let state = states.get(anchor);
          if (!state?.section.isConnected || state.section.parentElement !== content) {
            remove(anchor);
            const section = document.createElement("section");
            section.className = "notes-automatic-contents";
            section.setAttribute("aria-label", "Contents");
            content.append(section);
            for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup",
              "touchstart", "touchend", "click", "keydown", "keyup"])
              section.addEventListener(type, (event) => event.stopPropagation(), { signal });
            state = { section, groups: new Map() };
            states.set(anchor, state);
          }
          let groupIndex = 0;
          for (const [key, label, signature] of [
            ["favorites", "Favorites", favoriteSignature],
            ["pages", "Pages", treeSignature], ["tags", "Tags", tagSignature],
          ]) {
            let group = state.groups.get(key);
            if (!options[key]) {
              group?.element.remove();
              state.groups.delete(key);
              continue;
            }
            if (!group) {
              const element = document.createElement("details");
              element.className = "notes-automatic-group";
              element.open = true;
              const summary = document.createElement("summary");
              const heading = document.createElement("h3");
              heading.textContent = label;
              summary.append(heading);
              element.append(summary);
              group = { element, signature: null };
              state.groups.set(key, group);
            }
            const position = state.section.children[groupIndex++] || null;
            if (position !== group.element)
              state.section.insertBefore(group.element, position);
            if (group.signature === signature) continue;
            const old = group.element.querySelector(".notes-contents-tree, .notes-tag-cloud");
            const body = key === "pages" ? renderTree(visiblePages, old)
              : key === "favorites" ? renderFavorites(favorites) : renderTags(tags);
            if (old) old.replaceWith(body);
            else group.element.append(body);
            group.signature = signature;
          }
        }
      }
      for (const anchor of states.keys()) if (!active.has(anchor)) remove(anchor);
    } catch (error) {
      console.warn("Automatic Contents:", error);
    } finally {
      running = false;
      if (rerun && !signal.aborted) { rerun = false; schedule(); }
    }
  };
  const schedule = () => {
    if (signal.aborted) return;
    clearTimeout(timer);
    timer = setTimeout(refresh, 150);
  };
  const observer = new MutationObserver((changes) => {
    if (changes.some(({ target, addedNodes, removedNodes }) => {
      const element = target.nodeType === 1 ? target : target.parentElement;
      if (element?.closest(".notes-automatic-contents")) return false;
      return element?.closest(".block-properties") ||
        [...addedNodes, ...removedNodes].some((node) => node.nodeType === 1 &&
          (node.matches(".ls-block, .page, .sidebar-item") || node.querySelector(".ls-block")));
    })) schedule();
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  // Also pick up graph/index changes that have no visible DOM mutation.
  const interval = setInterval(schedule, 3000);
  window.addEventListener("hashchange", schedule, { signal });
  signal.addEventListener("abort", () => {
    observer.disconnect();
    clearTimeout(timer);
    clearInterval(interval);
    for (const anchor of states.keys()) remove(anchor);
  }, { once: true });
  void refresh();
})();

