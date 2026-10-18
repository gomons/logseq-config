const fs = require("fs"),
  vm = require("vm"),
  assert = require("assert/strict");
const { parseHTML } = require("linkedom");
const { window, document } = parseHTML(
  '<html><body><div id="left-container"><div id="head"><div class="l"></div><div class="r"><button>Home</button></div></div><main id="main-content-container"><div class="page"><div class="ls-page-title"><h1><span class="title" data-ref="leisure/books">Leisure/Books</span></h1></div></div></main></div></body></html>',
);
const timers = [];
window.notesFeatureEnabled = () => true;
window.logseq = {
  api: {
    get_state_from_store: () => undefined,
    datascript_query: async () => [],
  },
};
const context = {
  window,
  document,
  Node: window.Node,
  AbortController,
  MutationObserver: window.MutationObserver,
  requestAnimationFrame: () => 1,
  cancelAnimationFrame() {},
  setInterval: (fn) => (timers.push(fn), timers.length),
  clearInterval() {},
  setTimeout: () => 1,
  clearTimeout() {},
  console,
};
document.querySelector("#head").getBoundingClientRect = () => ({
  left: 0,
  right: 1000,
  width: 1000,
});
document.querySelector("#head .r").getBoundingClientRect = () => ({
  left: 250,
  right: 1000,
  width: 750,
});
document.querySelector("#head .r button").getBoundingClientRect = () => ({
  left: 800,
  right: 840,
  width: 40,
});
vm.runInNewContext(fs.readFileSync("logseq/custom.js", "utf8"), context);
for (const fn of timers) fn();
assert(document.querySelector("#head .notes-contents-shortcut"));
assert.equal(
  document.querySelector(".notes-toolbar-navigation").style.right,
  "208px",
);
assert(
  document.documentElement.classList.contains("notes-hide-unlinked-references"),
);
assert(window.notesAutomaticContents);
assert(!document.querySelector(".notes-favorites-toggle"));
assert(!document.querySelector(".notes-global-navigation"));
const path = document.querySelector(".notes-header-path");
assert.equal(path.parentElement.className, "notes-toolbar-navigation");
assert.equal(path.querySelector("a").textContent, "Leisure");
assert.equal(path.querySelectorAll(":scope > a").length, 1);
assert.equal(path.querySelector("[aria-current=page]"), null);
assert.equal(
  document.querySelector(".notes-contents-shortcut").parentElement.className,
  "notes-toolbar-actions",
);
const source = document.querySelector(".title");
source.setAttribute("data-ref", "contents");
source.textContent = "Contents";
for (const fn of timers) fn();
assert.equal(document.querySelector(".notes-contents-shortcut").hidden, true);
assert.equal(document.querySelector(".notes-header-path"), null);
source.setAttribute("data-ref", "shopping");
source.textContent = "Shopping";
for (const fn of timers) fn();
assert.equal(document.querySelector(".notes-contents-shortcut").hidden, false);
assert.equal(document.querySelector(".notes-header-path"), null);
source.setAttribute("data-ref", "leisure/games/diablo");
source.textContent = "Leisure/Games/Diablo";
document.querySelector("#head").getBoundingClientRect = () => ({
  left: 0,
  right: 360,
  width: 360,
});
const leftGroup = document.querySelector("#head .l");
leftGroup.getBoundingClientRect = () => ({ left: 0, right: 260, width: 260 });
leftGroup.innerHTML = "<button>Menu</button><button>Back</button>";
leftGroup.children[0].getBoundingClientRect = () => ({
  left: 8,
  right: 40,
  width: 32,
});
leftGroup.children[1].getBoundingClientRect = () => ({
  left: 48,
  right: 80,
  width: 32,
});
document.querySelector("#head .r button").getBoundingClientRect = () => ({
  left: 280,
  right: 320,
  width: 40,
});
for (const fn of timers) fn();
assert.equal(
  document.querySelector(".notes-toolbar-navigation").style.left,
  "88px",
);
assert.equal(
  document.querySelector(".notes-toolbar-navigation").style.right,
  "88px",
);
assert.equal(
  document.querySelector(".notes-header-path-parent").textContent,
  "Games",
);
assert.equal(
  document.querySelector(".notes-header-path-menu a").textContent,
  "Leisure",
);
console.log(
  "Full script initialized; Contents, page path and automatic sections started.",
);
