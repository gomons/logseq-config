/* Global feature flags come from the current graph's config.edn. */
window.notesFeatureEnabled = (key) => {
  const api = window.logseq?.api;
  const graph = api?.get_state_from_store?.("git/current-repo");
  if (!graph) return true;
  // Read the value directly: Logseq normalizes keyword names in returned maps.
  const path = ["config", `@${graph}`];
  if (key === "notes/contents-shortcut?") {
    const platform = window.Capacitor?.getPlatform?.();
    const navigator = window.navigator;
    const mobile = platform === "ios" || platform === "android" ||
      /Android|iPhone|iPad|iPod/i.test(navigator?.userAgent || "") ||
      (navigator?.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const override = api.get_state_from_store([
      ...path, mobile ? "notes/mobile" : "notes/desktop", key.slice(6),
    ]);
    if (typeof override === "boolean") return override;
  }
  return api.get_state_from_store([...path, key]) !== false;
};

