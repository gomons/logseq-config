const fs = require("fs"),
  vm = require("vm"),
  assert = require("assert/strict");
const { parseHTML } = require("linkedom");
const { window, document } = parseHTML(
  '<html><body><ul class="notes-catalog"><li class="notes-catalog-item" id="book"><a class="notes-catalog-field" href="#/page/books%2Fit">It</a><span class="notes-catalog-field"><span class="page-ref" data-ref="people/stephen king">Stephen King</span></span><span class="notes-catalog-field" hidden><a href="#/page/publishers/secret">Hidden publisher</a></span></li><li class="notes-catalog-item" id="game"><span class="notes-catalog-field">Game</span><a class="notes-catalog-field" href="#/page/companies%2Fblizzard">Blizzard Entertainment</a></li></ul></body></html>',
);
const context = {
  window,
  document,
  Node: window.Node,
  AbortController,
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  requestAnimationFrame: () => 1,
  cancelAnimationFrame() {},
  console,
};
window.logseq = { api: { get_state_from_store: () => "g" } };
vm.runInNewContext(fs.readFileSync("src/js/aliases.js", "utf8"), context);
window.notesPageAliasIndex = {
  graph: "g",
  pages: new Map([
    ["people/stephen king", ["Король ужасов", "Richard Bachman"]],
    ["companies/blizzard", ["Blizz"]],
    ["publishers/secret", ["Invisible alias"]],
    ["books/it", ["Оно"]],
  ]),
};
vm.runInNewContext(
  fs.readFileSync("src/js/catalog-search.js", "utf8"),
  context,
);
const input = document.querySelector("input");
const search = (q) => {
  input.value = q;
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  return [
    ...document.querySelectorAll(
      ".notes-catalog-item:not(.notes-catalog-search-hidden)",
    ),
  ].map((n) => n.id);
};
assert.deepEqual(search("король"), ["book"]);
assert.deepEqual(search("it bachman"), ["book"]);
assert.deepEqual(search("blizz"), ["game"]);
assert.deepEqual(search("ОНО"), ["book"]);
assert.deepEqual(search("Invisible alias"), []);
assert.deepEqual(search("no match"), []);
assert(!document.querySelector(".notes-search-alias"));
assert.deepEqual(search(""), ["book", "game"]);
window.notesContentsSearch.abort();
console.log(
  "Catalog linked-alias search passed: native page refs, direct field links, mixed terms, case/Cyrillic, hidden fields excluded, display unchanged.",
);
