const fs = require("fs"),
  vm = require("vm"),
  assert = require("assert");
const test = require("node:test");
const { parseHTML } = require("linkedom");
for (const mode of ["new", "implicit", "blank"]) {
  test(`Create subpage: ${mode}`, async () => {
    const { window, document } = parseHTML(
      '<html><body><div class="page"><div class="ls-page-title"><span class="title" data-ref="leisure/cinema/movies">Movies</span></div></div></body></html>',
    );
    window.location = { hash: "" };
    let calls = [];
    let saved;
    window.logseq = {
      api: {
        insert_block: async (...args) => {
          saved = args;
        },
        update_block: async (...args) => {
          saved = args;
        },
        get_page_blocks_tree: async () =>
          mode === "implicit"
            ? []
            : [
                {
                  uuid: "pre",
                  content: mode === "blank" ? "" : "read-only:: false",
                  children: [],
                },
              ],
        get_page: async (name) => {
          assert.equal(name, "leisure/cinema/movies");
          return { originalName: "Leisure/Cinema/Movies" };
        },
        create_page: async (...args) => {
          calls.push(args);
          return { name: args[0] };
        },
      },
    };
    const source = fs.readFileSync("src/js/navigation.js", "utf8");
    vm.runInNewContext(source, {
      window,
      document,
      AbortController,
      MutationObserver: class {
        observe() {}
        disconnect() {}
      },
      Node: { ELEMENT_NODE: 1 },
      requestAnimationFrame: () => 1,
      cancelAnimationFrame() {},
      console,
    });
    const form = document.querySelector("form"),
      input = form.querySelector("input"),
      toggle = document.querySelector(".notes-subpage-create");
    assert(form.hidden);
    toggle.click();
    assert(!form.hidden);
    input.value = "Arrival";
    form.dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true }),
    );
    await new Promise(setImmediate);
    if (mode !== "new") {
      assert(saved);
      assert(saved.includes("read-only:: false"));
    }
    assert.equal(calls[0][0], "Leisure/Cinema/Movies/Arrival");
    assert.equal(calls[0][2].redirect, false);
    assert.equal(calls[0][1]["read-only"], false);
    assert.equal(
      decodeURIComponent(window.location.hash),
      "#/page/Leisure/Cinema/Movies/Arrival",
    );
    toggle.click();
    input.value = "Bad/name";
    form.dispatchEvent(new window.Event("submit", { cancelable: true }));
    assert.equal(calls.length, 1);
    assert(form.textContent.includes("without /"));
    window.logseq.api.create_page = async () => {
      throw Error("Test failure");
    };
    input.value = "Valid";
    form.dispatchEvent(new window.Event("submit", { cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
    assert(form.textContent.includes("Test failure"));
    assert(!form.querySelector("button").disabled);
    window.notesPageNavigation.abort();
  });
}
