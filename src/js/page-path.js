/* Show leaf page titles and clickable parent namespaces beside Contents. */
(() => {
  window.notesPageHeadings?.abort();
  const controller = new AbortController();
  window.notesPageHeadings = controller;
  const { signal } = controller;
  const selector = ".ls-page-title h1";
  let frame = null;
  const render = () => {
    frame = null;
    observer.disconnect();
    document.querySelectorAll(selector).forEach((heading) => {
      const original = heading.querySelector(".title[data-ref]");
      const previous = heading.querySelector(".notes-namespace-title");
      const path = original?.getAttribute("data-ref") || "";
      const label = original?.textContent.trim() || "";
      const signature = JSON.stringify([path, label]);
      if (!original || !path.includes("/") || heading.querySelector("input, textarea")) {
        previous?.remove();
        heading.classList.remove("notes-has-namespace-title");
        return;
      }
      if (previous?.dataset.signature === signature) return;
      previous?.remove();
      const title = document.createElement("span");
      title.className = "notes-namespace-title";
      title.dataset.signature = signature;
      const parts = path.split("/");
      const labels = label.split("/");
      const names = labels.length === parts.length ? labels : parts;
      const leaf = document.createElement("span");
      leaf.className = "notes-namespace-current";
      leaf.textContent = names.at(-1);
      leaf.title = "Rename page";
      title.append(leaf);
      original.insertAdjacentElement("afterend", title);
      heading.classList.add("notes-has-namespace-title");
    });
    updateParentPath();
    if (!signal.aborted) observer.observe(document.body, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ["data-ref"],
    });
  };
  const createPathLink = (parts, names, index) => {
    const link = document.createElement("a");
    link.textContent = names[index];
    link.href = "#/page/" + encodeURIComponent(parts.slice(0, index + 1).join("/"));
    link.title = names.slice(0, index + 1).join(" / ");
    return link;
  };
  const createPathSeparator = () => {
    const separator = document.createElement("span");
    separator.className = "notes-header-path-separator";
    separator.textContent = "/";
    separator.setAttribute("aria-hidden", "true");
    return separator;
  };
  const createPathDisclosure = (parts, names) => {
    const disclosure = document.createElement("details");
    disclosure.className = "notes-header-path-overflow";
    const summary = document.createElement("summary");
    summary.textContent = "… /";
    summary.setAttribute("aria-label", "Show parent path");
    const menu = document.createElement("div");
    menu.className = "notes-header-path-menu";
    parts.forEach((_, index) => {
      if (index) {
        menu.append(createPathSeparator());
      }
      const link = createPathLink(parts, names, index);
      link.addEventListener("click", () => { disclosure.open = false; }, { signal });
      menu.append(link);
    });
    disclosure.append(summary, menu);
    disclosure.addEventListener("toggle", () => {
      if (disclosure.open)
        menu.style.top = `${summary.getBoundingClientRect().bottom + 8}px`;
    }, { signal });
    return disclosure;
  };
  const updateParentPath = () => {
    const toolbar = document.querySelector(".notes-toolbar-navigation");
    const source = document.querySelector("#main-content-container .ls-page-title .title[data-ref]");
    const path = source?.getAttribute("data-ref") || "";
    const old = document.querySelector(".notes-header-path");
    if (!toolbar || !path.includes("/")) {
      old?.remove();
      return;
    }
    const label = source.textContent.trim();
    const signature = JSON.stringify([path, label]);
    if (old?.dataset.signature === signature && old.parentElement === toolbar) return;
    old?.remove();
    const parts = path.split("/").slice(0, -1);
    const labels = label.split("/").slice(0, -1);
    const names = labels.length === parts.length ? labels : parts;
    const breadcrumb = document.createElement("nav");
    breadcrumb.className = "notes-header-path";
    breadcrumb.dataset.signature = signature;
    breadcrumb.setAttribute("aria-label", "Page path");
    if (parts.length > 1)
      breadcrumb.append(createPathDisclosure(parts.slice(0, -1), names.slice(0, -1)));
    parts.forEach((_, index) => {
      if (index) {
        const separator = createPathSeparator();
        breadcrumb.append(separator);
      }
      const link = createPathLink(parts, names, index);
      link.className = "notes-header-path-segment";
      if (index === parts.length - 1) link.classList.add("notes-header-path-parent");
      breadcrumb.append(link);
    });
    toolbar.append(breadcrumb);
  };
  window.notesUpdateParentPath = updateParentPath;
  document.addEventListener("pointerdown", (event) => {
    const disclosure = document.querySelector(".notes-header-path-overflow[open]");
    if (disclosure && !disclosure.contains(event.target)) disclosure.open = false;
  }, { signal, capture: true });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const disclosure = document.querySelector(".notes-header-path-overflow[open]");
    if (disclosure) {
      disclosure.open = false;
      disclosure.querySelector("summary").focus();
    }
  }, { signal });
  const observer = new MutationObserver((changes) => {
    if (changes.some((change) => {
      const target = change.target.nodeType === Node.ELEMENT_NODE ? change.target : change.target.parentElement;
      return target?.closest(selector) || [...change.addedNodes, ...change.removedNodes].some((node) =>
        node.nodeType === Node.ELEMENT_NODE && (node.matches(selector + ", #head") || node.querySelector(selector + ", #head")));
    }) && frame === null) frame = requestAnimationFrame(render);
  });
  signal.addEventListener("abort", () => {
    observer.disconnect();
    if (frame !== null) cancelAnimationFrame(frame);
    if (window.notesUpdateParentPath === updateParentPath) delete window.notesUpdateParentPath;
    document.querySelector(".notes-header-path")?.remove();
    document.querySelectorAll(".notes-namespace-title").forEach((title) => title.remove());
    document.querySelectorAll(".notes-has-namespace-title").forEach((heading) =>
      heading.classList.remove("notes-has-namespace-title"));
  }, { once: true });
  render();
})();

