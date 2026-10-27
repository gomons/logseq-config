/* Opt-in editing for simple Markdown tables; the block remains the source. */
(() => {
  window.notesTableEditor?.abort();
  const controller = new AbortController();
  window.notesTableEditor = controller;
  const { signal } = controller;
  const states = new Map();
  const wrapped = new Set();
  const wrapTable = (table, block, editor) => {
    const value = property(block, "table-wrap");
    const mode = value == null ? null : truth(value);
    for (const node of [table, editor].filter(Boolean)) {
      node.classList.remove("notes-table-wrap");
      node.classList.toggle("notes-table-nowrap", mode === false);
    }
    if (mode === false) wrapped.add(table);
    else wrapped.delete(table);
    editor?.querySelectorAll("textarea").forEach((input) => {
      input.setAttribute("wrap", mode === false ? "off" : "soft");
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
  const decodeCell = (text) => {
    const paragraph = text.match(/^<p>([\s\S]*)<\/p>$/i);
    const value = (paragraph ? paragraph[1] : text).replace(/<br\s*\/?>/gi, "\n");
    // Only decode entities in our HTML paragraph format, not ordinary Markdown.
    return paragraph ? value.replace(/&(amp|lt|gt|quot|#39);/g,
      (_, key) => ({ amp: "&", lt: "<", gt: ">", quot: '\"', "#39": "'" })[key]) : value;
  };
  const encodeCell = (value) => value.includes("\n")
    ? `<p>${value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>` : value;
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
    // Capture the native layout before hiding it; textarea content must not
    // redistribute columns when editing is enabled.
    const nativeCells = [...(table.querySelector("tr")?.children || [])];
    const widths = nativeCells.map((cell) => cell.getBoundingClientRect().width);
    const totalWidth = widths.reduce((sum, width) => sum + width, 0);
    const editor = document.createElement("div");
    editor.className = "notes-table-editor";
    const status = document.createElement("span"); status.setAttribute("role", "status");
    const state = { editor, status, content: block.content, uuid: block.uuid, graph, saving: false };
    const save = (change, redraw = true) => {
      state.queue = (state.queue || Promise.resolve()).then(() => persist(change, redraw));
      return state.queue;
    };
    const persist = async (change, redraw) => {
      state.saving = true; status.textContent = "Saving…";
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
          const frame = document.createElement("span");
          frame.className = "notes-table-cell-frame";
          const mirror = document.createElement("span");
          mirror.className = "notes-table-cell-mirror";
          mirror.setAttribute("aria-hidden", "true");
          const resize = () => { mirror.textContent = input.value + "\u200b"; };
          input.addEventListener("input", resize, { signal });
          input.value = decodeCell(text);
          input.setAttribute("aria-label", `${parsed.rows[0][column]}, row ${rowIndex || "header"}`);
          input.setAttribute("enterkeyhint", "enter");
          resize();
          let committed = input.value;
          input.addEventListener("blur", async () => {
            const value = input.value.replace(/\r\n?/g, "\n");
            if (value === committed) return;
            if (await save((rows) => { rows[rowIndex][column] = encodeCell(value); }, false)) committed = value;
          }, { signal });
          input.addEventListener("keydown", (event) => {
            if (event.isComposing) return;
            if (event.key === "Escape") {
              event.preventDefault(); input.value = committed; resize(); input.blur();
            } else if (event.key === "Enter" && !event.shiftKey && !window.matchMedia?.("(pointer: coarse)").matches) {
              event.preventDefault(); input.blur();
            }
          }, { signal });
          const alignment = parsed.rows[1][column];
          if (alignment.endsWith(":")) cell.style.textAlign = alignment.startsWith(":") ? "center" : "right";
          frame.append(mirror, input); cell.append(frame); tr.append(cell);
        });
        (rowIndex ? body : head).append(tr);
      });
      if (totalWidth > 0 && widths.length === parsed.rows[0].length) {
        const columns = document.createElement("colgroup");
        widths.forEach((width) => {
          const col = document.createElement("col");
          col.style.width = `${100 * width / totalWidth}%`;
          columns.append(col);
        });
        grid.style.tableLayout = "fixed";
        if (property({ content: state.content }, "table-wrap") === "false")
          grid.style.width = `${totalWidth}px`;
        grid.append(columns);
      }
      grid.append(head, body);
      editor.replaceChildren(grid, status);
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
      table.querySelectorAll(".notes-table-actions, .notes-table-row-handle").forEach((cell) => cell.remove());
      table.classList.remove("notes-table-wrap", "notes-table-nowrap", "notes-table-layout");
      table.style.minWidth = "";
      table.style.width = "";
      table.querySelectorAll("th, td").forEach((cell) => { cell.style.width = ""; });
    }
    wrapped.clear();
    for (const [table, state] of states) remove(table, state);
  }, { once: true });
  void refresh();
})();
