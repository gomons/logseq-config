const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { parseHTML } = require("linkedom");
const { window, document } = parseHTML(`<html><body><div class="page">
<div class="ls-page-title" data-ref="test">Test</div>
<div class="references page-tags"><div class="content"><div class="foldable-title"><span>Tagged pages</span><button>Filter</button></div></div><div class="initial">Pages</div></div>
</div></body></html>`);
const saved = new Map();
const observers = [];
const frames = [];
const context = {
  window,
  document,
  AbortController,
  Node: window.Node,
  localStorage: {
    getItem: (key) => saved.get(key),
    setItem: (key, value) => saved.set(key, value),
  },
  MutationObserver: class {
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe(target, options) {
      this.target = target;
      this.options = options;
    }
    disconnect() {
      this.target = null;
    }
  },
  requestAnimationFrame: (callback) => (frames.push(callback), frames.length),
  cancelAnimationFrame() {},
  console,
};
window.logseq = { api: { get_state_from_store: () => "graph" } };
const nav = fs.readFileSync("src/js/navigation.js", "utf8");
const folds = fs.readFileSync("src/js/folds.js", "utf8");
vm.runInNewContext(nav, context);
vm.runInNewContext(folds, context);
while (frames.length) frames.shift()();
const title = document.querySelector(".foldable-title");
const content = title.parentElement.nextElementSibling;
const click = (target) =>
  target.dispatchEvent(
    new window.Event("click", { bubbles: true, cancelable: true }),
  );
click(title.querySelector("button"));
assert(
  !content.classList.contains("hidden"),
  "Interactive controls do not fold",
);
click(title.querySelector("span"));
assert(
  content.classList.contains("hidden"),
  "Touch-style click folds without an arrow",
);
assert.equal(title.getAttribute("aria-expanded"), "false");
for (const observer of observers)
  if (observer.target === content) observer.callback([]);
assert.equal(
  JSON.parse(saved.get("notes.navigation-folds.v2"))['["graph","test","tags"]'],
  true,
);
click(title);
assert(!content.classList.contains("hidden"), "A second tap expands");
window.notesNavigationFolds.abort();
// Simulate remount/reload: restore the saved mobile fold through the same module.
vm.runInNewContext(folds, context);
while (frames.length) frames.shift()();
assert(content.classList.contains("hidden"), "Saved mobile fold is restored");
window.notesNavigationFolds.abort();
// Desktop keeps using Logseq's native arrow, and native title handlers are untouched.
const arrow = document.createElement("a");
arrow.className = "block-control";
title.append(arrow);
let nativeFolds = 0;
arrow.addEventListener("mousedown", () => nativeFolds++);
context.MouseEvent = window.Event;
click(title);
assert.equal(nativeFolds, 1);
title.classList.add("cursor");
click(title);
assert.equal(nativeFolds, 1, "Do not toggle native title handlers twice");
window.notesPageNavigation.abort();
