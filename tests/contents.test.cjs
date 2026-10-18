const fs = require("fs"),
  vm = require("vm"),
  assert = require("assert");
const { parseHTML } = require("linkedom");
const { window, document } = parseHTML(
  '<html><body><div class="page"><div class="ls-block" blockid="properties"><div class="block-content">Block properties</div></div><div id="tags">Tags unchanged</div></div></body></html>',
);
const page = (name, parent, tags = [], properties = {}) => ({
  "block/name": name,
  "block/file": { "file/path": "pages/" + name + ".md" },
  "block/original-name": name.replace("life", "Life"),
  "block/namespace": parent ? { "block/name": parent } : undefined,
  "block/tags": tags.map((name) => ({ "block/name": name })),
  "block/properties": properties,
});
let pages = [
  page("contents", null, [], { "auto-contents": true, "auto-tags": true }),
  page("life", null, ["contents"]),
  page("life/diary", "life"),
  page("life/diary/2026", "life/diary"),
  page("unrelated"),
];
let first = {
  uuid: "properties",
  content: "read-only:: true\nauto-contents:: true\nauto-tags:: true",
};
window.logseq = {
  api: {
    datascript_query: async (q) =>
      q.includes(":block/uuid")
        ? [[first]]
        : q.includes(":block/content")
          ? [
              [
                {
                  "block/content": "tags:: #ignored\n#test #test #[[Long tag]]",
                  "block/refs": [
                    { "block/name": "test" },
                    {
                      "block/name": "long tag",
                      "block/original-name": "Long tag",
                    },
                    { "block/name": "ignored" },
                  ],
                },
              ],
              [
                {
                  "block/content": "#test",
                  "block/refs": [{ "block/name": "test" }],
                },
              ],
              [
                {
                  "block/content": "[[ordinary]]",
                  "block/refs": [{ "block/name": "ordinary" }],
                },
              ],
            ]
          : pages.map((p) => [p]),
    get_page_blocks_tree: async () => [first],
  },
};
let favoriteNames = ["life/diary", "unrelated"];
window.logseq.api.get_current_graph_favorites = async () => favoriteNames;
first.content += "\nauto-favorites:: true";
let poll;
class Observer {
  constructor(cb) {}
  observe() {}
  disconnect() {}
}
pages.push(
  { "block/name": "ghost" },
  page("life/absent/leaf", "life/absent"),
  {
    "block/name": "today",
    "block/journal?": true,
    "block/file": { "file/path": "journals/today.md" },
  },
  { "block/name": "agents", "block/file": { "file/path": "AGENTS.md" } },
);
const source = fs
  .readFileSync("logseq/custom.js", "utf8")
  .split("/* Opt-in Contents:")[1]
  .split("/* Search native query")[0];
vm.runInNewContext("/* Opt-in Contents:" + source, {
  window,
  document,
  AbortController,
  MutationObserver: Observer,
  ResizeObserver: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
  setTimeout,
  clearTimeout,
  setInterval: (cb) => ((poll = cb), 1),
  clearInterval() {},
  console,
});
const tick = () => new Promise((resolve) => setTimeout(resolve, 200));
(async () => {
  await tick();
  const tree = () => document.querySelector(".notes-contents-tree");
  const link = () => tree().querySelector('a[href="#/page/life%2Fdiary"]');
  assert(link());
  pages.find((p) => p["block/name"] === "life/diary")["block/properties"][
    "contents-exclude"
  ] = true;
  await poll();
  await tick();
  assert(!tree().querySelector('details[data-page="life/diary"]'));
  assert(
    !window.notesPageSearchIndex.pages.some((p) => p.name === "life/diary"),
  );
  assert(window.notesPageAliasIndex.pages.has("life/diary"));
  assert(tree().querySelector('a[href="#/page/life%2Fdiary%2F2026"]'));
  pages.find((p) => p["block/name"] === "life/diary")["block/properties"][
    "contents-exclude"
  ] = "false";
  await poll();
  await tick();
  assert(link());
  assert(
    window.notesPageSearchIndex.pages.some((p) => p.name === "life/diary"),
  );
  window.notesAutomaticContents.abort();
  console.log(
    "contents-exclude: hide, preserve children and aliases, restore on false passed",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
  window.notesAutomaticContents.abort();
});
