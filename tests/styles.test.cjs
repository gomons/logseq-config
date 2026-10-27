const { readFileSync } = require("node:fs");
const assert = require("node:assert/strict");
const postcss = require("postcss");
const css = readFileSync("dist/logseq/custom.css", "utf8");
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
assert(declarations(".notes-table-editor textarea:focus")["outline"]);
assert(
  declarations('.notes-check-controls > input[type="checkbox"]:checked')[
    "background-image"
  ],
);
assert(declarations('.notes-checklist-filters button[aria-pressed="true"]'));
// CSS parsing cannot verify layout: still review Logseq on desktop and mobile.

assert.equal(
  declarations(".notes-table-editor textarea")["white-space"],
  "pre-wrap",
);
assert.equal(
  declarations(".notes-table-editor table")["table-layout"],
  "auto",
);

assert.equal(declarations(".notes-check-controls").display, "inline-flex");
assert.equal(declarations(".notes-check-controls")["align-items"], "center");
assert.equal(declarations(".notes-check-controls")["vertical-align"], "middle");
assert.equal(declarations('.notes-check-controls > input[type="checkbox"]')["margin-top"], "0");
assert.equal(declarations('.notes-check-controls > input[type="checkbox"]')["margin-bottom"], "0");

assert.equal(declarations(".notes-table-editor textarea").position, "absolute");
assert.equal(declarations(".notes-table-cell-mirror").visibility, "hidden");
assert(!rules.some((rule) => rule.selector.includes("notes-table-wrap")), "Default wrapping has no custom rules");

assert.equal(
  declarations('.notes-check-controls,\n.block-content :is(.todo, .done) > input[type="checkbox"]').top,
  "-0.1em",
);
