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
