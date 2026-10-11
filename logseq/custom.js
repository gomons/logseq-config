/* Global feature flags come from the current graph's config.edn. */
window.notesFeatureEnabled = (key) => {
  const api = window.logseq?.api;
  const graph = api?.get_state_from_store?.("git/current-repo");
  if (!graph) return true;
  // Read the value directly: Logseq normalizes keyword names in returned maps.
  return api.get_state_from_store(["config", `@${graph}`, key]) !== false;
};

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

