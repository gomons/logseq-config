const fs = require("fs"),
  vm = require("vm"),
  assert = require("assert");
const { parseHTML } = require("linkedom");
const { window, document } = parseHTML(
  '<html><body><div class="ls-block" blockid="b"><table><tr><td>Original</td></tr></table></div></body></html>',
);
let content =
    "table-editable:: true\n| Polish | Russian |\n| --- | --- |\n| kot | кот |",
  lock = false,
  ancestor = false,
  writes = [];
const block = () => ({ uuid: "b", content, page: { id: 1 } });
let poll;
window.logseq = {
  api: {
    get_state_from_store: () => "graph",
    get_block: async () => block(),
    get_page: async () => ({ name: "page", properties: { "read-only": lock } }),
    get_page_blocks_tree: async () => [
      {
        uuid: "parent",
        content: "read-only:: " + ancestor,
        children: [block()],
      },
    ],
    update_block: async (uuid, value) => {
      content = value;
      writes.push(value);
    },
  },
};
vm.runInNewContext(fs.readFileSync("src/js/table-editor.js", "utf8"), {
  window,
  document,
  AbortController,
  setInterval: (cb) => ((poll = cb), 1),
  clearInterval() {},
  console,
});
const tick = () => new Promise((r) => setTimeout(r, 0));
const inputs = () => [...document.querySelectorAll("tbody textarea")];
const blur = (node) => node.dispatchEvent(new window.Event("blur"));
(async () => {
  await tick();
  assert(document.querySelector(".notes-table-editor"));
  assert(!document.querySelector(".notes-table-editor button"));
  assert.equal(inputs().length, 2);
  const [a,b] = inputs();
  a.value = "kot | pies"; blur(a);
  b.value = "первая\nвторая"; blur(b);
  await tick(); await tick();
  assert(content.includes("kot \\| pies"));
  assert(content.includes("первая<br>вторая"));
  assert.equal(inputs()[0], a, "Saving retains input identity");
  a.value = "one\ntwo";
  a.dispatchEvent(new window.Event("input"));
  assert.equal(a.parentElement.querySelector(".notes-table-cell-mirror").textContent, "one\ntwo\u200b");
  const enter = (shift, touch) => {
    window.matchMedia = () => ({matches: touch});
    const e = new window.Event("keydown", {cancelable: true});
    Object.assign(e, {key: "Enter", shiftKey: shift});
    // Linkedom does not implement native blur.
    a.blur = () => {};
    a.dispatchEvent(e); return e.defaultPrevented;
  };
  assert(!enter(true, false), "Desktop Shift+Enter inserts newline");
  assert(!enter(false, true), "Touch Enter inserts newline");
  assert(enter(false, false), "Desktop Enter saves");
  content += "\nexternal:: true";
  await poll();
  assert.equal(inputs()[1].value, "первая\nвторая");
  content = content.replace("table-editable:: true", "table-editable:: false") + "\ntable-wrap:: true";
  await poll();
  assert(!document.querySelector(".notes-table-editor"));
  const native = document.querySelector("table");
  assert(!native.classList.contains("notes-table-wrap"));
  assert(!native.classList.contains("notes-table-nowrap"));
  content = content.replace("table-wrap:: true", "table-wrap:: false");
  await poll();
  assert(native.classList.contains("notes-table-nowrap"));
  content = content.replace("table-wrap:: false", "table-wrap:: true");
  await poll();
  assert(!native.classList.contains("notes-table-nowrap"));
  assert(!native.querySelector(".notes-table-actions, .notes-table-row-handle"));
  content = content.replace("table-editable:: false", "table-editable:: true");
  await poll();
  const current = inputs()[0];
  content += "\nchanged:: true";
  current.value = "must not overwrite"; blur(current);
  await tick(); await tick();
  assert(!content.includes("must not overwrite"));
  assert(document.querySelector('[role="status"]').textContent.includes("changed elsewhere"));
  window.notesTableEditor.abort();
  assert(!document.querySelector(".notes-table-editor"));
  assert(!native.classList.contains("notes-table-wrap"));
})().catch((e) => { console.error(e); process.exitCode = 1; });
