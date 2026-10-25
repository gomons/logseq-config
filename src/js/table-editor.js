/* Opt-in editing for simple Markdown tables; the block remains the source. */
(() => {
  window.notesTableEditor?.abort();
  const controller = new AbortController();
  window.notesTableEditor = controller;
  const { signal } = controller;
  const states = new Map();
  const wrapped = new Set();
  const layouts = new WeakMap();
  const resizeCell = (input) => {
    input.style.width = "100%";
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  };
  const wrapTable = (table, block, editor) => {
    const value = property(block, "table-wrap");
    const mode = value == null ? null : truth(value);
    const grid = editor?.querySelector("table");
    const previous = layouts.get(table);
    const width = (editor || table.parentElement)?.clientWidth || window.innerWidth;
    if (previous?.content === block?.content && previous.mode === mode &&
        previous.grid === grid && previous.width === width) return;
    layouts.set(table, { content: block?.content, mode, grid, width });
    for (const node of [table, editor].filter(Boolean)) {
      node.classList.toggle("notes-table-wrap", mode === true);
      node.classList.toggle("notes-table-nowrap", mode === false);
    }
    for (const target of [table, grid].filter(Boolean)) {
      target.style.minWidth = "";
      target.style.width = "";
      target.querySelectorAll("th, td").forEach((cell) => { cell.style.width = ""; });
      if (mode == null) continue;
      const rows = [...target.querySelectorAll("tr")];
      const widths = [];
      const measure = document.createElement("span");
      measure.style.cssText = "position:absolute;visibility:hidden;white-space:pre;pointer-events:none";
      document.body.append(measure);
      try {
        for (const row of rows) [...row.children].forEach((cell, column) => {
          const input = cell.querySelector("textarea");
          const style = window.getComputedStyle?.(input || cell);
          if (style) measure.style.font = style.font;
          measure.textContent = input ? input.value : cell.textContent;
          const textWidth = measure.getBoundingClientRect?.().width || measure.textContent.length * 8;
          const width = Math.max(1, Math.ceil(textWidth)) + 32;
          widths[column] = Math.max(widths[column] || 0, width);
        });
        const total = widths.reduce((sum, width) => sum + width, 0);
        const available = (editor || table.parentElement)?.clientWidth || window.innerWidth || total;
        const fitted = mode === true ? Math.min(total, available) : total;
        // Shrink the widest columns first, preserving compact dates and numbers.
        let fittedWidths = widths;
        if (fitted < total) {
          let low = 0, high = Math.max(...widths);
          for (let i = 0; i < 40; i++) {
            const cap = (low + high) / 2;
            if (widths.reduce((sum, size) => sum + Math.min(size, cap), 0) > fitted) high = cap;
            else low = cap;
          }
          fittedWidths = widths.map((size) => Math.min(size, low));
        }
        for (const row of rows) [...row.children].forEach((cell, column) => {
          cell.style.width = `${fittedWidths[column] / fitted * 100}%`;
        });
        target.style.width = `${fitted}px`;
      } finally { measure.remove(); }
    }
    if (mode != null) wrapped.add(table);
    else wrapped.delete(table);
    editor?.querySelectorAll("textarea").forEach((input) => {
      input.setAttribute("wrap", mode === false ? "off" : "soft");
      resizeCell(input);
    });
  };
  let running = false;
  const truth = (value) => value === true || String(value).toLowerCase() === "true";
  const property = (block, key) => block?.content?.match(
    new RegExp(`^${key}::[ \\t]*(true|false)[ \\t]*$`, "im"))?.[1]
    ?? block?.properties?.[key] ?? block?.properties?.[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())];
  const parse = (content) => {
    const lines = content.split("\n");
    const indices = lines.flatMap((line, i) => /^\s*\|.*\|\s*$/.test(line) ? [i] : []);
    if (indices.length < 2 || indices.some((n, i) => i && n !== indices[i - 1] + 1)) return null;
    const split = (line) => {
      const values = []; let value = "";
      const body = line.trim().slice(1, -1);
      for (let i = 0; i < body.length; i++) {
        if (body[i] === "\\" && i + 1 < body.length && /[\\|]/.test(body[i + 1])) value += body[++i];
        else if (body[i] === "|") { values.push(value.trim()); value = ""; }
        else value += body[i];
      }
      values.push(value.trim()); return values;
    };
    const rows = indices.map((i) => split(lines[i]));
    if (!rows[1].every((cell) => /^:?-{3,}:?$/.test(cell))
      || rows.some((row) => row.length !== rows[0].length)) return null;
    return { lines, indices, rows };
  };
  const serialize = (parsed) => {
    const escape = (value) => value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
    const indent = parsed.lines[parsed.indices[0]].match(/^\s*/)[0];
    const rows = parsed.rows.map((row) => indent + "| " + row.map(escape).join(" | ") + " |");
    return [...parsed.lines.slice(0, parsed.indices[0]), ...rows,
      ...parsed.lines.slice(parsed.indices.at(-1) + 1)].join("\n");
  };
  const remove = (table, state) => {
    state.editor.remove(); table.classList.remove("notes-table-source"); states.delete(table);
  };
  const mount = (table, block, graph) => {
    const editor = document.createElement("div");
    editor.className = "notes-table-editor";
    const status = document.createElement("span"); status.setAttribute("role", "status");
    const state = { editor, status, content: block.content, uuid: block.uuid, graph, saving: false };
    const button = (text, label) => {
      const node = document.createElement("button"); node.type = "button";
      node.textContent = text; node.setAttribute("aria-label", label); node.title = label; return node;
    };
    const save = (change, redraw = true) => {
      state.queue = (state.queue || Promise.resolve()).then(() => persist(change, redraw));
      return state.queue;
    };
    const persist = async (change, redraw) => {
      state.saving = true; status.textContent = "Saving…";
      editor.querySelectorAll("button").forEach((node) => { node.disabled = true; });
      try {
        const api = window.logseq.api;
        const sameGraph = () => graph === api.get_state_from_store?.("git/current-repo");
        if (!sameGraph()) throw Error("Graph changed. Reopen the page.");
        const latest = await api.get_block(state.uuid);
        if (!latest || !truth(property(latest, "table-editable"))) throw Error("Table editing is disabled.");
        if (signal.aborted || !sameGraph() || !table.isConnected) return;
        if (latest.content !== state.content) {
          state.content = latest.content; draw();
          throw Error("Table changed elsewhere. Review it and try again.");
        }
        const parsed = parse(latest.content);
        if (!parsed) throw Error("This table format is not supported.");
        change(parsed.rows);
        const content = serialize(parsed);
        const current = await api.get_block(state.uuid);
        if (signal.aborted || !sameGraph()) return;
        if (current?.content !== latest.content)
          throw Error("Table changed elsewhere. Review it and try again.");
        await api.update_block(state.uuid, content);
        state.content = content; if (redraw) draw(); status.textContent = ""; return true;
      } catch (error) { status.textContent = error.message || "Could not save the table."; }
      finally {
        state.saving = false;
        editor.querySelectorAll("button").forEach((node) => { node.disabled = false; });
      }
    };
    const draw = () => {
      const parsed = parse(state.content);
      if (!parsed) { remove(table, state); return; }
      const grid = document.createElement("table");
      const head = document.createElement("thead"), body = document.createElement("tbody");
      parsed.rows.forEach((row, rowIndex) => {
        if (rowIndex === 1) return;
        const tr = document.createElement("tr");
        row.forEach((text, column) => {
          const cell = document.createElement(rowIndex ? "td" : "th");
          const input = document.createElement("textarea");
          input.rows = 1;
          input.className = "notes-table-cell";
          const resize = () => {
            resizeCell(input);
          };
          input.addEventListener("input", resize, { signal });
          input.value = text;
          input.setAttribute("aria-label", `${parsed.rows[0][column]}, row ${rowIndex || "header"}`);
          input.setAttribute("enterkeyhint", "done");
          let committed = text;
          input.addEventListener("blur", async () => {
            const value = input.value.replace(/[\r\n]+/g, " ");
            if (value === committed) return;
            if (await save((rows) => { rows[rowIndex][column] = value; }, false)) committed = value;
          }, { signal });
          input.addEventListener("keydown", (event) => {
            if (event.isComposing) return;
            if (event.key === "Escape") {
              event.preventDefault(); input.value = committed; resize(); input.blur();
            } else if (event.key === "Enter") {
              event.preventDefault(); input.blur();
            }
          }, { signal });
          cell.append(input); tr.append(cell);
        });
        if (rowIndex) {
          const minus = button("−", "Delete row");
          minus.addEventListener("click", () => void save((rows) => rows.splice(rowIndex, 1)), { signal });
          minus.classList.add("notes-table-delete");
          tr.lastElementChild.append(minus);
        }
        (rowIndex ? body : head).append(tr);
      });
      grid.append(head, body);
      const add = button("+ Add row", "Add row");
      add.addEventListener("click", () => void save((rows) => rows.push(rows[0].map(() => ""))), { signal });
      editor.replaceChildren(grid, add, status);
      wrapTable(table, { content: state.content }, editor);
    };
    for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend", "click", "keydown", "keyup"])
      editor.addEventListener(type, (event) => event.stopPropagation(), { signal });
    table.after(editor); table.classList.add("notes-table-source"); states.set(table, state); draw();
    wrapTable(table, block, editor);
  };
  const refresh = async () => {
    if (running || signal.aborted) return;
    running = true;
    try {
      const api = window.logseq?.api;
      if (!api?.get_block) return;
      const graph = api.get_state_from_store?.("git/current-repo");
      for (const table of wrapped) if (!table.isConnected) wrapped.delete(table);
      for (const [table, state] of states) {
        if (!table.isConnected || state.graph !== graph
          || !state.editor.isConnected) remove(table, state);
      }
      for (const table of document.querySelectorAll(".ls-block table:not(.notes-table-editor table)")) {
        if (table.closest(".notes-table-editor, .references, .custom-query")) continue;
        const host = table.closest(".ls-block[blockid]");
        if (!host || host.querySelector("textarea:not(.notes-table-cell)")) continue;
        const block = await api.get_block(host.getAttribute("blockid"));
        if (signal.aborted || graph !== api.get_state_from_store?.("git/current-repo")) return;
        if (!table.isConnected) continue;
        const state = states.get(table);
        if (state?.saving || state?.editor.contains(document.activeElement)) continue;
        wrapTable(table, block, state?.editor);
        if (!block || !truth(property(block, "table-editable")) || !parse(block.content)) {
          if (state) remove(table, state); continue;
        }
        if (state && state.content !== block.content) remove(table, state);
        if (!states.has(table)) mount(table, block, graph);
      }
    } catch (error) { console.warn("Table editor:", error); }
    finally { running = false; }
  };
  const timer = setInterval(refresh, 750);
  signal.addEventListener("abort", () => {
    clearInterval(timer);
    for (const table of wrapped) {
      table.classList.remove("notes-table-wrap", "notes-table-nowrap");
      table.style.minWidth = "";
      table.style.width = "";
      table.querySelectorAll("th, td").forEach((cell) => { cell.style.width = ""; });
    }
    wrapped.clear();
    for (const [table, state] of states) remove(table, state);
  }, { once: true });
  void refresh();
})();
