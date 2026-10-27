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
    const managed = mode != null || property(block, "table-editable") != null;
    table.classList.toggle("notes-table-layout", managed);
    for (const row of table.querySelectorAll("tr")) {
      const dragCell = row.querySelector(".notes-table-row-handle");
      if (managed && !dragCell) {
        const cell = document.createElement(row.firstElementChild?.tagName === "TH" ? "th" : "td");
        cell.className = "notes-table-row-handle";
        cell.setAttribute("aria-hidden", "true");
        row.prepend(cell);
      } else if (!managed) dragCell?.remove();
      const action = row.querySelector(".notes-table-actions");
      if (managed && !action) {
        const cell = document.createElement(row.firstElementChild?.tagName === "TH" ? "th" : "td");
        cell.className = "notes-table-actions";
        cell.setAttribute("aria-hidden", "true");
        row.append(cell);
      } else if (!managed) action?.remove();
    }
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
      const widths = [], headerWidths = [];
      const measure = document.createElement("span");
      measure.style.cssText = "position:absolute;visibility:hidden;white-space:pre;pointer-events:none";
      document.body.append(measure);
      try {
        for (const row of rows.filter((row) => !row.closest("tfoot"))) [...row.children].forEach((cell, column) => {
          const input = cell.querySelector("textarea");
          const style = window.getComputedStyle?.(input || cell);
          if (style) measure.style.font = style.font;
          measure.textContent = input ? input.value : cell.textContent;
          const textWidth = measure.getBoundingClientRect?.().width || measure.textContent.length * 8;
          const width = cell.matches(".notes-table-actions, .notes-table-row-handle") ? 40 : Math.max(1, Math.ceil(textWidth)) + (cell.tagName === "TH" ? 40 : 32);
          widths[column] = Math.max(widths[column] || 0, width);
          if (cell.tagName === "TH") headerWidths[column] = width;
        });
        const total = widths.reduce((sum, width) => sum + width, 0);
        const available = (editor || table.parentElement)?.clientWidth || window.innerWidth || total;
        const minimum = headerWidths.reduce((sum, width) => sum + width, 0);
        const fitted = mode === true ? Math.min(total, available) : total;
        target.style.minWidth = mode === true ? "0" : `${minimum}px`;
        // Shrink the widest columns first, preserving compact dates and numbers.
        let fittedWidths = widths;
        if (fitted < total) {
          const contentWidths = widths.slice(1, -1);
          const budget = Math.max(0, fitted - 80);
          // Reserve the complete header plus its handle for the whole column.
          const floors = contentWidths.map((_, i) => headerWidths[i + 1] || 0);
          const floorTotal = floors.reduce((sum, width) => sum + width, 0);
          if (floorTotal > budget) floors.forEach((width, i) => { floors[i] = width * budget / floorTotal; });
          const fit = (size, i, cap) => Math.max(floors[i], Math.min(size, cap));
          let low = 0, high = Math.max(...contentWidths);
          for (let i = 0; i < 40; i++) {
            const cap = (low + high) / 2;
            if (contentWidths.reduce((sum, size, i) => sum + fit(size, i, cap), 0) > budget) high = cap;
            else low = cap;
          }
          fittedWidths = [40, ...contentWidths.map((size, i) => fit(size, i, low)), 40];
        }
        for (const row of rows) [...row.children].forEach((cell, column) => {
          cell.style.width = `${fittedWidths[column] / fitted * 100}%`;
        });
        target.style.width = `${fitted}px`;
      } finally { measure.remove(); }
    }
    if (managed) wrapped.add(table);
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
    let drag = null;
    const finishDrag = (commit = false) => {
      if (!drag) return;
      const { kind, from, to, handle, pointerId, moved } = drag;
      drag = null; state.dragging = false;
      handle.releasePointerCapture?.(pointerId);
      editor.classList.remove("notes-table-dragging");
      editor.querySelectorAll(".notes-table-drop").forEach((node) => node.classList.remove("notes-table-drop"));
      if (commit && moved && to !== from) void save((rows) => {
        const move = (items) => items.splice(to, 0, items.splice(from, 1)[0]);
        if (kind === "column") rows.forEach(move);
        else move(rows);
      });
    };
    const grip = (kind, index) => {
      const handle = button("≡", `Move ${kind} ${kind === "row" ? index - 1 : index + 1}`);
      handle.className = `notes-table-grip notes-table-grip-${kind}`;
      handle.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || state.saving || drag) return;
        // Commit the active cell before queuing a structural change.
        const active = document.activeElement;
        if (active?.tagName === "TEXTAREA" && editor.contains(active)) active.blur();
        event.preventDefault();
        drag = { kind, from: index, to: index, handle, pointerId: event.pointerId,
          x: event.clientX, y: event.clientY, moved: false };
        state.dragging = true;
        handle.setPointerCapture?.(event.pointerId);
      }, { signal });
      handle.addEventListener("pointermove", (event) => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return;
        drag.moved = true; event.preventDefault();
        editor.classList.add("notes-table-dragging");
        const bounds = editor.getBoundingClientRect();
        if (kind === "column") {
          if (event.clientX > bounds.right - 32) editor.scrollLeft += 24;
          else if (event.clientX < bounds.left + 32) editor.scrollLeft -= 24;
        }
        const hit = document.elementFromPoint(event.clientX, event.clientY);
        const target = hit?.closest(kind === "row" ? "tr[data-row]" : "[data-column]");
        editor.querySelectorAll(".notes-table-drop").forEach((node) => node.classList.remove("notes-table-drop"));
        drag.to = drag.from;
        if (!target || !editor.contains(target)) return;
        const value = Number(target.getAttribute(`data-${kind}`));
        if (kind === "row" && value < 2) return;
        drag.to = value;
        const targets = kind === "row" ? [target] : editor.querySelectorAll(`[data-column="${value}"]`);
        targets.forEach((node) => node.classList.add("notes-table-drop"));
      }, { signal });
      handle.addEventListener("pointerup", (event) => {
        if (drag?.pointerId === event.pointerId) finishDrag(true);
      }, { signal });
      for (const type of ["pointercancel", "lostpointercapture"])
        handle.addEventListener(type, () => finishDrag(), { signal });
      return handle;
    };
    editor.addEventListener("keydown", (event) => {
      if (event.key === "Escape") finishDrag();
    }, { signal });
    signal.addEventListener("abort", () => finishDrag(), { once: true });
    const draw = () => {
      const parsed = parse(state.content);
      if (!parsed) { remove(table, state); return; }
      const grid = document.createElement("table");
      const head = document.createElement("thead"), body = document.createElement("tbody");
      parsed.rows.forEach((row, rowIndex) => {
        if (rowIndex === 1) return;
        const tr = document.createElement("tr");
        tr.setAttribute("data-row", rowIndex);
        const dragCell = document.createElement(rowIndex ? "td" : "th");
        dragCell.className = "notes-table-row-handle";
        if (rowIndex) dragCell.append(grip("row", rowIndex));
        tr.append(dragCell);
        row.forEach((text, column) => {
          const cell = document.createElement(rowIndex ? "td" : "th");
          const input = document.createElement("textarea");
          input.rows = 1;
          input.className = "notes-table-cell";
          const resize = () => {
            resizeCell(input);
          };
          input.addEventListener("input", resize, { signal });
          input.value = text.replace(/<br\s*\/?>/gi, "\n");
          input.setAttribute("aria-label", `${parsed.rows[0][column]}, row ${rowIndex || "header"}`);
          input.setAttribute("enterkeyhint", "done");
          let committed = input.value;
          input.addEventListener("blur", async () => {
            const value = input.value.replace(/\r\n?/g, "\n");
            if (value === committed) return;
            if (await save((rows) => { rows[rowIndex][column] = value.replace(/\n/g, "<br>"); }, false)) committed = value;
          }, { signal });
          input.addEventListener("keydown", (event) => {
            if (event.isComposing) return;
            if (event.key === "Escape") {
              event.preventDefault(); input.value = committed; resize(); input.blur();
            } else if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault(); input.blur();
            }
          }, { signal });
          cell.setAttribute("data-column", column);
          cell.append(input);
          if (!rowIndex) cell.append(grip("column", column));
          tr.append(cell);
        });
        const action = document.createElement(rowIndex ? "td" : "th");
        action.className = "notes-table-actions";
        if (rowIndex) {
          const minus = button("−", "Delete row");
          minus.addEventListener("click", () => void save((rows) => rows.splice(rowIndex, 1)), { signal });
          minus.classList.add("notes-table-delete");
          action.append(minus);
        }
        tr.append(action);
        (rowIndex ? body : head).append(tr);
      });
      grid.append(head, body);
      const foot = document.createElement("tfoot");
      const footer = document.createElement("tr");
      const left = document.createElement("td"); left.className = "notes-table-row-handle";
      footer.append(left);
      parsed.rows[0].forEach((_, column) => {
        const cell = document.createElement("td");
        if (parsed.rows[0].length > 1) {
          const minus = button("−", `Delete column ${column + 1}`);
          minus.addEventListener("click", () => void save((rows) => {
            if (rows[0].length > 1) rows.forEach((row) => row.splice(column, 1));
          }), { signal });
          cell.append(minus);
        }
        for (const source of grid.querySelectorAll(`[data-column="${column}"]`)) {
          for (const [event, className, enabled] of [
            ["pointerenter", "notes-column-hover", true],
            ["pointerleave", "notes-column-hover", false],
            ["focusin", "notes-column-focus", true],
            ["focusout", "notes-column-focus", false],
          ]) source.addEventListener(event, () => cell.classList.toggle(className, enabled), { signal });
        }
        footer.append(cell);
      });
      const right = document.createElement("td"); right.className = "notes-table-actions";
      footer.append(right); foot.append(footer);
      grid.append(foot);
      const add = button("+ Add row", "Add row");
      add.addEventListener("click", () => void save((rows) => rows.push(rows[0].map(() => ""))), { signal });
      const addColumn = button("+ Add column", "Add column");
      addColumn.addEventListener("click", () => void save((rows) => {
        rows.forEach((row, index) => row.push(index === 0 ? "Column" : index === 1 ? "---" : ""));
      }), { signal });
      editor.replaceChildren(grid, add, addColumn, status);
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
        if (state?.saving || state?.dragging || state?.editor.contains(document.activeElement)) continue;
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
