/* Render CHECK tasks with native TODO/DONE controls and styling. */
(() => {
  window.notesCheckTasks?.abort();
  const controller = new AbortController();
  window.notesCheckTasks = controller;
  const { signal } = controller;
  const prefix = /^(CHECKED|CHECK)(?=\s|$)/i;
  const storedPrefix = /^((?:[ \t]*[\w-]+::[^\n]*\n)*[ \t]*)(CHECKED|CHECK)(?=\s|$)/i;
  const nativeClass = { CHECK: "todo", CHECKED: "done" };
  const controls = new Map();
  const pending = new Set();
  const saving = new Set();
  let frame = null;
  let readyTimer = null;

  const changeStatus = async (uuid, requested) => {
    if (saving.has(uuid)) return;
    saving.add(uuid);
    try {
      const api = window.logseq.api;
      const block = await api.get_block(uuid);
      const match = block?.content?.match(storedPrefix);
      if (!match || signal.aborted) return;
      await api.update_block(uuid, block.content.replace(storedPrefix,
        (_, properties) => properties + requested));
    } catch (error) {
      console.warn("CHECK task:", error);
    } finally {
      saving.delete(uuid);
      schedule();
    }
  };

  const mount = async (content) => {
    if (!content.isConnected || content.querySelector(".notes-check-controls")) return;
    const host = content.closest(".ls-block[blockid]");
    const uuid = host?.getAttribute("blockid");
    if (!uuid || host.querySelector("textarea:not(.notes-table-cell)")) return;
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    let text;
    while ((text = walker.nextNode()) && !text.textContent.trim()) {}
    if (!text || text.parentElement.closest("a, pre, code, .block-properties")) return;
    const match = text.textContent.match(prefix);
    if (!match || pending.has(content)) return;
    pending.add(content);
    try {
      // Check the stored prefix so quoted text and nested blocks aren't tasks.
      const block = await window.logseq.api.get_block(uuid);
      if (signal.aborted || !text.isConnected ||
          text.textContent.match(prefix)?.[1] !== match[1] ||
          block?.content?.match(storedPrefix)?.[2] !== match[1]) return;
      const status = match[1].toUpperCase();
      const title = text.parentElement.closest(".inline, h1, h2, h3, h4, h5, h6");
      if (!title || title.closest(".ls-block") !== host) return;
      const control = document.createElement("span");
      control.className = "notes-check-controls";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "form-checkbox h-4 w-4 transition duration-150 ease-in-out mr-1 cursor" +
        (status === "CHECKED" ? " checked" : "");
      checkbox.style.marginRight = "5px";
      checkbox.checked = status === "CHECKED";
      checkbox.setAttribute("aria-label", checkbox.checked ? "Reset CHECK task" : "Complete CHECK task");
      control.append(checkbox);
      // Stop the entire gesture: Logseq handles touchend as a block tap.
      for (const type of [
        "pointerdown", "pointerup", "mousedown", "mouseup",
        "touchstart", "touchmove", "touchend", "touchcancel", "click", "keydown",
      ])
        control.addEventListener(type, (event) => event.stopPropagation(), { signal });
      checkbox.addEventListener("change", () => {
        const requested = checkbox.checked ? "CHECKED" : "CHECK";
        // Keep the displayed state consistent until Logseq renders the saved block.
        checkbox.checked = status === "CHECKED";
        void changeStatus(uuid, requested);
      }, { signal });
      const original = text.textContent;
      text.textContent = original.replace(prefix, "").replace(/^\s/, "");
      text.before(control);
      const className = nativeClass[status];
      const addedClass = !title.classList.contains(className);
      title.classList.add(className);
      controls.set(control, { text, original, title, className, addedClass });
    } catch (error) {
      console.warn("CHECK task rendering:", error);
    } finally {
      pending.delete(content);
    }
  };
  // Query tables expose cell text but no stable block identity. Render status
  // only here; never update a block by matching potentially duplicate text.
  const renderTableStatuses = () => {
    for (const table of document.querySelectorAll(".custom-query .query-table table")) {
      const headers = [...table.querySelectorAll("thead th")];
      const index = headers.findIndex(cell => cell.textContent.trim() === "block");
      if (index < 0) continue;
      for (const row of table.querySelectorAll("tbody tr")) {
        const cell = row.children[index];
        if (!cell || cell.querySelector(".notes-check-controls")) continue;
        const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
        let text;
        while ((text = walker.nextNode()) && !text.textContent.trim()) {}
        const match = text?.textContent.match(prefix);
        if (!match || text.parentElement.closest("a, pre, code")) continue;
        const status = match[1].toUpperCase();
        const control = document.createElement("span");
        control.className = "notes-check-controls notes-check-table-status";
        control.setAttribute("role", "img");
        control.setAttribute("aria-label", status === "CHECKED" ? "Checked" : "Unchecked");
        control.title = "Checklist status — switch to list view to change";
        const box = document.createElement("input");
        box.type = "checkbox";
        box.disabled = true;
        box.checked = status === "CHECKED";
        box.setAttribute("aria-hidden", "true");
        control.append(box);
        const original = text.textContent;
        text.textContent = original.replace(prefix, "").replace(/^\s/, "");
        text.before(control);
        const className = nativeClass[status];
        const addedClass = !cell.classList.contains(className);
        cell.classList.add(className);
        controls.set(control, { text, original, title: cell, className, addedClass });
      }
    }
  };
  const refresh = () => {
    frame = null;
    if (signal.aborted) return;
    if (!window.logseq?.api?.get_block) {
      readyTimer = setTimeout(schedule, 250);
      return;
    }
    for (const [control, state] of controls) {
      // React can update the task text while retaining our inserted control.
      // Rebuild it when native rendering restores the marker or replaces text.
      if (!control.isConnected || !state.text.isConnected ||
          !control.querySelector('input[type="checkbox"]') ||
          prefix.test(state.text.textContent)) {
        control.remove();
        if (state.addedClass) state.title.classList.remove(state.className);
        controls.delete(control);
      }
    }
    renderTableStatuses();
    document.querySelectorAll(".ls-block[blockid] .block-content")
      .forEach((content) => void mount(content));
  };
  const schedule = () => {
    if (!signal.aborted && frame === null) frame = requestAnimationFrame(refresh);
  };
  const observer = new MutationObserver((changes) => {
    if (changes.some(({ target, addedNodes }) => {
      const element = target.nodeType === 1 ? target : target.parentElement;
      if (element?.closest(".notes-check-controls")) return false;
      return element?.closest(".ls-block, .query-table") || [...addedNodes].some((node) =>
        node.nodeType === 1 && (node.matches(".ls-block, .query-table") || node.querySelector(".ls-block, .query-table")));
    })) schedule();
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  signal.addEventListener("abort", () => {
    observer.disconnect();
    if (frame !== null) cancelAnimationFrame(frame);
    clearTimeout(readyTimer);
    controls.forEach(({ text, original, title, className, addedClass }, control) => {
      if (control.isConnected) {
        text.textContent = original;
        control.remove();
      }
      if (addedClass) title.classList.remove(className);
    });
    controls.clear();
  }, { once: true });
  refresh();
})();

