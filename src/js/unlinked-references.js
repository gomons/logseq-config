/* Hide Unlinked References only when enabled in config.edn. */
(() => {
  window.notesUnlinkedReferences?.abort();
  const controller = new AbortController();
  window.notesUnlinkedReferences = controller;
  const refresh = () => document.documentElement.classList.toggle(
    "notes-hide-unlinked-references",
    window.notesFeatureEnabled("notes/hide-unlinked-references?"),
  );
  const timer = setInterval(refresh, 1000);
  window.addEventListener("hashchange", refresh, { signal: controller.signal });
  controller.signal.addEventListener("abort", () => {
    clearInterval(timer);
    document.documentElement.classList.remove("notes-hide-unlinked-references");
  }, { once: true });
  refresh();
})();

