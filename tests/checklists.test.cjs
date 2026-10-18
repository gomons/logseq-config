const { readFileSync } = require("node:fs");
const { runInNewContext } = require("node:vm");
const assert = require("node:assert/strict");
const { parseHTML } = require("linkedom");

const { window, document } = parseHTML(
  `<html><body>${[
    "CHECK Buy milk",
    "CHECKED Buy bread",
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
  "CHECK Buy milk",
  "tag:: value\nCHECKED Buy bread",
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
const source = readFileSync("logseq/custom.js", "utf8")
  .split("/* Render CHECK tasks")[1]
  .split("/* Boolean property")[0];
runInNewContext("/* Render CHECK tasks" + source, {
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
  const boxes = [...document.querySelectorAll(".notes-check-controls input")];
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
  assert.equal(document.querySelector(".inline").textContent, "CHECK Buy milk");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
