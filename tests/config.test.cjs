const { readFileSync } = require("node:fs");
const { Script, runInNewContext } = require("node:vm");
const assert = require("node:assert/strict");
const source = readFileSync("logseq/custom.js", "utf8");
new Script(source); // Parse every feature, including ones absent from DOM fixtures.
const values = new Map();
let graph = "graph";
const window = {
  navigator: { userAgent: "Desktop" },
  logseq: {
    api: {
      get_state_from_store(key) {
        return key === "git/current-repo" ? graph : values.get(key.join("|"));
      },
    },
  },
};
runInNewContext(source.split("/* Alias lookups")[0], { window });
const enabled = window.notesFeatureEnabled;
assert.equal(enabled("notes/contents-shortcut?"), true);
values.set("config|@graph|notes/contents-shortcut?", false);
assert.equal(enabled("notes/contents-shortcut?"), false);
values.set("config|@graph|notes/desktop|contents-shortcut?", true);
assert.equal(enabled("notes/contents-shortcut?"), true);
window.navigator.userAgent = "iPhone";
assert.equal(enabled("notes/contents-shortcut?"), false);
values.set("config|@graph|notes/mobile|contents-shortcut?", true);
assert.equal(enabled("notes/contents-shortcut?"), true);
window.navigator = { platform: "MacIntel", maxTouchPoints: 5 };
assert.equal(enabled("notes/contents-shortcut?"), true);
values.set("config|@graph|notes/mobile|contents-shortcut?", false);
assert.equal(enabled("notes/contents-shortcut?"), false);
assert.equal(enabled("notes/hide-unlinked-references?"), true);
graph = null;
assert.equal(enabled("notes/contents-shortcut?"), true);
