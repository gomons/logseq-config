/* Boolean property checkboxes preserve native property labels and values. */
(() => {
  window.notesBooleanProperties?.abort();
  const controller = new AbortController();
  window.notesBooleanProperties = controller;
  const { signal } = controller;
  const controls = new Map();
  const saving = new Set();
  let timer = null;
  const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const valueOf = (element) => {
    const copy = element.cloneNode(true);
    copy.querySelectorAll(".notes-property-toggle").forEach((button) => button.remove());
    return copy.textContent.trim().toLowerCase();
  };
  const paint = (state) => {
    state.button.checked = state.value === "true";
    state.button.classList.toggle("checked", state.button.checked);
    state.button.setAttribute("aria-label", `Toggle ${state.key}`);
    state.button.disabled = saving.has(`${state.uuid}:${state.key}`);
  };
  const change = async (state) => {
    const id = `${state.uuid}:${state.key}`;
    if (saving.has(id)) return;
    saving.add(id);
    for (const item of controls.values()) paint(item);
    try {
      const api = window.logseq.api;
      const block = await api.get_block(state.uuid);
      if (signal.aborted) return;
      // Use the latest stored content, preserving all other properties and text.
      const pattern = new RegExp(`^([ \\t]*${escape(state.key)}::[ \\t]*)(true|false)([ \\t]*)(?=\\r?$)`, "im");
      if (!pattern.test(block?.content || "")) return;
      const content = block.content.replace(pattern,
        (_, prefix, value, suffix) => prefix + (value.toLowerCase() === "true" ? "false" : "true") + suffix);
      await api.update_block(state.uuid, content);
    } catch (error) {
      state.button.title = "Could not update property";
      console.warn("Boolean property:", error);
    } finally {
      saving.delete(id);
      for (const item of controls.values()) paint(item);
      schedule();
    }
  };
  const refresh = () => {
    timer = null;
    if (signal.aborted) return;
    observer.disconnect();
    try {
      for (const [element, state] of controls) {
        if (!element.isConnected || !state.button.isConnected) {
          state.button.remove();
          controls.delete(element);
        }
      }
      for (const element of document.querySelectorAll(".block-properties .page-property-value")) {
        const value = valueOf(element);
        const host = element.closest(".ls-block[blockid]");
        const keyElement = element.parentElement.querySelector(".page-property-key");
        const key = (keyElement?.getAttribute("data-ref") ||
          keyElement?.querySelector("[data-ref]")?.getAttribute("data-ref") ||
          keyElement?.textContent.replace(/:\s*$/, "").trim() || "").toLowerCase();
        const uuid = host?.getAttribute("blockid");
        const existing = controls.get(element);
        if (!uuid || ["tags", "alias", "aliases"].includes(key) || !/^[\w-]+$/.test(key) || !["true", "false"].includes(value) || host.querySelector("textarea")) {
          existing?.button.remove();
          controls.delete(element);
          continue;
        }
        let state = existing;
        if (state && (state.uuid !== uuid || state.key !== key)) {
          state.button.remove();
          controls.delete(element);
          state = null;
        }
        if (!state) {
          const button = document.createElement("input");
          button.type = "checkbox";
          button.className = "notes-property-toggle form-checkbox h-4 w-4 transition duration-150 ease-in-out cursor";
          state = { button, uuid, key, value };
          controls.set(element, state);
          for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup",
            "touchstart", "touchmove", "touchend", "touchcancel", "click", "keydown", "keyup"])
            button.addEventListener(type, (event) => event.stopPropagation(), { signal });
          button.addEventListener("change", () => void change(state), { signal });
          element.append(button);
        }
        state.value = value;
        paint(state);
      }
    } finally {
      if (!signal.aborted) observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
  };
  const schedule = () => {
    if (signal.aborted || timer !== null) return;
    timer = setTimeout(refresh, 50);
  };
  const observer = new MutationObserver((changes) => {
    if (changes.some(({ target, addedNodes, removedNodes }) => {
      const element = target.nodeType === 1 ? target : target.parentElement;
      if (element?.closest(".notes-property-toggle")) return false;
      return element?.closest(".block-properties, .ls-block") ||
        [...addedNodes, ...removedNodes].some((node) => node.nodeType === 1 &&
          (node.matches(".ls-block, .block-properties") || node.querySelector(".block-properties")));
    })) schedule();
  });
  signal.addEventListener("abort", () => {
    observer.disconnect();
    clearTimeout(timer);
    for (const state of controls.values()) state.button.remove();
    controls.clear();
  }, { once: true });
  refresh();
})();

