const { readFileSync } = require("node:fs");
const assert = require("node:assert/strict");
const postcss = require("postcss");
const css = readFileSync("logseq/custom.css", "utf8");
const root = postcss.parse(css);
const rules = [];
root.walkRules((rule) => rules.push(rule));
assert(rules.length > 100, "Parse the complete stylesheet");
const declarations = (selector) => {
  const result = {};
  for (const rule of rules.filter((rule) => rule.selector === selector)) {
    rule.walkDecls((decl) => {
      result[decl.prop] = decl.value;
    });
  }
  assert(Object.keys(result).length, `Missing rule: ${selector}`);
  return result;
};
assert.equal(declarations(".notes-table-source").display, "none");
assert.equal(declarations(".notes-table-editor")["overflow-x"], "auto");
assert(declarations(".notes-table-editor input:focus")["border-color"]);
assert(
  declarations('.notes-check-controls > input[type="checkbox"]:checked')[
    "background-image"
  ],
);
assert(declarations('.notes-checklist-filters button[aria-pressed="true"]'));
// CSS parsing cannot verify layout: still review Logseq on desktop and mobile.
