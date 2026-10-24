const fs = require("fs"),
  vm = require("vm"),
  assert = require("assert/strict");
const { parseHTML } = require("linkedom");
const { window, document } = parseHTML(
  '<html><body><div class="page"><div class="ls-page-title"><h1><span data-ref="test">Test</span></h1></div><div class="ls-block" blockid="parent"><div class="block-content">Parent</div></div><div class="ls-block" blockid="child"><div class="block-content">Child</div><input type="checkbox"><button class="notes-tag-action">+</button><input class="notes-tag-input" type="text"><a href="#/page/test">Link</a></div><div class="ls-block" blockid="sibling"><div class="block-content">Sibling</div></div></div></body></html>',
);
let pageProps = {},
  rootValue = true,
  childValue = false,
  pre = false;
const tree = () => [
  {
    uuid: "parent",
    preBlock: pre,
    content: `read-only:: ${rootValue}`,
    children: [
      { uuid: "child", content: `read-only:: ${childValue}`, children: [] },
    ],
  },
  { uuid: "sibling", content: "Sibling", children: [] },
];
window.logseq = {
  api: {
    get_page: async () => ({ name: "test", properties: pageProps }),
    get_page_blocks_tree: async () => tree(),
    get_block: async () => ({ page: { id: 123 } }),
  },
};
let refresh;
class Observer {
  constructor() {}
  observe() {}
  disconnect() {}
}
const src = fs.readFileSync("src/js/read-only.js", "utf8");
vm.runInNewContext(src, {
  window,
  document,
  Element: window.Element,
  AbortController,
  MutationObserver: Observer,
  setTimeout: (fn) => ((refresh = fn), 1),
  clearTimeout() {},
  console,
});
const tick = () => new Promise(setImmediate);
const block = (id) => document.querySelector(`[blockid=${id}]`);
const fire = (node, type) => {
  const event = new window.Event(type, { bubbles: true, cancelable: true });
  node.dispatchEvent(event);
  return event.defaultPrevented;
};
const update = async () => {
  window.dispatchEvent(new window.Event("hashchange"));
  refresh();
  await tick();
};
(async () => {
  await tick();
  assert(
    !document.querySelector(".page").classList.contains("notes-read-only"),
  );
  assert(block("parent").classList.contains("notes-read-only"));
  assert(block("child").classList.contains("notes-read-only"));
  assert(!block("sibling").classList.contains("notes-read-only"));
  assert(fire(block("child").querySelector(".block-content"), "click"));
  assert(!fire(block("sibling").querySelector(".block-content"), "click"));
  assert(!fire(block("child").querySelector("input"), "click"));
  assert(!fire(block("child").querySelector("a"), "click"));
  assert(!fire(block("child").querySelector(".notes-tag-action"), "click"));
  assert(
    !fire(block("child").querySelector(".notes-tag-input"), "beforeinput"),
  );
  assert(!fire(block("child").querySelector(".notes-tag-input"), "paste"));
  pageProps = { "read-only": true };
  rootValue = false;
  await update();
  assert(document.querySelector(".page").classList.contains("notes-read-only"));
  assert(fire(block("sibling"), "beforeinput"));
  const query = document.createElement("div");
  query.className = "custom-query";
  query.innerHTML =
    '<div class="breadcrumb block-parents"><a><span>Hoba</span></a></div><div class="block-content">Result text</div>';
  document.querySelector(".page").append(query);
  let navigations = 0;
  query.querySelector("a").addEventListener("mouseup", () => navigations++);
  // Use a document listener like Logseq's delegated React handler: it must
  // receive the event after the reading-mode guard, including from child spans.
  let delegated = 0;
  const onMouseUp = () => delegated++;
  document.addEventListener("mouseup", onMouseUp);
  assert(!fire(query.querySelector("a span"), "mousedown"));
  assert(!fire(query.querySelector("a span"), "mouseup"));
  assert.equal(navigations, 1);
  assert.equal(delegated, 1);
  assert(!fire(query.querySelector("a span"), "click"));
  assert(fire(query.querySelector("a span"), "beforeinput"));
  assert(fire(query.querySelector("a span"), "paste"));
  assert(fire(query.querySelector("a span"), "dragstart"));
  assert(fire(query.querySelector(".block-content"), "click"));
  document.removeEventListener("mouseup", onMouseUp);
  const editor = document.createElement("div");
  editor.className = "notes-table-editor";
  editor.innerHTML = '<textarea></textarea><button>Add row</button>';
  block("child").append(editor);
  for (const type of ["click", "keydown", "beforeinput", "paste", "cut"]) {
    assert(!fire(editor.querySelector("textarea"), type), type);
  }
  assert(!fire(editor.querySelector("button"), "click"));
  assert(fire(block("child").querySelector(".block-content"), "beforeinput"));
  pageProps = {};
  childValue = true;
  await update();
  assert(!block("parent").classList.contains("notes-read-only"));
  assert(block("child").classList.contains("notes-read-only"));
  pre = true;
  rootValue = true;
  await update();
  assert(document.querySelector(".page").classList.contains("notes-read-only"));
  pre = false;
  rootValue = false;
  document.querySelector(".ls-page-title").remove();
  await update();
  assert(block("child").classList.contains("notes-read-only"));
  window.notesReadMode.abort();
  assert(!document.querySelector(".notes-read-only"));
  console.log(
    "Block read-only passed: ancestor inheritance, child false, sibling isolation, page properties, preamble, first normal block, block focus, interactive controls, cleanup.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
