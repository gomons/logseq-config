const fs = require("fs"), vm = require("vm"), assert = require("assert/strict");
const { parseHTML } = require("linkedom");
const { window, document } = parseHTML(`<html><body><div class="page">
<div class="ls-block" blockid="source"><a class="block-control"><span>Fold</span></a><div class="custom-query"><div class="ls-block" blockid="query"><a class="block-control">Fold result</a></div></div></div>
<div class="references"><div class="ls-block" blockid="ref"><a class="block-control">Fold ref</a></div></div>
<div data-embed="true"><div class="ls-block" blockid="embed"><a class="block-control">Fold embed</a></div></div>
</div></body></html>`);
let args, editing = null, writes = 0, nativeFolds = 0;
window.logseq = { api: {
  get_state_from_store: key => key === "editor/args" ? args : editing,
  set_state_from_store: (key, value) => { assert.equal(key, "editor/args"); args = value; writes++; },
}};
vm.runInNewContext(fs.readFileSync("src/js/block-fold-context.js", "utf8"), {window, document, AbortController});
// Model the native guard: stale ref? suppresses an ordinary block's fold.
document.addEventListener("click", () => { if (!args?.at(-1)?.["ref?"]) nativeFolds++; });
const click = selector => document.querySelector(selector).dispatchEvent(new window.Event("click", { bubbles: true }));
const stale = () => [{}, {"ref?": true}];
args = stale(); click('[blockid="source"] .block-control span');
assert.equal(args, null); assert.equal(nativeFolds, 1); assert.equal(writes, 1);
for (const id of ["query", "ref", "embed"]) {
  args = stale(); const original = args; click(`[blockid="${id}"] .block-control`);
  assert.equal(args, original); assert.equal(writes, 1);
}
editing = "active-editor"; args = stale(); const active = args;
click('[blockid="source"] .block-control'); assert.equal(args, active); assert.equal(writes, 1);
editing = null; args = [{}, {"ref?": false}]; const ordinary = args;
click('[blockid="source"] .block-control'); assert.equal(args, ordinary); assert.equal(writes, 1);
args = null; click('[blockid="source"] .block-control'); assert.equal(writes, 1);
