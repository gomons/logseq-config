const fs = require("fs"),
  vm = require("vm"),
  assert = require("assert/strict");
const { parseHTML } = require("linkedom");
const { window, document } = parseHTML(
  '<html><body><div class="page"><div class="ls-page-title"><span class="title" data-ref="root">Root</span></div><div class="ls-block" blockid="auto"><div class="block-content"></div></div><div class="page-hierarchy"><div><div class="foldable-title"><h2>Subpages</h2></div></div><ul class="namespaces"><li><span data-ref="root/books">Root/Books</span></li></ul></div></div></body></html>',
);
const moduleSource = (name) => fs.readFileSync(`src/js/${name}.js`, "utf8");
let aliases = ["Reading List", "Книги"];
const pages = () => [
  [
    {
      "block/name": "root",
      "block/original-name": "Root",
      "block/tags": [{ "block/name": "contents" }],
    },
  ],
  [
    {
      "block/file": { "file/path": "pages/file1.md" },
      "block/name": "root/books",
      "block/original-name": "Root/Books",
      "block/namespace": { "block/name": "root" },
      "block/alias": aliases.map((name) => ({
        "block/name": name.toLowerCase(),
        "block/original-name": name,
      })),
    },
  ],
  [
    {
      "block/file": { "file/path": "pages/file2.md" },
      "block/name": "people",
      "block/original-name": "People",
      "block/alias": [{ "block/name": "люди", "block/original-name": "Люди" }],
    },
  ],
  [
    {
      "block/file": { "file/path": "pages/hidden.md" },
      "block/name": "unlisted/hidden page",
      "block/original-name": "Unlisted/Hidden Page",
    },
  ],
  [
    {
      "block/name": "fake alias",
      "block/original-name": "Fake Alias",
      "block/alias": [{ "block/name": "root/books" }],
    },
  ],
  [
    {
      "block/file": { "file/path": "pages/file3.md" },
      "block/name": "real alias page",
      "block/original-name": "Real Alias Page",
      "block/alias": [{ "block/name": "other" }],
    },
  ],
];
window.logseq = {
  api: {
    get_state_from_store: () => "g",
    datascript_query: async (q) =>
      q.includes(":block/uuid")
        ? [[{ uuid: "auto", content: "auto-contents:: true" }]]
        : pages(),
  },
};
let poll;
const frames = [];
class Observer {
  constructor() {}
  observe() {}
  disconnect() {}
}
const context = {
  window,
  document,
  Node: window.Node,
  AbortController,
  MutationObserver: Observer,
  requestAnimationFrame: (fn) => (frames.push(fn), frames.length),
  cancelAnimationFrame() {},
  setInterval: (fn) => ((poll = fn), 1),
  clearInterval() {},
  setTimeout,
  clearTimeout,
  console,
};
const evaluate = (s) => vm.runInNewContext(s, context);
const tick = () => new Promise(setImmediate);
const flush = () => {
  while (frames.length) frames.shift()();
};
const type = (input, text) => {
  input.value = text;
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
};
(async () => {
  evaluate(moduleSource("aliases"));
  evaluate(moduleSource("contents"));
  await tick();
  evaluate(moduleSource("navigation"));
  evaluate(moduleSource("catalog-search"));
  flush();
  let input = document.querySelector('[aria-label="Search all pages"]');
  assert(
    !document.querySelector(
      '.notes-contents-tree a[href="#/page/fake%20alias"]',
    ),
  );
  assert(
    document.querySelector(
      '.notes-contents-tree a[href="#/page/real%20alias%20page"]',
    ),
  );
  type(input, "fake alias");
  assert.equal(
    document.querySelectorAll(".notes-contents-search-results li").length,
    0,
  );
  type(input, "Люди");
  assert.equal(
    document
      .querySelector(".notes-contents-search-results a:last-of-type")
      .getAttribute("href"),
    "#/page/people",
  );
  assert.equal(document.querySelectorAll(".notes-search-alias").length, 0);
  assert(
    document.querySelector('.notes-contents-tree a[href="#/page/people"]'),
  );
  type(input, "unlisted");
  assert.equal(
    document.querySelectorAll(".notes-contents-search-results li").length,
    0,
  );
  type(input, "hidden");
  assert.equal(
    document
      .querySelector(".notes-contents-search-results a:last-of-type")
      .getAttribute("href"),
    "#/page/unlisted%2Fhidden%20page",
  );
  type(input, "");
  assert(
    !document
      .querySelector(".notes-contents-tree")
      .classList.contains("notes-contents-search-hidden"),
  );
  type(input, "reading");
  let result = document.querySelector(".notes-contents-search-results li");
  assert(result);
  assert.equal(document.querySelectorAll(".notes-search-alias").length, 0);
  assert.equal(
    result.querySelector("a:last-of-type").getAttribute("href"),
    "#/page/root%2Fbooks",
  );
  type(input, "Books");
  assert.equal(document.querySelectorAll(".notes-search-alias").length, 0);
  type(input, "книги");
  assert.equal(document.querySelectorAll(".notes-search-alias").length, 0);
  const native = document.querySelector(
    ".page-hierarchy .notes-page-list-filter",
  );
  type(native, "reading");
  const row = document.querySelector(".notes-navigation-row");
  assert(!row.classList.contains("notes-page-filter-hidden"));
  assert.equal(document.querySelectorAll(".notes-search-alias").length, 0);
  type(native, "missing");
  assert(row.classList.contains("notes-page-filter-hidden"));
  assert.equal(document.querySelectorAll(".notes-search-alias").length, 0);
  type(input, "");
  assert(!document.querySelector(".notes-contents-search-results li"));
  aliases = ["Library"];
  await poll();
  await new Promise((r) => setTimeout(r, 200));
  flush();
  input = document.querySelector('[aria-label="Search all pages"]');
  type(input, "library");
  assert.equal(document.querySelectorAll(".notes-search-alias").length, 0);
  window.notesContentsSearch.abort();
  window.notesPageNavigation.abort();
  window.notesAutomaticContents.abort();
  console.log(
    "Alias search passed: Contents/Subpages, actual destination, case/Cyrillic, no alias captions, no-match/clear, live updates.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
  window.notesAutomaticContents?.abort();
  window.notesContentsSearch?.abort();
  window.notesPageNavigation?.abort();
});
