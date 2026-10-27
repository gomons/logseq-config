const fs = require("fs"),
  vm = require("vm"),
  assert = require("assert");
const { parseHTML } = require("linkedom");
const { window, document } = parseHTML(
  '<html><body><div class="ls-block" blockid="b"><table><tr><td>Polish</td><td>Russian</td></tr></table></div></body></html>',
);
document.querySelectorAll("td").forEach((cell, i) => {
  cell.getBoundingClientRect = () => ({width: [180, 420][i]});
});
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
  assert.deepEqual([...document.querySelectorAll("col")].map(c => c.style.width), ["30%", "70%"]);
  assert.equal(document.querySelector(".notes-table-editor table").style.tableLayout, "fixed");
  const [a,b] = inputs();
  a.value = "kot | pies"; blur(a);
  b.value = "первая\nвторая"; blur(b);
  await tick(); await tick();
  assert(content.includes("kot \\| pies"));
  assert(content.includes("<p>первая<br>вторая</p>"));
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
  const multiline = inputs()[1];
  multiline.value = "<literal> & text\n123\n\nlast | line";
  blur(multiline); await tick(); await tick();
  assert(content.includes("<p>&lt;literal&gt; &amp; text<br>123<br><br>last \\| line</p>"));
  content += "\nrefresh:: true"; await poll();
  assert.equal(inputs()[1].value, "<literal> & text\n123\n\nlast | line");
  const current = inputs()[0];
  content += "\nchanged:: true";
  current.value = "must not overwrite"; blur(current);
  await tick(); await tick();
  assert(!content.includes("must not overwrite"));
  assert(document.querySelector('[role="status"]').textContent.includes("changed elsewhere"));
  // Reordering moves the separator/alignment with a column, and only body rows.
  content = "table-editable:: true\n| A | B |\n| :--- | ---: |\n| first | one |\n| second | two |";
  await poll();
  const pointer = (button, type, x, y) => {
    const event = new window.Event(type, {cancelable: true});
    Object.assign(event, {button: 0, pointerId: 1, clientX: x, clientY: y});
    button.dispatchEvent(event);
  };
  document.querySelectorAll(".notes-table-editor th").forEach((cell, i) => {
    cell.getBoundingClientRect = () => ({left:i*100, right:(i+1)*100, top:0, bottom:40, width:100,height:40});
  });
  const editor = document.querySelector(".notes-table-editor");
  editor.getBoundingClientRect = () => ({left:100,right:300,top:100,bottom:300});
  const overlay = document.querySelector(".notes-table-drag-overlay");
  pointer(document, "pointermove", 85, 160);
  assert(overlay.classList.contains("is-visible"), "External handle gutter stays visible");
  pointer(document, "pointermove", 50, 160);
  assert(!overlay.classList.contains("is-visible"), "Leaving the whole region hides handles");
  let handle = document.querySelector('[aria-label="Move column 1"]');
  pointer(handle, "pointerdown", 50, 0); pointer(handle, "pointermove", 190, 0); pointer(handle, "pointerup", 190, 0);
  await tick(); await tick();
  assert(content.includes("| B | A |\n| ---: | :--- |\n| one | first |"));
  document.querySelectorAll(".notes-table-editor tbody tr").forEach((row, i) => {
    row.getBoundingClientRect = () => ({left:0,right:200,top:40+i*40,bottom:80+i*40,width:200,height:40});
  });
  handle = document.querySelector('[aria-label="Move row 1"]');
  pointer(handle,"pointerdown",0,60); pointer(handle,"pointermove",0,119); pointer(handle,"pointerup",0,119);
  await tick(); await tick();
  assert(content.includes("| two | second |\n| one | first |"));
  const beforeCancel = content;
  handle = document.querySelector('[aria-label="Move row 1"]');
  pointer(handle,"pointerdown",0,60); pointer(handle,"pointermove",0,119); pointer(handle,"pointercancel",0,119);
  await tick(); assert.equal(content,beforeCancel);
  window.notesTableEditor.abort();
  assert(!document.querySelector(".notes-table-editor"));
  assert(!document.querySelector(".notes-table-drag-overlay"));
  assert(!native.classList.contains("notes-table-wrap"));
})().catch((e) => { console.error(e); process.exitCode = 1; });
