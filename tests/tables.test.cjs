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
  assert(nativeTable.classList.contains("notes-table-layout"), "View mode reserves the action gutter too");
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
  assert.equal(headers.length, 6, "Reserve a separate action column");
  assert(document.querySelector('[aria-label="Delete row"]').parentElement.classList.contains("notes-table-actions"));
  assert(document.querySelector('[aria-label="Move row 1"]').parentElement.classList.contains("notes-table-row-handle"));
  assert(nativeTable.querySelector("tr").firstElementChild.classList.contains("notes-table-row-handle"));
  const pixels = (cell) => parseFloat(cell.style.width) * 5;
  // The DOM fixture measures text at 8 px per character, plus 32 px padding.
  assert(Math.abs(pixels(headers[2]) - 96) < 0.01, "Keep the full date width");
  assert(Math.abs(pixels(headers[3]) - 96) < 0.01, "Keep both date columns intact");
  assert(pixels(headers[4]) < 300, "Long notes absorb the width reduction");
  assert(pixels(headers[1]) >= 96, "Reserve complete header and grip width for the entire column");
  content = content.replace("table-wrap:: true", "table-wrap:: false");
  await poll();
  assert(parseFloat(document.querySelector(".notes-table-editor table").style.width) > 500,
    "False keeps content width even when it exceeds the viewport");
  assert.equal(inputs()[0].getAttribute("wrap"), "off");
  content = "table-editable:: true\n| A | B |\n| :--- | ---: |\n| x | y |\n| u | v |";
  await poll();
  const pointer = (node, type, extra = {}) => {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { button: 0, pointerId: 1, clientX: 100, clientY: 100 }, extra);
    node.dispatchEvent(event);
  };
  const dragTo = async (handleSelector, targetSelector, cancel = false) => {
    const editor = document.querySelector(".notes-table-editor");
    editor.getBoundingClientRect = () => ({ left: 0, right: 500 });
    const handle = editor.querySelector(handleSelector);
    document.elementFromPoint = () => editor.querySelector(targetSelector);
    pointer(handle, "pointerdown");
    pointer(handle, "pointermove", { clientX: 150 });
    pointer(handle, cancel ? "pointercancel" : "pointerup", { clientX: 150 });
    await tick(); await tick();
  };
  await dragTo('[aria-label="Move column 1"]', 'th[data-column="1"]');
  assert(content.includes("| B | A |\n| ---: | :--- |\n| y | x |"), "Drag moves header, alignment and all column values");
  await dragTo('[aria-label="Move row 1"]', 'tr[data-row="3"]');
  assert(content.includes("| v | u |\n| y | x |"), "Drag moves the complete row");
  const beforeCancel = content, beforeWrites = writes.length;
  await dragTo('[aria-label="Move row 1"]', 'tr[data-row="3"]', true);
  assert.equal(content, beforeCancel);
  assert.equal(writes.length, beforeWrites, "Cancelled gesture does not save");
  content = "table-editable:: true\ntable-wrap:: true\n| Название | Количество | Примечание |\n| --- | --- | --- |\n| Яблоки | 3 | Текст |";
  window.innerWidth = 200;
  await poll();
  const narrowGrid = document.querySelector(".notes-table-editor table");
  assert.equal(parseFloat(narrowGrid.style.width), 200, "Wrap fits the viewport even when headers are wider");
  assert.equal(parseFloat(narrowGrid.style.minWidth), 0);
  document.querySelector('[aria-label="Add column"]').click();
  await tick(); await tick();
  assert(content.includes("| Название | Количество | Примечание | Column |"));
  assert(content.includes("| --- | --- | --- | --- |"));
  assert(content.includes("| Яблоки | 3 | Текст |  |"));
  assert(document.querySelector('[aria-label="Move column 4"]'));
  document.querySelector('[aria-label="Delete column 2"]').click();
  await tick(); await tick();
  assert(content.includes("| Название | Примечание | Column |"));
  assert(content.includes("| Яблоки | Текст |  |"));
  assert(content.includes("| --- | --- | --- |"));
  const hoverCell = inputs()[0].parentElement;
  const deleteCell = document.querySelector('[aria-label="Delete column 1"]').parentElement;
  hoverCell.dispatchEvent(new window.Event("pointerenter"));
  assert(deleteCell.classList.contains("notes-column-hover"));
  hoverCell.dispatchEvent(new window.Event("pointerleave"));
  assert(!deleteCell.classList.contains("notes-column-hover"));
  hoverCell.dispatchEvent(new window.Event("focusin"));
  assert(deleteCell.classList.contains("notes-column-focus"));
  hoverCell.dispatchEvent(new window.Event("focusout"));
  assert(!deleteCell.classList.contains("notes-column-focus"));
  const multiline = inputs()[0];
  const shiftEnter = new window.Event("keydown", { cancelable: true });
  Object.assign(shiftEnter, { key: "Enter", shiftKey: true });
  multiline.dispatchEvent(shiftEnter);
  assert(!shiftEnter.defaultPrevented, "Shift+Enter allows the textarea newline");
  multiline.value = "Первая строка\n\nВторая | строка";
  blur(multiline);
  await tick(); await tick();
  assert(content.includes("Первая строка<br><br>Вторая \\| строка"));
  document.querySelector('[aria-label="Add row"]').click();
  await tick(); await tick();
  assert.equal(inputs()[0].value, "Первая строка\n\nВторая | строка", "Multiline survives redraw and Markdown escaping");
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
