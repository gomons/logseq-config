const fs = require("fs"),
  vm = require("vm"),
  assert = require("assert/strict");
const { parseHTML } = require("linkedom");
const { window, document } = parseHTML(
  '<html><body><div class="ls-block" blockid="a"><div class="block-properties"><div><span class="page-property-key" data-ref="alias">alias:</span><span class="page-property-value"><a href="#/page/old">Old</a></span></div></div></div></body></html>',
);
const tableCell = document.createElement("textarea");
tableCell.className = "notes-table-cell";
document.querySelector(".ls-block").append(tableCell);
let content =
    "read-only:: true\nalias:: Old, Long tag, Тег\nother-property:: Keep\nBody",
  writes = [],
  graph = "g",
  edits = 0;
document
  .querySelector(".block-properties")
  .addEventListener("click", () => edits++);
window.logseq = {
  api: {
    get_state_from_store: () => graph,
    get_block: async () => ({ content }),
    update_block: async (uuid, value) => {
      writes.push(value);
      content = value;
    },
  },
};
const src = fs.readFileSync("src/js/list-properties.js", "utf8");
vm.runInNewContext(src, {
  window,
  document,
  AbortController,
  MutationObserver: window.MutationObserver,
  setTimeout,
  clearTimeout,
  console,
});
const tick = () => new Promise((resolve) => setTimeout(resolve, 120));
const key = (input, value) => {
  input.value = value;
  const e = new window.Event("keydown", { bubbles: true, cancelable: true });
  e.key = "Enter";
  input.dispatchEvent(e);
};
(async () => {
  await tick();
  assert.equal(document.querySelectorAll(".notes-alias-item").length, 3);
  assert.equal(
    document.querySelector(".notes-tag-editor").dataset.property,
    "alias",
  );
  const original = document.querySelector(".page-property-value > a");
  assert(original);
  document.querySelector(".notes-tag-chip > span").click();
  assert.equal(edits, 1);
  content += "\nConcurrent edit";
  document.querySelector('[aria-label="Remove alias Old"]').click();
  await tick();
  assert(!content.includes("alias:: Old"));
  assert(content.includes("Long tag"));
  assert(content.endsWith("Concurrent edit"));
  assert(content.includes("other-property:: Keep"));
  assert.equal(edits, 1);
  document.querySelector('[aria-label="Add alias"]').click();
  const input = document.querySelector(".notes-tag-input");
  assert.equal(input.hidden, false);
  key(input, "New tag");
  await tick();
  assert(content.includes("New tag"));
  assert(input.hidden);
  assert.equal(edits, 1);
  document.querySelector('[aria-label="Add alias"]').click();
  key(input, "new TAG");
  await tick();
  assert.equal(writes.length, 2);
  for (const button of [
    ...document.querySelectorAll(".notes-tag-chip button"),
  ]) {
    button.click();
    await tick();
  }
  assert.match(content, /alias::[ \t]*\n/);
  assert.equal(document.querySelectorAll(".notes-tag-chip").length, 0);
  assert(document.querySelector('[aria-label="Add alias"]'));
  window.notesTagProperties.abort();
  assert(!document.querySelector(".notes-tag-editor"));
  assert(!document.querySelector(".notes-tag-property"));
  assert.equal(document.querySelector(".page-property-value > a"), original);
  console.log(
    "Aliases passed: plain text aliases, add/remove, duplicates, fresh content, preserved properties, normal clicks, empty tags, cleanup.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
  window.notesTagProperties.abort();
});
