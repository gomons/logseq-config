const { readFileSync } = require("node:fs");
const { runInNewContext } = require("node:vm");
const assert = require("node:assert/strict");
const { parseHTML } = require("linkedom");

const { window, document } = parseHTML(
  `<html><body>${[
    "check Buy milk",
    "cHeCkEd Buy bread",
    "CHECKING Legacy text",
    "CHECKER Plain text",
  ]
    .map(
      (text, index) =>
        `<div class="ls-block" blockid="${index}"><div class="block-content"><span class="inline">${text}</span></div></div>`,
    )
    .join("")}</body></html>`,
);
const contents = [
  "check Buy milk",
  "tag:: value\ncHeCkEd Buy bread",
  "CHECKING Legacy text",
  "CHECKER Plain text",
];
const writes = [];
window.logseq = {
  api: {
    get_block: async (id) => ({ content: contents[id] }),
    update_block: async (id, content) => {
      writes.push([id, content]);
      contents[id] = content;
    },
  },
};
const query = document.createElement("div");
query.className = "custom-query";
query.innerHTML = '<div class="query-table"><table><thead><tr><th>page</th><th>block</th></tr></thead><tbody><tr><td>CHECK Page name</td><td><div>CHECK Table task</div></td></tr><tr><td>Page</td><td>CHECKED Finished task</td></tr><tr><td>Page</td><td>CHECKING ordinary text</td></tr></tbody></table></div>';
document.body.append(query);
const source = readFileSync("src/js/checklists.js", "utf8");
runInNewContext(source, {
  window,
  document,
  AbortController,
  NodeFilter: { SHOW_TEXT: 4 },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  requestAnimationFrame: () => 1,
  cancelAnimationFrame() {},
  setTimeout,
  clearTimeout,
  console,
});
(async () => {
  await new Promise(setImmediate);
  const statuses = [...query.querySelectorAll(".notes-check-table-status input")];
  assert.equal(statuses.length, 2);
  assert.equal(statuses[0].checked, false);
  assert.equal(statuses[1].checked, true);
  assert(statuses.every(box => box.disabled));
  assert.equal(query.querySelector("td").textContent, "CHECK Page name");
  const boxes = [...document.querySelectorAll(".ls-block .notes-check-controls input")];
  assert.equal(boxes.length, 2, "Only CHECK and CHECKED become controls");
  assert.equal(boxes[0].checked, false);
  assert.equal(boxes[1].checked, true);
  for (const box of boxes) {
    box.checked = !box.checked;
    box.dispatchEvent(new window.Event("change"));
  }
  await new Promise(setImmediate);
  assert.deepEqual(writes, [
    ["0", "CHECKED Buy milk"],
    ["1", "tag:: value\nCHECK Buy bread"],
  ]);
  window.notesCheckTasks.abort();
  assert.equal(document.querySelectorAll(".notes-check-controls").length, 0);
  assert.equal(document.querySelector(".inline").textContent, "check Buy milk");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
