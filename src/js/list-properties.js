/* Edit tag and alias lists without replacing the native property edit target. */
(() => {
  window.notesTagProperties?.abort();
  const controller = new AbortController();
  window.notesTagProperties = controller;
  const { signal } = controller;
  const states = new Map();
  const saving = new Set();
  const propertyLine = (key) => new RegExp(`^([ \t]*${key}::[ \t]*)([^\r\n]*)(?=\r?$)`, "im");
  let timer = null;
  let running = false;
  let rerun = false;
  const parse = (value) => {
    const parts = [];
    let start = 0;
    let wiki = false;
    for (let i = 0; i < value.length; i++) {
      if (value.slice(i, i + 2) === "[[") { wiki = true; i++; }
      else if (value.slice(i, i + 2) === "]]") { wiki = false; i++; }
      else if (value[i] === "," && !wiki) { parts.push(value.slice(start, i)); start = i + 1; }
    }
    parts.push(value.slice(start));
    return parts.flatMap((part) => {
      const refs = [...part.matchAll(/#?\[\[([^\]]+)\]\]/g)];
      return refs.length && !part.replace(/#?\[\[[^\]]+\]\]/g, "").trim()
        ? refs.map((match) => match[0]) : [part.trim()];
    }).filter(Boolean);
  };
  const remove = (element, state) => {
    state.editor.remove();
    element.classList.remove("notes-tag-property");
    states.delete(element);
  };
  const wikiName = (value) => value.match(/^#?\[\[([^\]]+)\]\]$/)?.[1];
  const format = (value, kind) => kind === "tag" && !wikiName(value) && !value.startsWith("#")
    ? `[[${value}]]` : value;
  const change = async (state, name, add) => {
    name = format(name.trim(), state.kind);
    if (!name) { state.status.textContent = `Enter a ${state.kind} name`; return; }
    if (saving.has(state.uuid)) return;
    saving.add(state.uuid);
    for (const view of states.values()) {
      if (view.uuid === state.uuid)
        view.editor.querySelectorAll("button, input").forEach((control) => { control.disabled = true; });
    }
    try {
      const api = window.logseq.api;
      const graph = api.get_state_from_store?.("git/current-repo");
      if (state.graph !== graph) return;
      const block = await api.get_block(state.uuid);
      if (signal.aborted || graph !== api.get_state_from_store?.("git/current-repo")) return;
      const match = block?.content?.match(state.pattern);
      if (!match) return;
      const original = parse(match[2]);
      const names = original.map((value) => format(value, state.kind)).filter(Boolean)
        .filter((value, index, values) => values.findIndex((entry) =>
          entry.toLowerCase() === value.toLowerCase()) === index);
      const equal = (tag) => tag.toLowerCase() === name.toLowerCase();
      const next = add ? names.some(equal) ? names : [...names, name] : names.filter((tag) => !equal(tag));
      const content = block.content.replace(state.pattern, (_, prefix) =>
        prefix.replace(/[ \t]*$/, " ") + next.join(", "));
      if (content !== block.content) await api.update_block(state.uuid, content);
      state.input.value = "";
      state.input.hidden = true;
      state.confirm.hidden = true;
      state.entry.hidden = true;
      state.add.setAttribute("aria-expanded", "false");
    } catch (error) {
      state.status.textContent = `Could not update ${state.key}`;
      console.warn("List properties:", error);
    } finally {
      saving.delete(state.uuid);
      for (const view of states.values()) {
        if (view.uuid === state.uuid)
          view.editor.querySelectorAll("button, input").forEach((control) => { control.disabled = false; });
      }
      schedule();
    }
  };
  const stopGesture = (control) => {
    for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart",
      "touchend", "touchcancel", "click", "dblclick", "keydown", "keyup"])
      control.addEventListener(type, (event) => event.stopPropagation(), { signal });
  };
  const mount = (element, uuid, key) => {
    const kind = key === "tags" ? "tag" : "alias";
    const editor = document.createElement("span");
    editor.className = "notes-tag-editor";
    editor.dataset.property = key;
    const chips = document.createElement("span");
    chips.className = "notes-tag-chips";
    const add = document.createElement("button");
    add.type = "button";
    add.className = "notes-tag-action";
    add.textContent = "+";
    add.title = `Add ${kind}`;
    add.setAttribute("aria-label", `Add ${kind}`);
    add.setAttribute("aria-expanded", "false");
    const input = document.createElement("input");
    input.type = "text";
    input.setAttribute("enterkeyhint", "done");
    input.className = "notes-tag-input";
    input.placeholder = kind === "tag" ? "Page name" : "Alias";
    input.setAttribute("aria-label", `New ${kind}; press Enter to add`);
    input.hidden = true;
    const confirm = document.createElement("button");
    confirm.type = "submit";
    confirm.className = "notes-tag-action";
    confirm.textContent = "✓";
    confirm.title = `Save ${kind}`;
    confirm.setAttribute("aria-label", `Save ${kind}`);
    confirm.hidden = true;
    const entry = document.createElement("form");
    entry.className = "notes-tag-entry";
    entry.hidden = true;
    entry.append(input, confirm);
    const status = document.createElement("span");
    status.className = "notes-tag-status";
    status.setAttribute("aria-live", "polite");
    const graph = window.logseq.api.get_state_from_store?.("git/current-repo");
    const state = { uuid, graph, key, kind, pattern: propertyLine(key),
      editor, chips, add, input, confirm, entry, status, signature: null };
    stopGesture(add);
    stopGesture(input);
    stopGesture(confirm);
    add.addEventListener("click", (event) => {
      event.preventDefault();
      input.hidden = !input.hidden;
      confirm.hidden = input.hidden;
      entry.hidden = input.hidden;
      add.setAttribute("aria-expanded", String(!input.hidden));
      if (!input.hidden) input.focus();
    }, { signal });
    const submit = () => {
      const name = input.value.trim();
      if (!name) return;
      if (/[\r\n]/.test(name) || ((/\[\[|\]\]/.test(name)) && !wikiName(name))) {
        status.textContent = kind === "tag" ? "Enter a page name" : "Enter an alias";
        return;
      }
      status.textContent = "";
      void change(state, name, true);
    };
    entry.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopPropagation();
      submit();
    }, { signal });
    input.addEventListener("beforeinput", (event) => {
      if (!event.isComposing && ["insertLineBreak", "insertParagraph"].includes(event.inputType)) {
        event.preventDefault();
        submit();
      }
    }, { signal });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        input.hidden = true;
        confirm.hidden = true;
        entry.hidden = true;
        add.setAttribute("aria-expanded", "false");
        add.focus();
      }
      if (event.key !== "Enter" || event.isComposing) return;
      event.preventDefault();
      submit();
    }, { signal });
    editor.append(chips, add, entry, status);
    element.append(editor);
    element.classList.add("notes-tag-property");
    states.set(element, state);
    return state;
  };
  const refresh = async () => {
    timer = null;
    if (signal.aborted) return;
    if (running) { rerun = true; return; }
    const api = window.logseq?.api;
    if (!api?.get_block || !api?.update_block) return;
    running = true;
    const graph = api.get_state_from_store?.("git/current-repo");
    try {
      const active = new Set();
      const blocks = new Map();
      for (const element of document.querySelectorAll(".block-properties .page-property-value")) {
        const row = element.parentElement;
        const key = row.querySelector(".page-property-key");
        const name = (key?.getAttribute("data-ref") || key?.querySelector("[data-ref]")?.getAttribute("data-ref") ||
          key?.textContent.replace(/:\s*$/, "").trim() || "").toLowerCase();
        const host = element.closest(".ls-block[blockid]");
        const uuid = host?.getAttribute("blockid");
        if (!["tags", "alias", "aliases"].includes(name) || !uuid || host.querySelector("textarea")) continue;
        if (!blocks.has(uuid)) blocks.set(uuid, api.get_block(uuid));
        const block = await blocks.get(uuid);
        if (signal.aborted || graph !== api.get_state_from_store?.("git/current-repo")) return;
        if (!element.isConnected || host.getAttribute("blockid") !== uuid) continue;
        const match = block?.content?.match(propertyLine(name));
        if (!match) continue;
        active.add(element);
        let state = states.get(element);
        if (state && (state.uuid !== uuid || state.key !== name || state.graph !== graph || !state.editor.isConnected)) {
          remove(element, state);
          state = null;
        }
        if (!state) state = mount(element, uuid, name);
        if (saving.has(uuid)) continue;
        const tags = parse(match[2]);
        const signature = JSON.stringify(tags);
        if (state.signature === signature) continue;
        state.chips.replaceChildren();
        for (const tag of tags) {
          const chip = document.createElement("span");
          chip.className = "notes-tag-chip" + (state.kind === "alias" ? " notes-alias-item" : "");
          const text = wikiName(tag) || tag;
          const linked = state.kind === "tag" || !!wikiName(tag) || tag.startsWith("#");
          const destination = wikiName(tag) || tag.replace(/^#/, "");
          const label = document.createElement(linked ? "a" : "span");
          label.textContent = text;
          if (linked) {
            label.setAttribute("href", `#/page/${encodeURIComponent(destination.toLowerCase())}`);
            label.title = text;
            stopGesture(label);
          }
          const minus = document.createElement("button");
          minus.type = "button";
          minus.className = "notes-tag-action";
          minus.textContent = "−";
          minus.setAttribute("aria-label", `Remove ${state.kind} ${text}`);
          minus.title = `Remove ${tag}`;
          stopGesture(minus);
          minus.addEventListener("click", (event) => {
            event.preventDefault();
            void change(state, tag, false);
          }, { signal });
          chip.append(label, minus);
          state.chips.append(chip);
        }
        state.signature = signature;
      }
      for (const [element, state] of states) if (!active.has(element)) remove(element, state);
    } catch (error) { console.warn("List properties:", error); }
    finally {
      running = false;
      if (rerun && !signal.aborted) { rerun = false; schedule(); }
    }
  };
  const schedule = () => {
    if (!signal.aborted && timer === null) timer = setTimeout(refresh, 80);
  };
  const observer = new MutationObserver((changes) => {
    if (changes.some(({ target, addedNodes }) => {
      const element = target.nodeType === 1 ? target : target.parentElement;
      if (element?.closest(".notes-tag-editor")) return false;
      return element?.closest(".block-properties, .ls-block") ||
        [...addedNodes].some((node) => node.nodeType === 1 &&
          (node.matches(".block-properties") || node.querySelector(".block-properties")));
    }) || [...states.keys()].some((element) => !element.isConnected)) schedule();
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ["blockid", "data-ref"] });
  window.addEventListener("hashchange", schedule, { signal });
  signal.addEventListener("abort", () => {
    observer.disconnect();
    if (timer !== null) clearTimeout(timer);
    for (const [element, state] of states) remove(element, state);
  }, { once: true });
  void refresh();
})();

