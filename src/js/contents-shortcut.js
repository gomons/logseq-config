/* Keep the Contents shortcut above the page in the native toolbar. */
(() => {
  window.notesGlobalNavigation?.abort();
  const controller = new AbortController();
  window.notesGlobalNavigation = controller;
  const { signal } = controller;
  let contentsLink = null;
  let toolbarIcons = null;
  let actions = null;
  const renderToolbar = (header) => {
    if (!header) { toolbarIcons?.remove(); actions?.remove(); return; }
    if (!toolbarIcons) {
      toolbarIcons = document.createElement("div");
      toolbarIcons.className = "notes-toolbar-navigation";
      for (const type of ["pointerdown", "mousedown", "touchstart", "click", "dblclick"])
        toolbarIcons.addEventListener(type, (event) => event.stopPropagation(), { signal });
      for (const [label, drawing] of [
        ["New page", '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M12 11v6M9 14h6"/>'],
        ["Global search", '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>'],
      ]) {
        const button = document.createElement("button");
        button.type = "button"; button.className = "button icon";
        button.title = label; button.setAttribute("aria-label", label);
        button.innerHTML = `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${drawing}</svg>`;
        button.addEventListener("click", async () => {
          const api = window.logseq?.api;
          if (label === "Global search") { api?.invoke_external_command?.("logseq.go/search"); return; }
          if (button.disabled) return;
          button.disabled = true;
          try {
            if (!api?.get_page || !api?.create_page) throw new Error("Page creation is unavailable");
            const graph = api.get_state_from_store?.("git/current-repo");
            let name = "Page", number = 2;
            while (await api.get_page(name)) name = `Page ${number++}`;
            if (signal.aborted || graph !== api.get_state_from_store?.("git/current-repo")) return;
            await api.create_page(name, {}, {redirect: true, createFirstBlock: true});
          } catch (error) { console.error("New page:", error); }
          finally { button.disabled = false; }
        }, {signal});
        toolbarIcons.append(button);
      }
      contentsLink = document.createElement("a");
      contentsLink.className = "notes-contents-shortcut button icon";
      contentsLink.href = "#/page/contents";
      contentsLink.title = "Open Contents";
      contentsLink.setAttribute("aria-label", "Open Contents");
      contentsLink.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M13 5h8M13 9h5M13 15h8M13 19h5"/><rect x="3" y="4" width="6" height="6" rx="1"/><rect x="3" y="14" width="6" height="6" rx="1"/></svg>';
      actions = document.createElement("div");
      actions.className = "notes-toolbar-actions";
      actions.append(contentsLink);
    }
    if (toolbarIcons.parentElement !== header) header.append(toolbarIcons);
    const rightGroup = header.querySelector(".r");
    if (rightGroup) {
      const home = rightGroup.querySelector("button:has(.ti-home), button:has(.tabler-icon-home), button:has(.icon-tabler-home), button.inline.mx-1");
      let homeSlot = home;
      while (homeSlot && homeSlot.parentElement !== rightGroup) homeSlot = homeSlot.parentElement;
      const position = homeSlot ? homeSlot.nextSibling : rightGroup.firstChild;
      if (position !== actions) rightGroup.insertBefore(actions, position);
    }
    const title = document.querySelector("#main-content-container .ls-page-title");
    const pageName = title?.getAttribute("data-ref") ||
      title?.querySelector("[data-ref]")?.getAttribute("data-ref") || "";
    contentsLink.hidden = pageName.toLowerCase() === "contents" ||
      !window.notesFeatureEnabled("notes/contents-shortcut?");
    toolbarIcons.hidden = false;
    const bounds = header.getBoundingClientRect();
    const content = document.querySelector("#main-content-container")?.getBoundingClientRect();
    // Native header groups reserve extra space on mobile; use visible controls.
    const leftControls = [...header.querySelectorAll(".l button, .l a.button")]
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0);
    const controlsRight = Math.max(bounds.left, ...leftControls.map((rect) => rect.right));
    const left = `${Math.max(content?.left ?? bounds.left, controlsRight) - bounds.left + 8}px`;
    if (toolbarIcons.style.left !== left) toolbarIcons.style.left = left;
    // The native right container fills all free space; measure its controls.
    const navigation = [...header.querySelector(".r")?.children || []]
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0)
      .sort((a, b) => a.left - b.left)[0];
    const right = `${Math.max(8, bounds.right - (navigation?.left || bounds.right) + 8)}px`;
    if (toolbarIcons.style.right !== right) toolbarIcons.style.right = right;
    // Mobile headers include top safe-area padding; follow the actual icon row.
    const icon = [...header.querySelectorAll(".r .button.icon")]
      .map((element) => element.getBoundingClientRect())
      .find((rect) => rect.width > 0 && rect.height > 0);
    const top = icon ? `${icon.top + icon.height / 2 - bounds.top}px` : "50%";
    if (toolbarIcons.style.top !== top) toolbarIcons.style.top = top;
    const nativeDrawings = {
      "arrow-left": '<path d="M19 12H5m7-7-7 7 7 7"/>',
      "arrow-right": '<path d="M5 12h14m-7-7 7 7-7 7"/>',
      "layout-sidebar-right": '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/>',
      "home": '<path d="m3 10 9-7 9 7v11h-6v-7H9v7H3z"/>',
      "dots": '<circle cx="4" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="20" cy="12" r="1"/>',
    };
    for (const [name, drawing] of Object.entries(nativeDrawings)) {
      for (const icon of header.querySelectorAll(`.button.icon .ti-${name}`)) {
        if (icon.dataset.notesReplaced) continue;
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("fill", "none"); svg.setAttribute("stroke", "currentColor");
        svg.setAttribute("stroke-width", "1.8"); svg.setAttribute("stroke-linecap", "round");
        svg.setAttribute("stroke-linejoin", "round"); svg.innerHTML = drawing;
        icon.style.display = "none"; icon.dataset.notesReplaced = "true"; icon.after(svg);
      }
    }
    const nativeButtons = [
      [header.querySelector(".toggle-right-sidebar"), "layout-sidebar-right"],
      [header.querySelector(".ls-icon-home, .ti-home, .tabler-icon-home")?.closest("button"), "home"],
      [header.querySelector(".nav-left"), "arrow-left"],
      [header.querySelector(".nav-right"), "arrow-right"],
    ];
    for (const [button, name] of nativeButtons) {
      if (!button || button.querySelector(":scope > .notes-native-drawing")) continue;
      button.classList.add("notes-normalized-button");
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.classList.add("notes-native-drawing");
      svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("fill", "none"); svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "1.8");
      svg.setAttribute("stroke-linecap", "round"); svg.setAttribute("stroke-linejoin", "round");
      svg.innerHTML = nativeDrawings[name]; button.append(svg);
    }
    // Normalize the visible drawing, not its differently padded SVG viewBox.
    for (const svg of header.querySelectorAll(".button.icon svg, .notes-normalized-button > svg")) {
      if (svg.dataset.notesIconAligned) continue;
      try {
        const box = svg.getBBox();
        if (!box.width || !box.height) continue;
        const stroke = Number(svg.getAttribute("stroke-width")) || 2;
        const padding = stroke / 2;
        const width = box.width + stroke, height = box.height + stroke;
        svg.setAttribute("viewBox", `${box.x-padding} ${box.y-padding} ${width} ${height}`);
        // Wide punctuation (the More menu) stays compact rather than enlarging its dots.
        const size = Math.min(20, 26 * height / width);
        svg.style.setProperty("height", `${size}px`, "important");
        svg.style.setProperty("width", `${size * width / height}px`, "important");
        svg.style.setProperty("transform", "none", "important");
        // Keep the final stroke thickness identical despite different SVG scales.
        svg.style.setProperty("stroke-width", `${1.8 * height / size}px`, "important");
        svg.dataset.notesIconAligned = "true";
      } catch (_) { /* Hidden SVGs are measured on the next render. */ }
    }
    window.notesUpdateParentPath?.();
  };
  const render = () => {
    if (signal.aborted) return;
    renderToolbar(document.querySelector("#head"));
  };
  const observer = new MutationObserver((changes) => {
    if (changes.some(({ target, addedNodes, removedNodes }) => {
      const element = target.nodeType === 1 ? target : target.parentElement;
      if (element?.closest(".notes-toolbar-navigation")) return false;
      return element?.closest("#head, .ls-page-title") ||
        [...addedNodes, ...removedNodes].some((node) => node.nodeType === 1 &&
          (node.matches("#head, .ls-page-title") || node.querySelector("#head, .ls-page-title")));
    })) render();
  });
  observer.observe(document.body, {
    childList: true, subtree: true, attributes: true, attributeFilter: ["data-ref"],
  });
  const timer = setInterval(render, 1000);
  window.addEventListener("hashchange", render, { signal });
  window.addEventListener("resize", render, { signal });
  signal.addEventListener("abort", () => {
    observer.disconnect();
    clearInterval(timer);
    toolbarIcons?.remove();
    actions?.remove();
  }, { once: true });
  render();
})();

