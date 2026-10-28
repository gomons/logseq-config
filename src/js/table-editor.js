/* Opt-in editing for simple Markdown tables; the block remains the source. */
(() => {
  window.notesTableEditor?.abort();
  const controller = new AbortController();
  window.notesTableEditor = controller;
  const { signal } = controller;
  const states = new Map();
  const wrapped = new Set();
  const viewWidths = new Map();
  const nativeControls = new Map();
  const widthKey = (graph, uuid) => JSON.stringify([graph, uuid]);
  const nativeLayouts = new Map();
  const applyViewWidths = (table, widths) => {
    let group = table.querySelector("colgroup.notes-view-widths");
    if (!widths) {
      if (group) group.remove();
      const original = nativeLayouts.get(table);
      if (original) {
        table.prepend(...original.groups);
        table.style.tableLayout = original.layout;
        nativeLayouts.delete(table);
      }
      return;
    }
    if (!group) {
      // Logseq already renders colgroups. Replace them temporarily, otherwise
      // the extra columns prevent the native table from resizing.
      const groups = [...table.children].filter(node => node.tagName === "COLGROUP");
      nativeLayouts.set(table, {groups, layout: table.style.tableLayout || ""});
      groups.forEach(node => node.remove());
      group = document.createElement("colgroup"); group.className = "notes-view-widths";
      table.prepend(group);
    }
    const total = widths.reduce((sum, width) => sum + width, 0);
    group.replaceChildren(...widths.map(width => {
      const col = document.createElement("col"); col.style.width = `${100 * width / total}%`; return col;
    }));
    table.style.tableLayout = "fixed";
  };
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
  const addTableControls = (editor, grid, save, state, widths, viewOnly = false) => {
    const overlay = document.createElement("div");
    overlay.className = "notes-table-drag-overlay";
    document.body.append(overlay);
    const marker = document.createElement("div");
    marker.className = "notes-table-drop-marker";
    marker.hidden = true;
    overlay.append(marker);
    let drag = null;
    const handles = [];
    const cells = () => [...(grid.querySelector("tr")?.children || [])];
    const rows = () => [...grid.querySelectorAll("tbody tr")];
    const position = () => {
      if (!editor.isConnected) return;
      const area = editor.getBoundingClientRect();
      handles.forEach(({button, element, column, deletion}) => {
        const r = element.getBoundingClientRect();
        const x = column ? r.left + r.width / 2 - 12 : deletion ? Math.min(grid.getBoundingClientRect().right, area.right) + 2 : area.left - 26;
        const y = column ? deletion ? grid.getBoundingClientRect().bottom + 2 : r.top - 25 : r.top + r.height / 2 - 12;
        button.style.left = `${x}px`; button.style.top = `${y}px`;
        button.hidden = r.bottom < 0 || r.top > window.innerHeight ||
          (column && (x < area.left || x + 24 > area.right));
      });
    };
    const show = () => { overlay.classList.add("is-visible"); position(); };
    // Include the external handles and the gap leading to them, without
    // placing an invisible element over nearby Logseq controls.
    const trackHover = (event) => {
      if (event.pointerType === "touch") return;
      const area = editor.getBoundingClientRect();
      const header = grid.getBoundingClientRect();
      const inside = event.clientX >= area.left - 30 && event.clientX <= area.right + 30 &&
        event.clientY >= Math.min(area.top, header.top - 28) && event.clientY <= Math.max(area.bottom, header.bottom + 30);
      overlay.classList.toggle("is-visible", !!drag || state.dragging || inside);
      if (inside || drag) position();
    };
    const leaveWindow = () => { if (!drag && !state.dragging) overlay.classList.remove("is-visible"); };
    editor.addEventListener("pointerenter", show);
    overlay.addEventListener("pointerenter", show);
    document.addEventListener("pointermove", trackHover);
    document.addEventListener("pointerleave", leaveWindow);
    const finish = (cancel) => {
      if (!drag) return;
      const { column, from, slot, button, moved } = drag;
      drag = null; state.dragging = false;
      button.classList.remove("is-dragging"); marker.hidden = true;
      if (cancel || !moved) return;
      const to = slot > from ? slot - 1 : slot;
      if (to === from) return;
      void save((data) => {
        const move = (items, offset = 0) => items.splice(to + offset, 0, items.splice(from + offset, 1)[0]);
        if (column) { data.forEach(row => move(row)); move(widths); }
        else move(data, 2);
      });
    };
    const makeHandle = (element, from, column) => {
      const button = document.createElement("button");
      button.type = "button"; button.textContent = column ? "⋯" : "≡";
      button.className = "notes-table-drag-handle";
      button.title = `Move ${column ? "column" : "row"} ${from + 1}`;
      button.setAttribute("aria-label", button.title);
      button.addEventListener("pointerdown", event => {
        if (event.button !== 0 || state.saving) return;
        // Commit a focused textarea before queuing the reorder.
        if (editor.contains(document.activeElement)) document.activeElement.blur();
        event.preventDefault(); event.stopPropagation();
        button.setPointerCapture?.(event.pointerId);
        drag = {column, from, slot: from, button, x: event.clientX, y: event.clientY, moved: false};
        state.dragging = true; show(); button.classList.add("is-dragging");
      });
      button.addEventListener("pointermove", event => {
        if (!drag || drag.button !== button) return;
        event.preventDefault();
        if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5 && !drag.moved) return;
        drag.moved = true;
        const items = column ? cells() : rows();
        const point = column ? event.clientX : event.clientY;
        const rects = items.map(item => item.getBoundingClientRect());
        let slot = rects.findIndex(r => point < (column ? r.left + r.width / 2 : r.top + r.height / 2));
        if (slot < 0) slot = items.length;
        drag.slot = slot;
        const r = rects[Math.min(slot, rects.length - 1)];
        const bounds = grid.getBoundingClientRect();
        const edge = slot === items.length ? (column ? r.right : r.bottom) : (column ? r.left : r.top);
        marker.hidden = false;
        marker.style.left = `${column ? edge : bounds.left}px`;
        marker.style.top = `${column ? bounds.top : edge}px`;
        marker.style.width = `${column ? 2 : bounds.width}px`;
        marker.style.height = `${column ? bounds.height : 2}px`;
        if (column) {
          const area = editor.getBoundingClientRect();
          if (event.clientX > area.right - 24) editor.scrollLeft += 12;
          else if (event.clientX < area.left + 24) editor.scrollLeft -= 12;
        }
        position();
      });
      button.addEventListener("pointerup", () => finish(false));
      button.addEventListener("pointercancel", () => finish(true));
      button.addEventListener("lostpointercapture", () => finish(true));
      button.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); });
      handles.push({button, element, column}); overlay.append(button);
    };
    const makeDelete = (element, index, column) => {
      const button = document.createElement("button");
      button.type = "button"; button.textContent = "×";
      button.className = "notes-table-drag-handle notes-table-delete";
      button.title = `Delete ${column ? "column" : "row"} ${index + 1}`;
      button.setAttribute("aria-label", button.title);
      button.disabled = column ? cells().length <= 1 : rows().length <= 1;
      button.addEventListener("pointerdown", event => {
        if (editor.contains(document.activeElement)) document.activeElement.blur();
        event.stopPropagation();
      });
      button.addEventListener("click", event => {
        event.preventDefault(); event.stopPropagation();
        if (state.saving || drag || button.disabled) return;
        void save(data => {
          if (column && data[0].length > 1) {
            data.forEach(row => row.splice(index, 1)); widths.splice(index, 1);
          } else if (!column && data.length > 3) data.splice(index + 2, 1);
        });
      });
      handles.push({button, element, column, deletion: true}); overlay.append(button);
    };
    if (!viewOnly) {
    cells().forEach((cell, i) => makeDelete(cell, i, true));
    rows().forEach((row, i) => makeDelete(row, i, false));
    cells().forEach((cell, i) => makeHandle(cell, i, true));
    rows().forEach((row, i) => makeHandle(row, i, false));
    }
    // Temporary adjacent-column resizing: no block properties or API writes.
    let resizing = null;
    const resizers = [];
    const positionResizers = () => {
      const area = editor.getBoundingClientRect();
      const headers = cells();
      resizers.forEach((button, index) => {
        const rect = headers[index].getBoundingClientRect();
        button.style.left = `${rect.right - 5}px`;
        button.style.top = `${rect.top}px`;
        button.style.height = `${rect.height}px`;
        button.hidden = rect.right < area.left || rect.right > area.right ||
          rect.bottom < 0 || rect.top > window.innerHeight;
      });
    };
    const endResize = cancel => {
      if (!resizing) return;
      const current = resizing;
      resizing = null; state.dragging = false;
      current.button.classList.remove("is-resizing");
      if (cancel) {
        current.cols.forEach((col, i) => { col.style.width = current.styles[i]; });
      } else if (current.moved) {
        widths.splice(0, widths.length, ...current.sizes);
        viewWidths.set(widthKey(state.graph, state.uuid), [...widths]);
      }
      position(); positionResizers();
    };
    if (truth(property({ content: state.content }, "table-wrap"))) {
      cells().slice(0, -1).forEach((cell, index) => {
        const button = document.createElement("button");
        button.type = "button"; button.className = "notes-table-resizer";
        button.title = `Resize columns ${index + 1} and ${index + 2}`;
        button.setAttribute("aria-label", button.title);
        button.addEventListener("pointerdown", event => {
          if (event.button !== 0 || state.saving || drag) return;
          if (editor.contains(document.activeElement)) document.activeElement.blur();
          const sizes = cells().map(item => item.getBoundingClientRect().width);
          if (viewOnly && sizes.every(size => size > 0)) applyViewWidths(grid, sizes);
          const cols = [...grid.querySelectorAll("col")];
          if (cols.length !== sizes.length || sizes.some(size => size <= 0)) return;
          event.preventDefault(); event.stopPropagation();
          button.setPointerCapture?.(event.pointerId);
          resizing = {button, cols, sizes, styles: cols.map(col => col.style.width),
            x: event.clientX, left: sizes[index], right: sizes[index + 1], index, moved: false};
          state.dragging = true; button.classList.add("is-resizing"); show();
        });
        button.addEventListener("pointermove", event => {
          if (!resizing || resizing.button !== button) return;
          event.preventDefault(); event.stopPropagation();
          const current = resizing;
          const pair = current.left + current.right;
          const minimum = Math.min(48, pair / 2);
          const left = Math.max(minimum, Math.min(pair - minimum, current.left + event.clientX - current.x));
          current.sizes[index] = left; current.sizes[index + 1] = pair - left;
          const total = current.sizes.reduce((sum, size) => sum + size, 0);
          // Set the initial measured proportions for all columns, changing only this pair.
          current.cols.forEach((col, i) => { col.style.width = `${100 * current.sizes[i] / total}%`; });
          current.moved = true;
          position(); positionResizers();
        });
        button.addEventListener("pointerup", () => endResize(false));
        button.addEventListener("pointercancel", () => endResize(true));
        button.addEventListener("lostpointercapture", () => endResize(true));
        button.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); });
        resizers.push(button); overlay.append(button);
      });
    }
    window.addEventListener("scroll", positionResizers, true);
    window.addEventListener("resize", positionResizers);
    const resizeObserver = window.ResizeObserver ? new window.ResizeObserver(positionResizers) : null;
    resizeObserver?.observe(grid);
    positionResizers();
    const escape = event => { if (event.key === "Escape") { finish(true); endResize(true); } };
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);
    const observer = window.ResizeObserver ? new window.ResizeObserver(position) : null;
    observer?.observe(grid);
    position();
    return () => {
      finish(true); endResize(true); overlay.remove(); observer?.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener("scroll", positionResizers, true);
      window.removeEventListener("resize", positionResizers);
      editor.removeEventListener("pointerenter", show);
      document.removeEventListener("pointermove", trackHover);
      document.removeEventListener("pointerleave", leaveWindow);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", position, true); window.removeEventListener("resize", position);
    };
  };
  const remove = (table, state) => {
    state.cleanupDrag?.();
    state.editor.remove(); table.classList.remove("notes-table-source"); states.delete(table);
  };
  const mount = (table, block, graph) => {
    // Capture the native layout before hiding it; textarea content must not
    // redistribute columns when editing is enabled.
    const nativeCells = [...(table.querySelector("tr")?.children || [])];
    const remembered = viewWidths.get(widthKey(graph, block.uuid));
    const measured = nativeCells.map((cell) => cell.getBoundingClientRect().width);
    const sum = measured.reduce((a, b) => a + b, 0);
    const widths = remembered?.length === measured.length
      ? remembered.map(width => width * sum / remembered.reduce((a, b) => a + b, 0)) : measured;
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
        if (viewWidths.has(widthKey(graph, state.uuid)))
          viewWidths.set(widthKey(graph, state.uuid), [...widths]);
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
      state.cleanupDrag?.();
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
      const totalWidth = widths.reduce((sum, width) => sum + width, 0);
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
      const actions = document.createElement("div");
      actions.className = "notes-table-add-actions";
      const addAction = (label, change) => {
        const button = document.createElement("button");
        button.type = "button"; button.textContent = `+ ${label}`;
        button.setAttribute("aria-label", label);
        button.addEventListener("click", event => {
          event.preventDefault(); event.stopPropagation();
          if (!state.saving) void save(change);
        }, { signal });
        actions.append(button);
      };
      addAction("Add row", rows => rows.push(rows[0].map(() => "")));
      addAction("Add column", rows => {
        rows.forEach((row, index) => row.push(index === 0 ? "Column" : index === 1 ? "---" : ""));
        widths.push(widths.length ? widths.reduce((sum, width) => sum + width, 0) / widths.length : 120);
      });
      const scroller = document.createElement("div");
      scroller.className = "notes-table-scroll";
      scroller.append(grid);
      editor.replaceChildren(scroller, actions, status);
      wrapTable(table, { content: state.content }, editor);
      state.cleanupDrag = addTableControls(scroller, grid, save, state, widths);
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
      for (const [table, item] of nativeControls) {
        if (!table.isConnected || item.state.graph !== graph) {
          item.cleanup(); applyViewWidths(table, null); nativeControls.delete(table);
        }
      }
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
        const native = nativeControls.get(table);
        if (native?.state.dragging) continue;
        if (native && (native.state.content !== block?.content || truth(property(block, "table-editable")))) {
          native.cleanup(); nativeControls.delete(table);
        }
        const state = states.get(table);
        if (state?.saving || state?.dragging || state?.editor.contains(document.activeElement)) continue;
        wrapTable(table, block, state?.editor);
        if (!block || !truth(property(block, "table-editable")) || !parse(block.content)) {
          if (state) remove(table, state);
          const saved = viewWidths.get(widthKey(graph, block?.uuid));
          const count = table.querySelector("tr")?.children.length;
          if (!nativeControls.has(table)) {
            applyViewWidths(table, truth(property(block, "table-wrap")) && saved?.length === count ? saved : null);
            if (block && truth(property(block, "table-wrap")) && parse(block.content)) {
              const nativeState = {content: block.content, graph, uuid: block.uuid};
              const sizes = [...table.querySelector("tr").children].map(cell => cell.getBoundingClientRect().width);
              nativeControls.set(table, { state: nativeState,
                cleanup: addTableControls(table.parentElement, table, null, nativeState, sizes, true) });
            }
          }
          continue;
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
    for (const [table, item] of nativeControls) { item.cleanup(); applyViewWidths(table, null); }
    nativeControls.clear(); viewWidths.clear();
    for (const table of nativeLayouts.keys()) applyViewWidths(table, null);
    for (const [table, state] of states) remove(table, state);
  }, { once: true });
  void refresh();
})();
