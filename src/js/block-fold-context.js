/* Logseq 0.10.x checks the last editor's ref? flag when folding normal blocks.
   A closed reference editor can leave that flag behind and make folding a no-op. */
(() => {
  window.notesBlockFoldContext?.abort();
  const controller = new AbortController();
  window.notesBlockFoldContext = controller;
  document.addEventListener("click", (event) => {
    if (event.button != null && event.button !== 0) return;
    const control = event.target.closest?.(".block-control");
    const block = control?.closest(".ls-block[blockid]");
    if (!block || control.matches(".notes-catalog-fold")) return;
    // References, query results and transclusions have their own local fold state.
    // The source query block's arrow is outside its .custom-query child.
    if (control.closest('.references, .custom-query, .block-ref, .embed-block, '
      + '[data-query="true"], [data-transclude="true"], [data-embed="true"]')) return;
    const api = window.logseq?.api;
    if (!api?.get_state_from_store || !api?.set_state_from_store) return;
    // Never discard the context of an editor that is still active.
    if (api.get_state_from_store("editor/editing?")) return;
    const args = api.get_state_from_store("editor/args");
    if (Array.isArray(args) && args.at(-1)?.["ref?"] === true)
      api.set_state_from_store("editor/args", null);
    // Let the native click handler perform and persist the actual fold.
  }, { capture: true, signal: controller.signal });
})();
