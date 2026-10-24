/* Alias lookups share the page snapshot already read by automatic Contents. */
window.notesPageAliasIndex = null;
window.notesPageSearchIndex = null;
window.notesAliasesForReference = (reference) => {
  const index = window.notesPageAliasIndex;
  const graph = window.logseq?.api?.get_state_from_store?.("git/current-repo");
  if (!index || index.graph !== graph) return [];
  let name = reference?.getAttribute("data-ref");
  if (!name) {
    const destination = reference?.getAttribute("href") ||
      reference?.querySelector("a:last-of-type")?.getAttribute("href");
    if (!destination?.includes("#/page/")) return [];
    try { name = decodeURIComponent(destination.split("#/page/")[1]); }
    catch { return []; }
  }
  return index.pages.get(name.toLowerCase()) || [];
};
window.notesMatchingAlias = (link, terms) => {
  if (!terms.length) return "";
  return window.notesAliasesForReference(link).find((alias) => {
    const text = alias.normalize("NFKC").toLocaleLowerCase().replace(/ё/g, "е");
    return terms.every((term) => text.includes(term));
  }) || "";
};

