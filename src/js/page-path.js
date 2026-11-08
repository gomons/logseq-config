/* In-content page and block breadcrumbs. Bounded refresh avoids observer feedback. */
(() => {
  window.notesPageHeadings?.abort();
  const controller = new AbortController();
  window.notesPageHeadings = controller;
  const { signal } = controller;
  const selector = ".ls-page-title h1";
  let frame = null;
  const render = () => {
    frame = null;

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
    updateBlockPaths();

  };
  const createPathLink = (parts, names, index) => {
    const link = document.createElement("a");
    link.className = "notes-header-path-segment";
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
    const toolbar = document.querySelector("#main-content-container .ls-page-title");
    const source = document.querySelector("#main-content-container .ls-page-title .title[data-ref]");
    const path = source?.getAttribute("data-ref") || "";
    const old = document.querySelector(".notes-header-path");
    if (!toolbar || !path) {
      old?.remove();
      return;
    }
    const label = source.textContent.trim();
    const signature = JSON.stringify([path, label]);
    if (old?.dataset.signature === signature && old.nextElementSibling === toolbar) return;
    old?.remove();
    const parts = path.split("/");
    const labels = label.split("/");
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
      if (index === parts.length - 1) link.setAttribute("aria-current", "page");
      else if (index === parts.length - 2) link.classList.add("notes-header-path-parent");
      breadcrumb.append(link);
    });
    toolbar.before(breadcrumb);
  };
  const updateBlockPaths = () => {
    for (const trail of document.querySelectorAll("#main-content-container .breadcrumb.block-parents")) {
      if (trail.closest(".references, .custom-query")) continue;
      if (!trail.classList.contains("notes-block-path")) trail.classList.add("notes-block-path");
      const source = [...trail.querySelectorAll("a")].find(link => !link.closest(".notes-block-page-path"));
      if (!source || source.closest(".notes-block-page-path")) continue;
      const path = source.getAttribute("data-ref") || source.textContent.trim();
      if (!path.includes("/")) continue;
      const old = trail.querySelector(".notes-block-page-path");
      if (old?.dataset.path === path) continue;
      old?.remove();
      const span = document.createElement("span");
      span.className = "notes-block-page-path";
      span.dataset.path = path;
      const parts = path.split("/");
      parts.forEach((_, i) => {
        if (i) span.append(createPathSeparator());
        span.append(createPathLink(parts, parts, i));
      });
      source.before(span);
      source.classList.add("notes-block-path-source");
    }
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
  // Other customizations also observe titles and breadcrumbs. Do not react to
  // their DOM writes with another MutationObserver: a bounded poll is enough.
  const timer = setInterval(render, 500);
  window.addEventListener("hashchange", render, { signal });
  signal.addEventListener("abort", () => {
    clearInterval(timer);

    if (frame !== null) cancelAnimationFrame(frame);
    if (window.notesUpdateParentPath === updateParentPath) delete window.notesUpdateParentPath;
    document.querySelector(".notes-header-path")?.remove();
    document.querySelectorAll(".notes-block-page-path").forEach(node => node.remove());
    document.querySelectorAll(".notes-block-path-source").forEach(node => node.classList.remove("notes-block-path-source"));
    document.querySelectorAll(".notes-block-path").forEach(node => node.classList.remove("notes-block-path"));
    document.querySelectorAll(".notes-namespace-title").forEach((title) => title.remove());
    document.querySelectorAll(".notes-has-namespace-title").forEach((heading) =>
      heading.classList.remove("notes-has-namespace-title"));
  }, { once: true });
  render();
})();

