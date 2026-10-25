const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { parseHTML } = require("linkedom");
const { window, document } = parseHTML('<html><body><div class="ls-block" blockid="b"><div class="block-properties"><div><span class="page-property-key">table-editable:</span><span class="page-property-value">true</span></div></div><div class="notes-table-editor"><textarea class="notes-table-cell"></textarea></div></div></body></html>');
let content = "table-editable:: true\nOther content", writes = 0;
window.logseq = { api: {
  get_block: async () => ({ content }),
  update_block: async (_, value) => { content = value; writes++; },
}};
const start = () => vm.runInNewContext(fs.readFileSync("src/js/boolean-properties.js", "utf8"), {
  window, document, AbortController, MutationObserver: window.MutationObserver,
  setTimeout, clearTimeout, console,
});
start();
const tick = () => new Promise(resolve => setTimeout(resolve, 120));
(async () => {
  await tick();
  let toggle = document.querySelector(".notes-property-toggle");
  assert(toggle, "Table cell textareas must not hide property controls");
  toggle.dispatchEvent(new window.Event("change", { bubbles: true }));
  await tick();
  assert.equal(content, "table-editable:: false\nOther content");
  assert.equal(writes, 1);
  const native = document.createElement("textarea");
  document.querySelector(".ls-block").append(native);
  start();
  await tick();
  assert(!document.querySelector(".notes-property-toggle"), "Native block editing still suspends controls");
  native.remove();
  start();
  await tick();
  assert(document.querySelector(".notes-property-toggle"), "Controls return after native editing");
  window.notesBooleanProperties.abort();
  assert(!document.querySelector(".notes-property-toggle"));
})().catch(error => { console.error(error); process.exitCode = 1; });
