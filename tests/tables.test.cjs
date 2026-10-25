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
  let [a, b] = inputs();
  a.value = "kot | pies";
  blur(a);
  b.value = "кот и пёс";
  blur(b);
  await tick();
  await tick();
  assert(content.includes("kot \\| pies"));
  assert(content.includes("кот и пёс"));
  assert.equal(writes.length, 2);
  assert.equal(inputs()[0], a);
  assert.equal(inputs()[1], b);
  assert(!b.disabled);
  assert(!document.querySelector('[aria-label="Save cell"]'));
  document.querySelector('[aria-label="Add row"]').click();
  await tick();
  assert.equal(document.querySelectorAll("tbody tr").length, 2);
  document.querySelector('[aria-label="Delete row"]').click();
  await tick();
  assert.equal(document.querySelectorAll("tbody tr").length, 1);
  // The editor's own textareas must not suppress refresh from source changes.
  content =
    "table-editable:: true\n| Polish | Russian |\n| --- | --- |\n| external | внешний |";
  await poll();
  assert.equal(inputs()[0].value, "external");
  assert.equal(writes.length, 4, "Refreshing never writes note content");
  const nativeEditor = document.createElement("textarea");
  document.querySelector(".ls-block").append(nativeEditor);
  content = content.replace("external", "after native edit");
  await poll();
  assert.equal(
    inputs()[0].value,
    "external",
    "Native block editor pauses refresh",
  );
  nativeEditor.remove();
  await poll();
  assert.equal(inputs()[0].value, "after native edit");
  for (const mode of ["page", "ancestor"]) {
    lock = mode === "page";
    ancestor = mode === "ancestor";
    let input = inputs()[0];
    document.querySelector(".ls-block").classList.add("notes-read-only");
    await poll();
    assert(document.querySelector(".notes-table-editor"));
    input.value = mode;
    let n = writes.length;
    blur(input);
    await tick();
    assert.equal(writes.length, n + 1);
    assert(content.includes(mode));
  }
  content = content.replace("table-editable:: true", "table-editable:: false");
  const n = writes.length;
  inputs()[0].value = "disabled";
  blur(inputs()[0]);
  await tick();
  assert.equal(writes.length, n, "Removing opt-in prevents saves");
  await poll();
  assert(!document.querySelector(".notes-table-editor"));
  content = content.replace("table-editable:: false", "table-wrap:: true");
  await poll();
  const nativeTable = document.querySelector(".ls-block > table");
  assert(nativeTable.classList.contains("notes-table-wrap"));
  assert(nativeTable.style.width, "Wrap mode sizes the whole table from content");
  assert(!document.querySelector(".notes-table-editor"));
  content = content.replace("table-wrap:: true", "table-wrap:: false") + "\ntable-editable:: true";
  await poll();
  assert(nativeTable.classList.contains("notes-table-nowrap"));
  assert.equal(inputs()[0].getAttribute("wrap"), "off");
  content = content.replace("table-wrap:: false", "table-wrap:: true");
  await poll();
  assert.equal(inputs()[0].getAttribute("wrap"), "soft");
  content = content.replace("table-wrap:: true\n", "");
  await poll();
  assert(!nativeTable.classList.contains("notes-table-wrap"));
  const before = document.querySelector(".notes-table-editor table").getAttribute("style");
  const cell = inputs()[0];
  cell.style.height = "123px";
  await poll();
  await poll();
  assert.equal(cell.style.height, "123px", "Unchanged polls must not reset cell geometry");
  assert.equal(document.querySelector(".notes-table-editor table").getAttribute("style"), before);
  window.innerWidth = 500;
  content = "table-editable:: true\ntable-wrap:: true\n| Place | From | To | Notes |\n| --- | --- | --- | --- |\n| A fairly long destination name | 26.02.22 | 30.04.22 | A very long note that should wrap instead of splitting the dates |";
  await poll();
  const fittedGrid = document.querySelector(".notes-table-editor table");
  assert.equal(parseFloat(fittedGrid.style.width), 500);
  const headers = [...fittedGrid.querySelectorAll("th")];
  assert.equal(headers.length, 4, "Editing must not add a layout column");
  const pixels = (cell) => parseFloat(cell.style.width) * 5;
  // The DOM fixture measures text at 8 px per character, plus 32 px padding.
  assert(Math.abs(pixels(headers[1]) - 96) < 0.01, "Keep the full date width");
  assert(Math.abs(pixels(headers[2]) - 96) < 0.01, "Keep both date columns intact");
  assert(pixels(headers[3]) < 300, "Long notes absorb the width reduction");
  content = content.replace("table-wrap:: true", "table-wrap:: false");
  await poll();
  assert(parseFloat(document.querySelector(".notes-table-editor table").style.width) > 500,
    "False keeps content width even when it exceeds the viewport");
  assert.equal(inputs()[0].getAttribute("wrap"), "off");
  window.notesTableEditor.abort();
  assert(!document.querySelector(".notes-table-editor"));
  assert(!document.querySelector(".notes-table-source"));
  console.log(
    "Table editor: blur saves, rapid cell switches queue both changes, inputs retain identity, escaping, row actions, read-only override and opt-in removal passed.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
