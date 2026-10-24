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
    toolbarIcons.hidden = !pageName.includes("/");
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

